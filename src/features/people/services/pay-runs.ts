import { sql } from "kysely";

import { addDays, isDate } from "@/features/people/rules/dates";
import { leaveAccount, leaveCountFrom, type LeaveRules } from "@/features/people/rules/leave";
import type { IrgTable } from "@/features/people/rules/pay";
import { computePayslip, type PayslipLine, type PayslipRates } from "@/features/people/rules/payslip";
import {
  JOB_POSITION_AR,
  type PayBasis,
  type PayslipItemType,
  type StaffKind,
} from "@/features/people/validators/staff-codes";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logDisclose } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { workerRoleAr, type WorkerRole } from "@/lib/options";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { basisPoints, localDate, minutes, money, qty, type LocalDate } from "@/lib/units";

import { employeeDays } from "./employee-attendance";
import { HOURS_PATH, weekStart, workerHours } from "./hours";
import { addDebtEntry, debtAt, debtBalanceOf, outstandingDebts, requirePay, type DebtPart } from "./payouts";
import { ACTIVE_STATUSES } from "./staff-exports";
import { staffName } from "@/lib/text/names";

/**
 * Pay runs (feature 38): a month of pay for the cleaning workers, or for the
 * centre's employees, one payslip each.
 *
 *  - `preparePayRun` drafts the month: for each person with pay terms, what
 *    the hours give (workers: the typed orders not paid yet, the late ones of
 *    earlier months included; employees: their checks in and out), the weeks
 *    that end in the month, absences and leave, allowances and deductions,
 *    advances to repay, CNAS and IRG from Settings;
 *  - a draft can be computed again (`refreshPayRun`) and corrected payslip by
 *    payslip (`updatePayslip`: CNAS, IRG, repayment, a deduction): what is
 *    typed is kept through a refresh;
 *  - `closePayRun` numbers the run and its payslips and freezes them (the
 *    database refuses any change after), and writes the repayments in the
 *    ledger. An order typed after it closed is paid by the next run, as
 *    arrears;
 *  - `voidPayRun` cancels a closed run whose payouts were voided first, and
 *    puts the repayments back.
 *
 * Payouts (advances and wages) are payouts.ts: each one tells Money, which
 * posts the expense on the day paid (ruling 1 of the data model).
 */

export const PAY_PATH = HOURS_PATH;

const RUN_KINDS: readonly StaffKind[] = ["WORKER", "EMPLOYEE"];
/** Visits whose seats are paid when typed. */
const WORKED_VISITS = ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS", "DONE", "PROBLEM"];

/** The Arabic words a payslip's lines print with. */
const LINE_AR: Record<PayslipItemType, string> = {
  BASE: "الأجر الأساسي",
  OVERTIME_50: "الساعات الإضافية (+50%)",
  REST_DAY_PREMIUM: "العمل يوم الراحة",
  LEAVE_PAY: "العطل والغيابات المدفوعة",
  ALLOWANCE: "منحة",
  BONUS: "علاوة",
  ABSENCE: "الغيابات غير المدفوعة",
  CNAS: "اشتراك الضمان الاجتماعي",
  IRG: "الضريبة على الدخل الإجمالي",
  ADVANCE_REPAYMENT: "تسديد التسبيقات",
  DEDUCTION: "اقتطاعات أخرى",
  OTHER: "أخرى",
};

/** The line of a correction of the base, before its reason. */
const BASE_CORRECTION_AR = "تصحيح الأجر الأساسي";

/** How a debt taken back on a payslip is worded, by the ledger line it comes from (PEO-13). */
const DEBT_AR: Partial<Record<string, string>> = {
  ADVANCE: "تسديد التسبيقات",
  DAMAGE: "تعويض ضرر",
  LOSS: "تعويض ضياع",
  OVERPAYMENT: "استرجاع مبلغ دفع زيادة",
};
const OTHER_DEBT_AR = "تسديد ديون أخرى";

/**
 * What a repayment takes back, as the payslip prints it (PEO-13): the oldest
 * debts first, an advance as «تسديد التسبيقات», a violation's deduction as
 * «اقتطاع: مخالفة رقم …», a damage or a loss as its compensation. Lines of the
 * same wording are added together, in the order they were owed.
 */
async function repaymentLines(
  ex: Executor,
  staffId: string,
  amount: number,
): Promise<Array<{ label: string; amount: number }>> {
  const parts = await outstandingDebts(ex, staffId);
  const violationIds = [...new Set(parts.map((part) => part.violationId).filter((id): id is string => id !== null))];
  const violations = violationIds.length
    ? await ex.selectFrom("Violation").select(["id", "number"]).where("id", "in", violationIds).execute()
    : [];
  const wordingOf = (part: DebtPart) => {
    const violation = part.violationId ? violations.find((each) => each.id === part.violationId) : undefined;
    if (violation) return `اقتطاع: مخالفة رقم ${violation.number}`;
    return DEBT_AR[part.reason] ?? OTHER_DEBT_AR;
  };
  const lines: Array<{ label: string; amount: number }> = [];
  let rest = amount;
  for (const part of parts) {
    if (rest <= 0) break;
    const taken = Math.min(part.left, rest);
    rest -= taken;
    const label = wordingOf(part);
    const same = lines.find((line) => line.label === label);
    if (same) same.amount += taken;
    else lines.push({ label, amount: taken });
  }
  // Never less than the repayment: what the ledger cannot place is an advance, as before.
  if (rest > 0) {
    const advance = lines.find((line) => line.label === DEBT_AR.ADVANCE);
    if (advance) advance.amount += rest;
    else lines.push({ label: DEBT_AR.ADVANCE as string, amount: rest });
  }
  return lines;
}

/** What the office typed over the computed values of a payslip. Kept through a refresh. */
export interface PayslipOverrides {
  cnas?: number;
  irg?: number;
  /** A wage per task: the overtime premium and the rest-day premium, priced by the office. */
  overtime?: number;
  restDayPremium?: number;
  advanceRepayment?: number;
  /** A deduction typed on this payslip, besides the recurring ones. */
  deduction?: number;
  deductionLabel?: string;
  /** The recurring deductions taken on this payslip, typed over their sum: less in a short month (PEO-09). */
  recurringDeductions?: number;
  /** A correction of the base, signed, and why (PEO-08): a rate typed wrong, a raise dated back. */
  baseCorrection?: number;
  baseCorrectionReason?: string;
}

interface StoredOverrides {
  typed: PayslipOverrides;
  /** Seats paid their planned minutes because their times were not typed (LAB-14). */
  plannedSeats?: number;
  /** What is missing to close: the IRG when no scale is in Settings and none was typed. */
  missing: string[];
}

function parseOverrides(text: string | null): StoredOverrides {
  try {
    const value = text ? (JSON.parse(text) as Partial<StoredOverrides>) : {};
    return { typed: value.typed ?? {}, missing: value.missing ?? [], plannedSeats: value.plannedSeats ?? 0 };
  } catch {
    return { typed: {}, missing: [], plannedSeats: 0 };
  }
}

function monthOf(month: string): { start: LocalDate; end: LocalDate } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ServiceError("Choose the month.");
  const [year, number] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return { start: localDate(`${month}-01`), end: localDate(end) };
}

async function rates(ex: Executor): Promise<{ rates: PayslipRates; snapshot: Record<string, unknown> }> {
  const settings = await getSettings(ex, [
    "work.weekMin",
    "work.overtimeCapMin",
    "work.dayMin",
    "work.restDay",
    "pay.overtimePremium",
    "pay.restDayPremium",
    "pay.monthlyDivisorMin",
    "pay.cnasEmployeeRate",
    "pay.cnasEmployerRate",
    "pay.irgTable",
    "pay.leaveDaysPerMonth",
    "pay.leaveCapDays",
    "pay.leaveYearStart",
  ]);
  return {
    rates: {
      legalWeekMinutes: settings["work.weekMin"],
      weekCapMinutes: settings["work.overtimeCapMin"],
      overtimePremiumBp: basisPoints(settings["pay.overtimePremium"]),
      restDayPremiumBp: basisPoints(settings["pay.restDayPremium"]),
      monthlyDivisorMinutes: settings["pay.monthlyDivisorMin"],
      dayMinutes: settings["work.dayMin"],
      cnasEmployeeBp: basisPoints(settings["pay.cnasEmployeeRate"]),
      cnasEmployerBp: basisPoints(settings["pay.cnasEmployerRate"]),
      irgTable: settings["pay.irgTable"] as IrgTable | null,
    },
    snapshot: settings,
  };
}

