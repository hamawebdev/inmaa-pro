import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { nextNumbers } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, localTime, minutes, type LocalDate } from "@/lib/units";

import { addDays, weekStartOf, weekdayOf, weekdaysOfCodes, type IsoDate } from "../rules/calendar";
import {
  contractVisits,
  onDemandVisits,
  slotsFromForm,
  visitKey,
  visitsToCreate,
  type FormTimes,
  type PlannedVisit,
  type Programme,
  type ProgrammeSettings,
  type WeeklySlot,
} from "../rules/visit-dates";
import { contractWeekIndex, restDatesForWeek, type Seat } from "../rules/working-time";
import type { DayPeriod, DurationUnit, ProgrammeWarning, VisitStatus } from "../validators/option-codes";
import { findingsWithVisit, sanctionedWorkers, seatsBetween, workTimeSettings, type VisitForSeat } from "./assignment";
import { VISITS_PATH } from "./paths";
import { readFileForScheduling, readSiteForOrder, readWorkers, type FileForScheduling } from "./upstream";
import { seedTasksFromServices } from "./tasks";

/**
 * A file's programme and its visits (#7).
 *
 * When a file becomes «متعاقد», Clients emits `file.contracted` and this
 * folder makes the file's programme row, its weekly slots from «أيام
 * التنفيذ», then every visit between «تاريخ البداية» and «تاريخ النهاية»
 * (events.ts). The same functions serve the preview shown before, and the
 * button on File › الزيارات.
 *
 * Running the generation again never makes a visit twice: a visit is keyed by
 * its slot and its programme date (`slotDate`), which never moves, and the
 * database refuses a second one. Visits that exist are never touched here.
 */

export { VISITS_PATH };

/** Statuses of a visit that is still to happen. */
export const OPEN_STATUSES: readonly VisitStatus[] = ["CONFIRMED", "AWAITING_CONFIRMATION"];

/** What a generation did, or would do. */
export interface GenerationSummary {
  /** Visits the programme calls for in the range. */
  planned: number;
  /** Of those, the visits written now (always 0 in a preview). */
  created: number;
  /** Of those, the visits that do not exist yet. */
  missing: number;
  /** The file is «متعاقد» and open: its visits may be made. */
  canGenerate: boolean;
  /** The form's days, times, dates or headcount changed since the programme was built (preview only). */
  formChanged?: boolean;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  /** Visits per weekday, Saturday first. */
  perWeekday: number[];
  warnings: ProgrammeWarning[];
  /**
   * Standing seats left open because seating the member would break a working-time rule (audit LAB-2): her visit
   * waits for confirmation and the office fills the seat by hand, with the manager where only he may pass the rule.
   */
  seatsHeld: Array<{ date: IsoDate; startTime: string; workerId: string; number: string; codes: string[] }>;
  /** Seats written as a member's rotating rest day on a six-visit contract (audit LAB-4): to be replaced. */
  restDays: Array<{ date: IsoDate; workerId: string; number: string }>;
  /** Whether the file's members rest in turn (`FileProgramme.rotateRestDay`). */
  restRotation: boolean;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function programmeSettings(ex: Executor): Promise<ProgrammeSettings> {
  const settings = await getSettings(ex, ["work.days", "work.restDay", "work.period.morning", "work.period.evening"]);
  const [restWeekday] = weekdaysOfCodes([settings["work.restDay"]]);
  return {
    workingWeekdays: weekdaysOfCodes(settings["work.days"]),
    restWeekday: restWeekday ?? 6,
    morning: settings["work.period.morning"],
    evening: settings["work.period.evening"],
  };
}

function formTimesOf(file: FileForScheduling): FormTimes {
  return {
    period: (file.period as DayPeriod | null) ?? null,
    windowFrom: file.periodFrom,
    windowTo: file.periodTo,
    arrivalTime: file.arrivalTime,
    departureTime: file.departureTime,
  };
}

// ── The programme row ───────────────────────────────────────────────────────

/** The file's own row (the two scheduling switches and the inspection plan), created with the defaults. */
export async function ensureProgramme(
  ex: Executor,
  ctx: ServiceContext,
  file: Pick<FileForScheduling, "id" | "serviceType" | "startDate"> & { visitsPerWeek?: number | null },
): Promise<{ id: string }> {
  const found = await ex.selectFrom("FileProgramme").select("id").where("fileId", "=", file.id).executeTakeFirst();
  if (found) return found;
  const settings = await getSettings(ex, [
    "inspection.defaultFrequency.contract",
    "inspection.defaultFrequency.onDemand",
  ]);
  const frequency =
    file.serviceType === "CONTRACT"
      ? settings["inspection.defaultFrequency.contract"]
      : settings["inspection.defaultFrequency.onDemand"];
  const id = newId();
  await ex
    .insertInto("FileProgramme")
    .values({
      id,
      fileId: file.id,
      inspectionFrequency: frequency,
      inspectionStartDate: frequency === "NONE" ? null : (file.startDate ?? ctx.today),
      // Six visits a week: the members rest in turn (scope section 5; audit LAB-4, ruled).
      rotateRestDay: file.serviceType === "CONTRACT" && (file.visitsPerWeek ?? 0) >= 6 ? 1 : 0,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  return { id };
}

// ── Slots ───────────────────────────────────────────────────────────────────

async function activeSlots(ex: Executor, fileId: string): Promise<WeeklySlot[]> {
  const rows = await ex
    .selectFrom("FileSlot")
    .select(["id", "dayOfWeek", "startTime", "durationMin", "workersNeeded", "validFrom", "validTo"])
    .where("fileId", "=", fileId)
    .where("isActive", "=", 1)
    .where("deletedAt", "is", null)
    .orderBy("dayOfWeek")
    .orderBy("startTime")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    weekday: row.dayOfWeek,
    startTime: row.startTime,
    durationMin: row.durationMin,
    workersNeeded: row.workersNeeded,
    validFrom: row.validFrom,
    validTo: row.validTo,
  }));
}

