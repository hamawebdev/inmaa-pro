import { addDays, daysBetween, isDate } from "@/features/people/rules/dates";
import {
  HOURS_ADJUSTMENT_KINDS,
  WEEKDAYS,
  type HoursAdjustmentKind,
  type Weekday,
} from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logErase } from "@/lib/log";
import { weekdayOf } from "@/lib/options";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, minutes, type LocalDate } from "@/lib/units";
import { staffName } from "@/lib/text/names";

/**
 * A cleaning worker's hours (feature 21): what Operations' typed orders say
 * she worked, seat by seat, with her absences and People's own corrections,
 * summed by week and by period, ready for pay.
 *
 * The seats are read from Operations' `VisitWorker` and `Visit`, and the
 * division from Clients' `File`, on the columns CONTRACTS section 2 opens to
 * People for hours. The absences come through Operations' `listWorkerAbsences`
 * rules (the same rows, RECORDED and APPROVED only).
 *
 * The rules (scope section 5, and the rulings given to People):
 *  - a week runs Saturday to Friday. Beyond the legal week (`work.weekMin`,
 *    40 h) is overtime, flagged past `work.overtimeCapMin` (48 h);
 *  - a week belongs to the period in which it ends: its overtime is counted
 *    there, whole, from every seat of the week;
 *  - her rest day in a week is the day she rests on a six-visit contract
 *    (a RESTING seat), else the centre's weekly rest (`work.restDay`). Minutes
 *    worked on it are rest-day minutes;
 *  - an order not typed in by the day of the count is counted as such, and
 *    pays nothing until it is typed.
 */

export const HOURS_PATH = "/dashboard/hours-pay";

/** The seats that are hers: on the visit, absent from it, or resting on it. */
const HER_SEATS = ["ASSIGNED", "ABSENT", "RESTING"] as const;
/** Visits whose seats are worked or still to be. A visit postponed or cancelled has no hours. */
const WORKED_VISITS = ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS", "DONE", "PROBLEM"] as const;
/** The absences that count: recorded, or a leave approved. */
const COUNTED_ABSENCES = ["RECORDED", "APPROVED"] as const;

export interface SeatMinutes {
  seatId: string;
  date: LocalDate;
  visitId: string;
  visitNumber: string;
  visitStatus: string;
  division: string | null;
  plannedStart: string;
  plannedMin: number;
  arrivedTime: string | null;
  workStartTime: string | null;
  workEndTime: string | null;
  leftTime: string | null;
  lateMin: number;
  lateReason: string | null;
  /** Null: the order is not typed in yet. */
  workedMin: number | null;
  seatStatus: string;
}

export interface AbsenceMinutes {
  id: string;
  startDate: string;
  endDate: string;
  category: string;
  leaveType: string | null;
  /** The minutes of it that fall in the period. */
  minutes: number;
  paid: boolean;
  justified: boolean;
}

export interface AdjustmentLine {
  id: string;
  date: string;
  adjustMin: number;
  kind: HoursAdjustmentKind;
  reason: string;
}

export interface WeekMinutes {
  /** Saturday. */
  start: LocalDate;
  /** Friday. */
  end: LocalDate;
  workedMin: number;
  overtimeMin: number;
  /** Past the 48-hour mark. */
  overCap: boolean;
  /** Her rest day that week. */
  restDate: LocalDate;
  restDayMin: number;
  /** Minutes past the standard day, day by day: what a daily wage pays as overtime. */
  beyondDayMin: number;
}

export interface HoursTotals {
  workedMin: number;
  daysWorked: number;
  lateMin: number;
  lateCount: number;
  ordersNotTyped: number;
  absenceMin: number;
  paidAbsenceMin: number;
  unpaidAbsenceMin: number;
  adjustMin: number;
  /** Of the weeks that end in the period. */
  overtimeMin: number;
  restDayMin: number;
  /** Worked minutes per division, for Money's expense lines; adjustments go to COMMON. */
  divisionMin: Record<string, number>;
}

export interface WorkerHours {
  workerId: string;
  number: string;
  firstName: string;
  lastName: string;
  sex: string;
  zoneName: string | null;
  payBasis: string | null;
  seats: SeatMinutes[];
  absences: AbsenceMinutes[];
  adjustments: AdjustmentLine[];
  weeks: WeekMinutes[];
  totals: HoursTotals;
}

/** The Saturday that starts the week of a date. */
export function weekStart(date: LocalDate): LocalDate {
  return localDate(addDays(date, -WEEKDAYS.indexOf(weekdayOf(date))));
}

/** The date of a weekday in the week that starts on `saturday`. */
const dayInWeek = (saturday: LocalDate, day: Weekday) => localDate(addDays(saturday, WEEKDAYS.indexOf(day)));