interface Setup {
  rates: PayslipRates;
  dayMin: number;
  weekMin: number;
  restDay: string;
  leave: LeaveRules;
}

const setupFrom = (payRates: PayslipRates, snapshot: Record<string, unknown>): Setup => ({
  rates: payRates,
  dayMin: snapshot["work.dayMin"] as number,
  weekMin: snapshot["work.weekMin"] as number,
  restDay: snapshot["work.restDay"] as string,
  leave: {
    perMonth: snapshot["pay.leaveDaysPerMonth"] as number,
    cap: snapshot["pay.leaveCapDays"] as number,
    yearStart: snapshot["pay.leaveYearStart"] as string,
  },
});

interface Person {
  id: string;
  kind: string;
  number: string;
  firstName: string;
  lastName: string;
  sex: string;
  role: string | null;
  jobPosition: string | null;
  cnasDeclared: number;
  cnasNumber: string | null;
  registrationDate: string;
  startDate: string | null;
  leftDate: string | null;
  engagementStatus: string;
  payBasis: string | null;
  payRate: number | null;
  leaveOpeningDays: number | null;
  leaveOpeningDate: string | null;
  /** Whether she was in post (on trial or accepted) on a day, by her dated status history (PEO-01). */
  inPost: (day: string) => boolean;
  /** The days of the run's month she was in post. */
  postDays: number;
}

/** What a run is, for the people it pays: its kind, its month, its branch. */
interface RunScope {
  id: string;
  staffKind: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  branchId: string;
}

/** Every day from `start` to `end`, both included. */
function daysFrom(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * Whether a person was in post on a day: the status in force then (the latest
 * dated STATUS row on or before it) is «تحت التجربة» or «مقبول». Before her
 * registration, and from the day she left, she was not. Registered with no
 * status written yet on that day: her status now.
 */
function inPostOn(
  person: { registrationDate: string; leftDate: string | null; engagementStatus: string },
  history: ReadonlyArray<{ date: string; toStatus: string | null }>,
) {
  return (day: string): boolean => {
    if (day < person.registrationDate) return false;
    if (person.leftDate !== null && day >= person.leftDate) return false;
    let status: string | null = null;
    for (const row of history) {
      if (row.date > day) break;
      status = row.toStatus;
    }
    return ACTIVE_STATUSES.has(status ?? person.engagementStatus);
  };
}

/** Typed seats (or seats of done visits, LAB-14) up to a day that no live run but this one has paid. */
function unpaidSeats(ex: Executor, end: LocalDate, runId: string) {
  return (
    ex
      .selectFrom("VisitWorker as vw")
      .innerJoin("Visit as v", "v.id", "vw.visitId")
      .innerJoin("File as f", "f.id", "v.fileId")
      .where("vw.seatStatus", "=", "ASSIGNED")
      // Typed, or on a done visit whose times were left empty: then its planned minutes (RULINGS item 14, LAB-14).
      .where((eb) => eb.or([eb("vw.workedMin", "is not", null), eb("v.status", "=", "DONE")]))
      .where("v.visitDate", "<=", end)
      .where("v.status", "in", WORKED_VISITS)
      .where((eb) => eb.or([eb("v.statusReason", "is", null), eb("v.statusReason", "<>", "PROGRAMME_CHANGED")]))
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("PayslipSeat as s")
              .innerJoin("Payslip as p", "p.id", "s.payslipId")
              .innerJoin("PayRun as r", "r.id", "p.payRunId")
              .select("s.id")
              .whereRef("s.visitWorkerId", "=", "vw.id")
              .where("r.status", "<>", "VOID")
              .where("r.id", "<>", runId),
          ),
        ),
      )
  );
}

/**
 * The people a run pays (PEO-01, PEO-02): of its kind and its branch, with
 * pay terms on their file, and in post (on trial or accepted) on at least one
 * day of the month, or, for a worker, with seats of earlier days in post still
 * to pay. A candidate, a refused worker, somebody who left before the month
 * are not paid; a worker readmitted is paid from the day she is in post again.
 * The terms are those in force at the end of the month: of the dated rows
 * that took effect by then, the one written last (PEO-08), so that a change
 * dated back reaches the drafts of the months it covers, and the month of the
 * last change pays what the file shows. Terms cleared on the file are no
 * terms.
 */
async function peopleOf(ex: Executor, run: RunScope): Promise<Person[]> {
  const kind = run.staffKind as StaffKind;
  const people = await ex
    .selectFrom("StaffMember")
    .select([
      "id",
      "kind",
      "number",
      "firstName",
      "lastName",
      "sex",
      "role",
      "jobPosition",
      "cnasDeclared",
      "cnasNumber",
      "registrationDate",
      "startDate",
      "leftDate",
      "engagementStatus",
      "payBasis",
      "payRate",
      "leaveOpeningDays",
      "leaveOpeningDate",
      "numberSeq",
    ])
    .where("kind", "=", kind)
    .where("branchId", "=", run.branchId)
    .where("deletedAt", "is", null)
    .where("registrationDate", "<=", run.periodEnd)
    .where("payBasis", "is not", null)
    .where("payRate", "is not", null)
    .orderBy("numberSeq")
    .execute();
  if (people.length === 0) return [];
  const ids = people.map((person) => person.id);
  const [events, owed] = await Promise.all([
    ex
      .selectFrom("StaffEvent")
      .select(["staffId", "kind", "date", "toStatus", "payBasis", "payRate", "createdAt"])
      .select(sql<number>`rowid`.as("written"))
      .where("staffId", "in", ids)
      .where("date", "<=", run.periodEnd)
      .orderBy("staffId")
      .orderBy("date")
      .orderBy("createdAt")
      .execute(),
    kind === "WORKER"
      ? unpaidSeats(ex, run.periodEnd, run.id)
          .select("vw.workerId")
          .distinct()
          .where("vw.workerId", "in", ids)
          .execute()
          .then((rows) => new Set(rows.map((row) => row.workerId)))
      : Promise.resolve(new Set<string>()),
  ]);
  const historyOf = new Map<string, typeof events>();
  for (const event of events) historyOf.set(event.staffId, [...(historyOf.get(event.staffId) ?? []), event]);
  const month = daysFrom(run.periodStart, run.periodEnd);

  return people.flatMap((person) => {
    const history = historyOf.get(person.id) ?? [];
    const inPost = inPostOn(
      person,
      history.filter((event) => event.kind === "STATUS"),
    );
    const postDays = month.filter(inPost).length;
    if (postDays === 0 && !owed.has(person.id)) return [];
    // The pay terms in force at the end of the month (her history, the row written last), else the file's.
    const terms = history
      .filter((event) => event.kind === "PAY_TERMS")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.written - b.written)
      .at(-1);
    return [
      {
        ...person,
        payBasis: terms?.payBasis ?? person.payBasis,
        payRate: terms?.payRate ?? person.payRate,
        inPost,
        postDays,
      },
    ];
  });
}

interface PaidSeat {
  id: string;
  date: string;
  workedMin: number;
  division: string;
  /** Paid its planned minutes: a done visit whose times were not typed. */
  planned: boolean;
}

/** A worker's typed seats up to the end of the month that no live run has paid. */
async function seatsToPay(ex: Executor, workerId: string, end: LocalDate, runId: string): Promise<PaidSeat[]> {
  const rows = await unpaidSeats(ex, end, runId)
    .select(["vw.id", "v.visitDate", "vw.workedMin", "v.plannedDurationMin", "v.status", "f.division"])
    .where("vw.workerId", "=", workerId)
    .orderBy("v.visitDate")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    date: row.visitDate,
    workedMin: row.workedMin ?? row.plannedDurationMin,
    division: row.division,
    planned: row.workedMin === null,
  }));
}

