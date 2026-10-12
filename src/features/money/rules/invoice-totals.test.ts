import { describe, expect, it } from "vitest";

import { formatMoney, mulDivRound, percentOf, shareByWeights } from "./centimes";
import { computeInvoiceTotals, missedVisitDeduction, visitPrice, type InvoiceTotalsInput } from "./invoice-totals";
import { DEFAULT_STAMP_SETTINGS } from "./stamp-duty";

const da = (dinars: number) => Math.round(dinars * 100);

const VAT_INCLUDED: Omit<InvoiceTotalsInput, "lineAmounts" | "paymentMethod"> = {
  taxMode: "VAT",
  vatRate: 1900,
  pricesIncludeVat: true,
};
const VAT_BEFORE_TAX = { ...VAT_INCLUDED, pricesIncludeVat: false };
const IFU = { ...VAT_INCLUDED, taxMode: "IFU" as const };

/** The checks the database makes on every invoice row. */
function expectConsistent(input: InvoiceTotalsInput) {
  const t = computeInvoiceTotals(input);
  expect(t.totalTTC).toBe(t.totalHT + t.vatAmount);
  expect(t.netToPay).toBe(t.totalTTC + t.stampDuty);
  if (input.taxMode === "IFU") expect([t.vatAmount, t.vatRate]).toEqual([0, 0]);
  if (input.paymentMethod !== "CASH") expect(t.stampDuty).toBe(0);
  const beforeTax = input.taxMode === "VAT" && !input.pricesIncludeVat;
  expect(t.grossAmount - t.discountAmount).toBe(beforeTax ? t.totalHT : t.totalTTC);
  return t;
}

describe("centimes", () => {
  it("multiplies and divides exactly, rounding half away from zero", () => {
    expect(mulDivRound(4_500_000, 1, 13)).toBe(346_154);
    expect(mulDivRound(-4_500_000, 1, 13)).toBe(-346_154);
    expect(mulDivRound(5, 1, 2)).toBe(3);
    expect(mulDivRound(-5, 1, 2)).toBe(-3);
    expect(mulDivRound(1, 1, 3)).toBe(0);
    // A product no float holds exactly: 99 999 999 999 centimes × 123 456 thousandths.
    expect(mulDivRound(99_999_999_999, 123_456, 1_000)).toBe(12_345_599_999_877);
    expect(() => mulDivRound(1.5, 1, 1)).toThrow(RangeError);
    expect(() => mulDivRound(1, 1, 0)).toThrow(RangeError);
  });

  it("takes a percentage to the centime", () => {
    expect(percentOf(da(40_000), 1900)).toBe(da(7_600));
    expect(percentOf(da(37_815.13), 1900)).toBe(da(7_184.87));
  });

  it("shares an amount so that the parts always add up", () => {
    expect(shareByWeights(da(100_000), [1, 1, 1])).toEqual([da(33_333.33), da(33_333.33), da(33_333.34)]);
    expect(shareByWeights(da(27_000), [8, 8, 8, 8, 4])).toEqual([
      da(6_000),
      da(6_000),
      da(6_000),
      da(6_000),
      da(3_000),
    ]);
    expect(shareByWeights(da(10), [1, 0, 2, 0])).toEqual([da(3.33), 0, da(6.67), 0]);
    expect(shareByWeights(da(10), [0, 0])).toEqual([0, 0]);
  });

  it("writes an amount as the academy does, on screen and on paper", () => {
    expect(formatMoney(da(45_675))).toBe("45.675,00");
    expect(formatMoney(da(42_162.46))).toBe("42.162,46");
    expect(formatMoney(da(1_234_567.05))).toBe("1.234.567,05");
    expect(formatMoney(da(-3_461.54))).toBe("-3.461,54");
    expect(formatMoney(0)).toBe("0,00");
    expect(formatMoney(da(195_650))).toBe("195.650,00");
    expect(formatMoney(da(999.5))).toBe("999,50");
  });
});

