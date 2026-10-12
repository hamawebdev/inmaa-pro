import { getSanctionStates } from "@/features/people/services/sanctions";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, minutes, type LocalDate, type LocalTime } from "@/lib/units";

import { MINUTES_PER_DAY, addDays, minutesOf, weekStartOf, weekdaysOfCodes, type IsoDate } from "../rules/calendar";
import {
  checkWorkerSeats,
  loadMin,
  worstLevel,
  type RuleFinding,
  type Seat,
  type WorkTimeSettings,
} from "../rules/working-time";
import type { Sex, VisitStatus, WorkRuleLevel } from "../validators/option-codes";
import { VISITS_PATH } from "./programme";
import {
  SCHEDULABLE_ENGAGEMENTS,
  readSiteForOrder,
  readWorkers,
  schedulableWorkers,
  type SchedulableWorker,
  type SiteForOrder,
} from "./upstream";

/**
 * The team of a visit (#8, #9): who may be given a seat, giving it, taking it
 * back, and the office's confirmation of a visit.
 *
 * Every seat given goes through the working-time rules of scope section 5
 * (`rules/working-time.ts`): a clash refuses; a rule only the manager may pass
 * refuses unless the manager passes it here, with a reason, and each rule
 * passed is kept as a `RuleOverride` row. Warnings come back to the screen.
 *
 * After any change of team the visit follows the status rule: «مؤكدة» when
 * every seat is held (a contract visit; an on-demand visit waits for the
 * office to confirm it), back to «بانتظار التأكيد» when a seat opens, and
 * «تغيّر بعد الطباعة» when its order was already printed.
 *
 * The helpers marked "shared" are also used by absences.ts.
 */

/** Statuses of a visit whose team may still change: still to happen, or under way. */
export const TEAM_OPEN_STATUSES: readonly VisitStatus[] = ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS"];

/** Seats that hold a worker's place on a visit (the unique index `VisitWorker_active_seat`). */
export const ACTIVE_SEAT_STATUSES: readonly string[] = ["ASSIGNED", "ABSENT", "RESTING"];

/** Visits whose seats no longer count in a worker's week. */
const NOT_WORKED: readonly VisitStatus[] = ["CANCELLED", "POSTPONED"];

// ── Shared: settings, the visit, the worker ─────────────────────────────────

/** «قواعد العمل» as the working-time rules read them. Read in the action that uses them. */
export async function workTimeSettings(ex: Executor): Promise<WorkTimeSettings> {
  const settings = await getSettings(ex, [
    "work.weekMin",
    "work.overtimeCapMin",
    "work.dayMin",
    "work.daySpanMin",
    "work.night",
    "work.travelGapMin",
    "work.restDay",
  ]);
  const [restWeekday] = weekdaysOfCodes([settings["work.restDay"]]);
  return {
    weeklyLegalMin: settings["work.weekMin"],
    weeklyCapMin: settings["work.overtimeCapMin"],
    dailyMin: settings["work.dayMin"],
    daySpanMin: settings["work.daySpanMin"],
    nightFrom: settings["work.night"].from,
    nightTo: settings["work.night"].to,
    travelGapMin: settings["work.travelGapMin"],
    restWeekday: restWeekday ?? 6,
  };
}

/** What giving a seat needs to know of a visit. */
export interface VisitForSeat {
  id: string;
  number: string;
  fileId: string;
  fileSlotId: string | null;
  /** The file's site: the history rules read by site, not by file. */
  siteId: string;
  origin: string;
  status: VisitStatus;
  visitDate: LocalDate;
  plannedStartTime: LocalTime;
  plannedDurationMin: number;
  workersNeeded: number;
  zoneId: string | null;
}

/** Shared. */
export async function readVisitForSeat(ex: Executor, visitId: string): Promise<VisitForSeat> {
  const row = await ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.fileId",
      "Visit.fileSlotId",
      "File.siteId",
      "Visit.origin",
      "Visit.status",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.workersNeeded",
      "Visit.zoneId",
    ])
    .where("Visit.id", "=", visitId)
    .executeTakeFirst();
  if (!row) throw new ServiceError("This visit does not exist.");
  return { ...row, status: row.status as VisitStatus };
}

