import type { SectionLevel } from "@/lib/access/catalogue";
import { requireCapability, requireSection, sectionLevel } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logCollect } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, localTime, minutes, qty, type LocalDate, type LocalTime } from "@/lib/units";

import {
  addDays,
  daysBetween,
  isClockTime,
  isIsoDate,
  minutesOf,
  weekdaysOfCodes,
  type IsoDate,
} from "../rules/calendar";
import { rankReplacementCandidates, type RankedCandidate, type SeatToFill } from "../rules/replacement";
import type { RuleFinding } from "../rules/working-time";
import type { ReplacementExclusion, VisitStatus } from "../validators/option-codes";
import {
  TEAM_OPEN_STATUSES,
  absenceMeetsVisit,
  absencesOnVisit,
  findingsWithVisit,
  insertSeat,
  judgeSeat,
  readVisitForSeat,
  seatsForRules,
  sanctionedWorkers,
  settleVisitTeam,
  workerForSeat,
  workTimeSettings,
  workersOnVisit,
  writeOverrides,
  type RuleOverrideInput,
  type SeatResult,
  type VisitForSeat,
} from "./assignment";
import { VISITS_PATH } from "./programme";
import { readSiteForOrder, readWorkers } from "./upstream";

/**
 * Absences and leave of cleaning workers (#9), and the replacement of a worker
 * on a visit.
 *
 * `WorkerAbsence` is Operations' table; People books, decides and sets the pay
 * treatment through the functions here, with its own session (CONTRACTS.md
 * section 3), so they accept either the requests section or the workers'.
 *
 * A recorded absence or an approved leave opens the seats it hits: the worker's
 * seats on visits still to be done that day (only the visits whose hours meet
 * the absent hours, for half a day or some hours) become ABSENT, pointing at
 * the absence, so People counts it once. A leave asked for opens nothing until
 * it is approved. A range that crosses a month end is cut into one row per
 * month, so each payslip reads whole rows.
 *
 * A replacement is a new seat that names the seat it takes over
 * (`replacesVisitWorkerId`); there is no replacement table (DESIGN.md section 17).
 */

// ── Code lists (OPTION-CODES.md section 1 and 4) ────────────────────────────

/** ABSENCE_TYPE «يوم كامل / نصف يوم / ساعات». */
export const ABSENCE_TYPES = ["FULL_DAY", "HALF_DAY", "HOURS"] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

/** ABSENCE_CATEGORY. */
export const ABSENCE_CATEGORIES = ["LEAVE", "SICK", "PERSONAL", "UNJUSTIFIED", "OTHER"] as const;
export type AbsenceCategory = (typeof ABSENCE_CATEGORIES)[number];

/** ABSENCE_STATUS. RECORDED and APPROVED open seats; REQUESTED warns; the other two are ignored. */
export const ABSENCE_STATUSES = ["RECORDED", "REQUESTED", "APPROVED", "REFUSED", "CANCELLED"] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];

/** ABSENCE_VIA. */
export const ABSENCE_VIAS = ["PHONE", "IN_PERSON", "SUPERVISOR", "NO_SHOW"] as const;
export type AbsenceVia = (typeof ABSENCE_VIAS)[number];

/** LEAVE_TYPE (People's wording), only on an absence of category LEAVE. */
export const LEAVE_TYPES = ["ANNUAL", "SICK", "UNPAID", "MATERNITY", "FAMILY_EVENT", "COMP_REST", "OTHER"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

/** REPLACEMENT_REASON. */
export const REPLACEMENT_REASONS = [
  "ABSENCE",
  "CLIENT_REQUEST",
  "SANCTION",
  "WORKER_LEFT",
  "REST_ROTATION",
  "SCHEDULE_CHANGE",
] as const;
export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number];

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** Statuses of an absence that open seats. */
const IN_FORCE: readonly AbsenceStatus[] = ["RECORDED", "APPROVED"];

// ── Access ──────────────────────────────────────────────────────────────────

/** The office (requests section) and People (workers section) both act here. */
function requireAbsenceRight(ctx: ServiceContext, level: SectionLevel): void {
  const held = [sectionLevel(ctx, "REQUESTS"), sectionLevel(ctx, "WORKERS")];
  if (!held.some((each) => each === "WRITE" || (level === "READ" && each === "READ"))) {
    throw new ServiceError("You do not have permission to do this.");
  }
}

/**
 * Deciding a worker's leave, recording one already approved, cancelling a
 * leave, and the pay treatment (paid, justified) are HR's acts: `staff.write`
 * (HR) or the manager (DESIGN.md section 12; audit ACC-2, ruled). Recording
 * or cancelling an ordinary absence stays with the writers of the visit.
 */
function requireLeaveRight(ctx: ServiceContext): void {
  requireCapability(ctx, "staff.write");
}

/** A sickness is category SICK, never a leave of type SICK (RULINGS item 13; audit LAB-12). */
function refuseSickLeave(leaveType: string | null | undefined): void {
  if (leaveType === "SICK")
    throw new ServiceError("Record a sickness under the category Sick, not as a type of leave.");
}

