import { sql } from "kysely";

import { sectionLevel } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, type LocalDate, type LocalTime } from "@/lib/units";

import {
  MINUTES_PER_DAY,
  addDays,
  clockOf,
  isIsoDate,
  minutesNear,
  minutesOf,
  type ClockTime,
  type IsoDate,
  type LocalMoment,
} from "../rules/calendar";
import { endTimeOf } from "../rules/visit-dates";
import type { EntryState, PresenceProof, VisitStatus } from "../validators/option-codes";
import {
  listWorkerAbsences,
  type AbsenceCategory,
  type AbsenceStatus,
  type AbsenceType,
  type AbsenceVia,
  type LeaveType,
  type WorkerAbsenceItem,
} from "./absences";
import { SCHEDULABLE_ENGAGEMENTS, readWorkers, type SchedulableWorker } from "./upstream";

/**
 * The reads behind the tab «الحضور والغياب» of «عمال النظافة» (#9, #12).
 *
 * A worker's attendance is what the office typed from the returned order: on
 * each seat, the arrival, the start and end of work and the departure, with the
 * site contact's initials. Nothing is clocked in from a phone. Her absences are
 * `WorkerAbsence` rows, written by absences.ts.
 *
 * The office reads here through the requests section, People through the
 * workers section: either one is enough, as for the absences themselves.
 * Reading is not logged: these are lists (DESIGN.md section 9), and nothing of
 * `StaffConfidential` is read.
 */

export const WORKER_ATTENDANCE_PATH = "/dashboard/worker-attendance";

/** The seats this tab shows: held, lost to an absence, a rotated rest day, handed over. Not a seat taken off. */
const SHOWN_SEATS = ["ASSIGNED", "ABSENT", "RESTING", "REPLACED"] as const;
export type ShownSeatStatus = (typeof SHOWN_SEATS)[number];

/** A visit that did not take place has no attendance to read on the day. */
const NOT_HELD: readonly VisitStatus[] = ["CANCELLED", "POSTPONED"];

/** What a worker's day comes to, read from her seats and her absences. */
export const ATTENDANCE_DAY_STATES = ["PRESENT", "ABSENT", "NOT_TYPED", "SCHEDULED", "RESTING", "NO_VISIT"] as const;
export type AttendanceDayState = (typeof ATTENDANCE_DAY_STATES)[number];

/** Paid or justified, for an absence cut into parts that People may have treated one by one. */
export const TREATMENTS = ["YES", "NO", "PARTLY"] as const;
export type Treatment = (typeof TREATMENTS)[number];

// ── Access and input ────────────────────────────────────────────────────────

function requireAttendanceRead(ctx: ServiceContext): void {
  if (sectionLevel(ctx, "REQUESTS") === null && sectionLevel(ctx, "WORKERS") === null) {
    throw new ServiceError("You do not have permission to do this.");
  }
}

function dateOf(text: unknown): LocalDate {
  if (typeof text !== "string" || !isIsoDate(text)) throw new ServiceError("Enter a valid date.");
  return localDate(text);
}

function rangeOf(input: { from: unknown; to: unknown }): { from: LocalDate; to: LocalDate } {
  const from = dateOf(input.from);
  const to = dateOf(input.to);
  if (to < from) throw new ServiceError("The start of the period is after its end.");
  return { from, to };
}

// ── Pure rules ──────────────────────────────────────────────────────────────

/**
 * When a clock time typed on an order happened: on the visit's day, or the day
 * before or after, whichever puts it nearest a moment of the visit given in
 * minutes after the visit day's midnight (past 1440 for a night visit's end).
 */
export function momentNear(visitDate: IsoDate, time: ClockTime, anchorMin: number): LocalMoment {
  const anchorDay = Math.floor(anchorMin / MINUTES_PER_DAY);
  const near = minutesNear(time, clockOf(anchorMin)) + anchorDay * MINUTES_PER_DAY;
  return { date: addDays(visitDate, Math.floor(near / MINUTES_PER_DAY)), time };
}