describe("invoice totals under 19% VAT", () => {
  it("reads «المبلغ إجمالي» as tax included by default", () => {
    const t = expectConsistent({ ...VAT_INCLUDED, lineAmounts: [da(45_000)], paymentMethod: "CASH" });
    expect(t).toEqual({
      grossAmount: da(45_000),
      discountAmount: 0,
      totalHT: da(37_815.13),
      vatRate: 1900,
      vatAmount: da(7_184.87),
      totalTTC: da(45_000),
      stampDuty: da(675),
      netToPay: da(45_675),
    });
  });

  it("adds the tax when prices are written before tax", () => {
    const t = expectConsistent({ ...VAT_BEFORE_TAX, lineAmounts: [da(40_000)], paymentMethod: "CASH" });
    expect([t.totalHT, t.vatAmount, t.totalTTC, t.stampDuty, t.netToPay]).toEqual([
      da(40_000),
      da(7_600),
      da(47_600),
      da(714),
      da(48_314),
    ]);

    const small = expectConsistent({ ...VAT_BEFORE_TAX, lineAmounts: [da(10_000)], paymentMethod: "CASH" });
    expect([small.vatAmount, small.totalTTC, small.stampDuty, small.netToPay]).toEqual([
      da(1_900),
      da(11_900),
      da(119),
      da(12_019),
    ]);
  });

  it("computes the tax once, on the total, not line by line", () => {
    // Three lines of 33,33: 19% of each is 6,33 (18,99 in all); 19% of 99,99 is 19,00.
    const t = expectConsistent({
      ...VAT_BEFORE_TAX,
      lineAmounts: [da(33.33), da(33.33), da(33.33)],
      paymentMethod: "BANK_TRANSFER",
    });
    expect(t.vatAmount).toBe(da(19));
  });

  it("charges no stamp duty on a transfer", () => {
    for (const paymentMethod of ["BANK_TRANSFER", "POSTAL_TRANSFER"] as const) {
      const t = expectConsistent({ ...VAT_INCLUDED, lineAmounts: [da(45_000)], paymentMethod });
      expect([t.stampDuty, t.netToPay]).toEqual([0, da(45_000)]);
    }
  });

  it("uses the stamp settings it is given", () => {
    const t = expectConsistent({
      ...VAT_BEFORE_TAX,
      lineAmounts: [da(40_000)],
      paymentMethod: "CASH",
      stamp: { ...DEFAULT_STAMP_SETTINGS, mode: "PROGRESSIVE" },
    });
    expect([t.stampDuty, t.netToPay]).toEqual([da(564), da(48_164)]);
  });
});

describe("invoice totals under IFU", () => {
  it("shows one total and no VAT", () => {
    const cash = expectConsistent({ ...IFU, lineAmounts: [da(45_000)], paymentMethod: "CASH" });
    expect(cash).toEqual({
      grossAmount: da(45_000),
      discountAmount: 0,
      totalHT: da(45_000),
      vatRate: 0,
      vatAmount: 0,
      totalTTC: da(45_000),
      stampDuty: da(675),
      netToPay: da(45_675),
    });

    const transfer = expectConsistent({ ...IFU, lineAmounts: [da(45_000)], paymentMethod: "POSTAL_TRANSFER" });
    expect([transfer.stampDuty, transfer.netToPay]).toEqual([0, da(45_000)]);
  });

  it("takes a missed visit off the period: 12 done of 13 at 45 000,00", () => {
    const deduction = missedVisitDeduction({
      rule: "BILL_DONE_ONLY",
      periodAmount: da(45_000),
      plannedVisits: 13,
      missedVisits: 1,
    });
    expect(deduction).toBe(da(-3_461.54));

    const t = expectConsistent({ ...IFU, lineAmounts: [da(45_000), deduction], paymentMethod: "CASH" });
    expect([t.grossAmount, t.discountAmount, t.totalTTC, t.stampDuty, t.netToPay]).toEqual([
      da(45_000),
      da(3_461.54),
      da(41_538.46),
      da(624),
      da(42_162.46),
    ]);
  });
});

describe("invoice lines", () => {
  it("prices one visit of a period", () => {
    expect(visitPrice(da(45_000), 13)).toBe(da(3_461.54));
    expect(visitPrice(da(6_000), 2)).toBe(da(3_000));
    expect(() => visitPrice(da(6_000), 0)).toThrow(RangeError);
  });

  it("deducts nothing when nothing was missed, and everything when nothing was done", () => {
    const period = { rule: "BILL_DONE_ONLY" as const, periodAmount: da(45_000), plannedVisits: 13 };
    expect(missedVisitDeduction({ ...period, missedVisits: 0 })).toBe(0);
    expect(missedVisitDeduction({ ...period, missedVisits: 2 })).toBe(da(-6_923.08));
    expect(missedVisitDeduction({ ...period, missedVisits: 13 })).toBe(da(-45_000));
    expect(() => missedVisitDeduction({ ...period, missedVisits: 14 })).toThrow(RangeError);
  });

  it("deducts the amount in settings under the fixed rule, never more than the period", () => {
    const period = { rule: "FIXED_AMOUNT" as const, periodAmount: da(45_000), plannedVisits: 13 };
    expect(missedVisitDeduction({ ...period, missedVisits: 2, fixedAmount: da(3_000) })).toBe(da(-6_000));
    expect(missedVisitDeduction({ ...period, missedVisits: 2, fixedAmount: 0 })).toBe(0);
    expect(missedVisitDeduction({ ...period, missedVisits: 2 })).toBe(0);
    expect(missedVisitDeduction({ ...period, missedVisits: 13, fixedAmount: da(5_000) })).toBe(da(-45_000));
  });

  it("refuses deductions larger than the lines", () => {
    expect(() =>
      computeInvoiceTotals({ ...IFU, lineAmounts: [da(1_000), da(-1_000.01)], paymentMethod: "CASH" }),
    ).toThrow(RangeError);
  });
});
