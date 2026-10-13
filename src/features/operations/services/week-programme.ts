import { listZones } from "@/features/core/services/places";
import { requireSection } from "@/lib/access/session";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, localTime, type LocalDate, type LocalTime } from "@/lib/units";
import { staffName } from "@/lib/text/names";

import {
  MINUTES_PER_DAY,
  addDays,
  datesBetween,
  isClockTime,
  isIsoDate,
  minutesFromTo,
  minutesOf,
  weekStartOf,
  weekdayOf,
  weekdaysOfCodes,
} from "../rules/calendar";
import { checkWorkerSeats, loadMin, worstLevel, type RuleFinding, type Seat } from "../rules/working-time";
import type {
  Division,
  ProgrammeWarning,
  Sex,
  VisitStatus,
  WorkRuleCode,
  WorkRuleLevel,
} from "../validators/option-codes";
import {
  absenceMeetsVisit,
  absencesOnVisit,
  findingsWithVisit,
  judgeSeat,
  readVisitForSeat,
  sanctionedWorkers,
  weekSeatsByWorker,
  workTimeSettings,
  writeOverrides,
  type RuleOverrideInput,
  type SeatJudgement,
  type VisitForSeat,
} from "./assignment";
import { OPEN_STATUSES, VISITS_PATH } from "./programme";
import { readFileForScheduling, readSiteForOrder, readWorkers, type SchedulableWorker } from "./upstream";

/**
 * «برنامج العمل» (#7, #8): every visit of a Saturday-to-Friday week, each
 * worker's hours that week against her capacity with what the working-time
 * rules say about them, and moving a visit to another day or time by hand.
 *
 * A move keeps the visit's programme date (`slotDate`): generation keys a visit
 * by its slot and that date, so it never makes the moved visit again, and
 * `isManuallyEdited` tells later changes of the programme to leave it alone.
 * The workers already seated keep their seats; the rules of the seat picker
 * (`judgeSeat`) are applied to each of them at the new day and time.
 */

export const WORK_PROGRAM_PATH = "/dashboard/work-program";

/** A visit can be moved while it has not started: confirmed or awaiting confirmation. */
export const MOVABLE_STATUSES: readonly VisitStatus[] = OPEN_STATUSES;

// ── The week ────────────────────────────────────────────────────────────────

export interface WeekProgrammeInput {
  /** Any day of the week wanted; the week is the Saturday-to-Friday one that holds it. */
  weekStart: string;
  /** Only the visits of this zone, and the workers of this zone or seated on them. Empty for every zone. */
  zoneId?: string | null;
}

/** A worker holding a seat on a visit. */
export interface WeekTeamMember {
  workerId: string;
  number: string;
  firstName: string;
  lastName: string;
}

export interface WeekVisit {
  id: string;
  /** «رقم أمر المهمة». */
  number: string;
  fileId: string;
  fileNumber: string;
  division: Division;
  siteId: string;
  /** The site's common name, else its address. */
  siteLabel: string;
  zoneId: string | null;
  date: LocalDate;
  startTime: LocalTime;
  durationMin: number;
  status: VisitStatus;
  workersNeeded: number;
  /** The ASSIGNED seats, in the order they were given. */
  team: WeekTeamMember[];
  /** The mission order was printed. */
  printed: boolean;
  /** «تغيّر بعد الطباعة»: the plan changed after the order was printed. */
  changedAfterPrint: boolean;
  /** Moved or changed by hand: a change of the programme leaves it alone. */
  isManuallyEdited: boolean;
  /** Confirmed or awaiting confirmation: it can be moved. */
  movable: boolean;
}

/** One thing the working-time rules say about a worker's week. */
export interface WeekFinding {
  code: WorkRuleCode;
  level: WorkRuleLevel;
  /** The day, for a daily rule. */
  date: LocalDate | null;
  /** The load or span behind it, in minutes. */
  valueMin: number | null;
  visitIds: string[];
}