/** The visit as one seat of a worker's plan. */
export function plannedSeat(visit: VisitForSeat): Seat {
  return {
    visitId: visit.id,
    siteId: visit.siteId,
    date: visit.visitDate,
    startTime: visit.plannedStartTime,
    durationMin: visit.plannedDurationMin,
  };
}

/** Shared. A worker who may be given seats now: a cleaning worker on trial or accepted. */
export async function workerForSeat(ex: Executor, workerId: string): Promise<SchedulableWorker> {
  const [worker] = await readWorkers(ex, { ids: [workerId] });
  if (!worker) throw new ServiceError("This worker does not exist.");
  if (!(SCHEDULABLE_ENGAGEMENTS as readonly string[]).includes(worker.engagementStatus)) {
    throw new ServiceError("This worker cannot be given visits.");
  }
  return worker;
}

/** The seats of a visit, every status. */
async function seatsOf(ex: Executor, visitId: string) {
  return ex.selectFrom("VisitWorker").select(["id", "workerId", "seatStatus"]).where("visitId", "=", visitId).execute();
}

/** Shared. The workers holding a place on the visit: assigned, absent or resting. */
export async function workersOnVisit(ex: Executor, visitId: string): Promise<Set<string>> {
  const seats = await seatsOf(ex, visitId);
  return new Set(seats.filter((seat) => ACTIVE_SEAT_STATUSES.includes(seat.seatStatus)).map((seat) => seat.workerId));
}

async function workerNumber(ex: Executor, workerId: string): Promise<string | undefined> {
  return (await ex.selectFrom("StaffMember").select("number").where("id", "=", workerId).executeTakeFirst())?.number;
}

// ── Shared: a worker's week, absences, sanctions ────────────────────────────

/**
 * Shared. Each worker's seats in the Saturday week of `date`: ASSIGNED seats on
 * visits not cancelled or postponed, as worked when the order was typed, else
 * as planned. Without `workerIds`, every worker's.
 */
export async function weekSeatsByWorker(
  ex: Executor,
  date: IsoDate,
  options: { workerIds?: readonly string[]; exceptVisitId?: string } = {},
): Promise<Map<string, Seat[]>> {
  const byWorker = new Map<string, Seat[]>();
  if (options.workerIds && options.workerIds.length === 0) return byWorker;
  const from = weekStartOf(date);
  let seats = ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .select([
      "VisitWorker.workerId",
      "Visit.id as visitId",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "File.siteId",
      "VisitWorker.workStartTime",
      "VisitWorker.arrivedTime",
      "VisitWorker.workedMin",
    ])
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .where("Visit.status", "not in", [...NOT_WORKED])
    .where("Visit.visitDate", ">=", localDate(from))
    .where("Visit.visitDate", "<=", localDate(addDays(from, 6)));
  if (options.exceptVisitId) seats = seats.where("Visit.id", "!=", options.exceptVisitId);
  if (options.workerIds) seats = seats.where("VisitWorker.workerId", "in", [...new Set(options.workerIds)]);
  for (const row of await seats.execute()) {
    const list = byWorker.get(row.workerId) ?? [];
    list.push({
      visitId: row.visitId,
      siteId: row.siteId,
      date: row.visitDate,
      startTime: row.workStartTime ?? row.arrivedTime ?? row.plannedStartTime,
      durationMin: row.workedMin ?? row.plannedDurationMin,
    });
    byWorker.set(row.workerId, list);
  }
  return byWorker;
}

/**
 * Shared. Whether an absence that covers the visit's day also covers its hours:
 * a whole day always does, a half day or some hours when the two meet.
 */