/**
 * Her day in one word. A typed arrival wins: she came, whatever else. Then a
 * seat she still holds (the order not typed in yet, or a day still to come),
 * then an absence, then a rest day.
 */
export function dayStateOf(input: {
  date: IsoDate;
  today: IsoDate;
  seats: readonly { seatStatus: string; arrivedTime: string | null }[];
  absenceInForce: boolean;
}): AttendanceDayState {
  const held = input.seats.filter((seat) => seat.seatStatus === "ASSIGNED");
  if (held.some((seat) => seat.arrivedTime)) return "PRESENT";
  if (held.length > 0) return input.date > input.today ? "SCHEDULED" : "NOT_TYPED";
  if (input.absenceInForce || input.seats.some((seat) => seat.seatStatus === "ABSENT")) return "ABSENT";
  if (input.seats.some((seat) => seat.seatStatus === "RESTING")) return "RESTING";
  return "NO_VISIT";
}

export interface AttendanceTotals {
  /** Visits she was expected at: a seat held or lost to an absence, on a visit that took place. */
  expected: number;
  /** Of those, the ones whose arrival was typed. */
  present: number;
  /** Seats lost to an absence. */
  absent: number;
  /** Time worked, as the orders give it. */
  workedMin: number;
  /** Arrivals later than the grace time. */
  lateCount: number;
  /** Minutes after the planned start, over every arrival. */
  lateMin: number;
}

export function attendanceTotals(
  seats: readonly {
    seatStatus: string;
    visitStatus: string;
    arrivedTime: string | null;
    lateMin: number | null;
    workedMin: number | null;
  }[],
  graceMin: number,
): AttendanceTotals {
  const totals: AttendanceTotals = { expected: 0, present: 0, absent: 0, workedMin: 0, lateCount: 0, lateMin: 0 };
  for (const seat of seats) {
    if ((NOT_HELD as readonly string[]).includes(seat.visitStatus)) continue;
    if (seat.seatStatus === "ABSENT") {
      totals.expected += 1;
      totals.absent += 1;
      continue;
    }
    if (seat.seatStatus !== "ASSIGNED") continue;
    totals.expected += 1;
    if (seat.arrivedTime) totals.present += 1;
    totals.workedMin += seat.workedMin ?? 0;
    totals.lateMin += seat.lateMin ?? 0;
    if ((seat.lateMin ?? 0) > graceMin) totals.lateCount += 1;
  }
  return totals;
}

const treatmentOf = (values: readonly boolean[]): Treatment =>
  values.every(Boolean) ? "YES" : values.some(Boolean) ? "PARTLY" : "NO";

/** An absence as the office reads it: one line, whatever the number of month parts it was cut into. */
export interface MergedAbsence {
  /** The first part: what cancelling names, and every part goes with it. */
  id: string;
  absenceIds: string[];
  workerId: string;
  startDate: LocalDate;
  endDate: LocalDate;
  type: AbsenceType;
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  /** Over every part. */
  absenceMin: number;
  category: AbsenceCategory;
  leaveType: LeaveType | null;
  /** Thousandths of a day, over every part; null when no part counts days. */
  days: number | null;
  paid: Treatment;
  justified: Treatment;
  plannedAhead: boolean;
  reportedVia: AbsenceVia | null;
  reason: string | null;
  details: string | null;
  status: AbsenceStatus;
  decidedAt: string | null;
}