/** Minutes of a worker's seats that live runs other than this one already paid, per day asked about (PEO-04). */
async function minutesPaidOn(
  ex: Executor,
  workerId: string,
  runId: string,
  dates: readonly string[],
): Promise<Map<string, number>> {
  if (dates.length === 0) return new Map();
  const rows = await ex
    .selectFrom("PayslipSeat as s")
    .innerJoin("Payslip as p", "p.id", "s.payslipId")
    .innerJoin("PayRun as r", "r.id", "p.payRunId")
    .select(["s.visitDate", "s.countedMin"])
    .where("p.staffId", "=", workerId)
    .where("r.status", "<>", "VOID")
    .where("r.id", "<>", runId)
    .where(
      "s.visitDate",
      "in",
      dates.map((date) => localDate(date)),
    )
    .execute();
  const paid = new Map<string, number>();
  for (const row of rows) paid.set(row.visitDate, (paid.get(row.visitDate) ?? 0) + row.countedMin);
  return paid;
}

interface Figures {
  /** Minutes per day of what this payslip pays. */
  days: Map<string, number>;
  /** The days it pays as days: those with minutes that no other run paid already (PEO-04). */
  daysWorked: number;
  /** Σ of what it adds past the standard day, each day taken whole with what was paid of it before (PEO-04). */
  beyondDayMin: number;
  seats: PaidSeat[];
  overtimeMin: number;
  premiumOnlyMin: number;
  restDayMin: number;
  paidAbsenceMin: number;
  unpaidAbsenceMin: number;
  lateMin: number;
  ordersNotTyped: number;
  divisionMin: Record<string, number>;
}

async function workerFigures(
  ex: Executor,
  ctx: ServiceContext,
  person: Person,
  period: { start: LocalDate; end: LocalDate },
  runId: string,
  limits: { dayMin: number; weekMin: number },
): Promise<Figures> {
  const [hours] = await workerHours(ex, ctx, { from: period.start, to: period.end, workerId: person.id });
  // What she did while in post is paid; nothing else (PEO-01).
  const seats = (await seatsToPay(ex, person.id, period.end, runId)).filter((seat) => person.inPost(seat.date));
  const days = new Map<string, number>();
  const divisionMin: Record<string, number> = {};
  for (const seat of seats) {
    days.set(seat.date, (days.get(seat.date) ?? 0) + seat.workedMin);
    divisionMin[seat.division] = (divisionMin[seat.division] ?? 0) + seat.workedMin;
  }
  for (const line of hours?.adjustments ?? []) {
    if (!person.inPost(line.date)) continue;
    days.set(line.date, Math.max(0, (days.get(line.date) ?? 0) + line.adjustMin));
    divisionMin.COMMON = (divisionMin.COMMON ?? 0) + line.adjustMin;
  }
  // A month she was in post on no day pays only her late seats: no week, absence or lateness of its own.
  const ownMonth = person.postDays > 0;
  const weeks = ownMonth ? (hours?.weeks ?? []) : [];
  let overtimeMin = weeks.reduce((sum, week) => sum + week.overtimeMin, 0);
  let premiumOnlyMin = weeks.reduce((sum, week) => sum + Math.max(0, week.overtimeMin - week.beyondDayMin), 0);
  let restDayMin = weeks.reduce((sum, week) => sum + week.restDayMin, 0);

  // A late seat on a day another run already paid adds to that day: it is not a day more, and what it brings
  // past the standard day is counted on the whole day (PEO-04).
  const lateDates = [...new Set(seats.filter((seat) => seat.date < period.start).map((seat) => seat.date))];
  const paidBefore = await minutesPaidOn(ex, person.id, runId, lateDates);
  const addedPastDay = (date: string, added: number) => {
    const before = paidBefore.get(date) ?? 0;
    return Math.max(0, before + added - limits.dayMin) - Math.max(0, before - limits.dayMin);
  };
  const daysWorked = [...days].filter(([date, value]) => value > 0 && !((paidBefore.get(date) ?? 0) > 0)).length;
  const beyondDayMin = [...days].reduce((sum, [date, value]) => sum + addedPastDay(date, value), 0);

  // Arrears (LAB-5): a seat typed after the month its week ended in was closed. Its week is priced again with
  // every seat now typed, and what the late seats add to its overtime and its rest-day work is paid here.
  const late = new Map<string, PaidSeat[]>();
  for (const seat of seats) {
    if (seat.date >= period.start) continue;
    const saturday = weekStart(localDate(seat.date));
    if (addDays(saturday, 6) >= period.start) continue; // a week ending in this month is already counted whole
    late.set(saturday, [...(late.get(saturday) ?? []), seat]);
  }
  for (const [saturday, lateSeats] of late) {
    const [past] = await workerHours(ex, ctx, { from: saturday, to: addDays(saturday, 6), workerId: person.id });
    const week = past?.weeks.find((each) => each.start === saturday);
    if (!week) continue;
    const added = lateSeats.reduce((sum, seat) => sum + seat.workedMin, 0);
    const overtimeBefore = Math.max(0, week.workedMin - added - limits.weekMin);
    const overtimeAdded = Math.max(0, week.overtimeMin - overtimeBefore);
    const byDay = new Map<string, number>();
    for (const seat of lateSeats) byDay.set(seat.date, (byDay.get(seat.date) ?? 0) + seat.workedMin);
    const beyondAdded = [...byDay].reduce((sum, [date, value]) => sum + addedPastDay(date, value), 0);
    const onRestDay = lateSeats
      .filter((seat) => seat.date === week.restDate)
      .reduce((sum, seat) => sum + seat.workedMin, 0);
    overtimeMin += overtimeAdded;
    premiumOnlyMin += Math.max(0, overtimeAdded - beyondAdded);
    restDayMin += Math.min(week.restDayMin, onRestDay);
  }
  return {
    days,
    daysWorked,
    beyondDayMin,
    seats,
    overtimeMin,
    premiumOnlyMin,
    restDayMin,
    paidAbsenceMin: ownMonth ? (hours?.totals.paidAbsenceMin ?? 0) : 0,
    unpaidAbsenceMin: ownMonth ? (hours?.totals.unpaidAbsenceMin ?? 0) : 0,
    lateMin: ownMonth ? (hours?.totals.lateMin ?? 0) : 0,
    ordersNotTyped: hours?.totals.ordersNotTyped ?? 0,
    divisionMin,
  };
}

async function employeeFigures(
  ex: Executor,
  person: Person,
  period: { start: LocalDate; end: LocalDate },
  settings: { dayMin: number; weekMin: number; restDay: string },
): Promise<Figures> {
  const readFrom = weekStart(period.start);
  const all = (await employeeDays(ex, { staffIds: [person.id], from: readFrom, to: period.end })).get(person.id);
  // Only the days in post count (PEO-01).
  const minutesOn = (date: string) => (person.inPost(date) ? (all?.get(date)?.minutes ?? 0) : 0);
  const days = new Map<string, number>();
  for (const [date, day] of all ?? []) {
    if (date >= period.start && day.minutes > 0 && person.inPost(date)) days.set(date, day.minutes);
  }

  let overtimeMin = 0;
  let premiumOnlyMin = 0;
  let restDayMin = 0;
  for (let saturday = readFrom; saturday <= period.end; saturday = localDate(addDays(saturday, 7))) {
    const friday = addDays(saturday, 6);
    if (friday < period.start || friday > period.end) continue;
    let total = 0;
    let beyond = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = minutesOn(addDays(saturday, offset));
      total += day;
      beyond += Math.max(0, day - settings.dayMin);
    }
    const weekOvertime = Math.max(0, total - settings.weekMin);
    overtimeMin += weekOvertime;
    premiumOnlyMin += Math.max(0, weekOvertime - beyond);
    const restDate = addDays(saturday, ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"].indexOf(settings.restDay));
    restDayMin += minutesOn(restDate);
  }

  const [absenceRows, leaveRows] = await Promise.all([
    ex
      .selectFrom("EmployeeAbsence")
      .select(["date", "absenceMin", "paid"])
      .where("staffId", "=", person.id)
      .where("date", ">=", period.start)
      .where("date", "<=", period.end)
      .where("deletedAt", "is", null)
      .where("employeeLeaveId", "is", null)
      .execute(),
    ex
      .selectFrom("EmployeeLeave")
      .select(["startDate", "days", "paid"])
      .where("staffId", "=", person.id)
      .where("status", "=", "APPROVED")
      .where("deletedAt", "is", null)
      .where("startDate", ">=", period.start)
      .where("endDate", "<=", period.end)
      .execute(),
  ]);
  const absences = absenceRows.filter((absence) => person.inPost(absence.date));
  const leaves = leaveRows.filter((leave) => person.inPost(leave.startDate));
  const leaveMin = (rows: typeof leaves) =>
    rows.reduce((sum, leave) => sum + Math.round((leave.days * settings.dayMin) / 1000), 0);
  const paidMin = [...days.values()].reduce((sum, value) => sum + value, 0);
  return {
    days,
    daysWorked: [...days.values()].filter((value) => value > 0).length,
    beyondDayMin: [...days.values()].reduce((sum, value) => sum + Math.max(0, value - settings.dayMin), 0),
    seats: [],
    overtimeMin,
    premiumOnlyMin,
    restDayMin,
    paidAbsenceMin:
      absences.filter((a) => a.paid === 1).reduce((sum, a) => sum + a.absenceMin, 0) +
      leaveMin(leaves.filter((leave) => leave.paid === 1)),
    unpaidAbsenceMin:
      absences.filter((a) => a.paid === 0).reduce((sum, a) => sum + a.absenceMin, 0) +
      leaveMin(leaves.filter((leave) => leave.paid === 0)),
    lateMin: 0,
    ordersNotTyped: 0,
    divisionMin: paidMin > 0 ? { COMMON: paidMin } : {},
  };
}

