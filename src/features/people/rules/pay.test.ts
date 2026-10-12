import { describe, expect, it } from "vitest";

import { basisPoints, money } from "@/lib/units";

import { computePay, irgFromTable, mulDivRound, type IrgTable, type PayRates } from "./pay";

/**
 * A scale made up for these tests. It is NOT Algeria's: the real one is the
 * accountant's to give, and goes into the setting `pay.irgTable`.
 */
const TEST_SCALE: IrgTable = {
  brackets: [
    { upTo: 2_000_000, rateBp: 0 },
    { upTo: 4_000_000, rateBp: 2300 },
    { upTo: 8_000_000, rateBp: 2700 },
    { upTo: 16_000_000, rateBp: 3000 },
  ],
  abatementBp: 4000,
  abatementMin: 100_000,
  abatementMax: 150_000,
  exemptUpTo: 3_000_000,
};

/** The defaults of the settings: 40 hours, flagged past 48, +50%, 173 h 20 a month, 8-hour days, 9% and 26%. */
const RATES: PayRates = {
  legalWeekMinutes: 2400,
  weekCapMinutes: 2880,
  overtimePremiumBp: basisPoints(5000),
  monthlyDivisorMinutes: 10400,
  dayMinutes: 480,
  cnasEmployeeBp: basisPoints(900),
  cnasEmployerBp: basisPoints(2600),
  irgTable: TEST_SCALE,
};

/** `count` days of `minutes` each: one week. */
function days(count: number, minutes: number): number[] {
  return Array.from({ length: count }, () => minutes);
}

describe("whole-number arithmetic", () => {
  it("rounds half up, exactly, whatever the size", () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(-1, 1, 2)).toBe(-1);
    expect(mulDivRound(4_500_000_000, 4_500_000_000, 1_000_000_000)).toBe(20_250_000_000);
  });
});