export function absenceMeetsVisit(
  absence: { type: string; startTime: string | null; endTime: string | null },
  visit: { plannedStartTime: string; plannedDurationMin: number },
): boolean {
  if (absence.type === "FULL_DAY" || !absence.startTime || !absence.endTime) return true;
  const from = minutesOf(absence.startTime);
  let to = minutesOf(absence.endTime);
  // A no-show on a night visit is written to the visit's end, past midnight.
  if (to <= from) to += MINUTES_PER_DAY;
  const start = minutesOf(visit.plannedStartTime);
  return start < to && from < start + visit.plannedDurationMin;
}

/** What the absences of a worker say about one visit. */
export interface AbsenceOnVisit {
  /** A recorded absence or an approved leave covers the visit: the rules flag ON_LEAVE. */
  absent: boolean;
  /** A leave asked for and not decided covers it: a warning only. */
  requested: boolean;
}

/** Shared. Per worker, the absences that meet the visit. Without `workerIds`, every worker's. */
export async function absencesOnVisit(
  ex: Executor,
  visit: Pick<VisitForSeat, "visitDate" | "plannedStartTime" | "plannedDurationMin">,
  workerIds?: readonly string[],
): Promise<Map<string, AbsenceOnVisit>> {
  const byWorker = new Map<string, AbsenceOnVisit>();
  if (workerIds && workerIds.length === 0) return byWorker;
  let absences = ex
    .selectFrom("WorkerAbsence")
    .select(["workerId", "type", "startTime", "endTime", "status"])
    .where("status", "in", ["RECORDED", "APPROVED", "REQUESTED"])
    .where("startDate", "<=", visit.visitDate)
    .where("endDate", ">=", visit.visitDate);
  if (workerIds) absences = absences.where("workerId", "in", [...new Set(workerIds)]);
  for (const absence of await absences.execute()) {
    if (!absenceMeetsVisit(absence, visit)) continue;
    const flags = byWorker.get(absence.workerId) ?? { absent: false, requested: false };
    if (absence.status === "REQUESTED") flags.requested = true;
    else flags.absent = true;
    byWorker.set(absence.workerId, flags);
  }
  return byWorker;
}

/**
 * Shared. Of these workers, those suspended or penalised on the day of a visit
 * («موقف / معاقب»): People's `getSanctionStates` is the one way to read it
 * (CONTRACTS.md section 3). It answers for today; a sanction that ends before
 * the visit's day does not block that visit. The states that block are the
 * setting `sanction.blockingStates`.
 */
export async function sanctionedWorkers(
  ex: Executor,
  ctx: ServiceContext,
  date: IsoDate,
  workerIds: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  const blocking = (await getSettings(ex, ["sanction.blockingStates"]))["sanction.blockingStates"].WORKER ?? [];
  if (blocking.length === 0 || workerIds.length === 0) return found;
  const states = await getSanctionStates(ex, ctx, { kind: "WORKER", ids: [...new Set(workerIds)] });
  for (const [workerId, state] of Object.entries(states)) {
    if (state && blocking.includes(state.state) && (!state.until || state.until >= date)) found.add(workerId);
  }
  return found;
}

/** Shared. The site's two rules on who may work there: women only, and the abilities it needs. */
export function fitsSite(
  worker: Pick<SchedulableWorker, "sex" | "abilities">,
  site: Pick<SiteForOrder, "womenOnly" | "requiredAbilityCodes"> | null,
): boolean {
  if (!site) return true;
  if (site.womenOnly && worker.sex !== "FEMALE") return false;
  return site.requiredAbilityCodes.every((code) => worker.abilities.includes(code));
}

/**
 * Shared. What the working-time rules say about the worker's week with this
 * visit added, keeping only what concerns this visit: a clash between two of
 * her other seats is not this seat's business.
 */
export function findingsWithVisit(
  worker: Pick<SchedulableWorker, "sex" | "weeklyCapacityMin" | "availableDays">,
  weekSeats: readonly Seat[],
  absent: boolean,
  visit: VisitForSeat,
  settings: WorkTimeSettings,
): RuleFinding[] {
  return checkWorkerSeats(
    {
      sex: worker.sex as Sex,
      weeklyCapacityMin: worker.weeklyCapacityMin,
      availableWeekdays: weekdaysOfCodes(worker.availableDays),
      absentDates: absent ? [visit.visitDate] : [],
    },
    [...weekSeats, plannedSeat(visit)],
    settings,
  ).filter((finding) => finding.visitIds.includes(visit.id));
}