/**
 * Two absences of one worker cannot cover the same day (OPS-03): People counts each one, and a monthly worker's
 * pay would be cut twice. The one already there is cancelled or changed first.
 */
export async function refuseOverlappingAbsence(
  ex: Executor,
  input: { workerId: string; startDate: string; endDate: string },
): Promise<void> {
  const clash = await ex
    .selectFrom("WorkerAbsence")
    .select("id")
    .where("workerId", "=", input.workerId)
    .where("status", "in", ["RECORDED", "APPROVED", "REQUESTED"])
    .where("startDate", "<=", localDate(input.endDate))
    .where("endDate", ">=", localDate(input.startDate))
    .executeTakeFirst();
  if (clash) {
    throw new ServiceError("This worker already has an absence on one of these days. Cancel or change it first.");
  }
}

// ── Rows ────────────────────────────────────────────────────────────────────

type AbsenceRow = Awaited<ReturnType<typeof absenceGroup>>[number];

/** The absence and the other parts of its leave cut at month ends, first month first. */
async function absenceGroup(ex: Executor, absenceId: string) {
  const row = await ex.selectFrom("WorkerAbsence").selectAll().where("id", "=", absenceId).executeTakeFirst();
  if (!row) throw new ServiceError("This absence does not exist.");
  if (!row.splitGroupId) return [row];
  return ex
    .selectFrom("WorkerAbsence")
    .selectAll()
    .where("splitGroupId", "=", row.splitGroupId)
    .orderBy("startDate")
    .execute();
}

async function workerOf(ex: Executor, workerId: string) {
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "number"])
    .where("id", "=", workerId)
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!worker) throw new ServiceError("This worker does not exist.");
  return worker;
}

const blankToNull = (text: string | null | undefined) => (text?.trim() ? text.trim() : null);
const rangeLabel = (row: { startDate: string; endDate: string }) => `${row.startDate}..${row.endDate}`;

/** The parts of a date range, one per calendar month. */
export function monthParts(
  startDate: IsoDate,
  endDate: IsoDate,
): { startDate: IsoDate; endDate: IsoDate; dayCount: number }[] {
  const parts: { startDate: IsoDate; endDate: IsoDate; dayCount: number }[] = [];
  let from = startDate;
  while (from <= endDate) {
    const year = Number(from.slice(0, 4));
    const month = Number(from.slice(5, 7));
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastOfMonth = addDays(nextMonth, -1);
    const to = endDate < lastOfMonth ? endDate : lastOfMonth;
    parts.push({ startDate: from, endDate: to, dayCount: daysBetween(from, to) + 1 });
    from = addDays(to, 1);
  }
  return parts;
}

/** A total in thousandths shared between the parts in proportion to their days, whole, adding up exactly. */
export function shareByDays(total: number, parts: readonly { dayCount: number }[]): number[] {
  const all = parts.reduce((sum, part) => sum + part.dayCount, 0);
  let counted = 0;
  let given = 0;
  return parts.map((part) => {
    counted += part.dayCount;
    const upTo = Math.round((total * counted) / all);
    const share = upTo - given;
    given = upTo;
    return share;
  });
}

// ── Seats an absence hits ───────────────────────────────────────────────────

/** A seat an absence opened, or gave back. */
export interface SeatHit {
  seatId: string;
  visitId: string;
  visitNumber: string;
  visitDate: LocalDate;
}

/**
 * The worker's ASSIGNED seats on visits still to be done in the absence's
 * range become ABSENT, pointing at it. For half a day or some hours, only the
 * visits whose planned hours meet the absent hours.
 */
async function openSeats(
  ex: Executor,
  ctx: ServiceContext,
  absence: Pick<AbsenceRow, "id" | "workerId" | "startDate" | "endDate" | "type" | "startTime" | "endTime">,
): Promise<SeatHit[]> {
  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .select([
      "VisitWorker.id as seatId",
      "VisitWorker.seatStatus",
      "VisitWorker.absenceId",
      "Visit.id as visitId",
      "Visit.number as visitNumber",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
    ])
    .where("VisitWorker.workerId", "=", absence.workerId)
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .where("Visit.status", "not in", ["DONE", "CANCELLED", "POSTPONED"])
    .where("Visit.visitDate", ">=", absence.startDate)
    .where("Visit.visitDate", "<=", absence.endDate)
    .orderBy("Visit.visitDate")
    .orderBy("Visit.plannedStartTime")
    .execute();
  const hits: SeatHit[] = [];
  for (const seat of seats) {
    if (!absenceMeetsVisit(absence, seat)) continue;
    const { set } = changedColumns(
      { seatStatus: seat.seatStatus, absenceId: seat.absenceId },
      { seatStatus: "ABSENT", absenceId: absence.id },
    );
    await ex
      .updateTable("VisitWorker")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", seat.seatId)
      .execute();
    hits.push({ seatId: seat.seatId, visitId: seat.visitId, visitNumber: seat.visitNumber, visitDate: seat.visitDate });
  }
  return hits;
}

