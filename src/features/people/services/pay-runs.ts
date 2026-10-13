import { addDays, isDate } from "@/features/people/rules/dates";
import { leaveBalance, leaveEarned, type LeaveRules } from "@/features/people/rules/leave";
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
import { addDebtEntry, debtAt, debtBalanceOf, requirePay } from "./payouts";

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

/** What the office typed over the computed values of a payslip. Kept through a refresh. */
export interface PayslipOverrides {
  cnas?: number;
  irg?: number;
  advanceRepayment?: number;
  /** A deduction typed on this payslip, besides the recurring ones. */
  deduction?: number;
  deductionLabel?: string;
}

interface StoredOverrides {
  typed: PayslipOverrides;
  /** What is missing to close: the IRG when no scale is in Settings and none was typed. */
  missing: string[];
}

function parseOverrides(text: string | null): StoredOverrides {
  try {
    const value = text ? (JSON.parse(text) as Partial<StoredOverrides>) : {};
    return { typed: value.typed ?? {}, missing: value.missing ?? [] };
  } catch {
    return { typed: {}, missing: [] };
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
}

/** The people a run of this kind pays: registered by its end, not gone before its start, with pay terms. */
async function peopleOf(ex: Executor, kind: StaffKind, start: LocalDate, end: LocalDate): Promise<Person[]> {
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
      "numberSeq",
    ])
    .where("kind", "=", kind)
    .where("deletedAt", "is", null)
    .where("registrationDate", "<=", end)
    .where((eb) => eb.or([eb("leftDate", "is", null), eb("leftDate", ">", start)]))
    .orderBy("numberSeq")
    .execute();
  // The pay terms in force at the end of the month (her history), else the file's.
  const terms = people.length
    ? await ex
        .selectFrom("StaffEvent")
        .select(["staffId", "payBasis", "payRate", "date", "createdAt"])
        .where("kind", "=", "PAY_TERMS")
        .where(
          "staffId",
          "in",
          people.map((person) => person.id),
        )
        .where("date", "<=", end)
        .orderBy("staffId")
        .orderBy("date")
        .orderBy("createdAt")
        .execute()
    : [];
  const latest = new Map<string, (typeof terms)[number]>();
  for (const row of terms) latest.set(row.staffId, row);
  return people
    .map((person) => {
      const inForce = latest.get(person.id);
      return {
        ...person,
        payBasis: inForce?.payBasis ?? person.payBasis,
        payRate: inForce?.payRate ?? person.payRate,
      };
    })
    .filter((person) => person.payBasis !== null && person.payRate !== null);
}

interface PaidSeat {
  id: string;
  date: string;
  workedMin: number;
  division: string;
}

/** A worker's typed seats up to the end of the month that no live run has paid. */
async function seatsToPay(ex: Executor, workerId: string, end: LocalDate, runId: string): Promise<PaidSeat[]> {
  const rows = await ex
    .selectFrom("VisitWorker as vw")
    .innerJoin("Visit as v", "v.id", "vw.visitId")
    .innerJoin("File as f", "f.id", "v.fileId")
    .select(["vw.id", "v.visitDate", "vw.workedMin", "f.division"])
    .where("vw.workerId", "=", workerId)
    .where("vw.seatStatus", "=", "ASSIGNED")
    .where("vw.workedMin", "is not", null)
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
    .orderBy("v.visitDate")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    date: row.visitDate,
    workedMin: row.workedMin ?? 0,
    division: row.division,
  }));
}