function formSlots(file: FileForScheduling, settings: ProgrammeSettings): WeeklySlot[] {
  return slotsFromForm(
    { ...formTimesOf(file), executionWeekdays: weekdaysOfCodes(file.executionDays), workersCount: file.workersCount },
    settings,
  );
}

const slotKey = (slot: WeeklySlot) => `${slot.weekday}|${slot.startTime}|${slot.durationMin}|${slot.workersNeeded}`;
const sameSlots = (a: readonly WeeklySlot[], b: readonly WeeklySlot[]) =>
  a.map(slotKey).sort().join(",") === b.map(slotKey).sort().join(",");

/**
 * Slots stored before the file has any visit can only be a renewal's copy of the old contract's (`copyFileSetup`).
 * When the renewal's own signed form gives other days, hours or headcount, the copy is out of date: the form wins
 * (rule 6; INT-5, OPS-05). True when the stored slots are such a copy that the form contradicts.
 */
async function copiedSlotsOutOfDate(
  ex: Executor,
  file: FileForScheduling,
  stored: readonly WeeklySlot[],
  settings: ProgrammeSettings,
): Promise<boolean> {
  if (stored.length === 0) return false;
  const form = formSlots(file, settings);
  if (form.length === 0 || sameSlots(stored, form)) return false;
  const anyVisit = await ex.selectFrom("Visit").select("id").where("fileId", "=", file.id).executeTakeFirst();
  return !anyVisit;
}

/**
 * Sets aside slots copied from the old contract that the renewal's form contradicts, before its first visits are
 * made: they are switched off, the copied team keeps its members on the form's slots of the same weekday, and the
 * office is told by a warning on the generation and a log entry. Returns whether it did.
 */
