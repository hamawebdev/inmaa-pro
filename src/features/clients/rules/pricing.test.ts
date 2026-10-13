import { describe, expect, it } from "vitest";

import { computeCostStudy, fileAmountOf, marginOver, quoteLineAmount, quoteTotals } from "./pricing";

describe("the cost study", () => {
  it("works labour out from workers, time, visits and the hourly cost, then the rates, the margin and the discount", () => {
    const study = computeCostStudy({
      workers: 2,
      perVisitMin: 180,
      visitsPerWeek: 3,
      weeks: 4000,
      hourlyRate: 40000, // 400,00 an hour
      lines: [
        { code: "LABOUR", label: null, amount: 0, rateBp: null },
        { code: "MATERIALS", label: null, amount: 600000, rateBp: null },
        { code: "TRANSPORT", label: null, amount: 240000, rateBp: 500 },
        { code: "RESERVE", label: null, amount: 0, rateBp: 500 },
        { code: "ADMIN_SHARE", label: null, amount: 100000, rateBp: null },
      ],
      marginPercent: 2500,
      discount: 4500,
    });
    expect(study.visits).toBe(12);
    expect(study.labourMin).toBe(2 * 180 * 12);
    // 72 hours at 400,00
    expect(study.lines.map((line) => [line.code, line.amount, line.rateBp])).toEqual([
      ["LABOUR", 2880000, null],
      ["MATERIALS", 600000, null],
      ["TRANSPORT", 240000, null],
      ["RESERVE", 186000, 500],
      ["ADMIN_SHARE", 100000, null],
    ]);
    expect(study.totalCost).toBe(4006000);
    expect(study.profitValue).toBe(1001500);
    expect(study.priceBeforeDiscount).toBe(5007500);
    expect(study.finalPrice).toBe(5003000);
    expect(study.pricePerVisit).toBe(416917);
    expect(study.pricePerWeek).toBe(1250750);
    expect(study.pricePerMonth).toBeNull(); // four weeks are not yet a month
  });

  it("is one job when no rhythm is given, and keeps a typed labour amount when the hours are unknown", () => {
    const study = computeCostStudy({
      workers: null,
      perVisitMin: null,
      visitsPerWeek: null,
      weeks: null,
      hourlyRate: 40000,
      lines: [{ code: "LABOUR", label: null, amount: 500000, rateBp: null }],
      marginPercent: null,
      discount: null,
    });
    expect(study).toMatchObject({ visits: 1, totalCost: 500000, finalPrice: 500000, pricePerVisit: 500000 });
    expect(study.pricePerWeek).toBeNull();
  });

  it("adds the labour line when the hours are known and nobody listed it", () => {
    const study = computeCostStudy({
      workers: 1,
      perVisitMin: 60,
      visitsPerWeek: null,
      weeks: null,
      hourlyRate: 30000,
      lines: [],
      marginPercent: 1000,
      discount: 0,
    });
    expect(study.lines).toEqual([{ code: "LABOUR", label: null, amount: 30000, rateBp: null }]);
    expect(study.finalPrice).toBe(33000);
  });
});

describe("a quote", () => {
  it("prices a line by its quantity in thousandths", () => {
    expect(quoteLineAmount({ quantity: 1000, unitPrice: 1650000 })).toBe(1650000);
    expect(quoteLineAmount({ quantity: 2500, unitPrice: 3333 })).toBe(8333);
  });

  it("totals its lines; a contract takes it without the first deep clean, a job on demand whole", () => {
    const totals = quoteTotals(
      [
        { kind: "INITIAL_JOB", quantity: 1000, unitPrice: 2000000 },
        { kind: "PERIODIC", quantity: 12000, unitPrice: 350000 },
        { kind: "EXTRA", quantity: 1000, unitPrice: 100000 },
      ],
      300000,
    );
    expect(totals).toEqual({
      subtotal: 6300000,
      discount: 300000,
      total: 6000000,
      byKind: { INITIAL_JOB: 2000000, PERIODIC: 4200000, EXTRA: 100000 },
    });
    expect(fileAmountOf(totals, "CONTRACT")).toBe(4000000);
    expect(fileAmountOf(totals, "ON_DEMAND")).toBe(6000000);
  });

  it("is the job's price when it is one job, and never goes below zero", () => {
    const job = quoteTotals([{ kind: "INITIAL_JOB", quantity: 1000, unitPrice: 1650000 }], 0);
    expect(fileAmountOf(job, "CONTRACT")).toBe(1650000);
    const small = quoteTotals([{ kind: "PERIODIC", quantity: 1000, unitPrice: 1000 }], 5000);
    expect(small).toMatchObject({ discount: 1000, total: 0 });
    expect(fileAmountOf(small, "CONTRACT")).toBe(0);
  });

  it("says what margin a price leaves", () => {
    expect(marginOver(4000000, 5000000)).toBe(2500);
    expect(marginOver(null, 5000000)).toBeNull();
    expect(marginOver(0, 5000000)).toBeNull();
  });
});