export interface WeekWorker {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  sex: Sex;
  zoneId: string | null;
  isReserve: boolean;
  /** Her minutes that week: ASSIGNED seats on visits neither cancelled nor postponed, as worked once typed. */
  loadMin: number;
  /** «الطاقة الأسبوعية». */
  capacityMin: number;
  /** Those seats, every zone included: what the screen checks a drag against. */
  seats: Seat[];
  /** What the rules say about her week, worst first. */
  findings: WeekFinding[];
  worstLevel: WorkRuleLevel | null;
  /** «موقف / معاقب» on the first day of the week still to come. */
  sanctioned: boolean;
}

export interface WeekProgramme {
  /** The Saturday. */
  weekStart: LocalDate;
  /** The Friday. */
  weekEnd: LocalDate;
  /** The seven days, Saturday first. */
  dates: LocalDate[];
  zoneId: string | null;
  /** Every active zone, for the filter. */
  zones: { id: string; name: string }[];
  /** Every visit of the week (in the zone), cancelled and postponed ones included; none dropped by a change of programme. */
  visits: WeekVisit[];
  workers: WeekWorker[];
  /** «قواعد العمل» the screen draws: the 40 h and 48 h marks, and the time kept between two sites. */
  rules: { weeklyLegalMin: number; weeklyCapMin: number; travelGapMin: number };
}

const LEVEL_ORDER: readonly WorkRuleLevel[] = ["FLAG", "WARNING", "NEEDS_MANAGER", "REFUSED"];
const severity = (level: WorkRuleLevel | null) => (level === null ? -1 : LEVEL_ORDER.indexOf(level));

function weekFinding(finding: RuleFinding): WeekFinding {
  return {
    code: finding.code,
    level: finding.level,
    date: finding.date ? localDate(finding.date) : null,
    valueMin: finding.valueMin ?? null,
    visitIds: finding.visitIds,
  };
}

/** The days her recorded absences or approved leave meet one of her seats: the rules flag ON_LEAVE there. */
function absentDatesOf(
  seats: readonly Seat[],
  absences: readonly {
    startDate: string;
    endDate: string;
    type: string;
    startTime: string | null;
    endTime: string | null;
  }[],
): string[] {
  const dates = seats
    .filter((seat) =>
      absences.some(
        (absence) =>
          absence.startDate <= seat.date &&
          absence.endDate >= seat.date &&
          absenceMeetsVisit(absence, { plannedStartTime: seat.startTime, plannedDurationMin: seat.durationMin }),
      ),
    )
    .map((seat) => seat.date);
  return [...new Set(dates)];
}