async function setAsideCopiedSlots(
  ex: Executor,
  ctx: ServiceContext,
  file: FileForScheduling,
  settings: ProgrammeSettings,
): Promise<boolean> {
  const stored = await activeSlots(ex, file.id);
  if (!(await copiedSlotsOutOfDate(ex, file, stored, settings))) return false;
  await ex
    .updateTable("FileSlot")
    .set({ isActive: 0, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where(
      "id",
      "in",
      stored.map((slot) => slot.id),
    )
    .execute();
  const fresh = await ensureSlots(ex, ctx, file, settings);
  for (const old of stored) {
    const next = fresh.find((slot) => slot.weekday === old.weekday)?.id ?? null;
    await ex
      .updateTable("FileAssignment")
      .set({ fileSlotId: next, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("fileId", "=", file.id)
      .where("fileSlotId", "=", old.id)
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    changes: { slots: [stored.map(slotKey).join(","), fresh.map(slotKey).join(",")] },
    context: { cause: "RENEWAL_SLOTS_FROM_FORM" },
  });
  return true;
}

/** The slots of a contract: the stored ones, or one per ticked day of «أيام التنفيذ», written now. */
async function ensureSlots(
  ex: Executor,
  ctx: ServiceContext,
  file: FileForScheduling,
  settings: ProgrammeSettings,
): Promise<WeeklySlot[]> {
  const stored = await activeSlots(ex, file.id);
  if (stored.length > 0) return stored;
  const fromForm = formSlots(file, settings);
  const written: WeeklySlot[] = [];
  for (const slot of fromForm) {
    const id = newId();
    await ex
      .insertInto("FileSlot")
      .values({
        id,
        fileId: file.id,
        dayOfWeek: slot.weekday,
        startTime: localTime(slot.startTime),
        durationMin: minutes(slot.durationMin),
        workersNeeded: slot.workersNeeded,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    written.push({ ...slot, id });
  }
  return written;
}

// ── The programme of a file ─────────────────────────────────────────────────

/** The visits the file's form calls for, before any range is applied. */
function plannedProgramme(
  file: FileForScheduling,
  slots: readonly WeeklySlot[],
  settings: ProgrammeSettings,
): Programme {
  if (file.serviceType === "CONTRACT") {
    if (!file.startDate || !file.endDate) return { visits: [], warnings: ["MISSING_DATES"] };
    return contractVisits(
      {
        startDate: file.startDate,
        endDate: file.endDate,
        slots,
        visitsPerWeek: file.visitsPerWeek,
        windowFrom: file.periodFrom,
        windowTo: file.periodTo,
      },
      settings,
    );
  }
  if (!file.startDate) return { visits: [], warnings: ["MISSING_DATES"] };
  return onDemandVisits(
    {
      ...formTimesOf(file),
      startDate: file.startDate,
      endDate: file.endDate,
      executionWeekdays: weekdaysOfCodes(file.executionDays),
      durationValue: file.executionDuration,
      durationUnit: (file.executionDurationUnit as DurationUnit | null) ?? null,
      workersCount: file.workersCount,
    },
    settings,
  );
}

/** Days and hours the site allows (its office block), against the programme. */
function siteWarnings(
  visits: readonly PlannedVisit[],
  site: { allowedDays: string[]; allowedFrom: string | null; allowedTo: string | null } | null,
): ProgrammeWarning[] {
  if (!site) return [];
  const warnings: ProgrammeWarning[] = [];
  const allowed = new Set(weekdaysOfCodes(site.allowedDays));
  if (allowed.size > 0 && visits.some((visit) => !allowed.has(weekdayOf(visit.date)))) {
    warnings.push("OUTSIDE_SITE_DAYS");
  }
  if (site.allowedFrom && site.allowedTo) {
    const from = site.allowedFrom;
    const to = site.allowedTo;
    const outside = visits.some((visit) => {
      const end = minutesFromStart(visit.startTime, visit.durationMin);
      return visit.startTime < from || end > to;
    });
    if (outside) warnings.push("OUTSIDE_SITE_HOURS");
  }
  return warnings;
}

function minutesFromStart(start: string, durationMin: number): string {
  const [hours, mins] = start.split(":").map(Number);
  const total = hours * 60 + mins + durationMin;
  // A visit running past midnight ends "after" any allowed hour of the same day.
  if (total >= 1440) return "24:00";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function inRange(visits: readonly PlannedVisit[], file: FileForScheduling, range: { from?: IsoDate; to?: IsoDate }) {
  const last = [range.to, file.endedDate].filter((date): date is string => Boolean(date)).sort()[0];
  return visits.filter((visit) => (!range.from || visit.date >= range.from) && (!last || visit.date <= last));
}

function summarise(
  visits: readonly PlannedVisit[],
  outcome: { created: number; missing: number; canGenerate: boolean },
  warnings: ProgrammeWarning[],
  seats: Pick<GenerationSummary, "seatsHeld" | "restDays" | "restRotation"> = {
    seatsHeld: [],
    restDays: [],
    restRotation: false,
  },
): GenerationSummary {
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const visit of visits) perWeekday[weekdayOf(visit.date)] += 1;
  const dates = visits.map((visit) => visit.date).sort();
  return {
    planned: visits.length,
    ...outcome,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    perWeekday,
    warnings: [...new Set(warnings)],
    ...seats,
  };
}

async function existingKeys(ex: Executor, fileId: string): Promise<Set<string>> {
  const rows = await ex
    .selectFrom("Visit")
    .select(["fileSlotId", "slotDate"])
    .where("fileId", "=", fileId)
    .where("origin", "in", ["CONTRACT", "ON_DEMAND"])
    .where((eb) => eb.or([eb("statusReason", "is", null), eb("statusReason", "!=", "PROGRAMME_CHANGED")]))
    .where("slotDate", "is not", null)
    .execute();
  return new Set(rows.map((row) => visitKey({ slotId: row.fileSlotId, date: row.slotDate as string })));
}

// ── Who a new visit is given to ─────────────────────────────────────────────

interface StandingSeat {
  workerId: string;
  role: string;
  fileSlotId: string | null;
  validFrom: string;
  validTo: string | null;
  sortOrder: number;
}

/** The file's standing team: LEADER and MEMBER rows naming a worker (an ALTERNATE only replaces). */
async function standingTeam(ex: Executor, fileId: string): Promise<StandingSeat[]> {
  const rows = await ex
    .selectFrom("FileAssignment")
    .innerJoin("StaffMember", "StaffMember.id", "FileAssignment.workerId")
    .select([
      "FileAssignment.workerId",
      "FileAssignment.fileSlotId",
      "FileAssignment.validFrom",
      "FileAssignment.validTo",
      "FileAssignment.sortOrder",
      "StaffMember.role",
    ])
    .where("FileAssignment.fileId", "=", fileId)
    .where("FileAssignment.deletedAt", "is", null)
    .where("FileAssignment.role", "in", ["LEADER", "MEMBER"])
    .where("FileAssignment.workerId", "is not", null)
    .orderBy("FileAssignment.sortOrder")
    .execute();
  return rows.map((row) => ({
    workerId: row.workerId as string,
    role: row.role ?? "CLEANER",
    fileSlotId: row.fileSlotId,
    validFrom: row.validFrom,
    validTo: row.validTo,
    sortOrder: row.sortOrder,
  }));
}

/** Absences that block a seat (RECORDED or APPROVED) of these workers between two dates. */
async function blockingAbsences(ex: Executor, workerIds: readonly string[], from: IsoDate, to: IsoDate) {
  if (workerIds.length === 0) return [];
  return ex
    .selectFrom("WorkerAbsence")
    .select(["workerId", "startDate", "endDate"])
    .where("workerId", "in", [...new Set(workerIds)])
    .where("status", "in", ["RECORDED", "APPROVED"])
    .where("startDate", "<=", localDate(to))
    .where("endDate", ">=", localDate(from))
    .execute();
}

/** The zone's supervisor on a date (#36): the latest assignment that covers the date. */
async function zoneSupervisors(ex: Executor, zoneId: string | null) {
  if (!zoneId) return [];
  return ex
    .selectFrom("SupervisorAssignment")
    .select(["supervisorEmployeeId", "fromDate", "toDate"])
    .where("zoneId", "=", zoneId)
    .orderBy("fromDate", "desc")
    .execute();
}

function supervisorOn(rows: Awaited<ReturnType<typeof zoneSupervisors>>, date: IsoDate): string | null {
  return rows.find((row) => row.fromDate <= date && (!row.toDate || row.toDate >= date))?.supervisorEmployeeId ?? null;
}

// ── Generation ──────────────────────────────────────────────────────────────

/**
 * Creates the slots if there are none, then every missing visit of the file in
 * the range. The engine of `generateVisits` and of the `file.contracted`
 * handler; it checks no permission (the handler runs in Clients' action).
 */
export async function generateFileVisits(
  ex: Executor,
  ctx: ServiceContext,
  fileId: string,
  range: { from?: IsoDate; to?: IsoDate } = {},
): Promise<GenerationSummary> {
  const file = await readFileForScheduling(ex, fileId);
  if (!file) throw new Error(`operations: file ${fileId} was not found`);
  const settings = await programmeSettings(ex);
  await ensureProgramme(ex, ctx, file);
  await seedTasksFromServices(ex, ctx, file.id);

  const setAside = file.serviceType === "CONTRACT" && (await setAsideCopiedSlots(ex, ctx, file, settings));
  const slots = file.serviceType === "CONTRACT" ? await ensureSlots(ex, ctx, file, settings) : [];
  const programme = plannedProgramme(file, slots, settings);
  const planned = inRange(programme.visits, file, range);
  const site = await readSiteForOrder(ex, { siteId: file.siteId, securityTicked: false });
  const warnings: ProgrammeWarning[] = [
    ...programme.warnings,
    ...siteWarnings(planned, site),
    ...(setAside ? (["RENEWAL_SLOTS_FROM_FORM"] as const) : []),
  ];

  const toCreate = visitsToCreate(planned, await existingKeys(ex, file.id));
  if (toCreate.length === 0) return summarise(planned, { created: 0, missing: 0, canGenerate: true }, warnings);

  const dates = toCreate.map((visit) => visit.date).sort();
  const supervisors = await zoneSupervisors(ex, site?.zoneId ?? null);
  const origin = file.serviceType === "CONTRACT" ? "CONTRACT" : "ON_DEMAND";
  const ordered = [...toCreate].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1,
  );
  const plan = await planSeats(
    ex,
    ctx,
    { file, siteId: file.siteId, zoneId: site?.zoneId ?? null, origin },
    planned,
    ordered,
  );

  // One block of numbers per calendar year: the visit number's year is its date's (A6).
  const byYear = new Map<string, number[]>();
  for (const [index, visit] of ordered.entries()) {
    const year = visit.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), index]);
  }

  for (const indexes of byYear.values()) {
    const numbers = await nextNumbers(ex, ctx, "VISIT", {
      date: localDate(ordered[indexes[0]].date),
      count: indexes.length,
    });
    for (const [position, index] of indexes.entries()) {
      const visit = ordered[index];
      const seats = plan.visits[index];
      const status: VisitStatus =
        origin === "CONTRACT" && seats.assigned.length >= visit.workersNeeded ? "CONFIRMED" : "AWAITING_CONFIRMATION";
      await ex
        .insertInto("Visit")
        .values({
          id: seats.visitId,
          numberSeq: numbers[position].seq,
          numberYear: numbers[position].year,
          number: numbers[position].display,
          fileId: file.id,
          fileSlotId: visit.slotId,
          origin,
          slotDate: localDate(visit.date),
          visitDate: localDate(visit.date),
          plannedStartTime: localTime(visit.startTime),
          plannedDurationMin: minutes(visit.durationMin),
          workersNeeded: visit.workersNeeded,
          zoneId: site?.zoneId ?? null,
          supervisorEmployeeId: supervisorOn(supervisors, visit.date),
          status,
          statusChangedAt: ctx.now,
          statusChangedByUserId: ctx.userId,
          createdAt: ctx.now,
          updatedAt: ctx.now,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
        .execute();
      const written = [
        ...seats.assigned.map((seat) => ({ seat, seatStatus: "ASSIGNED" as const })),
        ...seats.resting.map((seat) => ({ seat, seatStatus: "RESTING" as const })),
      ];
      for (const { seat, seatStatus } of written) {
        await ex
          .insertInto("VisitWorker")
          .values({
            id: newId(),
            visitId: seats.visitId,
            workerId: seat.workerId,
            role: seat.role,
            seatStatus,
            createdAt: ctx.now,
            updatedAt: ctx.now,
            createdByUserId: ctx.userId,
            updatedByUserId: ctx.userId,
          })
          .execute();
      }
    }
  }

  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    context: {
      visitsCreated: toCreate.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      seatsHeld: plan.seatsHeld.length,
      restDays: plan.restDays.length,
    },
  });
  return summarise(planned, { created: toCreate.length, missing: 0, canGenerate: true }, warnings, plan);
}

interface VisitSeats {
  visitId: string;
  assigned: StandingSeat[];
  resting: StandingSeat[];
}

/**
 * Who sits on each visit about to be made, in date order. Writes nothing.
 *
 * - A member who has left, is not in post, is suspended or penalised that day (RULINGS item 11), or is absent, has
 *   no seat.
 * - On a file whose members rest in turn (`rotateRestDay`, six visits a week), each member's seat on her rest day of
 *   the week is RESTING: the visit is a seat short and her replacement is suggested as for an absence (audit LAB-4).
 * - Every other member is judged as the seat picker judges her, on her week as it stands with the seats given in
 *   this run, with the day before and after the week: a seat that breaks a rule the manager alone may pass, or two
 *   visits at once, is left open and listed (audit LAB-2).
 */
async function planSeats(
  ex: Executor,
  ctx: ServiceContext,
  where: { file: FileForScheduling; siteId: string; zoneId: string | null; origin: string },
  programme: readonly PlannedVisit[],
  ordered: readonly PlannedVisit[],
): Promise<{ visits: VisitSeats[] } & Pick<GenerationSummary, "seatsHeld" | "restDays" | "restRotation">> {
  const { file } = where;
  const empty = { visits: [], seatsHeld: [], restDays: [], restRotation: false };
  if (ordered.length === 0) return empty;
  const first = ordered[0].date;
  const last = ordered[ordered.length - 1].date;
  const team = await standingTeam(ex, file.id);
  const ids = [...new Set(team.map((seat) => seat.workerId))];
  const absences = await blockingAbsences(ex, ids, first, last);

  // People's word on each member (RULINGS item 11), on each visit's own date: in post that day, and not suspended
  // or penalised that day, even by a sanction set ahead (INT-4, OPS-01).
  const people = await readWorkers(ex, ctx, { ids, date: ctx.today });
  const blockedOn = new Map<string, Set<string>>();
  for (const date of ids.length > 0 ? new Set(ordered.map((visit) => visit.date)) : []) {
    const inPost = await readWorkers(ex, ctx, { ids, date: localDate(date) });
    const blocked = await sanctionedWorkers(ex, ctx, date, ids);
    for (const id of ids) if (!inPost.some((worker) => worker.id === id && worker.activeOnDate)) blocked.add(id);
    blockedOn.set(date, blocked);
  }
  const unavailable = (workerId: string, date: string) =>
    !people.some((person) => person.id === workerId) || (blockedOn.get(date)?.has(workerId) ?? true);

  // The rotating rest day: each member's rest date in each week, by the order of the standing team.
  const programmeRow = await ex
    .selectFrom("FileProgramme")
    .select("rotateRestDay")
    .where("fileId", "=", file.id)
    .executeTakeFirst();
  const rotation =
    file.serviceType === "CONTRACT" &&
    (programmeRow ? programmeRow.rotateRestDay === 1 : (file.visitsPerWeek ?? 0) >= 6);
  const contractStart = file.startDate ?? programme[0]?.date ?? first;
  const restOf = new Map<string, Record<string, IsoDate>>();
  const restDateOf = (workerId: string, date: IsoDate): IsoDate | undefined => {
    if (!rotation) return undefined;
    const week = weekStartOf(date);
    let rests = restOf.get(week);
    if (!rests) {
      const weekDates = programme.filter((visit) => weekStartOf(visit.date) === week).map((visit) => visit.date);
      const members = [
        ...new Set(
          team
            .filter((seat) => seat.validFrom <= addDays(week, 6) && (!seat.validTo || seat.validTo >= week))
            .map((seat) => seat.workerId),
        ),
      ];
      rests = restDatesForWeek(contractWeekIndex(contractStart, date), members, weekDates);
      restOf.set(week, rests);
    }
    return rests[workerId];
  };

  // Her seats as they stand, from the day before the first week to the day after the last.
  const settings = await workTimeSettings(ex);
  const held = await seatsBetween(ex, addDays(weekStartOf(first), -1), addDays(weekStartOf(last), 7), {
    workerIds: ids,
  });
  const seatsNear = (workerId: string, date: IsoDate) => {
    const from = addDays(weekStartOf(date), -1);
    const to = addDays(weekStartOf(date), 7);
    return (held.get(workerId) ?? []).filter((seat) => seat.date >= from && seat.date <= to);
  };
  const numberOf = (workerId: string) => people.find((person) => person.id === workerId)?.number ?? "";

  const visits: VisitSeats[] = [];
  const seatsHeld: GenerationSummary["seatsHeld"] = [];
  const restDays: GenerationSummary["restDays"] = [];
  for (const visit of ordered) {
    const visitId = newId();
    const candidates = team
      .filter(
        (seat) =>
          (seat.fileSlotId === null || seat.fileSlotId === visit.slotId) &&
          seat.validFrom <= visit.date &&
          (!seat.validTo || seat.validTo >= visit.date) &&
          !unavailable(seat.workerId, visit.date) &&
          !absences.some(
            (absence) =>
              absence.workerId === seat.workerId && absence.startDate <= visit.date && absence.endDate >= visit.date,
          ),
      )
      .filter((seat, position, all) => all.findIndex((other) => other.workerId === seat.workerId) === position)
      .slice(0, visit.workersNeeded);
    const forRules: VisitForSeat = {
      id: visitId,
      number: "",
      fileId: file.id,
      fileSlotId: visit.slotId,
      siteId: where.siteId,
      origin: where.origin,
      status: "AWAITING_CONFIRMATION",
      visitDate: localDate(visit.date),
      plannedStartTime: localTime(visit.startTime),
      plannedDurationMin: visit.durationMin,
      workersNeeded: visit.workersNeeded,
      zoneId: where.zoneId,
    };
    const assigned: StandingSeat[] = [];
    const resting: StandingSeat[] = [];
    for (const seat of candidates) {
      if (restDateOf(seat.workerId, visit.date) === visit.date) {
        resting.push(seat);
        restDays.push({ date: visit.date, workerId: seat.workerId, number: numberOf(seat.workerId) });
        continue;
      }
      const person = people.find((each) => each.id === seat.workerId);
      if (!person) continue;
      const broken = findingsWithVisit(person, seatsNear(seat.workerId, visit.date), false, forRules, settings)
        .filter((finding) => finding.level === "REFUSED" || finding.level === "NEEDS_MANAGER")
        .map((finding) => finding.code);
      if (broken.length > 0) {
        seatsHeld.push({
          date: visit.date,
          startTime: visit.startTime,
          workerId: seat.workerId,
          number: person.number,
          codes: [...new Set(broken)],
        });
        continue;
      }
      assigned.push(seat);
      const given: Seat = {
        visitId,
        siteId: where.siteId,
        date: visit.date,
        startTime: visit.startTime,
        durationMin: visit.durationMin,
      };
      held.set(seat.workerId, [...(held.get(seat.workerId) ?? []), given]);
    }
    visits.push({ visitId, assigned, resting });
  }
  return { visits, seatsHeld, restDays, restRotation: rotation };
}

/** Writes nothing: what generating the file's visits would give, and what is wrong with it. */
export async function previewVisitGeneration(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<GenerationSummary> {
  requireSection(ctx, "REQUESTS", "READ");
  const file = await readFileForScheduling(ex, input.fileId);
  if (!file) throw new ServiceError("This client file does not exist.");
  const settings = await programmeSettings(ex);
  const stored = file.serviceType === "CONTRACT" ? await activeSlots(ex, file.id) : [];
  // A renewal's copied slots that its own form contradicts will be set aside at signature (INT-5, OPS-05).
  const outOfDate = await copiedSlotsOutOfDate(ex, file, stored, settings);
  const slots =
    file.serviceType === "CONTRACT" && (stored.length === 0 || outOfDate) ? formSlots(file, settings) : stored;
  const programme = plannedProgramme(file, slots, settings);
  const planned = inRange(programme.visits, file, {});
  const site = await readSiteForOrder(ex, { siteId: file.siteId, securityTicked: false });
  const missing = visitsToCreate(planned, await existingKeys(ex, file.id));
  const stage = await ex.selectFrom("File").select(["stage", "closedAt"]).where("id", "=", file.id).executeTakeFirst();
  const programmeRow = await ex
    .selectFrom("FileProgramme")
    .select("formChangedAt")
    .where("fileId", "=", file.id)
    .executeTakeFirst();
  const ordered = [...missing].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1,
  );
  // Who would sit, rest or be left out by a rule (audit LAB-2, LAB-4): nothing is written.
  const origin = file.serviceType === "CONTRACT" ? "CONTRACT" : "ON_DEMAND";
  const seats = await planSeats(
    ex,
    ctx,
    { file, siteId: file.siteId, zoneId: site?.zoneId ?? null, origin },
    planned,
    ordered,
  );
  const summary = summarise(
    planned,
    { created: 0, missing: missing.length, canGenerate: stage?.stage === "CONTRACTED" && !stage.closedAt },
    [
      ...programme.warnings,
      ...siteWarnings(planned, site),
      ...(outOfDate ? (["RENEWAL_SLOTS_FROM_FORM"] as const) : []),
    ],
    seats,
  );
  return { ...summary, formChanged: Boolean(programmeRow?.formChangedAt) };
}

/** The button on File › الزيارات: every missing visit of a contracted file. */
export async function generateVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; from?: IsoDate; to?: IsoDate },
): Promise<GenerationSummary> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const file = await ex
    .selectFrom("File")
    .select(["stage", "closedAt"])
    .where("id", "=", input.fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This client file does not exist.");
  if (file.stage !== "CONTRACTED" || file.closedAt) {
    throw new ServiceError("Visits are made for a contracted file only.");
  }
  return generateFileVisits(ex, ctx, input.fileId, { from: input.from, to: input.to });
}