// ── Shared: the rules on one seat, and the manager's override ───────────────

/** The manager passes the rules a seat breaks, with the reason he typed. */
export interface RuleOverrideInput {
  reason: string;
  /** The labour inspector's derogation; required to pass NIGHT_WOMAN. */
  derogationRef?: string | null;
}

export interface SeatJudgement {
  /** Everything the rules say about this seat, warnings included. */
  findings: RuleFinding[];
  /** The rules the manager passed, one RuleOverride row each. */
  passed: RuleFinding[];
  reason: string | null;
  derogationRef: string | null;
}

/**
 * Shared. Refuses a seat the site or the rules do not allow, and returns the
 * rules the manager passed. Writes nothing.
 */
export async function judgeSeat(
  ex: Executor,
  ctx: ServiceContext,
  worker: SchedulableWorker,
  visit: VisitForSeat,
  override?: RuleOverrideInput | null,
): Promise<SeatJudgement> {
  const site = await readSiteForOrder(ex, { siteId: visit.siteId, securityTicked: false });
  if (site?.womenOnly && worker.sex !== "FEMALE") throw new ServiceError("This site takes women workers only.");
  if (!fitsSite(worker, site)) throw new ServiceError("This worker does not have an ability this site requires.");
  if ((await sanctionedWorkers(ex, ctx, visit.visitDate, [worker.id])).has(worker.id)) {
    throw new ServiceError("This worker is suspended or penalised.");
  }

  const settings = await workTimeSettings(ex);
  const seats = await weekSeatsByWorker(ex, visit.visitDate, { workerIds: [worker.id], exceptVisitId: visit.id });
  const absence = (await absencesOnVisit(ex, visit, [worker.id])).get(worker.id);
  const findings = findingsWithVisit(worker, seats.get(worker.id) ?? [], absence?.absent ?? false, visit, settings);

  if (findings.some((finding) => finding.level === "REFUSED")) {
    throw new ServiceError("This worker already has a visit at that time.");
  }
  const passed = findings.filter((finding) => finding.level === "NEEDS_MANAGER");
  if (passed.length === 0) return { findings, passed, reason: null, derogationRef: null };

  if (!override) throw new ServiceError("This seat breaks a working-time rule. Only the manager can allow it.");
  requireCapability(ctx, "schedule.overrideRule");
  const reason = override.reason?.trim() ?? "";
  if (!reason) throw new ServiceError("A reason is required.");
  const derogationRef = override.derogationRef?.trim() || null;
  if (!derogationRef && passed.some((finding) => finding.code === "NIGHT_WOMAN")) {
    throw new ServiceError("Night work by a woman needs the reference of the labour inspector's derogation.");
  }
  return { findings, passed, reason, derogationRef };
}

/** Shared. One RuleOverride row per rule the manager passed on the new seat, and one log entry. */
export async function writeOverrides(
  ex: Executor,
  ctx: ServiceContext,
  judgement: SeatJudgement,
  seat: { seatId: string; worker: Pick<SchedulableWorker, "id" | "number">; visit: Pick<VisitForSeat, "number"> },
): Promise<string[]> {
  if (judgement.passed.length === 0 || !judgement.reason) return [];
  if (!ctx.userId) throw new Error("operations: a working-time rule is passed by a signed-in manager only");
  const ids: string[] = [];
  for (const finding of judgement.passed) {
    const id = newId();
    await ex
      .insertInto("RuleOverride")
      .values({
        id,
        visitWorkerId: seat.seatId,
        workerId: seat.worker.id,
        weekStart: finding.weekStart ? localDate(finding.weekStart) : null,
        ruleDate: finding.date ? localDate(finding.date) : null,
        ruleCode: finding.code,
        valueMin: finding.valueMin === undefined ? null : minutes(finding.valueMin),
        reason: judgement.reason,
        derogationRef: finding.code === "NIGHT_WOMAN" ? judgement.derogationRef : null,
        approvedByUserId: ctx.userId,
        approvedAt: ctx.now,
        createdAt: ctx.now,
      })
      .execute();
    ids.push(id);
  }
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "OVERRIDE",
    reason: judgement.reason,
    entity: "VisitWorker",
    entityId: seat.seatId,
    entityLabel: seat.visit.number,
    subject: { kind: "WORKER", id: seat.worker.id, label: seat.worker.number },
    context: {
      rules: judgement.passed.map((finding) => ({
        code: finding.code,
        weekStart: finding.weekStart ?? null,
        date: finding.date ?? null,
        valueMin: finding.valueMin ?? null,
      })),
      ruleOverrideIds: ids,
      derogationRef: judgement.derogationRef,
    },
  });
  return ids;
}