export async function getWeekProgramme(
  ex: Executor,
  ctx: ServiceContext,
  input: WeekProgrammeInput,
): Promise<WeekProgramme> {
  requireSection(ctx, "REQUESTS", "READ");
  if (!isIsoDate(input.weekStart)) throw new ServiceError("Enter a valid date.");
  const weekStart = localDate(weekStartOf(input.weekStart));
  const weekEnd = localDate(addDays(weekStart, 6));
  const zoneId = input.zoneId || null;
  const settings = await workTimeSettings(ex);
  const zones = (await listZones(ex)).map(({ id, name }) => ({ id, name }));

  const rows = await ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.fileId",
      "File.number as fileNumber",
      "File.division",
      "Site.id as siteId",
      "Site.commonName",
      "Site.address",
      "Site.zoneId as siteZoneId",
      "Visit.zoneId",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.status",
      "Visit.workersNeeded",
      "Visit.orderPrintedAt",
      "Visit.planChangedAt",
      "Visit.isManuallyEdited",
    ])
    .where("Visit.visitDate", ">=", weekStart)
    .where("Visit.visitDate", "<=", weekEnd)
    // A visit dropped by a change of the programme is not part of any count (OPTION-CODES: PROGRAMME_CHANGED).
    .where((eb) => eb.or([eb("Visit.statusReason", "is", null), eb("Visit.statusReason", "!=", "PROGRAMME_CHANGED")]))
    .orderBy("Visit.visitDate")
    .orderBy("Visit.plannedStartTime")
    .orderBy("Visit.number")
    .execute();
  const shown = rows.filter((row) => !zoneId || (row.zoneId ?? row.siteZoneId) === zoneId);
  const shownIds = new Set(shown.map((row) => row.id));

  const seatRows = (
    await ex
      .selectFrom("VisitWorker")
      .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
      .select(["VisitWorker.visitId", "VisitWorker.workerId", "VisitWorker.role", "VisitWorker.createdAt"])
      .where("VisitWorker.seatStatus", "=", "ASSIGNED")
      .where("Visit.visitDate", ">=", weekStart)
      .where("Visit.visitDate", "<=", weekEnd)
      .execute()
  ).filter((seat) => shownIds.has(seat.visitId));

  // The workers: those seated on a visit shown, and those who may be given seats in the zone shown.
  const schedulable = await readWorkers(ex, ctx);
  const workers = new Map<string, SchedulableWorker>(schedulable.map((worker) => [worker.id, worker]));
  const seated = new Set(seatRows.map((seat) => seat.workerId));
  for (const worker of await readWorkers(ex, ctx, { ids: [...seated].filter((id) => !workers.has(id)) })) {
    workers.set(worker.id, worker);
  }
  const panel = [...workers.values()].filter(
    (worker) =>
      seated.has(worker.id) ||
      (schedulable.some((each) => each.id === worker.id) && (!zoneId || worker.zoneId === zoneId)),
  );
  const panelIds = panel.map((worker) => worker.id);

  const weekSeats = await weekSeatsByWorker(ex, weekStart, { workerIds: panelIds });
  const absences =
    panelIds.length === 0
      ? []
      : await ex
          .selectFrom("WorkerAbsence")
          .select(["workerId", "type", "startTime", "endTime", "startDate", "endDate"])
          .where("workerId", "in", panelIds)
          .where("status", "in", ["RECORDED", "APPROVED"])
          .where("startDate", "<=", weekEnd)
          .where("endDate", ">=", weekStart)
          .execute();
  // A past week is not judged on today's sanctions; this week from today, a week to come from its Saturday.
  const sanctionDay = ctx.today > weekStart ? ctx.today : weekStart;
  const sanctioned =
    sanctionDay <= weekEnd ? await sanctionedWorkers(ex, ctx, sanctionDay, panelIds) : new Set<string>();

  const weekWorkers = panel
    .map((worker): WeekWorker => {
      const seats = weekSeats.get(worker.id) ?? [];
      const findings = checkWorkerSeats(
        {
          sex: worker.sex as Sex,
          weeklyCapacityMin: worker.weeklyCapacityMin,
          availableWeekdays: weekdaysOfCodes(worker.availableDays),
          absentDates: absentDatesOf(
            seats,
            absences.filter((absence) => absence.workerId === worker.id),
          ),
        },
        seats,
        settings,
      ).sort((a, b) => severity(b.level) - severity(a.level));
      return {
        id: worker.id,
        number: worker.number,
        firstName: worker.firstName,
        lastName: worker.lastName,
        sex: worker.sex as Sex,
        zoneId: worker.zoneId,
        isReserve: worker.isReserve,
        loadMin: loadMin(seats),
        capacityMin: worker.weeklyCapacityMin,
        seats: [...seats].sort((a, b) =>
          a.date === b.date ? minutesOf(a.startTime) - minutesOf(b.startTime) : a.date < b.date ? -1 : 1,
        ),
        findings: findings.map(weekFinding),
        worstLevel: worstLevel(findings),
        sanctioned: sanctioned.has(worker.id),
      };
    })
    .sort(
      (a, b) =>
        severity(b.worstLevel) - severity(a.worstLevel) ||
        b.loadMin - a.loadMin ||
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "ar") ||
        a.id.localeCompare(b.id),
    );

  const visits = shown.map((row): WeekVisit => {
    // The team leader first, then in the order the seats were given; seats given together, by name.
    const team = seatRows
      .filter((seat) => seat.visitId === row.id)
      .map((seat) => {
        const worker = workers.get(seat.workerId);
        return {
          leads: seat.role === "TEAM_LEADER" ? 0 : 1,
          createdAt: seat.createdAt,
          member: {
            workerId: seat.workerId,
            number: worker?.number ?? "",
            firstName: worker?.firstName ?? "",
            lastName: worker?.lastName ?? "",
          } satisfies WeekTeamMember,
        };
      })
      .sort(
        (a, b) =>
          a.leads - b.leads ||
          a.createdAt.localeCompare(b.createdAt) ||
          `${a.member.lastName} ${a.member.firstName}`.localeCompare(
            `${b.member.lastName} ${b.member.firstName}`,
            "ar",
          ) ||
          a.member.workerId.localeCompare(b.member.workerId),
      )
      .map((seat) => seat.member);
    const status = row.status as VisitStatus;
    return {
      id: row.id,
      number: row.number,
      fileId: row.fileId,
      fileNumber: row.fileNumber,
      division: row.division as Division,
      siteId: row.siteId,
      siteLabel: row.commonName?.trim() || row.address,
      zoneId: row.zoneId ?? row.siteZoneId,
      date: localDate(row.visitDate),
      startTime: localTime(row.plannedStartTime),
      durationMin: row.plannedDurationMin,
      status,
      workersNeeded: row.workersNeeded,
      team,
      printed: row.orderPrintedAt !== null,
      changedAfterPrint:
        row.orderPrintedAt !== null && row.planChangedAt !== null && row.planChangedAt > row.orderPrintedAt,
      isManuallyEdited: row.isManuallyEdited === 1,
      movable: MOVABLE_STATUSES.includes(status),
    };
  });

  return {
    weekStart,
    weekEnd,
    dates: datesBetween(weekStart, weekEnd).map((date) => localDate(date)),
    zoneId,
    zones,
    visits,
    workers: weekWorkers,
    rules: {
      weeklyLegalMin: settings.weeklyLegalMin,
      weeklyCapMin: settings.weeklyCapMin,
      travelGapMin: settings.travelGapMin,
    },
  };
}

