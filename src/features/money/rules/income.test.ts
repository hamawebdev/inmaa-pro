import { describe, expect, it } from "vitest";

import {
  divisionIncome,
  expensesByDivision,
  invoicedByDivision,
  outstandingByDivision,
  periodResult,
  type IncomePayment,
  type InvoiceMatch,
} from "./income";

const da = (dinars: number) => Math.round(dinars * 100);

const NOVEMBER = { from: "2026-11-01", to: "2026-11-30" };
const DECEMBER = { from: "2026-12-01", to: "2026-12-31" };
const JANUARY = { from: "2027-01-01", to: "2027-01-31" };

const payment = (overrides: Partial<IncomePayment> & { id: string }): IncomePayment => ({
  division: "HOUSING",
  receivedDate: "2026-12-03",
  amount: da(10_000),
  stampDuty: 0,
  voided: false,
  ...overrides,
});

describe("a division's income is what was collected, in the period it was received", () => {
  it("IFU: invoiced in November, paid in cash in December", () => {
    // The study's example: 10 000,00 invoiced 30/11, 10 100,00 received 03/12.
    const payments = [payment({ id: "p1", stampDuty: da(100) })];
    const matches: InvoiceMatch[] = [
      { paymentId: "p1", amount: da(10_000), invoiceTotalHT: da(10_000), invoiceTotalTTC: da(10_000) },
    ];
    const args = { payments, matches, taxMode: "IFU" as const, vatRate: 1900 };

    const november = divisionIncome({ ...args, ...NOVEMBER });
    expect(november.total).toEqual({ collected: 0, vatCollected: 0, stampCollected: 0, received: 0 });

    const december = divisionIncome({ ...args, ...DECEMBER });
    expect(december.byDivision.HOUSING).toEqual({
      collected: da(10_000),
      vatCollected: 0,
      stampCollected: da(100),
      received: da(10_100),
    });
    expect(december.byDivision.ORGANISATION.collected).toBe(0);
    expect(december.total).toEqual(december.byDivision.HOUSING);

    const invoiced = invoicedByDivision(
      [{ division: "HOUSING", issueDate: "2026-11-30", totalHT: da(10_000), totalTTC: da(10_000), voided: false }],
      NOVEMBER.from,
      NOVEMBER.to,
    );
    expect(invoiced.HOUSING).toEqual({ beforeTax: da(10_000), withTax: da(10_000) });
  });

  it("VAT: income is shown before tax, the tax and the stamp duty beside it", () => {
    // 10 000,00 before tax, 11 900,00 with tax, 12 019,00 in cash on 03/12.
    const matches: InvoiceMatch[] = [
      { paymentId: "p1", amount: da(11_900), invoiceTotalHT: da(10_000), invoiceTotalTTC: da(11_900) },
    ];
    const december = divisionIncome({
      payments: [payment({ id: "p1", amount: da(11_900), stampDuty: da(119) })],
      matches,
      ...DECEMBER,
      taxMode: "VAT",
      vatRate: 1900,
    });
    expect(december.byDivision.HOUSING).toEqual({
      collected: da(10_000),
      vatCollected: da(1_900),
      stampCollected: da(119),
      received: da(12_019),
    });
  });

  it("VAT: an invoice paid in two halves gives half the income to each month", () => {
    const payments = [
      payment({ id: "p1", amount: da(5_950), stampDuty: da(60), receivedDate: "2026-12-03" }),
      payment({ id: "p2", amount: da(5_950), stampDuty: da(60), receivedDate: "2027-01-10" }),
    ];
    const matches: InvoiceMatch[] = payments.map((p) => ({
      paymentId: p.id,
      amount: da(5_950),
      invoiceTotalHT: da(10_000),
      invoiceTotalTTC: da(11_900),
    }));
    const args = { payments, matches, taxMode: "VAT" as const, vatRate: 1900 };

    expect(divisionIncome({ ...args, ...DECEMBER }).byDivision.HOUSING.collected).toBe(da(5_000));
    expect(divisionIncome({ ...args, ...JANUARY }).byDivision.HOUSING.collected).toBe(da(5_000));
    expect(divisionIncome({ ...args, ...JANUARY }).byDivision.HOUSING.vatCollected).toBe(da(950));
  });

  it("VAT: an advance not yet matched to an invoice is split at the rate in force", () => {
    const december = divisionIncome({
      payments: [payment({ id: "p1", amount: da(45_000), division: "BUILDING" })],
      matches: [],
      ...DECEMBER,
      taxMode: "VAT",
      vatRate: 1900,
    });
    expect(december.byDivision.BUILDING.collected).toBe(da(37_815.13));
    expect(december.byDivision.BUILDING.vatCollected).toBe(da(7_184.87));
  });

  it("VAT: a payment that settles an invoice and leaves a credit splits each part its own way", () => {
    // 50 000,00 received: 11 900,00 settles an invoice of 10 000,00 before tax; 38 100,00 is credit.
    const december = divisionIncome({
      payments: [payment({ id: "p1", amount: da(50_000) })],
      matches: [{ paymentId: "p1", amount: da(11_900), invoiceTotalHT: da(10_000), invoiceTotalTTC: da(11_900) }],
      ...DECEMBER,
      taxMode: "VAT",
      vatRate: 1900,
    });
    // 38 100,00 ÷ 1,19 = 32 016,81
    expect(december.total.collected).toBe(da(10_000) + da(32_016.81));
    expect(december.total.collected + december.total.vatCollected).toBe(da(50_000));
  });

  it("an invoice issued under IFU stays all income after the centre moves to VAT", () => {
    const december = divisionIncome({
      payments: [payment({ id: "p1" })],
      matches: [{ paymentId: "p1", amount: da(10_000), invoiceTotalHT: da(10_000), invoiceTotalTTC: da(10_000) }],
      ...DECEMBER,
      taxMode: "VAT",
      vatRate: 1900,
    });
    expect(december.total).toMatchObject({ collected: da(10_000), vatCollected: 0 });
  });

  it("counts by the day received, both ends of the period included, and never a voided payment", () => {
    const payments = [
      payment({ id: "first", receivedDate: "2026-12-01" }),
      payment({ id: "last", receivedDate: "2026-12-31", division: "COMPLEX" }),
      payment({ id: "before", receivedDate: "2026-11-30" }),
      payment({ id: "after", receivedDate: "2027-01-01" }),
      payment({ id: "voided", receivedDate: "2026-12-15", voided: true }),
    ];
    const december = divisionIncome({ payments, matches: [], ...DECEMBER, taxMode: "IFU", vatRate: 1900 });
    expect(december.byDivision.HOUSING.collected).toBe(da(10_000));
    expect(december.byDivision.COMPLEX.collected).toBe(da(10_000));
    expect(december.total.collected).toBe(da(20_000));
  });
});

