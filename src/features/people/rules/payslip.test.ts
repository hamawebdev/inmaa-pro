import { describe, expect, it } from "vitest";

import { basisPoints, money } from "@/lib/units";

import { computePay, type PayRates } from "./pay";
import { computePayslip, type PayslipFigures, type PayslipRates } from "./payslip";

const RATES: PayslipRates = {
  legalWeekMinutes: 2400,
  weekCapMinutes: 2880,
  overtimePremiumBp: basisPoints(5000),
  monthlyDivisorMinutes: 10400,
  dayMinutes: 480,
  cnasEmployeeBp: basisPoints(900),
  cnasEmployerBp: basisPoints(2600),
  irgTable: null,
  restDayPremiumBp: basisPoints(5000),
};

/** The figures of a month made of these whole weeks, as a run reads them. */
function figuresOf(weeks: number[][], basis: PayslipFigures["basis"], rate: number): PayslipFigures {
  const days = weeks.flat();
  let premiumOnlyMin = 0;
  let overtimeMin = 0;
  for (const week of weeks) {
    const total = week.reduce((a, b) => a + b, 0);
    const beyond = week.reduce((a, b) => a + Math.max(0, b - 480), 0);
    const ot = Math.max(0, total - 2400);
    overtimeMin += ot;
    premiumOnlyMin += Math.max(0, ot - beyond);
  }
  return {
    basis,
    rate: money(rate),
    paidMin: days.reduce((a, b) => a + b, 0),
    daysWorked: days.filter((d) => d > 0).length,
    beyondDayMin: days.reduce((a, b) => a + Math.max(0, b - 480), 0),
    overtimeMin,
    premiumOnlyMin,
    restDayMin: 0,
    paidAbsenceMin: 0,
    unpaidAbsenceMin: 0,
    additions: [],
    otherDeductions: money(0),
    advanceRepayment: money(0),
    declared: true,
    overrides: { irg: money(0) },
  };
}

const WEEKS = [
  [480, 480, 480, 480, 480, 480], // 48 h: 8 h of overtime from a whole extra day
  [540, 540, 540, 540, 540], // 45 h: every day 1 h past the standard day
  [480, 480, 480, 240], // 28 h
  [600, 480, 480, 480, 480, 120], // 44 h
];

describe("computePayslip", () => {
  it.each(["HOURLY", "DAILY", "MONTHLY"] as const)("pays a month of whole weeks as computePay does (%s)", (basis) => {
    const rate = basis === "HOURLY" ? 25_000 : basis === "DAILY" ? 180_000 : 4_160_000;
    const slip = computePayslip(figuresOf(WEEKS, basis, rate), RATES);
    const pay = computePay(
      { basis, rate: money(rate), weeks: WEEKS, declared: true, overrides: { irg: money(0) } },
      RATES as PayRates,
    );
    expect(slip.gross).toBe(pay.gross);
    expect(slip.cnas).toBe(pay.cnas);
    expect(slip.net).toBe(pay.net);
    expect(slip.employerCnas).toBe(pay.employerCnas);
  });

  it("adds the rest-day premium on the hourly value, and pays paid leave as worked", () => {
    const hourly = computePayslip(
      { ...figuresOf([[480, 480, 480]], "HOURLY", 25_000), restDayMin: 480, paidAbsenceMin: 480 },
      RATES,
    );
    // 8 hours on the rest day at +50% of 250 DA: 1,000 DA; a paid day of leave: 2,000 DA.
    expect(hourly.restDayPremium).toBe(100_000);
    expect(hourly.leavePay).toBe(200_000);
    expect(hourly.lines.map((line) => line.type)).toEqual(["BASE", "LEAVE_PAY", "REST_DAY_PREMIUM", "CNAS"]);

    const daily = computePayslip(
      { ...figuresOf([[480, 480]], "DAILY", 180_000), restDayMin: 480, paidAbsenceMin: 480 },
      RATES,
    );
    expect(daily.leavePay).toBe(180_000);
    expect(daily.restDayPremium).toBe(90_000);
  });

  it("takes unpaid absence off a monthly wage, never below nothing", () => {
    const slip = computePayslip({ ...figuresOf([], "MONTHLY", 4_160_000), unpaidAbsenceMin: 480 }, RATES);
    // 41,600 DA over 10,400 minutes: 240 DA an hour, 1,920 DA for the day.
    expect(slip.absence).toBe(192_000);
    expect(slip.gross).toBe(4_160_000 - 192_000);
    const all = computePayslip({ ...figuresOf([], "MONTHLY", 4_160_000), unpaidAbsenceMin: 20_000 }, RATES);
    expect(all.gross).toBe(0);
  });

  it("leaves a wage per task's overtime and rest day to type, and the IRG when no scale is set", () => {
    const slip = computePayslip(
      { ...figuresOf([[600, 600, 600, 600, 600]], "PER_TASK", 150_000), tasks: 12, restDayMin: 120, overrides: {} },
      RATES,
    );
    expect(slip.base).toBe(1_800_000);
    expect(slip.warnings).toEqual([
      { kind: "OVERTIME_NOT_PRICED", minutes: 600 },
      { kind: "REST_DAY_NOT_PRICED", minutes: 120 },
      { kind: "IRG_TO_TYPE" },
    ]);
    expect(slip.irg).toBeNull();
    expect(slip.net).toBeNull();
  });

  it("takes advances and deductions off the net, and charges no CNAS to somebody not declared", () => {
    const slip = computePayslip(
      {
        ...figuresOf([[480, 480]], "HOURLY", 25_000),
        declared: false,
        overrides: {},
        additions: [{ label: "منحة النقل", amount: money(50_000), contributable: true, taxable: true }],
        advanceRepayment: money(100_000),
        otherDeductions: money(20_000),
      },
      RATES,
    );
    expect(slip).toMatchObject({ gross: 450_000, cnas: 0, irg: 0, net: 330_000, employerCnas: 0 });
  });
});