// ── Moving a visit ──────────────────────────────────────────────────────────

/** Where a visit is dropped: the day and the start time. */
export interface MoveTarget {
  visitId: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM". */
  startTime: string;
}

export interface MoveVisitInput extends MoveTarget {
  /** Given when the manager passes a working-time rule only he may pass. */
  override?: RuleOverrideInput | null;
}

/** What the rules say about one seated worker at the new day and time. */
export interface MoveCheck {
  workerId: string;
  number: string;
  firstName: string;
  lastName: string;
  /** Only what concerns this visit, warnings included. */
  findings: RuleFinding[];
}

/** A warning about the move, for the screen: a rule broken by a seated worker, or the site's days and hours. */
export interface MoveWarning {
  code: WorkRuleCode;
  level: WorkRuleLevel;
  workerId: string;
  /** Her name as typed, to show beside the rule. */
  workerName: string;
  valueMin: number | null;
}

export interface MoveVisitResult {
  visitId: string;
  fileId: string;
  /** False when the visit was dropped where it already was: nothing was written. */
  moved: boolean;
  date: LocalDate;
  startTime: LocalTime;
  /** WARNING and FLAG findings of the seated workers. */
  warnings: MoveWarning[];
  /** The new day or hours fall outside what the site or the client's form allows. */
  placeWarnings: ProgrammeWarning[];
  /** RuleOverride rows written for the manager's approval. */
  overrides: number;
  /** The order had been printed: it is marked «تغيّر بعد الطباعة». */
  changedAfterPrint: boolean;
}

function checkTarget(input: MoveTarget): { date: LocalDate; startTime: LocalTime } {
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (!isClockTime(input.startTime)) throw new ServiceError("Enter a time as HH:MM.");
  return { date: localDate(input.date), startTime: localTime(input.startTime) };
}