/** The parts of each absence cut at month ends, put back together; first day first. */
export function mergeAbsenceParts(items: readonly WorkerAbsenceItem[]): MergedAbsence[] {
  const groups = new Map<string, WorkerAbsenceItem[]>();
  for (const item of items) {
    const key = item.splitGroupId ?? item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const merged = [...groups.values()].map((group): MergedAbsence => {
    const parts = [...group].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const first = parts[0];
    const counted = parts.filter((part) => part.days !== null);
    return {
      id: first.id,
      absenceIds: parts.map((part) => part.id),
      workerId: first.workerId,
      startDate: first.startDate,
      endDate: parts[parts.length - 1].endDate,
      type: first.type,
      startTime: first.startTime,
      endTime: first.endTime,
      absenceMin: parts.reduce((sum, part) => sum + part.absenceMin, 0),
      category: first.category,
      leaveType: first.leaveType,
      days: counted.length === 0 ? null : counted.reduce((sum, part) => sum + (part.days ?? 0), 0),
      paid: treatmentOf(parts.map((part) => part.paid)),
      justified: treatmentOf(parts.map((part) => part.justified)),
      plannedAhead: first.plannedAhead,
      reportedVia: first.reportedVia,
      reason: first.reason,
      details: first.details,
      status: first.status,
      decidedAt: first.decidedAt,
    };
  });
  return merged.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.workerId.localeCompare(b.workerId) || a.id.localeCompare(b.id),
  );
}

// ── Workers ─────────────────────────────────────────────────────────────────

/** A worker as this tab names her. */
export interface AttendanceWorker {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  sex: string;
  zoneId: string | null;
  isReserve: boolean;
  /** On trial or accepted: she may be given visits now. */
  schedulable: boolean;
}

function attendanceWorker(worker: SchedulableWorker): AttendanceWorker {
  return {
    id: worker.id,
    number: worker.number,
    firstName: worker.firstName,
    lastName: worker.lastName,
    sex: worker.sex,
    zoneId: worker.zoneId,
    isReserve: worker.isReserve,
    schedulable: (SCHEDULABLE_ENGAGEMENTS as readonly string[]).includes(worker.engagementStatus),
  };
}

const byName = (a: AttendanceWorker, b: AttendanceWorker) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.number.localeCompare(b.number);

// ── Seats ───────────────────────────────────────────────────────────────────

/** One seat of a worker on a visit, with what the returned order said of her. */
export interface AttendanceSeat {
  seatId: string;
  seatStatus: ShownSeatStatus;
  /** The absence behind an ABSENT seat. */
  absenceId: string | null;
  visitId: string;
  /** «رقم أمر المهمة». */
  visitNumber: string;
  visitStatus: VisitStatus;
  visitDate: LocalDate;
  /** The site's common name, else its address. */
  siteName: string;
  plannedStartTime: LocalTime;
  plannedEndTime: ClockTime;
  plannedDurationMin: number;
  arrivedTime: LocalTime | null;
  workStartTime: LocalTime | null;
  workEndTime: LocalTime | null;
  leftTime: LocalTime | null;
  lateMin: number | null;
  lateReason: string | null;
  workedMin: number | null;
  /** Which of her two times the site contact initialled. */
  presenceProof: PresenceProof | null;
  /** How far the returned order was typed in; null while it has not come back. */
  entryState: EntryState | null;
}