interface Figures {
  /** Minutes per day of what this payslip pays. */
  days: Map<string, number>;
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
): Promise<Figures> {
  const [hours] = await workerHours(ex, ctx, { from: period.start, to: period.end, workerId: person.id });
  const seats = await seatsToPay(ex, person.id, period.end, runId);
  const days = new Map<string, number>();
  const divisionMin: Record<string, number> = {};
  for (const seat of seats) {
    days.set(seat.date, (days.get(seat.date) ?? 0) + seat.workedMin);
    divisionMin[seat.division] = (divisionMin[seat.division] ?? 0) + seat.workedMin;
  }
  for (const line of hours?.adjustments ?? []) {
    days.set(line.date, Math.max(0, (days.get(line.date) ?? 0) + line.adjustMin));
    divisionMin.COMMON = (divisionMin.COMMON ?? 0) + line.adjustMin;
  }
  const weeks = hours?.weeks ?? [];
  return {
    days,
    seats,
    overtimeMin: weeks.reduce((sum, week) => sum + week.overtimeMin, 0),
    premiumOnlyMin: weeks.reduce((sum, week) => sum + Math.max(0, week.overtimeMin - week.beyondDayMin), 0),
    restDayMin: weeks.reduce((sum, week) => sum + week.restDayMin, 0),
    paidAbsenceMin: hours?.totals.paidAbsenceMin ?? 0,
    unpaidAbsenceMin: hours?.totals.unpaidAbsenceMin ?? 0,
    lateMin: hours?.totals.lateMin ?? 0,
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
  const minutesOn = (date: string) => all?.get(date)?.minutes ?? 0;
  const days = new Map<string, number>();
  for (const [date, day] of all ?? []) if (date >= period.start && day.minutes > 0) days.set(date, day.minutes);

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

  const [absences, leaves] = await Promise.all([
    ex
      .selectFrom("EmployeeAbsence")
      .select(["absenceMin", "paid"])
      .where("staffId", "=", person.id)
      .where("date", ">=", period.start)
      .where("date", "<=", period.end)
      .where("deletedAt", "is", null)
      .where("employeeLeaveId", "is", null)
      .execute(),
    ex
      .selectFrom("EmployeeLeave")
      .select(["days", "paid"])
      .where("staffId", "=", person.id)
      .where("status", "=", "APPROVED")
      .where("deletedAt", "is", null)
      .where("startDate", ">=", period.start)
      .where("endDate", "<=", period.end)
      .execute(),
  ]);
  const leaveMin = (rows: typeof leaves) =>
    rows.reduce((sum, leave) => sum + Math.round((leave.days * settings.dayMin) / 1000), 0);
  const paidMin = [...days.values()].reduce((sum, value) => sum + value, 0);
  return {
    days,
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

/** The days of the month a person was employed, for a monthly wage. */
function monthShare(person: Person, period: { start: LocalDate; end: LocalDate }) {
  const all = Number(period.end.slice(8, 10));
  const began = person.startDate ?? person.registrationDate;
  const from = began > period.start ? began : period.start;
  const lastDay = person.leftDate ? addDays(person.leftDate, -1) : period.end;
  const to = lastDay < period.end ? lastDay : period.end;
  if (to < from) return { days: 0, of: all };
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return days >= all ? undefined : { days, of: all };
}

/** A line's quantity as stored, in thousandths: hours for minutes, or the days or tasks of the base. */
function lineQuantity(line: PayslipLine, basis: PayBasis) {
  const counted = line.type === "BASE" && (basis === "DAILY" || basis === "PER_TASK");
  return qty(counted ? (line.quantity ?? 0) * 1000 : Math.round(((line.quantity ?? 0) * 1000) / 60));
}

/** Paid leave taken in the month, and what is left at its end, in thousandths of a day. */
async function leaveFigures(
  ex: Executor,
  person: Person,
  period: { start: LocalDate; end: LocalDate },
  rules: LeaveRules,
): Promise<{ taken: number; balance: number }> {
  const accrual = leaveEarned({ startDate: person.startDate ?? person.registrationDate, asOf: period.end }, rules);
  const since = localDate(accrual.from < period.start ? accrual.from : period.start);
  const taken: Array<{ startDate: string; days: number | null }> =
    person.kind === "WORKER"
      ? await ex
          .selectFrom("WorkerAbsence")
          .select(["startDate", "days"])
          .where("workerId", "=", person.id)
          .where("category", "=", "LEAVE")
          .where("status", "=", "APPROVED")
          .where("paid", "=", 1)
          .where("startDate", ">=", since)
          .where("startDate", "<=", period.end)
          .execute()
      : await ex
          .selectFrom("EmployeeLeave")
          .select(["startDate", "days"])
          .where("staffId", "=", person.id)
          .where("status", "=", "APPROVED")
          .where("paid", "=", 1)
          .where("deletedAt", "is", null)
          .where("startDate", ">=", since)
          .where("startDate", "<=", period.end)
          .execute();
  const sum = (from: string) =>
    taken.filter((row) => row.startDate >= from).reduce((all, row) => all + (row.days ?? 0), 0);
  return {
    taken: sum(period.start),
    balance: leaveBalance({
      broughtForward: person.leaveOpeningDays ?? 0,
      earned: accrual.earned,
      taken: sum(accrual.from),
    }),
  };
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
): Promise<boolean> {
  const period = { start: run.periodStart, end: run.periodEnd };
  const figures =
    person.kind === "WORKER"
      ? await workerFigures(ex, ctx, person, period, run.id)
      : await employeeFigures(ex, person, period, {
          dayMin: setup.dayMin,
          weekMin: setup.weekMin,
          restDay: setup.restDay,
        });
  const basis = person.payBasis as PayBasis;
  const paidMin = [...figures.days.values()].reduce((sum, value) => sum + value, 0);
  // Nothing to pay a worker paid by the hour, day or task who worked nothing and was paid no leave.
  if (basis !== "MONTHLY" && paidMin === 0 && figures.paidAbsenceMin === 0) return false;

  const items = await ex
    .selectFrom("StaffPayItem")
    .selectAll()
    .where("staffId", "=", person.id)
    .where("deletedAt", "is", null)
    .where("fromDate", "<=", run.periodEnd)
    .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", run.periodStart)]))
    .execute();
  const allowances = items.filter((item) => item.type === "ALLOWANCE");
  const recurringDeductions = items.filter((item) => item.type === "DEDUCTION");
  const deductions = recurringDeductions.reduce((sum, item) => sum + item.amount, 0) + (typed.deduction ?? 0);
  const share = basis === "MONTHLY" ? monthShare(person, period) : undefined;
  const figuresIn = {
    basis,
    rate: money(person.payRate ?? 0),
    paidMin,
    daysWorked: [...figures.days.values()].filter((value) => value > 0).length,
    beyondDayMin: [...figures.days.values()].reduce((sum, value) => sum + Math.max(0, value - setup.dayMin), 0),
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
  const leaveAccrued = share ? Math.round((setup.leave.perMonth * share.days) / share.of) : setup.leave.perMonth;
  const leave = await leaveFigures(ex, person, period, setup.leave);
  await ex
    .insertInto("Payslip")
    .values({
      id: payslipId,
      payRunId: run.id,
      staffId: person.id,
      staffName: `${person.lastName} ${person.firstName}`,
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
      baseAmount: result.base,
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
        missing: result.irg === null ? ["IRG"] : [],
      } satisfies StoredOverrides),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();

  const lineLabel = (line: PayslipLine) => {
    if (line.type === "ALLOWANCE" && line.label) return line.label;
    if (line.type === "DEDUCTION" && typed.deductionLabel) return typed.deductionLabel;
    return LINE_AR[line.type];
  };
  for (const [index, line] of result.lines.entries()) {
    const fromItem = line.type === "ALLOWANCE" ? allowances.find((item) => item.label === line.label) : undefined;
    await ex
      .insertInto("PayslipItem")
      .values({
        id: newId(),
        payslipId,
        sortOrder: index,
        type: line.type,
        label: lineLabel(line),
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
  return true;
}

/** Writes every payslip of a draft run, keeping what was typed on each. */
async function fillRun(
  ex: Executor,
  ctx: ServiceContext,
  run: { id: string; staffKind: string; periodStart: LocalDate; periodEnd: LocalDate },
  kept: Map<string, { id: string; typed: PayslipOverrides }>,
): Promise<number> {
  const { rates: payRates, snapshot } = await rates(ex);
  const people = await peopleOf(ex, run.staffKind as StaffKind, run.periodStart, run.periodEnd);
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
    if (wrote) written += 1;
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
    { id: payRunId, staffKind: input.staffKind, periodStart: start, periodEnd: end },
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

/** Types over a draft payslip's CNAS, IRG, repayment, or adds a deduction. Kept through a refresh. */
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
  for (const key of ["cnas", "irg", "advanceRepayment", "deduction"] as const) {
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
  // The payslip is written again, alone, with what was typed.
  const run = await runOf(ex, slip.runId);
  await ex.deleteFrom("PayslipSeat").where("payslipId", "=", slip.id).execute();
  await ex.deleteFrom("PayslipItem").where("payslipId", "=", slip.id).execute();
  await ex.deleteFrom("Payslip").where("id", "=", slip.id).execute();
  const { rates: payRates, snapshot } = await rates(ex);
  const person = (await peopleOf(ex, run.staffKind as StaffKind, run.periodStart, run.periodEnd)).find(
    (each) => each.id === slip.staffId,
  );
  if (!person) throw new ServiceError("This person has no pay terms for this month.");
  await writePayslip(ex, ctx, run, person, setupFrom(payRates, snapshot), typed, slip.id);
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "Payslip",
    entityId: slip.id,
    entityLabel: slip.staffName,
    subject: { kind: run.staffKind === "EMPLOYEE" ? "EMPLOYEE" : "WORKER", id: slip.staffId, label: slip.staffName },
    changes: Object.fromEntries(Object.entries(typed).map(([key, value]) => [key, [null, value]])),
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
