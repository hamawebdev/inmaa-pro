import type { PayBasis, PayslipItemType } from "@/features/people/validators/staff-codes";
import { money, type BasisPoints, type Money } from "@/lib/units";

import { irgFromTable, mulDivRound, type PayAddition, type PayRates } from "./pay";

/**
 * One payslip of a monthly run (feature 38), from what the hours give.
 *
 * `computePay` (pay.ts) prices a set of whole weeks. A run pays a calendar
 * month, and its weeks cross the month's edges, so the two things are taken
 * apart here:
 *
 *  - what this payslip pays: the minutes and days of the seats it pays (the
 *    month's, and earlier ones typed in late), and the minutes past the
 *    standard day of each of those days;
 *  - what the weeks that end in the month add: their overtime, and the
 *    minutes worked on the rest day, each week counted whole once, by the run
 *    of the month it ends in.
 *
 * The rules are `computePay`'s (the rulings given to People): an hourly rate
 * pays every minute, and the overtime minutes add the premium; a daily wage
 * pays the standard day, the minutes past it at the hourly value with the
 * premium, and the premium only on overtime that whole extra days make; a
 * monthly wage pays the month, the overtime at its hourly value with the
 * premium, and loses unpaid absence at its hourly value; a wage per task pays
 * the tasks, and its overtime is typed. Work on the rest day adds its own
 * premium (`pay.restDayPremium`) on the hourly value, besides the rest owed.
 */

export interface PayslipRates extends PayRates {
  /** Setting `pay.restDayPremium`: 5000 is +50%. */
  restDayPremiumBp: BasisPoints;
}

export interface PayslipFigures {
  basis: PayBasis;
  /** Per month, day, hour or task, as the basis says. */
  rate: Money;
  /** Minutes of what this payslip pays: its seats, the late ones included, and People's corrections. */
  paidMin: number;
  /** Days with minutes, among those. */
  daysWorked: number;
  /** Σ max(0, day − standard day) over those days. */
  beyondDayMin: number;
  /** The overtime of the weeks that end in the month. */
  overtimeMin: number;
  /** Σ over those weeks of max(0, the week's overtime − its minutes past the standard day). */
  premiumOnlyMin: number;
  /** Minutes worked on the rest day, in those weeks. */
  restDayMin: number;
  /** A wage per task: the tasks done. */
  tasks?: number;
  /** Paid absence and paid leave in the month: paid as worked for an hourly or daily wage. */
  paidAbsenceMin: number;
  /** Unpaid absence: a monthly wage loses it at its hourly value. */
  unpaidAbsenceMin: number;
  /** A monthly wage: days employed over the days of the month. */
  monthShare?: { days: number; of: number };
  /** Recurring allowances. */
  additions: readonly PayAddition[];
  /** Recurring deductions, and those typed on the payslip. */
  otherDeductions: Money;
  /** Advances repaid on this payslip. */
  advanceRepayment: Money;
  declared: boolean;
  /**
   * Amounts typed over the computed ones: CNAS, IRG, and, where the basis has
   * no hourly value (a wage per task), the overtime premium and the rest-day
   * premium, which the office prices (People's round-0 ruling).
   */
  overrides?: { cnas?: Money; irg?: Money; overtime?: Money; restDayPremium?: Money };
}

export interface PayslipLine {
  type: PayslipItemType;
  /** Why this line, for the payslip's wording: past the standard day, or premium only. */
  detail?: "BEYOND_STANDARD_DAY" | "PREMIUM_ONLY";
  label?: string;
  /** Minutes, days or tasks. */
  quantity?: number;
  /** Positive is paid, negative is taken off. */
  amount: Money;
  contributable: boolean;
  taxable: boolean;
}

export type PayslipWarning =
  | { kind: "OVERTIME_NOT_PRICED"; minutes: number }
  | { kind: "REST_DAY_NOT_PRICED"; minutes: number }
  | { kind: "IRG_TO_TYPE" };