/** The status rule and the printed-order rule on every visit whose team changed. */
async function settleVisits(ex: Executor, ctx: ServiceContext, hits: readonly SeatHit[]): Promise<void> {
  for (const visitId of new Set(hits.map((hit) => hit.visitId))) await settleVisitTeam(ex, ctx, visitId);
}

const seatsForLog = (hits: readonly SeatHit[]) =>
  hits.map((hit) => ({ seatId: hit.seatId, visit: hit.visitNumber, date: hit.visitDate }));

// ── Recording ───────────────────────────────────────────────────────────────

export interface RecordWorkerAbsenceInput {
  workerId: string;
  startDate: string;
  endDate: string;
  type: AbsenceType;
  /** Required for HOURS; HALF_DAY without them is the morning period (`work.period.morning`). */
  startTime?: string | null;
  endTime?: string | null;
  category: AbsenceCategory;
  /** Required for a leave (category LEAVE), with `days`. */
  leaveType?: LeaveType | null;
  /** Days counted against the leave balance, in thousandths: 2500 is two days and a half. */
  days?: number | null;
  paid?: boolean;
  justified?: boolean;
  reportedVia?: AbsenceVia | null;
  reason?: string | null;
  details?: string | null;
  /** RECORDED (the default), REQUESTED for a leave asked for, APPROVED for a leave already decided. */
  status?: "RECORDED" | "REQUESTED" | "APPROVED";
}

export interface RecordedAbsence {
  /** One per month the range touches. */
  absenceIds: string[];
  /** The seats it opened: none for a leave only asked for. */
  seatsHit: SeatHit[];
}

export async function recordWorkerAbsence(
  ex: Executor,
  ctx: ServiceContext,
  input: RecordWorkerAbsenceInput,
): Promise<RecordedAbsence> {
  requireAbsenceRight(ctx, "WRITE");
  const status = input.status ?? "RECORDED";
  if (status === "APPROVED" || input.paid || input.justified) requireLeaveRight(ctx);
  refuseSickLeave(input.category === "LEAVE" ? input.leaveType : null);
  if (
    !oneOf(["RECORDED", "REQUESTED", "APPROVED"] as const, status) ||
    !oneOf(ABSENCE_TYPES, input.type) ||
    !oneOf(ABSENCE_CATEGORIES, input.category) ||
    (input.reportedVia != null && !oneOf(ABSENCE_VIAS, input.reportedVia)) ||
    (input.leaveType != null && !oneOf(LEAVE_TYPES, input.leaveType))
  ) {
    throw new ServiceError("Choose one of the options.");
  }
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) throw new ServiceError("Enter a valid date.");
  if (input.endDate < input.startDate) throw new ServiceError("The absence cannot end before it starts.");
  await refuseOverlappingAbsence(ex, input);

  // The hours, for half a day or some hours.
  let startTime = blankToNull(input.startTime);
  let endTime = blankToNull(input.endTime);
  const settings = await getSettings(ex, ["work.dayMin", "work.period.morning"]);
  if (input.type === "FULL_DAY") {
    startTime = null;
    endTime = null;
  } else {
    if (input.type === "HALF_DAY" && !startTime && !endTime) {
      startTime = settings["work.period.morning"].from;
      endTime = settings["work.period.morning"].to;
    }
    if (!startTime || !endTime) throw new ServiceError("Give both the start and the end time of the absence.");
    if (!isClockTime(startTime) || !isClockTime(endTime)) throw new ServiceError("Enter a time as HH:MM.");
    if (minutesOf(endTime) <= minutesOf(startTime))
      throw new ServiceError("The end time must be after the start time.");
  }

  // A leave carries its type and its days; nothing else carries a leave type.
  const isLeave = input.category === "LEAVE";
  const days = input.days ?? null;
  if (days !== null && (!Number.isSafeInteger(days) || days < 0)) {
    throw new ServiceError("The number of days must be zero or more.");
  }
  if (isLeave && (!input.leaveType || days === null)) {
    throw new ServiceError("A leave needs its type and its number of days.");
  }

  const worker = await workerOf(ex, input.workerId);
  const parts = monthParts(input.startDate, input.endDate);
  const dayMin = settings["work.dayMin"];
  const perDay =
    input.type === "FULL_DAY"
      ? dayMin
      : input.type === "HALF_DAY"
        ? Math.round(dayMin / 2)
        : minutesOf(endTime as string) - minutesOf(startTime as string);
  const daysByPart = days === null ? parts.map(() => null) : shareByDays(days, parts);
  const splitGroupId = parts.length > 1 ? newId() : null;
  const decided = status === "APPROVED";

  const absenceIds: string[] = [];
  const seatsHit: SeatHit[] = [];
  for (const [index, part] of parts.entries()) {
    const row = {
      id: newId(),
      workerId: worker.id,
      startDate: localDate(part.startDate),
      endDate: localDate(part.endDate),
      type: input.type,
      startTime: startTime ? localTime(startTime) : null,
      endTime: endTime ? localTime(endTime) : null,
      absenceMin: minutes(perDay * part.dayCount),
      category: input.category,
      leaveType: isLeave ? (input.leaveType ?? null) : null,
      days: daysByPart[index] === null ? null : qty(daysByPart[index] as number),
      splitGroupId,
      paid: input.paid ? 1 : 0,
      justified: input.justified ? 1 : 0,
      plannedAhead: input.startDate > ctx.today ? 1 : 0,
      reportedVia: input.reportedVia ?? null,
      reason: blankToNull(input.reason),
      details: blankToNull(input.details),
      status,
      decidedByUserId: decided ? ctx.userId : null,
      decidedAt: decided ? ctx.now : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    };
    await ex.insertInto("WorkerAbsence").values(row).execute();
    const hits = IN_FORCE.includes(status) ? await openSeats(ex, ctx, row) : [];
    await logCollect(ex, ctx, {
      owner: "OPERATIONS",
      action: "CREATE",
      entity: "WorkerAbsence",
      entityId: row.id,
      entityLabel: rangeLabel(row),
      subject: { kind: "WORKER", id: worker.id, label: worker.number },
      context: { status, type: row.type, splitGroupId, seats: seatsForLog(hits) },
    });
    absenceIds.push(row.id);
    seatsHit.push(...hits);
  }

  await settleVisits(ex, ctx, seatsHit);
  for (const absenceId of absenceIds) await emit(ex, ctx, "absence.recorded", { absenceId });
  return { absenceIds, seatsHit };
}