/** The days of the month a person was in post, for a monthly wage (PEO-01): all of them is the whole month. */
function monthShare(person: Person, period: { start: LocalDate; end: LocalDate }) {
  const all = Number(period.end.slice(8, 10));
  return person.postDays >= all ? undefined : { days: person.postDays, of: all };
}

/** A line's quantity as stored, in thousandths: hours for minutes, or the days or tasks of the base. */
function lineQuantity(line: PayslipLine, basis: PayBasis) {
  const counted = line.type === "BASE" && (basis === "DAILY" || basis === "PER_TASK");
  return qty(counted ? (line.quantity ?? 0) * 1000 : Math.round(((line.quantity ?? 0) * 1000) / 60));
}

/**
 * Annual leave taken in the month, and what is left to take at its end, in
 * thousandths of a day (Law 90-11, the coordinator's ruling): the years ended
 * are carried, the count begins after a balance brought in, and only annual
 * leave debits it.
 */
async function leaveFigures(
  ex: Executor,
  person: Person,
  period: { start: LocalDate; end: LocalDate },
  rules: LeaveRules,
): Promise<{ taken: number; balance: number }> {
  const from = leaveCountFrom(person.startDate ?? person.registrationDate, person.leaveOpeningDate);
  const since = localDate(from < period.start ? from : period.start);
  const taken: Array<{ startDate: string; days: number | null }> =
    person.kind === "WORKER"
      ? await ex
          .selectFrom("WorkerAbsence")
          .select(["startDate", "days"])
          .where("workerId", "=", person.id)
          .where("category", "=", "LEAVE")
          .where("leaveType", "=", "ANNUAL")
          .where("status", "=", "APPROVED")
          .where("startDate", ">=", since)
          .where("startDate", "<=", period.end)
          .execute()
      : await ex
          .selectFrom("EmployeeLeave")
          .select(["startDate", "days"])
          .where("staffId", "=", person.id)
          .where("type", "=", "ANNUAL")
          .where("status", "=", "APPROVED")
          .where("deletedAt", "is", null)
          .where("startDate", ">=", since)
          .where("startDate", "<=", period.end)
          .execute();
  const sum = (after: string) =>
    taken.filter((row) => row.startDate >= after).reduce((all, row) => all + (row.days ?? 0), 0);
  const account = leaveAccount(
    {
      startDate: person.startDate ?? person.registrationDate,
      openingDate: person.leaveOpeningDate,
      openingDays: person.leaveOpeningDays,
      asOf: period.end,
      taken: sum(from),
    },
    rules,
  );
  return { taken: sum(period.start), balance: account.toTake };
}