/** Shared. Writes a new ASSIGNED seat. */
export async function insertSeat(
  ex: Executor,
  ctx: ServiceContext,
  seat: {
    visitId: string;
    worker: Pick<SchedulableWorker, "id" | "role">;
    replaces?: { seatId: string; reason: string; absenceId: string | null };
  },
): Promise<string> {
  const id = newId();
  await ex
    .insertInto("VisitWorker")
    .values({
      id,
      visitId: seat.visitId,
      workerId: seat.worker.id,
      role: seat.worker.role ?? "CLEANER",
      seatStatus: "ASSIGNED",
      replacesVisitWorkerId: seat.replaces?.seatId ?? null,
      replacementReason: seat.replaces?.reason ?? null,
      absenceId: seat.replaces?.absenceId ?? null,
      replacedAt: seat.replaces ? ctx.now : null,
      replacedByUserId: seat.replaces ? ctx.userId : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  return id;
}

// ── Shared: the visit after its team changed ────────────────────────────────

/**
 * Shared. Applies the status rule and the printed-order rule to a visit whose
 * team has just changed, and logs a status that moved. Returns the status.
 *
 *  - «مؤكدة» when every seat is held, for a contract visit; an on-demand or
 *    added visit stays «بانتظار التأكيد» until the office confirms it.
 *  - A seat opening on a «مؤكدة» visit returns it to «بانتظار التأكيد».
 *  - A visit under way, done, postponed, in trouble or cancelled keeps its status.
 *  - An order already printed is marked «تغيّر بعد الطباعة» (`planChangedAt`).
 */
export async function settleVisitTeam(ex: Executor, ctx: ServiceContext, visitId: string): Promise<VisitStatus> {
  const visit = await ex
    .selectFrom("Visit")
    .select(["id", "number", "origin", "status", "workersNeeded", "orderPrintedAt", "planChangedAt"])
    .where("id", "=", visitId)
    .executeTakeFirst();
  if (!visit) throw new Error(`operations: visit ${visitId} was not found`);
  const held = (await seatsOf(ex, visit.id)).filter((seat) => seat.seatStatus === "ASSIGNED").length;
  const full = held >= visit.workersNeeded;

  let status = visit.status as VisitStatus;
  if (status === "CONFIRMED" && !full) status = "AWAITING_CONFIRMATION";
  else if (status === "AWAITING_CONFIRMATION" && full && visit.origin === "CONTRACT") status = "CONFIRMED";

  const patch: { status: VisitStatus; planChangedAt?: string } = { status };
  if (visit.orderPrintedAt) patch.planChangedAt = ctx.now;
  const { set, changes } = changedColumns(visit, patch);
  if (!changes) return status;

  const moved = set.status !== undefined;
  await ex
    .updateTable("Visit")
    .set({
      ...set,
      ...(moved ? { statusChangedAt: ctx.now, statusChangedByUserId: ctx.userId } : {}),
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  if (moved) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "STATUS_CHANGE",
      entity: "Visit",
      entityId: visit.id,
      entityLabel: visit.number,
      changes,
      context: { cause: "TEAM_CHANGED", seatsHeld: held, workersNeeded: visit.workersNeeded },
    });
  }
  return status;
}

// ── Who may be given a seat ─────────────────────────────────────────────────

/** A worker the office may give a seat of the visit, with what the rules say. */
export interface SeatCandidate {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  sex: string;
  role: string | null;
  zoneId: string | null;
  isReserve: boolean;
  /** Her zone is the visit's. */
  sameZone: boolean;
  /** Her minutes that Saturday-to-Friday week, before this visit. */
  loadMin: number;
  /** «الطاقة الأسبوعية». */
  capacityMin: number;
  /** The rules with this visit added; only what concerns this visit. */
  findings: RuleFinding[];
  worstLevel: WorkRuleLevel | null;
  /** Suspended or penalised that day: the seat would be refused. */
  sanctioned: boolean;
  /** A leave she asked for, not decided yet, covers the visit. */
  leaveRequested: boolean;
}

/**
 * The picker of a visit's seat: every schedulable worker not on the visit,
 * best first — those the rules let through without the manager, then those of
 * the visit's zone, then the lightest week. A man is not offered for a
 * women-only site, nor a worker without an ability the site requires.
 */
export async function listSeatCandidates(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<SeatCandidate[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const visit = await readVisitForSeat(ex, input.visitId);
  const site = await readSiteForOrder(ex, { siteId: visit.siteId, securityTicked: false });
  const zoneId = visit.zoneId ?? site?.zoneId ?? null;
  const onVisit = await workersOnVisit(ex, visit.id);
  const workers = (await schedulableWorkers(ex, ctx, { date: visit.visitDate })).filter(
    (worker) => !onVisit.has(worker.id) && fitsSite(worker, site),
  );
  if (workers.length === 0) return [];

  const settings = await workTimeSettings(ex);
  const weekSeats = await weekSeatsByWorker(ex, visit.visitDate, { exceptVisitId: visit.id });
  const absences = await absencesOnVisit(ex, visit);
  const sanctioned = await sanctionedWorkers(
    ex,
    ctx,
    visit.visitDate,
    workers.map((worker) => worker.id),
  );

  const candidates = workers.map((worker): SeatCandidate => {
    const seats = weekSeats.get(worker.id) ?? [];
    const absence = absences.get(worker.id);
    const findings = findingsWithVisit(worker, seats, absence?.absent ?? false, visit, settings);
    return {
      id: worker.id,
      number: worker.number,
      firstName: worker.firstName,
      lastName: worker.lastName,
      sex: worker.sex,
      role: worker.role,
      zoneId: worker.zoneId,
      isReserve: worker.isReserve,
      sameZone: zoneId !== null && worker.zoneId === zoneId,
      loadMin: loadMin(seats),
      capacityMin: worker.weeklyCapacityMin,
      findings,
      worstLevel: worstLevel(findings),
      sanctioned: sanctioned.has(worker.id),
      leaveRequested: absence?.requested ?? false,
    };
  });

  const blocked = (candidate: SeatCandidate) =>
    candidate.sanctioned ||
    candidate.findings.some((finding) => finding.level === "REFUSED" || finding.level === "NEEDS_MANAGER");
  return candidates.sort(
    (a, b) =>
      Number(blocked(a)) - Number(blocked(b)) ||
      Number(b.sameZone) - Number(a.sameZone) ||
      a.loadMin - b.loadMin ||
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "ar") ||
      a.id.localeCompare(b.id),
  );
}

// ── Giving, taking back, confirming ─────────────────────────────────────────

export interface AssignVisitWorkerInput {
  visitId: string;
  workerId: string;
  /** Given when the manager passes a rule only he may pass. */
  override?: RuleOverrideInput | null;
}

/** What giving a seat did: the seat, what the rules said (warnings for the screen), and the visit's status. */
export interface SeatResult {
  seatId: string;
  findings: RuleFinding[];
  status: VisitStatus;
}

export async function assignVisitWorker(
  ex: Executor,
  ctx: ServiceContext,
  input: AssignVisitWorkerInput,
): Promise<SeatResult> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const visit = await readVisitForSeat(ex, input.visitId);
  if (!TEAM_OPEN_STATUSES.includes(visit.status))
    throw new ServiceError("The team of this visit can no longer change.");
  const seats = await seatsOf(ex, visit.id);
  if (seats.some((seat) => seat.workerId === input.workerId && ACTIVE_SEAT_STATUSES.includes(seat.seatStatus))) {
    throw new ServiceError("This worker is already on this visit.");
  }
  if (seats.filter((seat) => seat.seatStatus === "ASSIGNED").length >= visit.workersNeeded) {
    throw new ServiceError("Every seat of this visit is already filled.");
  }

  const worker = await workerForSeat(ex, input.workerId);
  const judgement = await judgeSeat(ex, ctx, worker, visit, input.override);
  const seatId = await insertSeat(ex, ctx, { visitId: visit.id, worker });
  await writeOverrides(ex, ctx, judgement, { seatId, worker, visit });
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    subject: { kind: "WORKER", id: worker.id, label: worker.number },
    changes: { [`${worker.number}.seatStatus`]: [null, "ASSIGNED"] },
    context: { seatId, warnings: judgement.findings.map((finding) => finding.code) },
  });
  const status = await settleVisitTeam(ex, ctx, visit.id);
  return { seatId, findings: judgement.findings, status };
}