/** The visit's ASSIGNED seats, in the order they were given. */
async function assignedSeats(ex: Executor, visitId: string) {
  return ex
    .selectFrom("VisitWorker")
    .select(["id", "workerId"])
    .where("visitId", "=", visitId)
    .where("seatStatus", "=", "ASSIGNED")
    .orderBy("createdAt")
    .orderBy("id")
    .execute();
}

/** The seated workers, whatever their state today: one who has left since still holds her seat. */
async function seatedWorkers(ex: Executor, ctx: ServiceContext, visitId: string) {
  const seats = await assignedSeats(ex, visitId);
  const workers = await readWorkers(ex, ctx, { ids: seats.map((seat) => seat.workerId) });
  return seats.map((seat) => {
    const worker = workers.find((each) => each.id === seat.workerId);
    if (!worker) throw new Error(`operations: worker ${seat.workerId} of seat ${seat.id} was not found`);
    return { seatId: seat.id, worker };
  });
}

/** True when the visit, from its start and for its length, does not fit in the hours from `from` to `to`. */
function outsideHours(startTime: string, durationMin: number, from: string | null, to: string | null): boolean {
  if (!from || !to) return false;
  const offset = (((minutesOf(startTime) - minutesOf(from)) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return offset + durationMin > minutesFromTo(from, to);
}

/** The site's days and hours («الأيام المسموح بها», «من / إلى») and the client's own window on the form. */
async function placeWarningsOf(ex: Executor, visit: VisitForSeat): Promise<ProgrammeWarning[]> {
  const warnings: ProgrammeWarning[] = [];
  const site = await readSiteForOrder(ex, { siteId: visit.siteId, securityTicked: false });
  if (site) {
    const allowed = weekdaysOfCodes(site.allowedDays);
    if (allowed.length > 0 && !allowed.includes(weekdayOf(visit.visitDate))) warnings.push("OUTSIDE_SITE_DAYS");
    if (outsideHours(visit.plannedStartTime, visit.plannedDurationMin, site.allowedFrom, site.allowedTo)) {
      warnings.push("OUTSIDE_SITE_HOURS");
    }
  }
  const file = await readFileForScheduling(ex, visit.fileId);
  if (file && outsideHours(visit.plannedStartTime, visit.plannedDurationMin, file.periodFrom, file.periodTo)) {
    warnings.push("OUTSIDE_ALLOWED_WINDOW");
  }
  return warnings;
}

/**
 * Writes nothing: what the working-time rules would say about each seated
 * worker if the visit were moved there. The screen shows it in the manager's
 * approval, and asks for the inspector's derogation only when night work by a
 * woman is among the rules.
 */
export async function previewVisitMove(
  ex: Executor,
  ctx: ServiceContext,
  input: MoveTarget,
): Promise<{ checks: MoveCheck[]; placeWarnings: ProgrammeWarning[] }> {
  requireSection(ctx, "REQUESTS", "READ");
  const target = checkTarget(input);
  const visit = await readVisitForSeat(ex, input.visitId);
  const moved: VisitForSeat = { ...visit, visitDate: target.date, plannedStartTime: target.startTime };
  const team = await seatedWorkers(ex, ctx, visit.id);
  const ids = team.map(({ worker }) => worker.id);
  const settings = await workTimeSettings(ex);
  const weekSeats = await weekSeatsByWorker(ex, moved.visitDate, { workerIds: ids, exceptVisitId: visit.id });
  const absences = await absencesOnVisit(ex, moved, ids);
  const checks = team.map(
    ({ worker }): MoveCheck => ({
      workerId: worker.id,
      number: worker.number,
      firstName: worker.firstName,
      lastName: worker.lastName,
      findings: findingsWithVisit(
        worker,
        weekSeats.get(worker.id) ?? [],
        absences.get(worker.id)?.absent ?? false,
        moved,
        settings,
      ),
    }),
  );
  return { checks, placeWarnings: await placeWarningsOf(ex, moved) };
}

/**
 * Moves a visit still to happen to another day or start time. Its team comes
 * along: each seated worker is judged at the new time as the seat picker
 * judges her (two visits at once refuses; a rule only the manager may pass
 * needs his reason, and the inspector's derogation for night work by a woman).
 * The visit is then marked as edited by hand, and as changed after printing
 * when its order was printed. One log entry, plus one per seat whose rules the
 * manager passed.
 */
export async function moveVisit(ex: Executor, ctx: ServiceContext, input: MoveVisitInput): Promise<MoveVisitResult> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const target = checkTarget(input);
  const visit = await readVisitForSeat(ex, input.visitId);
  if (!MOVABLE_STATUSES.includes(visit.status)) {
    throw new ServiceError("Only a visit confirmed or awaiting confirmation can be moved.");
  }
  const unchanged = {
    visitId: visit.id,
    fileId: visit.fileId,
    date: visit.visitDate,
    startTime: visit.plannedStartTime,
    warnings: [],
    placeWarnings: [],
    overrides: 0,
    changedAfterPrint: false,
  };
  if (target.date === visit.visitDate && target.startTime === visit.plannedStartTime) {
    return { ...unchanged, moved: false };
  }
  if (target.date < ctx.today) throw new ServiceError("A visit cannot be moved to a day already past.");

  const moved: VisitForSeat = { ...visit, visitDate: target.date, plannedStartTime: target.startTime };
  const judged: { seatId: string; worker: SchedulableWorker; judgement: SeatJudgement }[] = [];
  for (const { seatId, worker } of await seatedWorkers(ex, ctx, visit.id)) {
    judged.push({ seatId, worker, judgement: await judgeSeat(ex, ctx, worker, moved, input.override) });
  }

  const before = await ex
    .selectFrom("Visit")
    .select(["visitDate", "plannedStartTime", "isManuallyEdited", "orderPrintedAt", "planChangedAt"])
    .where("id", "=", visit.id)
    .executeTakeFirstOrThrow();
  const printed = before.orderPrintedAt !== null;
  const { set, changes } = changedColumns(before, {
    visitDate: target.date,
    plannedStartTime: target.startTime,
    isManuallyEdited: 1,
    ...(printed ? { planChangedAt: ctx.now } : {}),
  });
  await ex
    .updateTable("Visit")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", visit.id)
    .execute();

  const overrideIds: string[] = [];
  for (const { seatId, worker, judgement } of judged) {
    overrideIds.push(...(await writeOverrides(ex, ctx, judgement, { seatId, worker, visit })));
  }

  const warnings = judged.flatMap(({ worker, judgement }) =>
    judgement.findings
      .filter((finding) => finding.level === "WARNING" || finding.level === "FLAG")
      .map(
        (finding): MoveWarning => ({
          code: finding.code,
          level: finding.level,
          workerId: worker.id,
          workerName: staffName(worker),
          valueMin: finding.valueMin ?? null,
        }),
      ),
  );
  const placeWarnings = await placeWarningsOf(ex, moved);
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    changes: changes ?? undefined,
    context: {
      cause: "MOVED_ON_WEEK_PROGRAMME",
      workers: judged.map(({ worker }) => worker.number),
      warnings: [...new Set(warnings.map((warning) => warning.code))],
      placeWarnings,
      ruleOverrideIds: overrideIds,
    },
  });

  return {
    visitId: visit.id,
    fileId: visit.fileId,
    moved: true,
    date: target.date,
    startTime: target.startTime,
    warnings,
    placeWarnings,
    overrides: overrideIds.length,
    changedAfterPrint: printed,
  };
}

export const getWeekProgrammeQuery = query(getWeekProgramme);
export const previewVisitMoveQuery = query(previewVisitMove);
/**
 * Besides the week and the visits (the board, the visit page, the home screen's board): the file's own list of
 * visits, the supervisors' day sheets and the home screen's tiles, which all read a visit's day.
 */
export const moveVisitAction = action(moveVisit, {
  revalidate: (result) => [
    WORK_PROGRAM_PATH,
    VISITS_PATH,
    `/dashboard/files/${result.fileId}`,
    "/dashboard/supervisors",
    "/dashboard/home",
  ],
});