// ── Deciding, cancelling, the pay treatment ─────────────────────────────────

/** HR's answer to a leave asked for: approving opens the seats it hits. Every part of the leave at once. */
export async function decideWorkerLeave(
  ex: Executor,
  ctx: ServiceContext,
  input: { absenceId: string; status: "APPROVED" | "REFUSED"; reason: string },
): Promise<RecordedAbsence> {
  requireAbsenceRight(ctx, "WRITE");
  requireLeaveRight(ctx);
  if (!oneOf(["APPROVED", "REFUSED"] as const, input.status)) throw new ServiceError("Choose one of the options.");
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new ServiceError("A reason is required.");
  const group = await absenceGroup(ex, input.absenceId);
  if (group.some((row) => row.status !== "REQUESTED")) {
    throw new ServiceError("Only a leave that was asked for can be approved or refused.");
  }

  const seatsHit: SeatHit[] = [];
  for (const row of group) {
    const { set } = changedColumns(row, { status: input.status, decidedByUserId: ctx.userId, decidedAt: ctx.now });
    await ex
      .updateTable("WorkerAbsence")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", row.id)
      .execute();
    if (input.status === "APPROVED") seatsHit.push(...(await openSeats(ex, ctx, row)));
  }
  await settleVisits(ex, ctx, seatsHit);

  const worker = await workerOf(ex, group[0].workerId);
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: input.status === "APPROVED" ? "APPROVE" : "REFUSE",
    reason,
    entity: "WorkerAbsence",
    entityId: input.absenceId,
    entityLabel: rangeLabel({ startDate: group[0].startDate, endDate: group[group.length - 1].endDate }),
    subject: { kind: "WORKER", id: worker.id, label: worker.number },
    changes: { status: ["REQUESTED", input.status] },
    context: { absenceIds: group.map((row) => row.id), seats: seatsForLog(seatsHit) },
  });
  for (const row of group) await emit(ex, ctx, "absence.recorded", { absenceId: row.id });
  return { absenceIds: group.map((row) => row.id), seatsHit };
}

export interface CancelledAbsence {
  absenceIds: string[];
  /** Seats she holds again. */
  seatsGivenBack: SeatHit[];
  /** Seats another worker had taken over: they stay with her replacement. */
  seatsReplaced: SeatHit[];
  /** Seats she could not take back without breaking a working-time rule: left open, to fill by hand. */
  seatsLeftOpen: Array<SeatHit & { why: string }>;
}

/**
 * Cancels an absence or a leave, every part of it. The seats it opened on
 * visits not done or cancelled come back to the worker, unless another worker
 * took one over: that seat then reads REPLACED, the absence behind it being gone.
 */