/** Takes a worker off a visit still to happen or under way; the reason typed goes to the log. */
export async function removeVisitWorker(
  ex: Executor,
  ctx: ServiceContext,
  input: { seatId: string; reason: string },
): Promise<{ status: VisitStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new ServiceError("A reason is required.");
  const seat = await ex.selectFrom("VisitWorker").selectAll().where("id", "=", input.seatId).executeTakeFirst();
  if (!seat) throw new ServiceError("This seat does not exist.");
  if (seat.seatStatus !== "ASSIGNED") throw new ServiceError("Only an assigned worker can be taken off a visit.");
  const visit = await readVisitForSeat(ex, seat.visitId);
  if (!TEAM_OPEN_STATUSES.includes(visit.status))
    throw new ServiceError("The team of this visit can no longer change.");

  const { set, changes } = changedColumns(seat, { seatStatus: "REMOVED" });
  await ex
    .updateTable("VisitWorker")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", seat.id)
    .execute();
  const label = (await workerNumber(ex, seat.workerId)) ?? seat.workerId;
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    reason,
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    subject: { kind: "WORKER", id: seat.workerId, label },
    changes: { [`${label}.seatStatus`]: changes?.seatStatus ?? [seat.seatStatus, "REMOVED"] },
    context: { seatId: seat.id },
  });
  const status = await settleVisitTeam(ex, ctx, visit.id);
  return { status };
}