/** Computes and writes one person's payslip in a draft run, with its lines and the seats it pays. */
async function writePayslip(
  ex: Executor,
  ctx: ServiceContext,
  run: { id: string; staffKind: string; periodStart: LocalDate; periodEnd: LocalDate },
  person: Person,
  setup: Setup,
  typed: PayslipOverrides,
  keepId?: string,
): Promise<ReturnType<typeof computePayslip> | null> {
  const period = { start: run.periodStart, end: run.periodEnd };
  const figures =
    person.kind === "WORKER"
      ? await workerFigures(ex, ctx, person, period, run.id, { dayMin: setup.dayMin, weekMin: setup.weekMin })
      : await employeeFigures(ex, person, period, {
          dayMin: setup.dayMin,
          weekMin: setup.weekMin,
          restDay: setup.restDay,
        });
  const basis = person.payBasis as PayBasis;
  const paidMin = [...figures.days.values()].reduce((sum, value) => sum + value, 0);
  // Nothing to pay a worker paid by the hour, day or task who worked nothing and was paid no leave.
  if (basis !== "MONTHLY" && paidMin === 0 && figures.paidAbsenceMin === 0) return null;
  // A monthly wage with no day in post this month has nothing to pay.
  if (basis === "MONTHLY" && person.postDays === 0 && paidMin === 0) return null;

  // Allowances and recurring deductions belong to a month in post: none for one paid only its late seats.
  const items =
    person.postDays === 0
      ? []
      : await ex
          .selectFrom("StaffPayItem")
          .selectAll()
          .where("staffId", "=", person.id)
          .where("deletedAt", "is", null)
          .where("fromDate", "<=", run.periodEnd)
          .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", run.periodStart)]))
          .execute();
  const allowances = items.filter((item) => item.type === "ALLOWANCE");
  const recurringDeductions = items.filter((item) => item.type === "DEDUCTION");
  // The recurring deductions in full, unless the office typed what this payslip takes of them (PEO-09).
  const recurring = typed.recurringDeductions ?? recurringDeductions.reduce((sum, item) => sum + item.amount, 0);
  const deductions = recurring + (typed.deduction ?? 0);
  const share = basis === "MONTHLY" ? monthShare(person, period) : undefined;
  const figuresIn = {
    basis,
    rate: money(person.payRate ?? 0),
    paidMin,
    daysWorked: figures.daysWorked,
    beyondDayMin: figures.beyondDayMin,
    overtimeMin: figures.overtimeMin,
    premiumOnlyMin: figures.premiumOnlyMin,
    restDayMin: figures.restDayMin,
    tasks: figures.seats.length,
    paidAbsenceMin: figures.paidAbsenceMin,
    unpaidAbsenceMin: figures.unpaidAbsenceMin,
    monthShare: share,
    additions: allowances.map((item) => ({
      label: item.label,
      amount: money(item.amount),
      contributable: item.contributable === 1,
      taxable: item.taxable === 1,
    })),
    otherDeductions: money(deductions),
    declared: person.cnasDeclared === 1,
    overrides: {
      cnas: typed.cnas === undefined ? undefined : money(typed.cnas),
      irg: typed.irg === undefined ? undefined : money(typed.irg),
      overtime: typed.overtime === undefined ? undefined : money(typed.overtime),
      restDayPremium: typed.restDayPremium === undefined ? undefined : money(typed.restDayPremium),
    },
    baseCorrection:
      typed.baseCorrection === undefined || typed.baseCorrection === 0
        ? undefined
        : {
            amount: money(typed.baseCorrection),
            label: typed.baseCorrectionReason
              ? `${BASE_CORRECTION_AR}: ${typed.baseCorrectionReason}`
              : BASE_CORRECTION_AR,
          },
  };
  // Advances and other debts are taken back from what is left: those of this month and of the months before
  // it, unless the office typed another amount (never more than is owed now).
  const owed = await debtBalanceOf(ex, person.id);
  const owedThen = await debtAt(ex, person.id, run.periodEnd);
  const before = computePayslip({ ...figuresIn, advanceRepayment: money(0) }, setup.rates);
  const repay =
    typed.advanceRepayment !== undefined
      ? Math.min(typed.advanceRepayment, owed)
      : Math.max(0, Math.min(owed, owedThen, before.net ?? 0));
  const result = computePayslip({ ...figuresIn, advanceRepayment: money(repay) }, setup.rates);
  // What is taken back, line by line of the ledger: an advance, a violation's deduction, a damage (PEO-13).
  const repaid = repay > 0 ? await repaymentLines(ex, person.id, repay) : [];

  const positionOrRole =
    person.kind === "WORKER"
      ? person.role
        ? workerRoleAr(person.role as WorkerRole, person.sex as never)
        : null
      : person.jobPosition
        ? (JOB_POSITION_AR[person.jobPosition as keyof typeof JOB_POSITION_AR] ?? null)
        : null;
  // A payslip computed again keeps its id: the page open on it stays the same record.
  const payslipId = keepId ?? newId();
  // Leave is earned for the days in post (PEO-01).
  const monthDays = Number(run.periodEnd.slice(8, 10));
  const leaveAccrued = Math.round((setup.leave.perMonth * Math.min(person.postDays, monthDays)) / monthDays);
  const leave = await leaveFigures(ex, person, period, setup.leave);
  await ex
    .insertInto("Payslip")
    .values({
      id: payslipId,
      payRunId: run.id,
      staffId: person.id,
      staffName: staffName(person),
      staffNumber: person.number,
      positionOrRole,
      cnasNumber: person.cnasNumber,
      payBasis: basis,
      payRate: money(person.payRate ?? 0),
      daysWorked: qty(figuresIn.daysWorked * 1000),
      visitsDone: figures.seats.length,
      ordersNotTypedCount: figures.ordersNotTyped,
      normalMin: minutes(Math.max(0, paidMin - figures.overtimeMin)),
      overtimeMin: minutes(figures.overtimeMin),
      restDayMin: minutes(figures.restDayMin),
      absenceMin: minutes(figures.paidAbsenceMin + figures.unpaidAbsenceMin),
      lateMin: minutes(figures.lateMin),
      divisionMin: JSON.stringify(figures.divisionMin),
      baseAmount: money(result.base + result.baseCorrection),
      overtimeAmount: money(result.overtime + result.restDayPremium),
      allowancesTotal: money(result.additions + result.leavePay),
      grossAmount: result.gross,
      contributableBase: result.contributableBase,
      cnasRate: person.cnasDeclared === 1 ? setup.rates.cnasEmployeeBp : basisPoints(0),
      cnasAmount: result.cnas,
      taxableBase: result.taxableBase,
      irgAmount: result.irg ?? money(0),
      advanceRepayment: result.advanceRepayment,
      otherDeductions: result.otherDeductions,
      netAmount: result.net ?? money(result.gross - result.cnas - result.advanceRepayment - result.otherDeductions),
      employerCnasRate: person.cnasDeclared === 1 ? setup.rates.cnasEmployerBp : basisPoints(0),
      employerCnasAmount: result.employerCnas,
      leaveAccruedDays: qty(leaveAccrued),
      leaveTakenDays: qty(leave.taken),
      leaveBalanceDays: qty(leave.balance),
      manualOverrides: JSON.stringify({
        typed,
        // What must be typed before the run closes: the IRG without a scale, and a wage per task's premiums.
        plannedSeats: figures.seats.filter((seat) => seat.planned).length,
        missing: [
          ...(result.irg === null ? ["IRG"] : []),
          ...(result.warnings.some((warning) => warning.kind === "OVERTIME_NOT_PRICED") ? ["OVERTIME"] : []),
          ...(result.warnings.some((warning) => warning.kind === "REST_DAY_NOT_PRICED") ? ["REST_DAY"] : []),
        ],
      } satisfies StoredOverrides),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();

  const lineLabel = (line: PayslipLine) => {
    if ((line.type === "ALLOWANCE" || line.type === "OTHER") && line.label) return line.label;
    if (line.type === "DEDUCTION" && typed.deductionLabel) return typed.deductionLabel;
    return LINE_AR[line.type];
  };
  // The one repayment line of the computation is printed as the ledger's lines it takes back (PEO-13).
  const written = result.lines.flatMap((line) =>
    line.type === "ADVANCE_REPAYMENT" && repaid.length > 0
      ? repaid.map((part) => ({ ...line, label: part.label, amount: money(-part.amount) }))
      : [line],
  );
  for (const [index, line] of written.entries()) {
    const fromItem = line.type === "ALLOWANCE" ? allowances.find((item) => item.label === line.label) : undefined;
    await ex
      .insertInto("PayslipItem")
      .values({
        id: newId(),
        payslipId,
        sortOrder: index,
        type: line.type,
        label: line.type === "ADVANCE_REPAYMENT" && line.label ? line.label : lineLabel(line),
        quantity: line.quantity === undefined ? null : lineQuantity(line, basis),
        rate: line.type === "BASE" ? money(person.payRate ?? 0) : null,
        amount: line.amount,
        contributable: line.contributable ? 1 : 0,
        taxable: line.taxable ? 1 : 0,
        sourceKind: fromItem ? "PAY_ITEM" : line.type === "BASE" || line.type === "OVERTIME_50" ? "HOURS" : null,
        sourceId: fromItem?.id ?? null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .execute();
  }
  for (const seat of figures.seats) {
    await ex
      .insertInto("PayslipSeat")
      .values({
        id: newId(),
        payslipId,
        visitWorkerId: seat.id,
        visitDate: localDate(seat.date),
        countedMin: minutes(seat.workedMin),
        isArrears: seat.date < run.periodStart ? 1 : 0,
        createdAt: ctx.now,
      })
      .execute();
  }
  return result;
}

/** Writes every payslip of a draft run, keeping what was typed on each. */
async function fillRun(
  ex: Executor,
  ctx: ServiceContext,
  run: RunScope,
  kept: Map<string, { id: string; typed: PayslipOverrides }>,
): Promise<number> {
  const { rates: payRates, snapshot } = await rates(ex);
  const people = await peopleOf(ex, run);
  let written = 0;
  for (const person of people) {
    const wrote = await writePayslip(
      ex,
      ctx,
      run,
      person,
      setupFrom(payRates, snapshot),
      kept.get(person.id)?.typed ?? {},
      kept.get(person.id)?.id,
    );
    if (wrote !== null) written += 1;
  }
  return written;
}

/** Empties a draft run: its seats, lines and payslips. Returns each person's payslip id and what was typed on it, to keep. */
async function emptyRun(ex: Executor, runId: string): Promise<Map<string, { id: string; typed: PayslipOverrides }>> {
  const payslips = await ex
    .selectFrom("Payslip")
    .select(["id", "staffId", "manualOverrides"])
    .where("payRunId", "=", runId)
    .execute();
  const kept = new Map(
    payslips.map((slip) => [slip.staffId, { id: slip.id, typed: parseOverrides(slip.manualOverrides).typed }]),
  );
  const ids = payslips.map((slip) => slip.id);
  if (ids.length) {
    await ex.deleteFrom("PayslipSeat").where("payslipId", "in", ids).execute();
    await ex.deleteFrom("PayslipItem").where("payslipId", "in", ids).execute();
    await ex.deleteFrom("Payslip").where("id", "in", ids).execute();
  }
  return kept;
}

async function runOf(ex: Executor, payRunId: string) {
  const run = await ex.selectFrom("PayRun").selectAll().where("id", "=", payRunId).executeTakeFirst();
  if (!run) throw new ServiceError("This pay run does not exist.");
  return run;
}

/**
 * Drafts the month's pay run for workers or for employees, or brings the
 * draft up to date when there is one. A month already closed is not run again.
 */
export async function preparePayRun(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffKind: StaffKind; month: string },
): Promise<{ payRunId: string; payslips: number }> {
  if (!RUN_KINDS.includes(input.staffKind)) throw new Error(`people: no pay run for ${input.staffKind}`);
  requirePay(ctx, "WRITE");
  const { start, end } = monthOf(input.month);
  if (start > ctx.today) throw new ServiceError("A month still to come cannot be paid yet.");
  const live = await ex
    .selectFrom("PayRun")
    .select(["id", "status"])
    .where("staffKind", "=", input.staffKind)
    .where("periodType", "=", "MONTHLY")
    .where("periodStart", "=", start)
    .where("branchId", "=", ctx.branchId)
    .where("status", "<>", "VOID")
    .executeTakeFirst();
  if (live?.status === "CLOSED") throw new ServiceError("This month's pay run is already closed.");
  if (live) return refreshPayRun(ex, ctx, { payRunId: live.id });

  const earlier = await ex
    .selectFrom("PayRun")
    .select("id")
    .where("staffKind", "=", input.staffKind)
    .where("branchId", "=", ctx.branchId)
    .where("status", "=", "DRAFT")
    .where("periodStart", "<", start)
    .executeTakeFirst();
  if (earlier) throw new ServiceError("An earlier pay run is still a draft: close it first.");

  const { snapshot } = await rates(ex);
  const payRunId = newId();
  await ex
    .insertInto("PayRun")
    .values({
      id: payRunId,
      staffKind: input.staffKind,
      periodType: "MONTHLY",
      periodStart: start,
      periodEnd: end,
      status: "DRAFT",
      ratesSnapshot: JSON.stringify(snapshot),
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  const payslips = await fillRun(
    ex,
    ctx,
    { id: payRunId, staffKind: input.staffKind, periodStart: start, periodEnd: end, branchId: ctx.branchId },
    new Map(),
  );
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "PayRun",
    entityId: payRunId,
    entityLabel: `${input.month} ${input.staffKind}`,
    changes: { status: [null, "DRAFT"] },
    context: { payslips },
  });
  return { payRunId, payslips };
}

/** Computes a draft again from what the hours, absences and pay items say now. What was typed is kept. */
export async function refreshPayRun(
  ex: Executor,
  ctx: ServiceContext,
  input: { payRunId: string },
): Promise<{ payRunId: string; payslips: number }> {
  const run = await runOf(ex, input.payRunId);
  requirePay(ctx, "WRITE");
  if (run.status !== "DRAFT") throw new ServiceError("Only a draft pay run can be computed again.");
  const kept = await emptyRun(ex, run.id);
  const payslips = await fillRun(ex, ctx, run, kept);
  // A draft follows the rates in Settings; they are fixed when it closes.
  const { snapshot } = await rates(ex);
  await ex
    .updateTable("PayRun")
    .set({ ratesSnapshot: JSON.stringify(snapshot), updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", run.id)
    .execute();
  return { payRunId: run.id, payslips };
}

/**
 * Types over a draft payslip's CNAS, IRG, repayment, its recurring
 * deductions, or adds a deduction, or corrects its base with the reason.
 * Kept through a refresh.
 */
export async function updatePayslip(
  ex: Executor,
  ctx: ServiceContext,
  input: { payslipId: string } & { [K in keyof PayslipOverrides]?: PayslipOverrides[K] | null },
): Promise<void> {
  const slip = await ex
    .selectFrom("Payslip as p")
    .innerJoin("PayRun as r", "r.id", "p.payRunId")
    .select(["p.id", "p.staffId", "p.staffName", "p.manualOverrides", "r.id as runId", "r.status", "r.staffKind"])
    .where("p.id", "=", input.payslipId)
    .executeTakeFirst();
  if (!slip) throw new ServiceError("This payslip does not exist.");
  requirePay(ctx, "WRITE");
  if (slip.status !== "DRAFT") throw new ServiceError("A closed payslip can no longer be changed.");
  const typed: PayslipOverrides = { ...parseOverrides(slip.manualOverrides).typed };
  const amounts = [
    "cnas",
    "irg",
    "advanceRepayment",
    "deduction",
    "overtime",
    "restDayPremium",
    "recurringDeductions",
  ] as const;
  for (const key of amounts) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === null) delete typed[key];
    else if (!Number.isSafeInteger(value) || value < 0) throw new ServiceError("An amount is in dinars, 0 or more.");
    else typed[key] = value;
  }
  if (input.deductionLabel !== undefined) {
    if (input.deductionLabel === null || input.deductionLabel.trim() === "") delete typed.deductionLabel;
    else typed.deductionLabel = input.deductionLabel.trim();
  }
  // A correction of the base is signed, and says why (PEO-08).
  if (input.baseCorrectionReason !== undefined) {
    const reason = input.baseCorrectionReason?.trim() ?? "";
    if (reason === "") delete typed.baseCorrectionReason;
    else typed.baseCorrectionReason = reason;
  }
  if (input.baseCorrection !== undefined) {
    if (input.baseCorrection === null || input.baseCorrection === 0) {
      delete typed.baseCorrection;
      delete typed.baseCorrectionReason;
    } else if (!Number.isSafeInteger(input.baseCorrection)) {
      throw new ServiceError("A correction of the base is an amount in dinars.");
    } else {
      typed.baseCorrection = input.baseCorrection;
    }
  }
  if (typed.baseCorrection !== undefined && !typed.baseCorrectionReason) {
    throw new ServiceError("Write the reason for correcting the base pay.");
  }
  // The payslip is written again, alone, with what was typed.
  const run = await runOf(ex, slip.runId);
  await ex.deleteFrom("PayslipSeat").where("payslipId", "=", slip.id).execute();
  await ex.deleteFrom("PayslipItem").where("payslipId", "=", slip.id).execute();
  await ex.deleteFrom("Payslip").where("id", "=", slip.id).execute();
  const { rates: payRates, snapshot } = await rates(ex);
  const person = (await peopleOf(ex, run)).find((each) => each.id === slip.staffId);
  if (!person) throw new ServiceError("This person has no pay terms for this month.");
  const result = await writePayslip(ex, ctx, run, person, setupFrom(payRates, snapshot), typed, slip.id);
  if (result && typed.baseCorrection !== undefined && result.baseCorrection !== typed.baseCorrection) {
    throw new ServiceError("A correction cannot take off more than the base pay.");
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "Payslip",
    entityId: slip.id,
    entityLabel: slip.staffName,
    subject: { kind: run.staffKind === "EMPLOYEE" ? "EMPLOYEE" : "WORKER", id: slip.staffId, label: slip.staffName },
    changes: Object.fromEntries(Object.entries(typed).map(([key, value]) => [key, [null, value]])),
    reason: typed.baseCorrectionReason,
  });
}

/** Closes a draft run: numbers it and its payslips, freezes them, writes the repayments in the ledger. */
export async function closePayRun(
  ex: Executor,
  ctx: ServiceContext,
  input: { payRunId: string },
): Promise<{ number: string }> {
  const run = await runOf(ex, input.payRunId);
  requirePay(ctx, "WRITE");
  if (run.status !== "DRAFT") throw new ServiceError("Only a draft pay run can be closed.");
  if (run.periodEnd >= ctx.today) throw new ServiceError("A month is closed once it is over.");

  // What closes is what the hours, the absences and the pay items say now (PEO-03): the draft is computed again
  // here, and closed only if that changed nothing; otherwise it is to be looked at again first.
  const figuresOf = async () =>
    (
      await ex
        .selectFrom("Payslip")
        .select(["staffId", "grossAmount", "netAmount", "cnasAmount", "irgAmount", "advanceRepayment"])
        .select(["otherDeductions", "employerCnasAmount"])
        .where("payRunId", "=", run.id)
        .orderBy("staffId")
        .execute()
    )
      .map((slip) => Object.values(slip).join("|"))
      .join("\n");
  const seen = await figuresOf();
  await fillRun(ex, ctx, run, await emptyRun(ex, run.id));
  if ((await figuresOf()) !== seen) {
    throw new ServiceError("The hours or the pay changed since this run was computed: compute it again and check it.");
  }
  const { snapshot } = await rates(ex);
  await ex
    .updateTable("PayRun")
    .set({ ratesSnapshot: JSON.stringify(snapshot) })
    .where("id", "=", run.id)
    .execute();

  const payslips = await ex
    .selectFrom("Payslip")
    .selectAll()
    .where("payRunId", "=", run.id)
    .orderBy("staffNumber")
    .execute();
  if (payslips.length === 0) throw new ServiceError("This pay run has no payslip.");
  if (payslips.some((slip) => parseOverrides(slip.manualOverrides).missing.includes("IRG"))) {
    throw new ServiceError("Type the IRG of every payslip first: its scale is not in Settings.");
  }
  if (
    payslips.some((slip) => {
      const missing = parseOverrides(slip.manualOverrides).missing;
      return missing.includes("OVERTIME") || missing.includes("REST_DAY");
    })
  ) {
    throw new ServiceError("Price the overtime and the rest-day work of every payslip paid per task first.");
  }
  for (const slip of payslips) {
    if (slip.netAmount < 0) throw new ServiceError("A payslip takes off more than it pays: correct it first.");
    if (slip.advanceRepayment > (await debtBalanceOf(ex, slip.staffId))) {
      throw new ServiceError("The advances changed since this run was computed: compute it again.");
    }
  }

  // The payslips' numbers while the run is still a draft; then the run's, with its closing, in one statement.
  for (const slip of payslips) {
    const number = await nextNumber(ex, ctx, "PAYSLIP", { date: run.periodEnd });
    await ex
      .updateTable("Payslip")
      .set({ numberSeq: number.seq, numberYear: number.year, number: number.display, updatedAt: ctx.now })
      .where("id", "=", slip.id)
      .execute();
  }
  const number = await nextNumber(ex, ctx, "PAY_RUN", { date: run.periodEnd });
  await ex
    .updateTable("PayRun")
    .set({
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      status: "CLOSED",
      closedAt: ctx.now,
      closedByUserId: ctx.userId,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", run.id)
    .execute();

  for (const slip of payslips) {
    if (slip.advanceRepayment <= 0) continue;
    await addDebtEntry(ex, ctx, {
      staffId: slip.staffId,
      date: run.periodEnd,
      direction: "DECREASE",
      reason: "REPAID_ON_PAYSLIP",
      amount: slip.advanceRepayment,
      payslipId: slip.id,
    });
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "STATUS_CHANGE",
    entity: "PayRun",
    entityId: run.id,
    entityLabel: number.display,
    changes: { status: ["DRAFT", "CLOSED"] },
    context: { payslips: payslips.length },
  });
  await emit(ex, ctx, "payrun.closed", { payRunId: run.id });
  return { number: number.display };
}

/** Takes a draft away. A closed run is voided instead. */
export async function deletePayRun(ex: Executor, ctx: ServiceContext, input: { payRunId: string }): Promise<void> {
  const run = await runOf(ex, input.payRunId);
  requirePay(ctx, "WRITE");
  if (run.status !== "DRAFT") throw new ServiceError("Only a draft pay run can be taken away; a closed one is voided.");
  await emptyRun(ex, run.id);
  await ex.deleteFrom("PayRun").where("id", "=", run.id).execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "PayRun",
    entityId: run.id,
    entityLabel: `${run.periodStart.slice(0, 7)} ${run.staffKind}`,
    changes: { status: ["DRAFT", null] },
  });
}

/**
 * Voids a closed run, with the reason: its payslips no longer count, its seats
 * are free to be paid again, and the repayments go back on the ledger. Its
 * wage payouts must be voided first.
 */
export async function voidPayRun(
  ex: Executor,
  ctx: ServiceContext,
  input: { payRunId: string; reason: string },
): Promise<void> {
  const run = await runOf(ex, input.payRunId);
  requirePay(ctx, "WRITE");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for voiding.");
  if (run.status !== "CLOSED") throw new ServiceError("Only a closed pay run can be voided.");
  const paid = await ex
    .selectFrom("StaffPayout as o")
    .innerJoin("Payslip as p", "p.id", "o.payslipId")
    .select("o.id")
    .where("p.payRunId", "=", run.id)
    .where("o.voidedAt", "is", null)
    .executeTakeFirst();
  if (paid) throw new ServiceError("Void the wages paid on this run first.");
  await ex
    .updateTable("PayRun")
    .set({
      status: "VOID",
      voidedAt: ctx.now,
      voidedByUserId: ctx.userId,
      voidReason: reason,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", run.id)
    .execute();
  const repaid = await ex
    .selectFrom("StaffDebtEntry as d")
    .innerJoin("Payslip as p", "p.id", "d.payslipId")
    .select(["d.id", "d.staffId", "d.amount"])
    .where("p.payRunId", "=", run.id)
    .where("d.reason", "=", "REPAID_ON_PAYSLIP")
    .execute();
  for (const line of repaid) {
    await addDebtEntry(ex, ctx, {
      staffId: line.staffId,
      date: ctx.today,
      direction: "INCREASE",
      reason: "REVERSAL",
      amount: line.amount,
      reversesEntryId: line.id,
      note: reason,
    });
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "VOID",
    reason,
    entity: "PayRun",
    entityId: run.id,
    entityLabel: run.number ?? run.periodStart.slice(0, 7),
    changes: { status: ["CLOSED", "VOID"] },
  });
  await emit(ex, ctx, "payrun.voided", { payRunId: run.id });
}

// ── Reading ─────────────────────────────────────────────────────────────────

export interface PayRunRow {
  id: string;
  number: string | null;
  staffKind: StaffKind;
  month: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  payslips: number;
  gross: number;
  net: number;
  paid: number;
  closedAt: string | null;
}

export async function listPayRuns(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffKind?: StaffKind } = {},
): Promise<PayRunRow[]> {
  requirePay(ctx, "READ");
  let runs = ex
    .selectFrom("PayRun as r")
    .leftJoin("Payslip as p", "p.payRunId", "r.id")
    .select((eb) => [
      "r.id",
      "r.number",
      "r.staffKind",
      "r.periodStart",
      "r.periodEnd",
      "r.status",
      "r.closedAt",
      eb.fn.count<number>("p.id").as("payslips"),
      eb.fn.coalesce(eb.fn.sum<number>("p.grossAmount"), eb.lit(0)).as("gross"),
      eb.fn.coalesce(eb.fn.sum<number>("p.netAmount"), eb.lit(0)).as("net"),
      eb.fn.coalesce(eb.fn.sum<number>("p.paidAmount"), eb.lit(0)).as("paid"),
    ])
    .groupBy("r.id");
  if (input.staffKind) runs = runs.where("r.staffKind", "=", input.staffKind);
  const found = await runs.orderBy("r.periodStart", "desc").orderBy("r.createdAt", "desc").execute();
  return found.map((run) => ({
    id: run.id,
    number: run.number,
    staffKind: run.staffKind as StaffKind,
    month: run.periodStart.slice(0, 7),
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    status: run.status,
    payslips: Number(run.payslips),
    gross: Number(run.gross),
    net: Number(run.net),
    paid: Number(run.paid),
    closedAt: run.closedAt,
  }));
}

export interface PayslipRow {
  id: string;
  number: string | null;
  staffId: string;
  staffName: string;
  staffNumber: string;
  positionOrRole: string | null;
  payBasis: string;
  payRate: number;
  daysWorked: number;
  visitsDone: number;
  ordersNotTypedCount: number;
  normalMin: number;
  overtimeMin: number;
  restDayMin: number;
  absenceMin: number;
  lateMin: number;
  grossAmount: number;
  cnasAmount: number;
  irgAmount: number;
  advanceRepayment: number;
  otherDeductions: number;
  netAmount: number;
  employerCnasAmount: number;
  paidAmount: number;
  paidDate: string | null;
  /** The IRG still to type. */
  missing: string[];
  /** Seats paid their planned minutes, their times not typed (LAB-14). */
  plannedSeats: number;
  typed: PayslipOverrides;
}

const payslipRow = (slip: Record<string, unknown> & { manualOverrides: string | null }): PayslipRow => {
  const overrides = parseOverrides(slip.manualOverrides);
  return {
    id: slip.id as string,
    number: slip.number as string | null,
    staffId: slip.staffId as string,
    staffName: slip.staffName as string,
    staffNumber: slip.staffNumber as string,
    positionOrRole: slip.positionOrRole as string | null,
    payBasis: slip.payBasis as string,
    payRate: slip.payRate as number,
    daysWorked: slip.daysWorked as number,
    visitsDone: slip.visitsDone as number,
    ordersNotTypedCount: slip.ordersNotTypedCount as number,
    normalMin: slip.normalMin as number,
    overtimeMin: slip.overtimeMin as number,
    restDayMin: slip.restDayMin as number,
    absenceMin: slip.absenceMin as number,
    lateMin: slip.lateMin as number,
    grossAmount: slip.grossAmount as number,
    cnasAmount: slip.cnasAmount as number,
    irgAmount: slip.irgAmount as number,
    advanceRepayment: slip.advanceRepayment as number,
    otherDeductions: slip.otherDeductions as number,
    netAmount: slip.netAmount as number,
    employerCnasAmount: slip.employerCnasAmount as number,
    paidAmount: slip.paidAmount as number,
    paidDate: slip.paidDate as string | null,
    missing: overrides.missing,
    plannedSeats: overrides.plannedSeats ?? 0,
    typed: overrides.typed,
  };
};

export async function getPayRun(ex: Executor, ctx: ServiceContext, input: { payRunId: string }) {
  const run = await runOf(ex, input.payRunId);
  requirePay(ctx, "READ");
  const payslips = await ex
    .selectFrom("Payslip")
    .selectAll()
    .where("payRunId", "=", run.id)
    .orderBy("staffNumber")
    .execute();
  const rows = payslips.map(payslipRow);
  return {
    id: run.id,
    number: run.number,
    staffKind: run.staffKind as StaffKind,
    month: run.periodStart.slice(0, 7),
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    status: run.status,
    voidReason: run.voidReason,
    closedAt: run.closedAt,
    totals: {
      gross: rows.reduce((sum, slip) => sum + slip.grossAmount, 0),
      net: rows.reduce((sum, slip) => sum + slip.netAmount, 0),
      paid: rows.reduce((sum, slip) => sum + slip.paidAmount, 0),
      employerCnas: rows.reduce((sum, slip) => sum + slip.employerCnasAmount, 0),
    },
    payslips: rows,
  };
}

export interface PayslipFile extends PayslipRow {
  run: {
    id: string;
    number: string | null;
    month: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    staffKind: StaffKind;
  };
  cnasNumber: string | null;
  /** MALE or FEMALE: the printed payslip words itself by it. */
  sex: string;
  /** The centre as the employer, for the printed payslip. */
  employer: { nameAr: string; city: string; cnasEmployerNumber: string };
  contributableBase: number;
  taxableBase: number;
  cnasRate: number;
  employerCnasRate: number;
  leaveAccruedDays: number;
  leaveTakenDays: number;
  leaveBalanceDays: number;
  divisionMin: Record<string, number>;
  items: Array<{
    id: string;
    type: PayslipItemType;
    label: string;
    quantity: number | null;
    rate: number | null;
    amount: number;
  }>;
  seats: Array<{ visitWorkerId: string; visitDate: string; countedMin: number; isArrears: boolean }>;
  payouts: Array<{
    id: string;
    number: string;
    date: string;
    amount: number;
    kind: string;
    wageMethod: string;
    voidedAt: string | null;
  }>;
}

function parseDivisionMinutes(text: string | null): Record<string, number> {
  try {
    return text ? (JSON.parse(text) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** One payslip with its lines, the seats it pays and its payouts. */
export async function getPayslip(
  ex: Executor,
  ctx: ServiceContext,
  input: { payslipId: string },
): Promise<PayslipFile> {
  const slip = await ex.selectFrom("Payslip").selectAll().where("id", "=", input.payslipId).executeTakeFirst();
  if (!slip) throw new ServiceError("This payslip does not exist.");
  const run = await runOf(ex, slip.payRunId);
  requirePay(ctx, "READ");
  const centre = await getSettings(ex, ["centre.nameAr", "centre.city", "centre.cnasEmployerNumber"]);
  const person = await ex.selectFrom("StaffMember").select("sex").where("id", "=", slip.staffId).executeTakeFirst();
  const [items, seats, payouts] = await Promise.all([
    ex.selectFrom("PayslipItem").selectAll().where("payslipId", "=", slip.id).orderBy("sortOrder").execute(),
    ex.selectFrom("PayslipSeat").selectAll().where("payslipId", "=", slip.id).orderBy("visitDate").execute(),
    ex.selectFrom("StaffPayout").selectAll().where("payslipId", "=", slip.id).orderBy("date").execute(),
  ]);
  const divisionMin = parseDivisionMinutes(slip.divisionMin);
  return {
    ...payslipRow(slip),
    run: {
      id: run.id,
      number: run.number,
      month: run.periodStart.slice(0, 7),
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      status: run.status,
      staffKind: run.staffKind as StaffKind,
    },
    cnasNumber: slip.cnasNumber,
    sex: person?.sex ?? "MALE",
    employer: {
      nameAr: centre["centre.nameAr"],
      city: centre["centre.city"],
      cnasEmployerNumber: centre["centre.cnasEmployerNumber"],
    },
    contributableBase: slip.contributableBase,
    taxableBase: slip.taxableBase,
    cnasRate: slip.cnasRate,
    employerCnasRate: slip.employerCnasRate,
    leaveAccruedDays: slip.leaveAccruedDays,
    leaveTakenDays: slip.leaveTakenDays,
    leaveBalanceDays: slip.leaveBalanceDays,
    divisionMin,
    items: items.map((item) => ({
      id: item.id,
      type: item.type as PayslipItemType,
      label: item.label,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount,
    })),
    seats: seats.map((seat) => ({
      visitWorkerId: seat.visitWorkerId,
      visitDate: seat.visitDate,
      countedMin: seat.countedMin,
      isArrears: seat.isArrears === 1,
    })),
    payouts: payouts.map((payout) => ({
      id: payout.id,
      number: payout.number,
      date: payout.date,
      amount: payout.amount,
      kind: payout.kind,
      wageMethod: payout.wageMethod,
      voidedAt: payout.voidedAt,
    })),
  };
}

/** A payslip handed to its owner is a disclosure of personal data: the print is logged before the dialog opens. */
export async function recordPayslipPrint(
  ex: Executor,
  ctx: ServiceContext,
  input: { payslipId: string },
): Promise<void> {
  requirePay(ctx, "READ");
  const slip = await ex
    .selectFrom("Payslip as p")
    .innerJoin("PayRun as r", "r.id", "p.payRunId")
    .select(["p.id", "p.number", "p.staffId", "p.staffName", "r.staffKind", "r.periodStart"])
    .where("p.id", "=", input.payslipId)
    .executeTakeFirst();
  if (!slip) throw new ServiceError("This payslip does not exist.");
  await logDisclose(ex, ctx, {
    owner: "PEOPLE",
    action: "PRINT",
    entity: "Payslip",
    entityId: slip.id,
    entityLabel: slip.number ?? slip.periodStart.slice(0, 7),
    subject: { kind: slip.staffKind === "EMPLOYEE" ? "EMPLOYEE" : "WORKER", id: slip.staffId, label: slip.staffName },
  });
}

export interface StaffPayslipRow {
  id: string;
  number: string | null;
  month: string;
  status: string;
  grossAmount: number;
  netAmount: number;
  paidAmount: number;
}

/** One person's payslips, the last month first: for the person's pay page. */
export async function listPayslipsOf(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string },
): Promise<StaffPayslipRow[]> {
  requirePay(ctx, "READ");
  const rows = await ex
    .selectFrom("Payslip as p")
    .innerJoin("PayRun as r", "r.id", "p.payRunId")
    .select(["p.id", "p.number", "r.periodStart", "r.status", "p.grossAmount", "p.netAmount", "p.paidAmount"])
    .where("p.staffId", "=", input.staffId)
    .where("r.status", "<>", "VOID")
    .orderBy("r.periodStart", "desc")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    month: row.periodStart.slice(0, 7),
    status: row.status,
    grossAmount: row.grossAmount,
    netAmount: row.netAmount,
    paidAmount: row.paidAmount,
  }));
}

/** The month a date is in, `YYYY-MM`, for the screens. */
export const monthOfDate = (date: string) => (isDate(date) ? date.slice(0, 7) : "");

// What the screens import.
const RUN_REFRESHES = [PAY_PATH];
export const preparePayRunAction = action(preparePayRun, { revalidate: RUN_REFRESHES });
export const refreshPayRunAction = action(refreshPayRun, { revalidate: RUN_REFRESHES });
export const updatePayslipAction = action(updatePayslip, { revalidate: RUN_REFRESHES });
export const closePayRunAction = action(closePayRun, { revalidate: RUN_REFRESHES });
export const deletePayRunAction = action(deletePayRun, { revalidate: RUN_REFRESHES });
export const voidPayRunAction = action(voidPayRun, { revalidate: RUN_REFRESHES });
export const listPayRunsQuery = query(listPayRuns);
export const getPayRunQuery = query(getPayRun);
export const getPayslipQuery = query(getPayslip);
export const listPayslipsOfQuery = query(listPayslipsOf);
export const recordPayslipPrintAction = action(recordPayslipPrint, { revalidate: [] });