export interface PayslipResult {
  base: Money;
  overtime: Money;
  restDayPremium: Money;
  leavePay: Money;
  absence: Money;
  additions: Money;
  gross: Money;
  contributableBase: Money;
  cnas: Money;
  taxableBase: Money;
  /** Null while it cannot be computed: the IRG scale is missing and none was typed. */
  irg: Money | null;
  advanceRepayment: Money;
  otherDeductions: Money;
  net: Money | null;
  employerCnas: Money;
  lines: PayslipLine[];
  warnings: PayslipWarning[];
}

function whole(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${what} must be a whole number, 0 or more`);
  return value;
}

export function computePayslip(input: PayslipFigures, rates: PayslipRates): PayslipResult {
  const warnings: PayslipWarning[] = [];
  const lines: PayslipLine[] = [];
  const earnedLine = (line: Omit<PayslipLine, "contributable" | "taxable">) =>
    lines.push({ ...line, contributable: true, taxable: true });

  const rate = whole(input.rate, "The rate");
  const paidMin = whole(input.paidMin, "The minutes paid");
  const overtimeMin = whole(input.overtimeMin, "The overtime");
  const restDayMin = whole(input.restDayMin, "The rest-day minutes");
  const paidAbsenceMin = whole(input.paidAbsenceMin, "The paid absence");
  const unpaidAbsenceMin = whole(input.unpaidAbsenceMin, "The unpaid absence");
  const premium = rates.overtimePremiumBp;

  /** The value of `minutes` at the basis' hourly value, times `factorBp` (10000 is the value itself). */
  let atHourly: ((minutes: number, factorBp: number) => number) | null = null;
  let base = 0;
  let overtime = 0;
  let leavePay = 0;
  let absence = 0;

  switch (input.basis) {
    case "HOURLY": {
      atHourly = (minutes, factorBp) => mulDivRound(minutes * factorBp, rate, 60 * 10000);
      base = mulDivRound(paidMin, rate, 60);
      overtime = atHourly(overtimeMin, premium);
      leavePay = mulDivRound(paidAbsenceMin, rate, 60);
      earnedLine({ type: "BASE", quantity: paidMin, amount: money(base) });
      if (overtime > 0)
        earnedLine({ type: "OVERTIME_50", detail: "PREMIUM_ONLY", quantity: overtimeMin, amount: money(overtime) });
      break;
    }
    case "DAILY": {
      atHourly = (minutes, factorBp) => mulDivRound(minutes * factorBp, rate, rates.dayMinutes * 10000);
      base = whole(input.daysWorked, "Days worked") * rate;
      const beyondDay = atHourly(whole(input.beyondDayMin, "Minutes past the day"), 10000 + premium);
      const premiumOnly = atHourly(whole(input.premiumOnlyMin, "Overtime from whole days"), premium);
      overtime = beyondDay + premiumOnly;
      leavePay = mulDivRound(paidAbsenceMin, rate, rates.dayMinutes);
      earnedLine({ type: "BASE", quantity: input.daysWorked, amount: money(base) });
      if (beyondDay > 0) {
        earnedLine({
          type: "OVERTIME_50",
          detail: "BEYOND_STANDARD_DAY",
          quantity: input.beyondDayMin,
          amount: money(beyondDay),
        });
      }
      if (premiumOnly > 0) {
        earnedLine({
          type: "OVERTIME_50",
          detail: "PREMIUM_ONLY",
          quantity: input.premiumOnlyMin,
          amount: money(premiumOnly),
        });
      }
      break;
    }
    case "MONTHLY": {
      atHourly = (minutes, factorBp) => mulDivRound(minutes * factorBp, rate, rates.monthlyDivisorMinutes * 10000);
      const share = input.monthShare;
      if (share && (share.of < 1 || share.days > share.of)) {
        throw new RangeError("a month share is days employed of the days in the month");
      }
      base = share ? mulDivRound(rate, whole(share.days, "Days employed"), whole(share.of, "Days in the month")) : rate;
      overtime = atHourly(overtimeMin, 10000 + premium);
      absence = Math.min(base, mulDivRound(unpaidAbsenceMin, rate, rates.monthlyDivisorMinutes));
      earnedLine({ type: "BASE", amount: money(base) });
      if (absence > 0) earnedLine({ type: "ABSENCE", quantity: unpaidAbsenceMin, amount: money(-absence) });
      if (overtime > 0) earnedLine({ type: "OVERTIME_50", quantity: overtimeMin, amount: money(overtime) });
      break;
    }
    case "PER_TASK": {
      const tasks = whole(input.tasks ?? 0, "Tasks done");
      base = tasks * rate;
      earnedLine({ type: "BASE", quantity: tasks, amount: money(base) });
      if (overtimeMin > 0) {
        if (input.overrides?.overtime === undefined)
          warnings.push({ kind: "OVERTIME_NOT_PRICED", minutes: overtimeMin });
        else {
          overtime = whole(input.overrides.overtime, "The overtime typed");
          if (overtime > 0) earnedLine({ type: "OVERTIME_50", quantity: overtimeMin, amount: money(overtime) });
        }
      }
      break;
    }
  }

  if (leavePay > 0) earnedLine({ type: "LEAVE_PAY", quantity: paidAbsenceMin, amount: money(leavePay) });
  let restDayPremium = 0;
  if (restDayMin > 0) {
    if (atHourly) {
      restDayPremium = atHourly(restDayMin, rates.restDayPremiumBp);
      if (restDayPremium > 0) {
        earnedLine({ type: "REST_DAY_PREMIUM", quantity: restDayMin, amount: money(restDayPremium) });
      }
    } else if (input.overrides?.restDayPremium !== undefined) {
      restDayPremium = whole(input.overrides.restDayPremium, "The rest-day premium typed");
      if (restDayPremium > 0) {
        earnedLine({ type: "REST_DAY_PREMIUM", quantity: restDayMin, amount: money(restDayPremium) });
      }
    } else {
      warnings.push({ kind: "REST_DAY_NOT_PRICED", minutes: restDayMin });
    }
  }

  // ── Allowances ──────────────────────────────────────────────────────────
  let additions = 0;
  let contributableAdditions = 0;
  let taxableAdditions = 0;
  for (const addition of input.additions) {
    const amount = whole(addition.amount, "An allowance");
    additions += amount;
    if (addition.contributable) contributableAdditions += amount;
    if (addition.taxable) taxableAdditions += amount;
    lines.push({
      type: "ALLOWANCE",
      label: addition.label,
      amount: money(amount),
      contributable: addition.contributable,
      taxable: addition.taxable,
    });
  }

  // ── Social security and income tax ──────────────────────────────────────
  const earned = base - absence + overtime + restDayPremium + leavePay;
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
  const off = (type: PayslipItemType, amount: number) =>
    lines.push({ type, amount: money(-amount), contributable: false, taxable: false });
  if (cnas > 0) off("CNAS", cnas);
  if (irg) off("IRG", irg);

  // ── What is taken off, and what is paid ─────────────────────────────────
  const advanceRepayment = whole(input.advanceRepayment, "An advance");
  const otherDeductions = whole(input.otherDeductions, "A deduction");
  if (advanceRepayment > 0) off("ADVANCE_REPAYMENT", advanceRepayment);
  if (otherDeductions > 0) off("DEDUCTION", otherDeductions);
  const net = irg === null ? null : gross - cnas - irg - advanceRepayment - otherDeductions;
  const employerCnas = input.declared ? mulDivRound(contributableBase, rates.cnasEmployerBp, 10000) : 0;

  return {
    base: money(base),
    overtime: money(overtime),
    restDayPremium: money(restDayPremium),
    leavePay: money(leavePay),
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
    employerCnas: money(employerCnas),
    lines,
    warnings,
  };
}