/**
 * The office reached the client and confirms a visit awaiting confirmation
 * (an on-demand visit, or a contract visit whose team was completed by hand).
 * Every seat must be held.
 */
export async function confirmVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<{ status: VisitStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const visit = await readVisitForSeat(ex, input.visitId);
  if (visit.status !== "AWAITING_CONFIRMATION") {
    throw new ServiceError("Only a visit awaiting confirmation can be confirmed.");
  }
  const held = (await seatsOf(ex, visit.id)).filter((seat) => seat.seatStatus === "ASSIGNED").length;
  if (held < visit.workersNeeded) throw new ServiceError("A visit is confirmed only when every seat is filled.");

  await ex
    .updateTable("Visit")
    .set({
      status: "CONFIRMED",
      statusChangedAt: ctx.now,
      statusChangedByUserId: ctx.userId,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    changes: { status: [visit.status, "CONFIRMED"] },
    context: { cause: "CONFIRMED_BY_OFFICE" },
  });
  return { status: "CONFIRMED" };
}

export const listSeatCandidatesQuery = query(listSeatCandidates);
export const assignVisitWorkerAction = action(assignVisitWorker, { revalidate: [VISITS_PATH] });
export const removeVisitWorkerAction = action(removeVisitWorker, { revalidate: [VISITS_PATH] });
export const confirmVisitAction = action(confirmVisit, { revalidate: [VISITS_PATH] });