export async function cancelWorkerAbsence(
  ex: Executor,
  ctx: ServiceContext,
  input: { absenceId: string; reason: string },
): Promise<CancelledAbsence> {
  requireAbsenceRight(ctx, "WRITE");
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new ServiceError("A reason is required.");
  const group = await absenceGroup(ex, input.absenceId);
  if (group.every((row) => row.status === "CANCELLED" || row.status === "REFUSED")) {
    throw new ServiceError("This absence is already cancelled or refused.");
  }
  if (group.some((row) => row.category === "LEAVE")) requireLeaveRight(ctx);

  for (const row of group) {
    const { set, changes } = changedColumns(row, { status: "CANCELLED" });
    if (!changes) continue;
    await ex
      .updateTable("WorkerAbsence")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", row.id)
      .execute();
  }

  const ids = group.map((row) => row.id);
  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .select([
      "VisitWorker.id as seatId",
      "VisitWorker.seatStatus",
      "VisitWorker.absenceId",
      "Visit.id as visitId",
      "Visit.number as visitNumber",
      "Visit.visitDate",
    ])
    .where("VisitWorker.absenceId", "in", ids)
    .where("VisitWorker.seatStatus", "=", "ABSENT")
    .where("Visit.status", "not in", ["DONE", "CANCELLED"])
    .orderBy("Visit.visitDate")
    .execute();
  const takenOver =
    seats.length === 0
      ? new Set<string | null>()
      : new Set(
          (
            await ex
              .selectFrom("VisitWorker")
              .select("replacesVisitWorkerId")
              .where(
                "replacesVisitWorkerId",
                "in",
                seats.map((seat) => seat.seatId),
              )
              .execute()
          ).map((row) => row.replacesVisitWorkerId),
        );

  const seatsGivenBack: SeatHit[] = [];
  const seatsReplaced: SeatHit[] = [];
  const seatsLeftOpen: Array<SeatHit & { why: string }> = [];
  for (const seat of seats) {
    const replaced = takenOver.has(seat.seatId);
    // A seat comes back only as a new seat would be given: under the working-time rules, with no override (LAB-10).
    const why = replaced ? null : await whySeatStaysOpen(ex, ctx, group[0].workerId, seat.visitId);
    const next = replaced
      ? { seatStatus: "REPLACED" }
      : why === null
        ? { seatStatus: "ASSIGNED", absenceId: null }
        : { seatStatus: "REMOVED", absenceId: null };
    const { set } = changedColumns({ seatStatus: seat.seatStatus, absenceId: seat.absenceId }, next);
    await ex
      .updateTable("VisitWorker")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", seat.seatId)
      .execute();
    const hit = {
      seatId: seat.seatId,
      visitId: seat.visitId,
      visitNumber: seat.visitNumber,
      visitDate: seat.visitDate,
    };
    if (replaced) seatsReplaced.push(hit);
    else if (why === null) seatsGivenBack.push(hit);
    else seatsLeftOpen.push({ ...hit, why });
  }
  await settleVisits(ex, ctx, [...seatsGivenBack, ...seatsReplaced, ...seatsLeftOpen]);

  const worker = await workerOf(ex, group[0].workerId);
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CANCEL",
    reason,
    entity: "WorkerAbsence",
    entityId: input.absenceId,
    entityLabel: rangeLabel({ startDate: group[0].startDate, endDate: group[group.length - 1].endDate }),
    subject: { kind: "WORKER", id: worker.id, label: worker.number },
    changes: { status: [group[0].status, "CANCELLED"] },
    context: {
      absenceIds: ids,
      seatsGivenBack: seatsForLog(seatsGivenBack),
      seatsReplaced: seatsForLog(seatsReplaced),
      seatsLeftOpen: seatsLeftOpen.map((seat) => ({ visit: seat.visitNumber, why: seat.why })),
    },
  });
  for (const id of ids) await emit(ex, ctx, "absence.recorded", { absenceId: id });
  return { absenceIds: ids, seatsGivenBack, seatsReplaced, seatsLeftOpen };
}

/**
 * Why a seat left by a cancelled absence cannot come back to her: a rule the
 * seat would break now (two visits at once, over 48 hours, a sanction…), as
 * `judgeSeat` words it. Null when it can.
 */
async function whySeatStaysOpen(
  ex: Executor,
  ctx: ServiceContext,
  workerId: string,
  visitId: string,
): Promise<string | null> {
  // A seat filled meanwhile by «إضافة عامل» is not given back on top of it (OPS-07).
  const visit = await ex.selectFrom("Visit").select("workersNeeded").where("id", "=", visitId).executeTakeFirst();
  const held = await ex
    .selectFrom("VisitWorker")
    .select("id")
    .where("visitId", "=", visitId)
    .where("seatStatus", "=", "ASSIGNED")
    .execute();
  if (visit && held.length >= visit.workersNeeded) return "Every seat of this visit is already filled.";
  try {
    const worker = await workerForSeat(ex, ctx, workerId);
    await judgeSeat(ex, ctx, worker, await readVisitForSeat(ex, visitId), null);
    return null;
  } catch (error) {
    if (error instanceof ServiceError) return error.message;
    throw error;
  }
}