describe("the figures beside income", () => {
  it("invoiced: by issue date, voided invoices left out", () => {
    const invoiced = invoicedByDivision(
      [
        { division: "BUILDING", issueDate: "2026-11-30", totalHT: da(40_000), totalTTC: da(47_600), voided: false },
        { division: "BUILDING", issueDate: "2026-11-30", totalHT: da(1_000), totalTTC: da(1_190), voided: true },
        { division: "BUILDING", issueDate: "2026-12-01", totalHT: da(40_000), totalTTC: da(47_600), voided: false },
      ],
      NOVEMBER.from,
      NOVEMBER.to,
    );
    expect(invoiced.BUILDING).toEqual({ beforeTax: da(40_000), withTax: da(47_600) });
    expect(invoiced.HOUSING).toEqual({ beforeTax: 0, withTax: 0 });
  });

  it("outstanding: what remains on dues that are not cancelled", () => {
    const outstanding = outstandingByDivision([
      { division: "ORGANISATION", amount: da(45_000), paidAmount: da(20_000), cancelled: false },
      { division: "ORGANISATION", amount: da(45_000), paidAmount: 0, cancelled: true },
      { division: "ORGANISATION", amount: da(45_000), paidAmount: da(45_000), cancelled: false },
      { division: "HOUSING", amount: da(3_000), paidAmount: 0, cancelled: false },
    ]);
    expect(outstanding).toEqual({ HOUSING: da(3_000), ORGANISATION: da(25_000), BUILDING: 0, COMPLEX: 0 });
  });

  it("expenses: by date, per line, removed ones left out", () => {
    const expenses = expensesByDivision(
      [
        { division: "HOUSING", date: "2026-11-03", amount: da(80_000), deleted: false },
        { division: "COMMON", date: "2026-11-30", amount: da(150_000), deleted: false },
        { division: "COMMON", date: "2026-11-30", amount: da(9_000), deleted: true },
        { division: "BUILDING", date: "2026-12-01", amount: da(90_000), deleted: false },
      ],
      NOVEMBER.from,
      NOVEMBER.to,
    );
    expect(expenses).toEqual({ HOUSING: da(80_000), ORGANISATION: 0, BUILDING: 0, COMPLEX: 0, COMMON: da(150_000) });
  });
});

describe("the result of a month", () => {
  // The study's November: income 620 000, expenses 310 000 on the four lines and 150 000 common.
  const income = { HOUSING: da(150_000), ORGANISATION: da(250_000), BUILDING: da(180_000), COMPLEX: da(40_000) };
  const expenses = {
    HOUSING: da(80_000),
    ORGANISATION: da(120_000),
    BUILDING: da(90_000),
    COMPLEX: da(20_000),
    COMMON: da(150_000),
  };

  it("leaves the common expenses as a line of their own by default", () => {
    const result = periodResult({ income, expenses, spreadCommon: false });
    expect(result.byDivision.HOUSING.result).toBe(da(70_000));
    expect(result.byDivision.ORGANISATION.result).toBe(da(130_000));
    expect(result.byDivision.BUILDING.result).toBe(da(90_000));
    expect(result.byDivision.COMPLEX.result).toBe(da(20_000));
    expect(result.commonExpenses).toBe(da(150_000));
    expect([result.totalIncome, result.totalExpenses, result.profit]).toEqual([da(620_000), da(460_000), da(160_000)]);
  });

  it("spreads them by income when asked, without changing the profit", () => {
    const result = periodResult({ income, expenses, spreadCommon: true });
    const shares = Object.values(result.byDivision).map((division) => division.commonShare);
    expect(shares).toEqual([da(36_290.32), da(60_483.87), da(43_548.39), da(9_677.42)]);
    expect(shares.reduce((a, b) => a + b)).toBe(da(150_000));
    expect(result.byDivision.HOUSING.result).toBe(da(33_709.68));
    expect(result.commonExpenses).toBe(0);
    expect(result.profit).toBe(da(160_000));
    expect(Object.values(result.byDivision).reduce((sum, division) => sum + division.result, 0)).toBe(da(160_000));
  });

  it("does not spread when there is no income to go by", () => {
    const none = { HOUSING: 0, ORGANISATION: 0, BUILDING: 0, COMPLEX: 0 };
    const result = periodResult({ income: none, expenses, spreadCommon: true });
    expect(result.commonExpenses).toBe(da(150_000));
    expect(result.profit).toBe(da(-460_000));
  });
});