async function readSeats(
  ex: Executor,
  filter: { from: LocalDate; to: LocalDate; workerId?: string; heldVisitsOnly: boolean },
): Promise<(AttendanceSeat & { workerId: string })[]> {
  let rows = ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .select([
      "VisitWorker.id as seatId",
      "VisitWorker.workerId",
      "VisitWorker.seatStatus",
      "VisitWorker.absenceId",
      "VisitWorker.arrivedTime",
      "VisitWorker.workStartTime",
      "VisitWorker.workEndTime",
      "VisitWorker.leftTime",
      "VisitWorker.lateMin",
      "VisitWorker.lateReason",
      "VisitWorker.workedMin",
      "VisitWorker.presenceProof",
      "Visit.id as visitId",
      "Visit.number as visitNumber",
      "Visit.status as visitStatus",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Site.commonName",
      "Site.address",
      "VisitReport.entryState",
    ])
    .where("VisitWorker.seatStatus", "in", [...SHOWN_SEATS])
    .where("Visit.visitDate", ">=", filter.from)
    .where("Visit.visitDate", "<=", filter.to);
  if (filter.workerId) rows = rows.where("VisitWorker.workerId", "=", filter.workerId);
  if (filter.heldVisitsOnly) rows = rows.where("Visit.status", "not in", [...NOT_HELD]);
  const found = await rows
    .orderBy("Visit.visitDate")
    .orderBy("Visit.plannedStartTime")
    .orderBy("Visit.number")
    .orderBy("VisitWorker.id")
    .execute();
  return found.map((row) => ({
    seatId: row.seatId,
    workerId: row.workerId,
    seatStatus: row.seatStatus as ShownSeatStatus,
    absenceId: row.absenceId,
    visitId: row.visitId,
    visitNumber: row.visitNumber,
    visitStatus: row.visitStatus as VisitStatus,
    visitDate: row.visitDate,
    siteName: row.commonName?.trim() ? row.commonName : row.address,
    plannedStartTime: row.plannedStartTime,
    plannedEndTime: endTimeOf({ startTime: row.plannedStartTime, durationMin: row.plannedDurationMin }),
    plannedDurationMin: row.plannedDurationMin,
    arrivedTime: row.arrivedTime,
    workStartTime: row.workStartTime,
    workEndTime: row.workEndTime,
    leftTime: row.leftTime,
    lateMin: row.lateMin,
    lateReason: row.lateReason,
    workedMin: row.workedMin,
    presenceProof: row.presenceProof as PresenceProof | null,
    entryState: row.entryState as EntryState | null,
  }));
}

/**
 * Per worker, when her last typed arrival (or departure) happened, on a visit
 * of that date or before: the academy's "last check-in" and "last check-out".
 */
async function lastTyped(ex: Executor, upTo: LocalDate, which: "arrival" | "departure") {
  const column = which === "arrival" ? "VisitWorker.arrivedTime" : "VisitWorker.leftTime";
  const ranked = ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .select([
      "VisitWorker.workerId",
      "VisitWorker.arrivedTime",
      "VisitWorker.leftTime",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      sql<number>`row_number() over (partition by "VisitWorker"."workerId" order by "Visit"."visitDate" desc, "Visit"."plannedStartTime" desc, "VisitWorker"."id" desc)`.as(
        "rank",
      ),
    ])
    .where(column, "is not", null)
    .where("Visit.visitDate", "<=", upTo);
  const rows = await ex.selectFrom(ranked.as("ranked")).selectAll().where("ranked.rank", "=", 1).execute();
  const moments = new Map<string, LocalMoment>();
  for (const row of rows) {
    const start = minutesOf(row.plannedStartTime);
    const moment =
      which === "arrival"
        ? momentNear(row.visitDate, row.arrivedTime as string, start)
        : momentNear(row.visitDate, row.leftTime as string, start + row.plannedDurationMin);
    moments.set(row.workerId, moment);
  }
  return moments;
}

// ── Absences on a day ───────────────────────────────────────────────────────

/** The absence that covers a worker's day. */
export interface DayAbsence {
  id: string;
  type: AbsenceType;
  category: AbsenceCategory;
  leaveType: LeaveType | null;
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  status: AbsenceStatus;
}