/** People's treatment of one row for pay: paid, justified, the leave days and type. Changed columns only. */
export async function setAbsencePayTreatment(
  ex: Executor,
  ctx: ServiceContext,
  input: { absenceId: string; paid: boolean; justified: boolean; days?: number | null; leaveType?: LeaveType | null },
): Promise<{ absenceId: string; changed: boolean }> {
  requireAbsenceRight(ctx, "WRITE");
  requireLeaveRight(ctx);
  if (input.leaveType != null && !oneOf(LEAVE_TYPES, input.leaveType))
    throw new ServiceError("Choose one of the options.");
  if (input.days != null && (!Number.isSafeInteger(input.days) || input.days < 0)) {
    throw new ServiceError("The number of days must be zero or more.");
  }
  const before = await ex.selectFrom("WorkerAbsence").selectAll().where("id", "=", input.absenceId).executeTakeFirst();
  if (!before) throw new ServiceError("This absence does not exist.");

  const isLeave = before.category === "LEAVE";
  const leaveType = isLeave ? (input.leaveType === undefined ? before.leaveType : input.leaveType) : null;
  if (input.leaveType !== undefined) refuseSickLeave(leaveType);
  const days = input.days === undefined ? before.days : input.days === null ? null : qty(input.days);
  if (isLeave && (!leaveType || days === null))
    throw new ServiceError("A leave needs its type and its number of days.");

  const { set, changes } = changedColumns(before, {
    paid: input.paid ? 1 : 0,
    justified: input.justified ? 1 : 0,
    leaveType,
    days,
  });
  if (!changes) return { absenceId: before.id, changed: false };
  await ex
    .updateTable("WorkerAbsence")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  const worker = await workerOf(ex, before.workerId);
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "WorkerAbsence",
    entityId: before.id,
    entityLabel: rangeLabel(before),
    subject: { kind: "WORKER", id: worker.id, label: worker.number },
    changes,
  });
  await emit(ex, ctx, "absence.recorded", { absenceId: before.id });
  return { absenceId: before.id, changed: true };
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** One row of `WorkerAbsence`, as People reads it. */
export interface WorkerAbsenceItem {
  id: string;
  workerId: string;
  startDate: LocalDate;
  endDate: LocalDate;
  type: AbsenceType;
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  absenceMin: number;
  category: AbsenceCategory;
  leaveType: LeaveType | null;
  /** Thousandths of a day. */
  days: number | null;
  splitGroupId: string | null;
  paid: boolean;
  justified: boolean;
  plannedAhead: boolean;
  reportedVia: AbsenceVia | null;
  reason: string | null;
  details: string | null;
  status: AbsenceStatus;
  decidedAt: string | null;
}

/** The absences that overlap a range, whatever their status, one worker's or everybody's. */
export async function listWorkerAbsences(
  ex: Executor,
  ctx: ServiceContext,
  input: { workerId?: string | null; from: string; to: string },
): Promise<WorkerAbsenceItem[]> {
  requireAbsenceRight(ctx, "READ");
  if (!isIsoDate(input.from) || !isIsoDate(input.to)) throw new ServiceError("Enter a valid date.");
  let rows = ex
    .selectFrom("WorkerAbsence")
    .selectAll()
    .where("startDate", "<=", localDate(input.to))
    .where("endDate", ">=", localDate(input.from));
  if (input.workerId) rows = rows.where("workerId", "=", input.workerId);
  const found = await rows.orderBy("startDate").orderBy("workerId").orderBy("id").execute();
  return found.map((row) => ({
    id: row.id,
    workerId: row.workerId,
    startDate: row.startDate,
    endDate: row.endDate,
    type: row.type as AbsenceType,
    startTime: row.startTime,
    endTime: row.endTime,
    absenceMin: row.absenceMin,
    category: row.category as AbsenceCategory,
    leaveType: row.leaveType as LeaveType | null,
    days: row.days,
    splitGroupId: row.splitGroupId,
    paid: row.paid === 1,
    justified: row.justified === 1,
    plannedAhead: row.plannedAhead === 1,
    reportedVia: row.reportedVia as AbsenceVia | null,
    reason: row.reason,
    details: row.details,
    status: row.status as AbsenceStatus,
    decidedAt: row.decidedAt,
  }));
}

// ── Replacement ─────────────────────────────────────────────────────────────

interface WorkerNames {
  number: string;
  firstName: string;
  lastName: string;
}

export interface ReplacementSuggestions {
  seatId: string;
  visitId: string;
  visitNumber: string;
  visitDate: LocalDate;
  /** Best first; each with what the rules say once she takes the seat. */
  ranked: (RankedCandidate & WorkerNames & { findings: RuleFinding[]; leaveRequested: boolean })[];
  /** Those left out, and why. */
  excluded: ({ workerId: string; reasons: ReplacementExclusion[] } & WorkerNames)[];
}

/** The seat a replacement fills, from the visit and its site. */
async function seatToFill(ex: Executor, visit: VisitForSeat): Promise<SeatToFill> {
  const site = await readSiteForOrder(ex, { siteId: visit.siteId, securityTicked: false });
  return {
    visitId: visit.id,
    siteId: visit.siteId,
    zoneId: visit.zoneId ?? site?.zoneId ?? null,
    date: visit.visitDate,
    startTime: visit.plannedStartTime,
    durationMin: visit.plannedDurationMin,
    womenOnly: site?.womenOnly ?? false,
    requiredAbilities: site?.requiredAbilityCodes ?? [],
  };
}