function checkPeriod(input: { from: string; to: string }): { from: LocalDate; to: LocalDate } {
  if (!isDate(input.from) || !isDate(input.to)) throw new ServiceError("Enter a valid date.");
  if (input.to < input.from) throw new ServiceError("The end date must not be before the start date.");
  return { from: localDate(input.from), to: localDate(input.to) };
}

/** The share of an absence that falls in a period, by days. */
function minutesIn(absence: { startDate: string; endDate: string; absenceMin: number }, from: string, to: string) {
  const first = absence.startDate > from ? absence.startDate : from;
  const last = absence.endDate < to ? absence.endDate : to;
  if (last < first) return 0;
  const all = daysBetween(absence.startDate, absence.endDate) + 1;
  const inside = daysBetween(first, last) + 1;
  return Math.round((absence.absenceMin * inside) / all);
}

/**
 * Each worker's hours in a period. Without `workerId`, every worker with a
 * seat, an absence or a correction in it. The weeks ending in the period are
 * read whole, so their overtime counts every seat of the week.
 */
export async function workerHours(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: string; to: string; workerId?: string | null },
): Promise<WorkerHours[]> {
  requireSection(ctx, "WORKERS", "READ");
  const { from, to } = checkPeriod(input);
  // The weeks that end in the period begin up to six days before it.
  const readFrom = weekStart(from) < from ? weekStart(from) : from;
  const settings = await getSettings(ex, ["work.weekMin", "work.overtimeCapMin", "work.dayMin", "work.restDay"]);

  let seatRows = ex
    .selectFrom("VisitWorker as vw")
    .innerJoin("Visit as v", "v.id", "vw.visitId")
    .innerJoin("File as f", "f.id", "v.fileId")
    .select([
      "vw.id as seatId",
      "vw.workerId",
      "vw.seatStatus",
      "vw.arrivedTime",
      "vw.workStartTime",
      "vw.workEndTime",
      "vw.leftTime",
      "vw.lateMin",
      "vw.lateReason",
      "vw.workedMin",
      "v.id as visitId",
      "v.number as visitNumber",
      "v.status as visitStatus",
      "v.visitDate",
      "v.plannedStartTime",
      "v.plannedDurationMin",
      "f.division",
    ])
    .where("v.visitDate", ">=", readFrom)
    .where("v.visitDate", "<=", to)
    .where("vw.seatStatus", "in", [...HER_SEATS])
    .where((eb) => eb.or([eb("v.statusReason", "is", null), eb("v.statusReason", "<>", "PROGRAMME_CHANGED")]));
  if (input.workerId) seatRows = seatRows.where("vw.workerId", "=", input.workerId);
  const seats = await seatRows.orderBy("v.visitDate").orderBy("v.plannedStartTime").execute();

  let absenceRows = ex
    .selectFrom("WorkerAbsence")
    .selectAll()
    .where("startDate", "<=", to)
    .where("endDate", ">=", from)
    .where("status", "in", [...COUNTED_ABSENCES]);
  if (input.workerId) absenceRows = absenceRows.where("workerId", "=", input.workerId);
  const absences = await absenceRows.orderBy("startDate").execute();

  let adjustmentRows = ex
    .selectFrom("HoursAdjustment")
    .selectAll()
    .where("date", ">=", from)
    .where("date", "<=", to)
    .where("deletedAt", "is", null);
  if (input.workerId) adjustmentRows = adjustmentRows.where("staffId", "=", input.workerId);
  const adjustments = await adjustmentRows.orderBy("date").execute();

  const ids = [
    ...new Set([
      ...seats.map((seat) => seat.workerId),
      ...absences.map((absence) => absence.workerId),
      ...adjustments.map((line) => line.staffId),
      ...(input.workerId ? [input.workerId] : []),
    ]),
  ];
  if (ids.length === 0) return [];
  const people = await ex
    .selectFrom("StaffMember as w")
    .leftJoin("Zone as z", "z.id", "w.zoneId")
    .select([
      "w.id",
      "w.number",
      "w.firstName",
      "w.lastName",
      "w.sex",
      "w.payBasis",
      "w.numberSeq",
      "z.name as zoneName",
    ])
    .where("w.id", "in", ids)
    .where("w.kind", "=", "WORKER")
    .orderBy("w.numberSeq")
    .execute();

  return people.map((person) => {
    const hers = seats.filter((seat) => seat.workerId === person.id);
    const seatLines: SeatMinutes[] = hers.map((seat) => ({
      seatId: seat.seatId,
      date: seat.visitDate,
      visitId: seat.visitId,
      visitNumber: seat.visitNumber,
      visitStatus: seat.visitStatus,
      division: seat.division,
      plannedStart: seat.plannedStartTime,
      plannedMin: seat.plannedDurationMin,
      arrivedTime: seat.arrivedTime,
      workStartTime: seat.workStartTime,
      workEndTime: seat.workEndTime,
      leftTime: seat.leftTime,
      lateMin: seat.lateMin ?? 0,
      lateReason: seat.lateReason,
      workedMin: seat.seatStatus === "ASSIGNED" ? seat.workedMin : 0,
      seatStatus: seat.seatStatus,
    }));
    const worked = (seat: SeatMinutes) =>
      seat.seatStatus === "ASSIGNED" && (WORKED_VISITS as readonly string[]).includes(seat.visitStatus)
        ? (seat.workedMin ?? 0)
        : 0;
    const lines = adjustments
      .filter((line) => line.staffId === person.id)
      .map((line) => ({
        id: line.id,
        date: line.date,
        adjustMin: line.adjustMin,
        kind: line.kind as HoursAdjustmentKind,
        reason: line.reason,
      }));

    // Minutes day by day, the corrections included.
    const byDay = new Map<string, number>();
    for (const seat of seatLines) byDay.set(seat.date, (byDay.get(seat.date) ?? 0) + worked(seat));
    for (const line of lines) byDay.set(line.date, Math.max(0, (byDay.get(line.date) ?? 0) + line.adjustMin));

    // The weeks that end in the period, read whole.
    const weeks: WeekMinutes[] = [];
    for (let saturday = weekStart(from); saturday <= to; saturday = localDate(addDays(saturday, 7))) {
      const friday = localDate(addDays(saturday, 6));
      if (friday < from || friday > to) continue;
      let workedMin = 0;
      let beyondDayMin = 0;
      for (let offset = 0; offset < 7; offset += 1) {
        const day = byDay.get(addDays(saturday, offset)) ?? 0;
        workedMin += day;
        beyondDayMin += Math.max(0, day - settings["work.dayMin"]);
      }
      const resting = seatLines.find(
        (seat) => seat.seatStatus === "RESTING" && seat.date >= saturday && seat.date <= friday,
      );
      const restDate = resting ? resting.date : dayInWeek(saturday, settings["work.restDay"] as Weekday);
      weeks.push({
        start: saturday,
        end: friday,
        workedMin,
        overtimeMin: Math.max(0, workedMin - settings["work.weekMin"]),
        overCap: workedMin > settings["work.overtimeCapMin"],
        restDate,
        restDayMin: byDay.get(restDate) ?? 0,
        beyondDayMin,
      });
    }

    const inPeriod = seatLines.filter((seat) => seat.date >= from && seat.date <= to);
    const ownAbsences = absences
      .filter((absence) => absence.workerId === person.id)
      .map((absence) => ({
        id: absence.id,
        startDate: absence.startDate,
        endDate: absence.endDate,
        category: absence.category,
        leaveType: absence.leaveType,
        minutes: minutesIn(absence, from, to),
        paid: absence.paid === 1,
        justified: absence.justified === 1,
      }));
    const divisionMin: Record<string, number> = {};
    for (const seat of inPeriod) {
      const key = seat.division ?? "COMMON";
      divisionMin[key] = (divisionMin[key] ?? 0) + worked(seat);
    }
    const adjustMin = lines.reduce((sum, line) => sum + line.adjustMin, 0);
    if (adjustMin !== 0) divisionMin.COMMON = (divisionMin.COMMON ?? 0) + adjustMin;
    const daysInPeriod = [...byDay.entries()].filter(([day, value]) => day >= from && day <= to && value > 0);
    const today = ctx.today;
    const absenceMin = ownAbsences.reduce((sum, absence) => sum + absence.minutes, 0);
    const paidAbsenceMin = ownAbsences.filter((absence) => absence.paid).reduce((sum, a) => sum + a.minutes, 0);

    return {
      workerId: person.id,
      number: person.number,
      firstName: person.firstName,
      lastName: person.lastName,
      sex: person.sex,
      zoneName: person.zoneName,
      payBasis: person.payBasis,
      seats: inPeriod,
      absences: ownAbsences,
      adjustments: lines,
      weeks,
      totals: {
        workedMin: daysInPeriod.reduce((sum, [, value]) => sum + value, 0),
        daysWorked: daysInPeriod.length,
        lateMin: inPeriod.reduce((sum, seat) => sum + seat.lateMin, 0),
        lateCount: inPeriod.filter((seat) => seat.lateMin > 0).length,
        ordersNotTyped: inPeriod.filter(
          (seat) =>
            seat.seatStatus === "ASSIGNED" &&
            seat.workedMin === null &&
            seat.date <= today &&
            (WORKED_VISITS as readonly string[]).includes(seat.visitStatus),
        ).length,
        absenceMin,
        paidAbsenceMin,
        unpaidAbsenceMin: absenceMin - paidAbsenceMin,
        adjustMin,
        overtimeMin: weeks.reduce((sum, week) => sum + week.overtimeMin, 0),
        restDayMin: weeks.reduce((sum, week) => sum + week.restDayMin, 0),
        divisionMin,
      },
    };
  });
}