/** Per worker: the absence in force that covers the day (a whole day first), and whether a leave is asked for. */
async function absencesOnDay(
  ex: Executor,
  date: LocalDate,
): Promise<Map<string, { inForce: DayAbsence | null; requested: boolean }>> {
  const rows = await ex
    .selectFrom("WorkerAbsence")
    .select(["id", "workerId", "type", "category", "leaveType", "startTime", "endTime", "status"])
    .where("status", "in", ["RECORDED", "APPROVED", "REQUESTED"])
    .where("startDate", "<=", date)
    .where("endDate", ">=", date)
    .orderBy("startDate")
    .orderBy("id")
    .execute();
  const byWorker = new Map<string, { inForce: DayAbsence | null; requested: boolean }>();
  for (const row of rows) {
    const found = byWorker.get(row.workerId) ?? { inForce: null, requested: false };
    if (row.status === "REQUESTED") {
      found.requested = true;
    } else if (!found.inForce || (found.inForce.type !== "FULL_DAY" && row.type === "FULL_DAY")) {
      found.inForce = {
        id: row.id,
        type: row.type as AbsenceType,
        category: row.category as AbsenceCategory,
        leaveType: row.leaveType as LeaveType | null,
        startTime: row.startTime,
        endTime: row.endTime,
        status: row.status as AbsenceStatus,
      };
    }
    byWorker.set(row.workerId, found);
  }
  return byWorker;
}

// ── The day ─────────────────────────────────────────────────────────────────

/** One worker on the day sheet. */
export interface AttendanceDayRow {
  worker: AttendanceWorker;
  /** Her seats on the day's visits that take place, first planned first. */
  seats: AttendanceSeat[];
  state: AttendanceDayState;
  /** A recorded absence or an approved leave that covers the day. */
  absence: DayAbsence | null;
  /** A leave asked for and not decided covers the day. */
  leaveRequested: boolean;
  /** Her last typed arrival and departure on that date or before. */
  lastArrival: LocalMoment | null;
  lastDeparture: LocalMoment | null;
}

export interface Period {
  from: string;
  to: string;
}

export interface AttendanceOverview {
  date: LocalDate;
  rows: AttendanceDayRow[];
  /** `work.arrivalGraceMin`: lateness within it is not flagged. */
  graceMin: number;
  /** `work.period.morning` and `work.period.evening`: the two halves of a day an absence may take. */
  periods: { MORNING: Period; EVENING: Period };
}

/**
 * The day sheet: every worker who may be given visits, and anyone else who
 * held a seat that day, with her seats on the day's visits that take place,
 * the times typed from their orders, the absence that covers her day, and her
 * last typed arrival and departure.
 */
export async function listAttendanceOverview(
  ex: Executor,
  ctx: ServiceContext,
  input: { date: string },
): Promise<AttendanceOverview> {
  requireAttendanceRead(ctx);
  const date = dateOf(input.date);

  const seats = await readSeats(ex, { from: date, to: date, heldVisitsOnly: true });
  const schedulable = await readWorkers(ex, ctx);
  const listed = new Set(schedulable.map((worker) => worker.id));
  const others = await readWorkers(ex, ctx, {
    ids: [...new Set(seats.map((seat) => seat.workerId).filter((id) => !listed.has(id)))],
  });
  const workers = [...schedulable, ...others].map(attendanceWorker).sort(byName);

  const arrivals = await lastTyped(ex, date, "arrival");
  const departures = await lastTyped(ex, date, "departure");
  const absences = await absencesOnDay(ex, date);
  const settings = await getSettings(ex, ["work.arrivalGraceMin", "work.period.morning", "work.period.evening"]);

  const rows = workers.map((worker): AttendanceDayRow => {
    const own = seats.filter((seat) => seat.workerId === worker.id).map(({ workerId: _workerId, ...seat }) => seat);
    const absence = absences.get(worker.id);
    return {
      worker,
      seats: own,
      state: dayStateOf({ date, today: ctx.today, seats: own, absenceInForce: Boolean(absence?.inForce) }),
      absence: absence?.inForce ?? null,
      leaveRequested: absence?.requested ?? false,
      lastArrival: arrivals.get(worker.id) ?? null,
      lastDeparture: departures.get(worker.id) ?? null,
    };
  });

  return {
    date,
    rows,
    graceMin: settings["work.arrivalGraceMin"],
    periods: { MORNING: settings["work.period.morning"], EVENING: settings["work.period.evening"] },
  };
}

