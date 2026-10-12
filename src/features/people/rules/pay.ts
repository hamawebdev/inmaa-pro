import { money, type BasisPoints, type Money } from "@/lib/units";
import type { PayBasis } from "@/features/people/validators/staff-codes";

/**
 * One person's pay for one period, from the minutes worked: the lines of a
 * payslip and its totals.
 *
 * Everything comes in as an argument: the person's pay terms, the minutes of
 * each week, the amounts to add and take off, and the rates, which live in
 * settings and are passed in. Amounts are whole centimes, durations whole
 * minutes, rates basis points (900 is 9%), as in the database. Each line is
 * rounded once, half up, to the centime.
 *
 * The legal rules (scope section 5): 40 hours a week, overtime beyond them at
 * +50%, with a warning past 48; CNAS and IRG from rates kept in settings, and
 * both editable on each payslip. Rounding of the IRG base and the smoothing
 * Algerian payroll applies near the exemption threshold are not modelled: the
 * accountant confirms the table, and the payslip can be corrected by hand.
 */

/** The IRG scale, in the shape of the setting `pay.irgTable`. Amounts are monthly, in centimes. */
export interface IrgTable {
  /** Brackets in order; the income above the last one is taxed at the last rate. */
  brackets: ReadonlyArray<{ upTo: number; rateBp: number }>;
  /** The abatement on the tax, its rate and its floor and ceiling. */
  abatementBp: number;
  abatementMin: number;
  abatementMax: number;
  /** A taxable income up to this owes nothing. */
  exemptUpTo: number;
}

export interface PayRates {
  /** The legal week: setting `work.weekMin` (2400, 40 hours). Beyond it, overtime. */
  legalWeekMinutes: number;
  /** Where a week is flagged: setting `work.overtimeCapMin` (2880, 48 hours). */
  weekCapMinutes: number;
  /** The overtime premium: setting `pay.overtimePremium` (5000, +50%). */
  overtimePremiumBp: BasisPoints;
  /** The minutes a monthly wage pays, to find its hourly value: setting `pay.monthlyDivisorMin`. */
  monthlyDivisorMinutes: number;
  /** The standard day a daily wage pays: setting `work.dayMin` (480, 8 hours). */
  dayMinutes: number;
  /** The employee's and the employer's social security: `pay.cnasEmployeeRate`, `pay.cnasEmployerRate`. */
  cnasEmployeeBp: BasisPoints;
  cnasEmployerBp: BasisPoints;
  /** Null while the accountant has not given it: the IRG is then typed on the payslip. */
  irgTable: IrgTable | null;
}

export interface PayAddition {
  label: string;
  amount: Money;
  /** Counted in the CNAS base, and in the IRG base. */
  contributable: boolean;
  taxable: boolean;
}

export interface PayInput {
  basis: PayBasis;
  /** Per month, day, hour or task, as the basis says. */
  rate: Money;
  /**
   * The minutes of each day worked, week by week, Saturday to Friday:
   * `[[480, 480, 540], [480, …]]`. A day of 0 minutes is not a day worked.
   */
  weeks: ReadonlyArray<readonly number[]>;
  /** A wage per task: the tasks done. */
  units?: number;
  /** A monthly wage: minutes of unpaid absence, taken off at the hourly value. */
  unpaidAbsenceMinutes?: number;
  /** A monthly wage: the share of the month the person was employed, as days employed over days in the month. */
  monthShare?: { days: number; of: number };
  additions?: readonly PayAddition[];
  /** Advances paid during the period and repaid on this payslip. */
  advanceRepayment?: Money;
  /** Anything else taken off (damage, a typed deduction). */
  otherDeductions?: Money;
  /** CNAS and IRG apply only to a person declared to the CNAS. */
  declared: boolean;
  /** Values typed over the computed ones on the payslip. */
  overrides?: { cnas?: Money; irg?: Money };
}

export type PayLineType =
  | "BASE"
  | "OVERTIME_50"
  | "ABSENCE"
  | "ALLOWANCE"
  | "CNAS"
  | "IRG"
  | "ADVANCE_REPAYMENT"
  | "DEDUCTION";

export interface PayLine {
  type: PayLineType;
  /**
   * The two parts of a daily wage's overtime: the minutes past the standard
   * day, paid at the hourly value with the premium, and the minutes past the
   * legal week that whole extra days make, already paid as days, which add the
   * premium only.
   */
  detail?: "BEYOND_STANDARD_DAY" | "PREMIUM_ONLY";
  label?: string;
  /** Minutes, days or tasks, where the line counts something. */
  quantity?: number;
  /** Positive is paid to the person, negative is taken off. */
  amount: Money;
}

export type PayWarning =
  /** A week went past the 48-hour mark: its index in `weeks`. */
  | { kind: "WEEK_OVER_CAP"; week: number; minutes: number }
  /** A wage per task has no hourly value: the overtime premium is to type. */
  | { kind: "OVERTIME_NOT_PRICED"; minutes: number }
  /** No IRG scale in settings and none typed. */
  | { kind: "IRG_TO_TYPE" };