describe("pay for a period", () => {
  it("pays an hourly wage, and the hours past forty at +50%", () => {
    // 80 normal hours at 250 DA, then 5 hours of overtime in the second week at 375 DA.
    const pay = computePay(
      { basis: "HOURLY", rate: money(25_000), weeks: [days(5, 480), days(5, 540)], declared: true },
      { ...RATES, irgTable: TEST_SCALE },
    );
    expect(pay).toMatchObject({
      workedMinutes: 5100,
      overtimeMinutes: 300,
      base: 2_000_000,
      overtime: 187_500,
      gross: 2_187_500,
      cnas: 196_875,
      taxableBase: 1_990_625,
      irg: 0, // below the exemption of the test scale
      net: 1_990_625,
      employerCnas: 568_750,
      warnings: [],
    });
  });

  it("pays a monthly wage with its overtime, an absence, an allowance, CNAS, IRG and an advance", () => {
    const pay = computePay(
      {
        basis: "MONTHLY",
        rate: money(4_500_000),
        weeks: [days(5, 480), days(5, 480), days(5, 528), days(5, 480)],
        unpaidAbsenceMinutes: 480,
        additions: [{ label: "منحة النقل", amount: money(300_000), contributable: false, taxable: true }],
        advanceRepayment: money(500_000),
        declared: true,
      },
      RATES,
    );
    // Hourly value 45 000 / 173.33 = 259.62 DA. Overtime 4 h × 259.62 × 1.5 = 1 557.69 DA;
    // absence 8 h × 259.62 = 2 076.92 DA.
    expect(pay).toMatchObject({
      overtimeMinutes: 240,
      base: 4_500_000,
      overtime: 155_769,
      absence: 207_692,
      additions: 300_000,
      gross: 4_748_077,
      contributableBase: 4_448_077,
      cnas: 400_327,
      taxableBase: 4_347_750,
      // 2 000 000 × 23% + 347 750 × 27% = 553 892.5 → 553 893; abatement 40% capped at 150 000.
      irg: 403_893,
      advanceRepayment: 500_000,
      net: 3_443_857,
      employerCnas: 1_156_500,
    });
    expect(pay.lines.map((line) => [line.type, line.amount])).toEqual([
      ["BASE", 4_500_000],
      ["ABSENCE", -207_692],
      ["OVERTIME_50", 155_769],
      ["ALLOWANCE", 300_000],
      ["CNAS", -400_327],
      ["IRG", -403_893],
      ["ADVANCE_REPAYMENT", -500_000],
    ]);
  });

  it("pays part of the month to someone who started during it", () => {
    const pay = computePay(
      { basis: "MONTHLY", rate: money(3_000_000), weeks: [], monthShare: { days: 10, of: 30 }, declared: false },
      RATES,
    );
    expect(pay.base).toBe(1_000_000);
    expect(pay.net).toBe(1_000_000);
  });

  describe("a daily wage (the coordinator's ruling)", () => {
    // 1 500 DA a day for the standard day of 8 hours: 187.50 DA an hour, 281.25 DA with the premium.
    const daily = (weeks: number[][]) =>
      computePay({ basis: "DAILY", rate: money(150_000), weeks, declared: false }, RATES);

    it("pays a sixth whole day as a day, and adds only the premium on it", () => {
      const pay = daily([days(6, 480)]);
      expect(pay).toMatchObject({ base: 900_000, overtime: 75_000, net: 975_000, warnings: [] });
      expect(pay.lines.map((line) => [line.detail, line.quantity, line.amount])).toEqual([
        [undefined, 6, 900_000],
        ["PREMIUM_ONLY", 480, 75_000],
      ]);
    });

    it("pays the minutes past the standard day at the hourly value with the premium, and counts them once", () => {
      // Five days of 9 hours: 5 hours past the standard day, which are also the week's 5 hours of overtime.
      const pay = daily([days(5, 540)]);
      expect(pay).toMatchObject({ base: 750_000, overtime: 140_625 });
      expect(pay.lines.map((line) => line.detail)).toEqual([undefined, "BEYOND_STANDARD_DAY"]);
    });

    it("pays both parts when long days and an extra day come together", () => {
      // Six days of 9 hours: 6 hours past the standard day at 281.25 DA, then the sixth day's 8 hours at the premium only.
      const pay = daily([days(6, 540)]);
      expect(pay).toMatchObject({ base: 900_000, overtime: 168_750 + 75_000 });
      expect(pay.warnings).toEqual([{ kind: "WEEK_OVER_CAP", week: 0, minutes: 3240 }]);
    });

    it("pays long days even in a week of forty hours", () => {
      // Four days of 10 hours: 8 hours past the standard day, no week overtime.
      expect(daily([days(4, 600)])).toMatchObject({ base: 600_000, overtime: 225_000, overtimeMinutes: 0 });
    });

    it("does not count a day of no minutes as worked", () => {
      expect(daily([[480, 0, 480]]).base).toBe(300_000);
    });
  });

  it("says when a wage per task leaves the overtime to price, and when a week passes 48 hours", () => {
    const pay = computePay(
      { basis: "PER_TASK", rate: money(200_000), units: 10, weeks: [days(5, 600)], declared: false },
      RATES,
    );
    expect(pay.base).toBe(2_000_000);
    expect(pay.overtime).toBe(0);
    expect(pay.warnings).toEqual([
      { kind: "WEEK_OVER_CAP", week: 0, minutes: 3000 },
      { kind: "OVERTIME_NOT_PRICED", minutes: 600 },
    ]);
  });

  it("leaves the IRG to type while the scale is missing, and takes typed values over computed ones", () => {
    const input = { basis: "MONTHLY" as const, rate: money(4_000_000), weeks: [days(5, 480)], declared: true };
    const missing = computePay(input, { ...RATES, irgTable: null });
    expect(missing.irg).toBeNull();
    expect(missing.net).toBeNull();
    expect(missing.warnings).toEqual([{ kind: "IRG_TO_TYPE" }]);

    const typed = computePay(
      { ...input, overrides: { irg: money(250_000), cnas: money(350_000) } },
      { ...RATES, irgTable: null },
    );
    expect(typed).toMatchObject({ cnas: 350_000, irg: 250_000, net: 4_000_000 - 350_000 - 250_000, warnings: [] });
  });

  it("refuses what is not a whole number of centimes or minutes", () => {
    expect(() => computePay({ basis: "HOURLY", rate: money(100), weeks: [[10.5]], declared: false }, RATES)).toThrow(
      RangeError,
    );
  });
});

describe("the IRG scale", () => {
  it("taxes each bracket at its rate, and above the last at the last rate", () => {
    // 2 000 000 × 23% + 4 000 000 × 27% + 12 000 000 × 30% = 5 140 000; abatement capped at 150 000.
    expect(irgFromTable(money(20_000_000), TEST_SCALE)).toBe(4_990_000);
  });

  it("takes the abatement's floor, but never more than the tax", () => {
    // 1 000 001 × 23% = 230 000; 40% of it is 92 000, raised to the floor of 100 000: 130 000 is due.
    expect(irgFromTable(money(3_000_001), { ...TEST_SCALE, exemptUpTo: 0 })).toBe(130_000);
    // 100 000 × 23% = 23 000: the floor would take more than the tax, so nothing is due.
    expect(irgFromTable(money(2_100_000), { ...TEST_SCALE, exemptUpTo: 0 })).toBe(0);
  });

  it("owes nothing up to the exemption", () => {
    expect(irgFromTable(money(3_000_000), TEST_SCALE)).toBe(0);
  });
});