// ── People's own corrections ────────────────────────────────────────────────

export interface HoursAdjustmentInput {
  staffId: string;
  date: string;
  /** Signed: minutes added, or taken off. */
  adjustMin: number;
  kind: HoursAdjustmentKind;
  reason: string;
}

/** A correction of a person's minutes on a day: a training morning, office work, a time typed wrong. */
export async function addHoursAdjustment(
  ex: Executor,
  ctx: ServiceContext,
  input: HoursAdjustmentInput,
): Promise<{ id: string }> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (!Number.isInteger(input.adjustMin) || input.adjustMin === 0 || Math.abs(input.adjustMin) > 24 * 60) {
    throw new ServiceError("A correction is a whole number of minutes, at most a day either way.");
  }
  if (!(HOURS_ADJUSTMENT_KINDS as readonly string[]).includes(input.kind))
    throw new ServiceError("Choose the kind of correction.");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the correction.");
  const person = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "lastName", "firstName"])
    .where("id", "=", input.staffId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!person) throw new ServiceError("This person does not exist.");
  await refuseClosedDay(ex, person.id, input.date);
  const id = newId();
  await ex
    .insertInto("HoursAdjustment")
    .values({
      id,
      staffId: person.id,
      date: localDate(input.date),
      adjustMin: minutes(input.adjustMin),
      kind: input.kind,
      reason,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  const label = staffName(person);
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "HoursAdjustment",
    entityId: id,
    entityLabel: `${person.number} ${label}`,
    subject: { kind: person.kind === "EMPLOYEE" ? "EMPLOYEE" : "WORKER", id: person.id, label },
    changes: { adjustMin: [null, input.adjustMin], date: [null, input.date] },
    context: { kind: input.kind, reason },
  });
  return { id };
}