// ── Absences of a period ────────────────────────────────────────────────────

/** An absence on the absences list, with whose it is. */
export interface AbsenceLine extends MergedAbsence {
  /** Null only for a row whose worker is no longer a cleaning worker. */
  worker: AttendanceWorker | null;
}

/**
 * The absences that touch a period, every status, everybody's or one
 * worker's: each one whole, its month parts put back together even when a
 * part lies outside the period.
 */
export async function listAttendanceAbsences(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: string; to: string; workerId?: string | null },
): Promise<AbsenceLine[]> {
  requireAttendanceRead(ctx);
  const { from, to } = rangeOf(input);
  const items = await listWorkerAbsences(ex, ctx, { workerId: input.workerId ?? null, from, to });

  // A leave cut at a month end: its other parts, wherever they fall.
  const seen = new Set(items.map((item) => item.id));
  const groups = [...new Set(items.map((item) => item.splitGroupId).filter((id): id is string => id !== null))];
  if (groups.length > 0) {
    const spans = await ex
      .selectFrom("WorkerAbsence")
      .select((eb) => [
        "splitGroupId",
        "workerId",
        eb.fn.min("startDate").as("firstDate"),
        eb.fn.max("endDate").as("lastDate"),
      ])
      .where("splitGroupId", "in", groups)
      .groupBy(["splitGroupId", "workerId"])
      .execute();
    for (const span of spans) {
      const parts = await listWorkerAbsences(ex, ctx, {
        workerId: span.workerId,
        from: span.firstDate,
        to: span.lastDate,
      });
      for (const part of parts) {
        if (part.splitGroupId !== span.splitGroupId || seen.has(part.id)) continue;
        items.push(part);
        seen.add(part.id);
      }
    }
  }

  const merged = mergeAbsenceParts(items);
  const workers = new Map(
    (await readWorkers(ex, ctx, { ids: merged.map((line) => line.workerId) })).map((worker) => [
      worker.id,
      attendanceWorker(worker),
    ]),
  );
  return merged.map((line) => ({ ...line, worker: workers.get(line.workerId) ?? null }));
}

// ── One worker's history ────────────────────────────────────────────────────

export interface AttendanceHistory {
  worker: AttendanceWorker;
  from: LocalDate;
  to: LocalDate;
  /** Every seat of hers in the range, whatever became of the visit, first first. */
  seats: AttendanceSeat[];
  absences: AbsenceLine[];
  totals: AttendanceTotals;
  graceMin: number;
}

/** A worker's seats in a range with the four times, late and worked minutes, the order and the visit; her absences. */
export async function listWorkerAttendanceHistory(
  ex: Executor,
  ctx: ServiceContext,
  input: { workerId: string; from: string; to: string },
): Promise<AttendanceHistory> {
  requireAttendanceRead(ctx);
  const { from, to } = rangeOf(input);
  const [found] = await readWorkers(ex, ctx, { ids: [input.workerId] });
  if (!found) throw new ServiceError("This worker does not exist.");

  const seats = (await readSeats(ex, { from, to, workerId: found.id, heldVisitsOnly: false })).map(
    ({ workerId: _workerId, ...seat }) => seat,
  );
  const absences = await listAttendanceAbsences(ex, ctx, { from, to, workerId: found.id });
  const graceMin = (await getSettings(ex, ["work.arrivalGraceMin"]))["work.arrivalGraceMin"];
  return {
    worker: attendanceWorker(found),
    from,
    to,
    seats,
    absences,
    totals: attendanceTotals(seats, graceMin),
    graceMin,
  };
}

export const listAttendanceOverviewQuery = query(listAttendanceOverview);
export const listAttendanceAbsencesQuery = query(listAttendanceAbsences);
export const listWorkerAttendanceHistoryQuery = query(listWorkerAttendanceHistory);