export interface PayResult {
  workedMinutes: number;
  overtimeMinutes: number;
  base: Money;
  overtime: Money;
  absence: Money;
  additions: Money;
  gross: Money;
  /** The CNAS base and the employee's share. */
  contributableBase: Money;
  cnas: Money;
  /** The IRG base: the taxable gross less the employee's CNAS. */
  taxableBase: Money;
  /** Null while it cannot be computed (`IRG_TO_TYPE`). */
  irg: Money | null;
  advanceRepayment: Money;
  otherDeductions: Money;
  /** What is paid out. Null while the IRG is unknown. */
  net: Money | null;
  /** The employer's CNAS: a cost of the centre, not taken from the wage. */
  employerCnas: Money;
  lines: PayLine[];
  warnings: PayWarning[];
}

/** `a × b ÷ c`, rounded half up, in whole numbers. Exact for any size. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (![a, b, c].every(Number.isSafeInteger) || c <= 0)
    throw new RangeError("mulDivRound takes whole numbers and c > 0");
  const product = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  const sign = product < 0n ? -1n : 1n;
  const magnitude = product * sign;
  return Number(sign * ((magnitude * 2n + divisor) / (divisor * 2n)));
}

function whole(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${what} must be a whole number, 0 or more`);
  return value;
}

/** The IRG on a monthly taxable income, from the scale. */
export function irgFromTable(taxable: Money, table: IrgTable): Money {
  if (taxable <= table.exemptUpTo) return money(0);
  let tax = 0n;
  let below = 0;
  for (const [index, bracket] of table.brackets.entries()) {
    const last = index === table.brackets.length - 1;
    // Each bracket taxes the income between the one before it and its own top;
    // the last one taxes everything above the one before it.
    const top = last ? taxable : Math.min(taxable, bracket.upTo);
    if (top > below) tax += BigInt(top - below) * BigInt(bracket.rateBp);
    if (last || taxable <= bracket.upTo) break;
    below = bracket.upTo;
  }
  const gross = Number((tax * 2n + 10000n) / 20000n);
  const abatement = Math.min(
    gross,
    Math.max(table.abatementMin, Math.min(table.abatementMax, mulDivRound(gross, table.abatementBp, 10000))),
  );
  return money(gross - abatement);
}

