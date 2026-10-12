import { describe, expect, it } from "vitest";

import { buildDueSchedule, type DueTerms } from "./due-schedule";
import { buildForecast, expectedMonthlyExpenses, renewedTerms, type ForecastInput } from "./forecast";

const da = (dinars: number) => Math.round(dinars * 100);

/**
 * The study's forecast (section c8), made on 11/10/2026: 310 000 due in
 * November, 295 000 in December, 250 000 in January, 42 000 overdue; a contract
 * of 25 000 a month ends on 30/11.
 */
const study: ForecastInput = {
  today: "2026-10-11",
  months: 3,
  dues: [
    { dueDate: "2026-09-30", remaining: da(30_000) },
    { dueDate: "2026-10-10", remaining: da(12_000) },
    { dueDate: "2026-10-11", remaining: da(8_000) },
    { dueDate: "2026-10-31", remaining: da(20_000) },
    { dueDate: "2026-11-05", remaining: da(285_000) },
    { dueDate: "2026-11-30", remaining: da(25_000) },
    { dueDate: "2026-12-05", remaining: da(295_000) },
    { dueDate: "2027-01-05", remaining: da(250_000) },
    { dueDate: "2027-02-05", remaining: da(250_000) },
    { dueDate: "2026-11-20", remaining: 0 },
  ],
  duesIfRenewed: [
    { dueDate: "2026-12-30", remaining: da(25_000) },
    { dueDate: "2027-01-30", remaining: da(25_000) },
  ],
  recurringExpenses: da(43_000),
  lastPayRun: da(180_000),
  otherExpensesOfLastMonths: [da(30_000), da(36_000), da(33_000)],
};

describe("the forecast", () => {
  it("expects each month the recurring expenses, the last pay run and the average of the rest", () => {
    expect(expectedMonthlyExpenses(study)).toBe(da(256_000));
    expect(expectedMonthlyExpenses({ ...study, otherExpensesOfLastMonths: [] })).toBe(da(223_000));
    // 100,00 over three months is 33,33 a month.
    expect(
      expectedMonthlyExpenses({ recurringExpenses: 0, lastPayRun: 0, otherExpensesOfLastMonths: [da(100), 0, 0] }),
    ).toBe(da(33.33));
  });

  it("gives the study's three months", () => {
    const forecast = buildForecast(study);
    expect(forecast.monthlyExpenses).toBe(da(256_000));
    expect(forecast.months.map((month) => [month.month, month.receipts, month.net, month.running])).toEqual([
      ["2026-11", da(310_000), da(54_000), da(54_000)],
      ["2026-12", da(295_000), da(39_000), da(93_000)],
      ["2027-01", da(250_000), da(-6_000), da(87_000)],
    ]);
  });

  it("keeps the renewals on a line of their own", () => {
    const forecast = buildForecast(study);
    expect(
      forecast.months.map((month) => [month.receiptsIfRenewed, month.netIfRenewed, month.runningIfRenewed]),
    ).toEqual([
      [0, da(54_000), da(54_000)],
      [da(25_000), da(64_000), da(118_000)],
      [da(25_000), da(19_000), da(137_000)],
    ]);
  });

  it("shows what is overdue and what is left of this month, outside the months", () => {
    const forecast = buildForecast(study);
    // Due before today: 30 000 + 12 000. Due today counts as this month's, not as overdue.
    expect(forecast.overdue).toBe(da(42_000));
    expect(forecast.restOfCurrentMonth).toBe(da(28_000));
  });

  it("crosses the end of the year and covers as many months as asked", () => {
    const forecast = buildForecast({ ...study, today: "2026-12-20", months: 2 });
    expect(forecast.months.map((month) => month.month)).toEqual(["2027-01", "2027-02"]);
    expect(forecast.months.map((month) => month.receipts)).toEqual([da(250_000), da(250_000)]);
    // Everything due before 20/12 is overdue now.
    expect(forecast.overdue).toBe(da(30_000 + 12_000 + 8_000 + 20_000 + 285_000 + 25_000 + 295_000));
    expect(() => buildForecast({ ...study, months: 0 })).toThrow(RangeError);
  });
});

describe("the terms of a renewal", () => {
  const contract: DueTerms = {
    serviceType: "CONTRACT",
    startDate: "2026-09-01",
    endDate: "2026-11-30",
    frequency: "MONTHLY",
    totalAmount: da(25_000),
    amountBasis: "PER_PAYMENT_PERIOD",
    firstDueDate: "2026-09-30",
  };

  it("a contract of whole months is renewed by months", () => {
    const renewed = renewedTerms(contract);
    expect(renewed).toMatchObject({ startDate: "2026-12-01", endDate: "2027-02-28", firstDueDate: "2026-12-30" });

    // 01/11 to 31/01 becomes 01/02 to 30/04.
    expect(renewedTerms({ ...contract, startDate: "2026-11-01", endDate: "2027-01-31" })).toMatchObject({
      startDate: "2027-02-01",
      endDate: "2027-04-30",
    });
  });

  it("gives, through the schedule, the dues the forecast adds", () => {
    const renewed = renewedTerms(contract)!;
    const dues = buildDueSchedule(renewed, []);
    expect(dues.map((due) => [due.dueDate, due.expectedAmount])).toEqual([
      ["2026-12-30", da(25_000)],
      ["2027-01-30", da(25_000)],
      ["2027-02-28", da(25_000)],
    ]);
  });

  it("any other length is renewed by days", () => {
    const renewed = renewedTerms({
      ...contract,
      startDate: "2026-11-01",
      endDate: "2026-11-20",
      firstDueDate: "2026-11-07",
    });
    expect(renewed).toMatchObject({ startDate: "2026-11-21", endDate: "2026-12-10", firstDueDate: "2026-11-27" });
  });

  it("there is nothing to renew for a request or a contract with no end", () => {
    expect(renewedTerms({ ...contract, serviceType: "ON_DEMAND" })).toBeNull();
    expect(renewedTerms({ ...contract, endDate: null })).toBeNull();
  });
});