/** Takes a correction off, with the reason. Kept, marked deleted. */
export async function removeHoursAdjustment(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; reason: string },
): Promise<void> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the correction.");
  const line = await ex
    .selectFrom("HoursAdjustment as h")
    .innerJoin("StaffMember as s", "s.id", "h.staffId")
    .select([
      "h.id",
      "h.staffId",
      "h.date",
      "h.adjustMin",
      "h.deletedAt",
      "s.kind",
      "s.number",
      "s.lastName",
      "s.firstName",
    ])
    .where("h.id", "=", input.id)
    .executeTakeFirst();
  if (!line || line.deletedAt) throw new ServiceError("This correction does not exist.");
  await refuseClosedDay(ex, line.staffId, line.date);
  await ex
    .updateTable("HoursAdjustment")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", line.id)
    .execute();
  const label = staffName(line);
  await logErase(ex, ctx, {
    owner: "PEOPLE",
    action: "SOFT_DELETE",
    reason,
    entity: "HoursAdjustment",
    entityId: line.id,
    entityLabel: `${line.number} ${label}`,
    subject: { kind: line.kind === "EMPLOYEE" ? "EMPLOYEE" : "WORKER", id: line.staffId, label },
    context: { date: line.date, adjustMin: line.adjustMin },
  });
}

/** A day already paid by a closed run is not corrected afterwards: the next run would not see it. */
async function refuseClosedDay(ex: Executor, staffId: string, date: string): Promise<void> {
  const closed = await ex
    .selectFrom("Payslip as p")
    .innerJoin("PayRun as r", "r.id", "p.payRunId")
    .select("r.id")
    .where("p.staffId", "=", staffId)
    .where("r.status", "=", "CLOSED")
    .where("r.periodStart", "<=", localDate(date))
    .where("r.periodEnd", ">=", localDate(date))
    .executeTakeFirst();
  if (closed) throw new ServiceError("This day is in a closed pay run: it can no longer be corrected.");
}

// What the screens import.
export const workerHoursQuery = query(workerHours);
export const addHoursAdjustmentAction = action(addHoursAdjustment, { revalidate: [HOURS_PATH] });
export const removeHoursAdjustmentAction = action(removeHoursAdjustment, { revalidate: [HOURS_PATH] });