// ── Ending ──────────────────────────────────────────────────────────────────

/**
 * Cancels the file's programme visits still to happen after a date (the
 * contract ended). A make-up or redo visit already placed is left, and so is
 * anything printed in progress, done, postponed or cancelled.
 */
export async function cancelFutureVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; afterDate: LocalDate; reason: string; note?: string | null },
): Promise<{ cancelled: number }> {
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "number", "status"])
    .where("fileId", "=", input.fileId)
    .where("origin", "in", ["CONTRACT", "ON_DEMAND"])
    .where("status", "in", [...OPEN_STATUSES])
    .where("visitDate", ">", input.afterDate)
    .orderBy("visitDate")
    .execute();
  if (visits.length === 0) return { cancelled: 0 };
  await ex
    .updateTable("Visit")
    .set({
      status: "CANCELLED",
      statusReason: input.reason,
      statusNote: input.note ?? null,
      statusChangedAt: ctx.now,
      statusChangedByUserId: ctx.userId,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where(
      "id",
      "in",
      visits.map((visit) => visit.id),
    )
    .execute();
  const file = await ex.selectFrom("File").select("number").where("id", "=", input.fileId).executeTakeFirst();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    entity: "File",
    entityId: input.fileId,
    entityLabel: file?.number,
    changes: { visitStatus: ["CONFIRMED / AWAITING_CONFIRMATION", "CANCELLED"] },
    context: { statusReason: input.reason, visits: visits.map((visit) => visit.number) },
  });
  return { cancelled: visits.length };
}

export const previewVisitGenerationQuery = query(previewVisitGeneration);
export const generateVisitsAction = action(generateVisits, { revalidate: [VISITS_PATH, "/dashboard/files"] });