/** The file's named alternates on the visit's day (D1 «كل منطقة لها عاملة بديلة»). */
async function fileAlternates(ex: Executor, visit: VisitForSeat): Promise<string[]> {
  const day = visit.visitDate;
  let rows = ex
    .selectFrom("FileAssignment")
    .select("workerId")
    .where("fileId", "=", visit.fileId)
    .where("role", "=", "ALTERNATE")
    .where("workerId", "is not", null)
    .where("deletedAt", "is", null)
    .where("validFrom", "<=", day)
    .where((eb) => eb.or([eb("validTo", "is", null), eb("validTo", ">=", day)]));
  const slotId = visit.fileSlotId;
  rows = slotId
    ? rows.where((eb) => eb.or([eb("fileSlotId", "is", null), eb("fileSlotId", "=", slotId)]))
    : rows.where("fileSlotId", "is", null);
  return (await rows.orderBy("sortOrder").execute()).map((row) => row.workerId as string);
}

/** Workers resting that day under the rest-day rotation. */
async function restingOn(ex: Executor, date: LocalDate): Promise<Set<string>> {
  const rows = await ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .select("VisitWorker.workerId")
    .where("VisitWorker.seatStatus", "=", "RESTING")
    .where("Visit.visitDate", "=", date)
    .execute();
  return new Set(rows.map((row) => row.workerId));
}

/** How many visits each worker has done on the site before the date, read by site (a renewal is a new file). */
async function visitsAtSiteBefore(ex: Executor, siteId: string, date: LocalDate): Promise<Map<string, number>> {
  const rows = await ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .select(["VisitWorker.workerId", "Visit.id as visitId"])
    .where("File.siteId", "=", siteId)
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .where("Visit.visitDate", "<", date)
    .where("Visit.status", "not in", ["CANCELLED", "POSTPONED"])
    .execute();
  const visits = new Map<string, Set<string>>();
  for (const row of rows) visits.set(row.workerId, (visits.get(row.workerId) ?? new Set()).add(row.visitId));
  return new Map([...visits].map(([workerId, set]) => [workerId, set.size]));
}

async function replaceableSeat(ex: Executor, seatId: string) {
  const seat = await ex.selectFrom("VisitWorker").selectAll().where("id", "=", seatId).executeTakeFirst();
  if (!seat) throw new ServiceError("This seat does not exist.");
  // A RESTING seat is a member's rotating rest day (LAB-4): replaced as an absence is.
  if (seat.seatStatus !== "ASSIGNED" && seat.seatStatus !== "ABSENT" && seat.seatStatus !== "RESTING") {
    throw new ServiceError("Only a seat held or left by an absence can be replaced.");
  }
  return seat;
}

/**
 * Who may take a seat over, best first: the file's named alternate, the reserve
 * of the site's zone, the zone's other workers, the reserve of another zone,
 * then everybody else (`rules/replacement.ts`). The office always chooses.
 */
export async function suggestReplacements(
  ex: Executor,
  ctx: ServiceContext,
  input: { seatId: string },
): Promise<ReplacementSuggestions> {
  requireSection(ctx, "REQUESTS", "READ");
  const seat = await replaceableSeat(ex, input.seatId);
  const visit = await readVisitForSeat(ex, seat.visitId);
  const toFill = await seatToFill(ex, visit);
  const onVisit = await workersOnVisit(ex, visit.id);
  const workers = (await readWorkers(ex, ctx, { date: visit.visitDate })).filter((worker) => !onVisit.has(worker.id));

  const settings = await workTimeSettings(ex);
  const forRules = await seatsForRules(ex, visit.visitDate, { exceptVisitId: visit.id });
  const weekSeats = forRules.week;
  const absences = await absencesOnVisit(ex, visit);
  const sanctioned = await sanctionedWorkers(
    ex,
    ctx,
    visit.visitDate,
    workers.map((worker) => worker.id),
  );
  const resting = await restingOn(ex, visit.visitDate);
  const atSite = await visitsAtSiteBefore(ex, visit.siteId, visit.visitDate);
  const alternates = await fileAlternates(ex, visit);

  const ranking = rankReplacementCandidates(
    toFill,
    alternates,
    workers.map((worker) => ({
      workerId: worker.id,
      name: `${worker.lastName} ${worker.firstName}`,
      sex: worker.sex as "MALE" | "FEMALE",
      zoneId: worker.zoneId,
      isReserve: worker.isReserve,
      availableWeekdays: weekdaysOfCodes(worker.availableDays),
      abilities: worker.abilities,
      isSanctioned: sanctioned.has(worker.id),
      isAbsent: absences.get(worker.id)?.absent ?? false,
      isResting: resting.has(worker.id),
      weeklyCapacityMin: worker.weeklyCapacityMin,
      weekSeats: weekSeats.get(worker.id) ?? [],
      visitsAtSite: atSite.get(worker.id) ?? 0,
    })),
    settings,
  );

  const byId = new Map(workers.map((worker) => [worker.id, worker]));
  const names = (workerId: string): WorkerNames => {
    const worker = byId.get(workerId);
    return { number: worker?.number ?? "", firstName: worker?.firstName ?? "", lastName: worker?.lastName ?? "" };
  };
  return {
    seatId: seat.id,
    visitId: visit.id,
    visitNumber: visit.number,
    visitDate: visit.visitDate,
    ranked: ranking.ranked.map((ranked) => {
      const worker = byId.get(ranked.workerId);
      return {
        ...ranked,
        ...names(ranked.workerId),
        findings: worker ? findingsWithVisit(worker, forRules.withEdges(worker.id), false, visit, settings) : [],
        leaveRequested: absences.get(ranked.workerId)?.requested ?? false,
      };
    }),
    excluded: ranking.excluded.map((excluded) => ({ ...excluded, ...names(excluded.workerId) })),
  };
}