export function computePay(input: PayInput, rates: PayRates): PayResult {
  const warnings: PayWarning[] = [];
  const lines: PayLine[] = [];

  // ── Time ────────────────────────────────────────────────────────────────
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  let daysWorked = 0;
  // A daily wage: minutes past the standard day, and minutes past the legal
  // week that those do not already account for (whole extra days).
  let beyondDayMinutes = 0;
  let premiumOnlyMinutes = 0;
  input.weeks.forEach((days, index) => {
    let week = 0;
    let beyondDay = 0;
    for (const day of days) {
      whole(day, "The minutes of a day");
      if (day === 0) continue;
      daysWorked += 1;
      week += day;
      beyondDay += Math.max(0, day - rates.dayMinutes);
    }
    const weekOvertime = Math.max(0, week - rates.legalWeekMinutes);
    workedMinutes += week;
    overtimeMinutes += weekOvertime;
    beyondDayMinutes += beyondDay;
    premiumOnlyMinutes += Math.max(0, weekOvertime - beyondDay);
    if (week > rates.weekCapMinutes) warnings.push({ kind: "WEEK_OVER_CAP", week: index, minutes: week });
  });
  const normalMinutes = workedMinutes - overtimeMinutes;
  const premiumAndPay = 10000 + rates.overtimePremiumBp;

  // ── What the basis pays ─────────────────────────────────────────────────
  const rate = whole(input.rate, "The rate");
  let base = 0;
  let overtime = 0;
  let absence = 0;
  switch (input.basis) {
    case "HOURLY":
      // Normal minutes at the rate, overtime minutes at the rate and the premium.
      base = mulDivRound(normalMinutes, rate, 60);
      overtime = mulDivRound(overtimeMinutes * premiumAndPay, rate, 60 * 10000);
      lines.push({ type: "BASE", quantity: normalMinutes, amount: money(base) });
      if (overtime > 0) lines.push({ type: "OVERTIME_50", quantity: overtimeMinutes, amount: money(overtime) });
      break;
    case "MONTHLY": {
      // The month pays the legal hours. Overtime is paid on top, at the hourly
      // value of the month with its premium; unpaid absence comes off at that value.
      const share = input.monthShare;
      if (share && (share.of < 1 || share.days > share.of))
        throw new RangeError("a month share is days employed of the days in the month");
      base = share ? mulDivRound(rate, whole(share.days, "Days employed"), whole(share.of, "Days in the month")) : rate;
      overtime = mulDivRound(overtimeMinutes * premiumAndPay, rate, rates.monthlyDivisorMinutes * 10000);
      const away = whole(input.unpaidAbsenceMinutes ?? 0, "Minutes of absence");
      absence = Math.min(base, mulDivRound(away, rate, rates.monthlyDivisorMinutes));
      lines.push({ type: "BASE", amount: money(base) });
      if (absence > 0) lines.push({ type: "ABSENCE", quantity: away, amount: money(-absence) });
      if (overtime > 0) lines.push({ type: "OVERTIME_50", quantity: overtimeMinutes, amount: money(overtime) });
      break;
    }
    case "DAILY": {
      // The wage pays the standard day, for every day worked (the coordinator's
      // ruling). Minutes past the standard day are not in it: they are paid at
      // the hourly value of the day with the premium. Minutes past the legal
      // week that come from extra whole days are already paid as days: they
      // add the premium only.
      base = daysWorked * rate;
      const beyondDay = mulDivRound(beyondDayMinutes * premiumAndPay, rate, rates.dayMinutes * 10000);
      const premiumOnly = mulDivRound(premiumOnlyMinutes * rates.overtimePremiumBp, rate, rates.dayMinutes * 10000);
      overtime = beyondDay + premiumOnly;
      lines.push({ type: "BASE", quantity: daysWorked, amount: money(base) });
      if (beyondDay > 0) {
        lines.push({
          type: "OVERTIME_50",
          detail: "BEYOND_STANDARD_DAY",
          quantity: beyondDayMinutes,
          amount: money(beyondDay),
        });
      }
      if (premiumOnly > 0) {
        lines.push({
          type: "OVERTIME_50",
          detail: "PREMIUM_ONLY",
          quantity: premiumOnlyMinutes,
          amount: money(premiumOnly),
        });
      }
      break;
    }
    case "PER_TASK": {
      const tasks = whole(input.units ?? 0, "Tasks done");
      base = tasks * rate;
      lines.push({ type: "BASE", quantity: tasks, amount: money(base) });
      if (overtimeMinutes > 0) warnings.push({ kind: "OVERTIME_NOT_PRICED", minutes: overtimeMinutes });
      break;
    }
  }

  // ── Additions ───────────────────────────────────────────────────────────
  let additions = 0;
  let contributableAdditions = 0;
  let taxableAdditions = 0;
  for (const addition of input.additions ?? []) {
    const amount = whole(addition.amount, "An allowance");
    additions += amount;
    if (addition.contributable) contributableAdditions += amount;
    if (addition.taxable) taxableAdditions += amount;
    lines.push({ type: "ALLOWANCE", label: addition.label, amount: money(amount) });
  }

  // ── Social security and income tax ──────────────────────────────────────
  const earned = base - absence + overtime;
  const gross = earned + additions;
  const contributableBase = earned + contributableAdditions;
  const computedCnas = input.declared ? mulDivRound(contributableBase, rates.cnasEmployeeBp, 10000) : 0;
  const cnas = input.overrides?.cnas ?? computedCnas;
  const taxableBase = Math.max(0, earned + taxableAdditions - cnas);
  let irg: number | null;
  if (input.overrides?.irg !== undefined) irg = input.overrides.irg;
  else if (!input.declared) irg = 0;
  else if (rates.irgTable) irg = irgFromTable(money(taxableBase), rates.irgTable);
  else {
    irg = null;
    warnings.push({ kind: "IRG_TO_TYPE" });
  }
  if (cnas > 0) lines.push({ type: "CNAS", amount: money(-cnas) });
  if (irg) lines.push({ type: "IRG", amount: money(-irg) });

  // ── What is taken off, and what is paid ─────────────────────────────────
  const advanceRepayment = whole(input.advanceRepayment ?? 0, "An advance");
  const otherDeductions = whole(input.otherDeductions ?? 0, "A deduction");
  if (advanceRepayment > 0) lines.push({ type: "ADVANCE_REPAYMENT", amount: money(-advanceRepayment) });
  if (otherDeductions > 0) lines.push({ type: "DEDUCTION", amount: money(-otherDeductions) });
  const net = irg === null ? null : gross - cnas - irg - advanceRepayment - otherDeductions;

  return {
    workedMinutes,
    overtimeMinutes,
    base: money(base),
    overtime: money(overtime),
    absence: money(absence),
    additions: money(additions),
    gross: money(gross),
    contributableBase: money(contributableBase),
    cnas: money(cnas),
    taxableBase: money(taxableBase),
    irg: irg === null ? null : money(irg),
    advanceRepayment: money(advanceRepayment),
    otherDeductions: money(otherDeductions),
    net: net === null ? null : money(net),
    employerCnas: money(input.declared ? mulDivRound(contributableBase, rates.cnasEmployerBp, 10000) : 0),
    lines,
    warnings,
  };
}