export interface ReplaceSeatInput {
  seatId: string;
  workerId: string;
  reason: ReplacementReason;
  /** Given when the manager passes a rule only he may pass. */
  override?: RuleOverrideInput | null;
}

/**
 * Another worker takes a seat over: a new ASSIGNED seat naming the one it
 * replaces, with the reason and the absence behind it. The old seat stays
 * ABSENT when it was (so People counts the absence once); a seat still held
 * becomes REPLACED. The same rules and the same override as giving a seat.
 */
export async function replaceSeat(ex: Executor, ctx: ServiceContext, input: ReplaceSeatInput): Promise<SeatResult> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!oneOf(REPLACEMENT_REASONS, input.reason)) throw new ServiceError("Choose one of the options.");
  const old = await replaceableSeat(ex, input.seatId);
  const visit = await readVisitForSeat(ex, old.visitId);
  if (!TEAM_OPEN_STATUSES.includes(visit.status))
    throw new ServiceError("The team of this visit can no longer change.");
  if ((await workersOnVisit(ex, visit.id)).has(input.workerId)) {
    throw new ServiceError("This worker is already on this visit.");
  }
  // The team keeps its size (OPS-07): a seat is replaced once, and a replacement never fills a seat already full.
  const seats = await ex
    .selectFrom("VisitWorker")
    .select(["id", "seatStatus", "replacesVisitWorkerId"])
    .where("visitId", "=", visit.id)
    .execute();
  if (seats.some((seat) => seat.replacesVisitWorkerId === old.id && seat.seatStatus === "ASSIGNED")) {
    throw new ServiceError("This seat is already replaced: replace the worker who took it instead.");
  }
  const held = seats.filter((seat) => seat.seatStatus === "ASSIGNED").length;
  if (old.seatStatus !== "ASSIGNED" && held >= visit.workersNeeded) {
    throw new ServiceError("Every seat of this visit is already filled.");
  }

  const worker = await workerForSeat(ex, ctx, input.workerId);
  const judgement = await judgeSeat(ex, ctx, worker, visit, input.override);

  const changes: Record<string, readonly [unknown, unknown]> = {};
  const oldNumber = (await workerOf(ex, old.workerId)).number;
  if (old.seatStatus === "ASSIGNED") {
    const { set } = changedColumns(old, { seatStatus: "REPLACED" });
    await ex
      .updateTable("VisitWorker")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", old.id)
      .execute();
    changes[`${oldNumber}.seatStatus`] = ["ASSIGNED", "REPLACED"];
  }
  const seatId = await insertSeat(ex, ctx, {
    visitId: visit.id,
    worker,
    replaces: { seatId: old.id, reason: input.reason, absenceId: old.absenceId },
  });
  changes[`${worker.number}.seatStatus`] = [null, "ASSIGNED"];
  await writeOverrides(ex, ctx, judgement, { seatId, worker, visit });
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    subject: { kind: "WORKER", id: worker.id, label: worker.number },
    changes,
    context: {
      seatId,
      replacesSeatId: old.id,
      replacedWorker: oldNumber,
      replacementReason: input.reason,
      absenceId: old.absenceId,
      warnings: judgement.findings.map((finding) => finding.code),
    },
  });
  const status: VisitStatus = await settleVisitTeam(ex, ctx, visit.id);
  return { seatId, findings: judgement.findings, status };
}

const PEOPLE_REFRESH = [VISITS_PATH, "/dashboard/workers"];

export const recordWorkerAbsenceAction = action(recordWorkerAbsence, { revalidate: PEOPLE_REFRESH });
export const decideWorkerLeaveAction = action(decideWorkerLeave, { revalidate: PEOPLE_REFRESH });
export const cancelWorkerAbsenceAction = action(cancelWorkerAbsence, { revalidate: PEOPLE_REFRESH });
export const setAbsencePayTreatmentAction = action(setAbsencePayTreatment, { revalidate: PEOPLE_REFRESH });
export const replaceSeatAction = action(replaceSeat, { revalidate: PEOPLE_REFRESH });
export const listWorkerAbsencesQuery = query(listWorkerAbsences);
export const suggestReplacementsQuery = query(suggestReplacements);
