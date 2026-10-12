import { describe, expect, it } from "vitest";

import { contractProfitability, estimatedMinutes, labourCost, type ProfitabilityInput } from "./profitability";

const da = (dinars: number) => Math.round(dinars * 100);
const hours = (h: number, m = 0) => h * 60 + m;

/**
 * The study's building (section c7): 40 000,00 a month under IFU, 13 visits in
 * November, one worker from 08:00 to 12:00, an hourly cost of 250,00 DA.
 */
const building: ProfitabilityInput = {
  revenue: da(40_000),
  estimatedMinutes: hours(52),
  workedMinutes: hours(69, 20),
  hourlyCost: da(250),
  estimatedMaterials: da(3_000),
  estimatedTransport: da(2_000),
  materials: da(3_400),
  transport: da(2_000),
  other: 0,
  hoursOverrunTolerance: 1000,
};

describe("contract profitability", () => {
  it("estimates the time from the form: visits × workers × the visit's length", () => {
    expect(estimatedMinutes({ plannedVisits: 13, workers: 1, arrival: "08:00", departure: "12:00" })).toBe(hours(52));
    expect(estimatedMinutes({ plannedVisits: 12, workers: 2, arrival: "14:00", departure: "16:30" })).toBe(hours(60));
  });

  it("costs labour to the centime", () => {
    expect(labourCost(hours(52), da(250))).toBe(da(13_000));
    expect(labourCost(hours(69, 20), da(250))).toBe(da(17_333.33));
    expect(labourCost(1, da(250))).toBe(417);
  });

  it("the estimate: 52 h, a cost of 18 000,00, a margin of 55%", () => {
    const { estimate } = contractProfitability(building);
    expect(estimate).toEqual({
      minutes: hours(52),
      labour: da(13_000),
      materials: da(3_000),
      transport: da(2_000),
      other: 0,
      cost: da(18_000),
      margin: da(22_000),
      marginRate: 5500,
    });
  });

  it("the actual: 69 h 20, a cost of 22 733,33, a margin of 43.17%, hours a third over", () => {
    const result = contractProfitability(building);
    expect(result.actual).toEqual({
      minutes: hours(69, 20),
      labour: da(17_333.33),
      materials: da(3_400),
      transport: da(2_000),
      other: 0,
      cost: da(22_733.33),
      margin: da(17_266.67),
      marginRate: 4317,
    });
    expect(result.hoursOverrun).toBe(3333);
    expect(result.flags).toEqual({ hoursOverEstimate: true, negativeMargin: false, hourlyCostMissing: false });
  });

  it("does not flag hours inside the tolerance, and flags just above it", () => {
    const at = contractProfitability({ ...building, estimatedMinutes: 1000, workedMinutes: 1100 });
    expect([at.hoursOverrun, at.flags.hoursOverEstimate]).toEqual([1000, false]);
    const above = contractProfitability({ ...building, estimatedMinutes: 1000, workedMinutes: 1101 });
    expect([above.hoursOverrun, above.flags.hoursOverEstimate]).toEqual([1010, true]);
    const under = contractProfitability({ ...building, workedMinutes: hours(48) });
    expect([under.hoursOverrun, under.flags.hoursOverEstimate]).toEqual([-769, false]);
  });

  it("flags a contract priced below its cost", () => {
    const result = contractProfitability({ ...building, revenue: da(20_000), other: da(1_000) });
    expect(result.actual.margin).toBe(da(-3_733.33));
    expect(result.actual.marginRate).toBe(-1867);
    expect(result.flags.negativeMargin).toBe(true);
  });

  it("costs each worker at their own rate when People have one, at the setting otherwise", () => {
    const result = contractProfitability({
      ...building,
      workedMinutes: hours(69, 20),
      workedByWorker: [
        { minutes: hours(40), hourlyCost: da(300) },
        { minutes: hours(29, 20), hourlyCost: null },
      ],
    });
    // 40 h × 300,00 + 29 h 20 × 250,00 = 12 000,00 + 7 333,33
    expect(result.actual.labour).toBe(da(19_333.33));
    expect(result.estimate.labour).toBe(da(13_000));
  });

  it("shows no margin, rather than a flattering one, when no hourly cost is set", () => {
    const result = contractProfitability({ ...building, hourlyCost: null });
    expect(result.estimate).toMatchObject({ labour: null, cost: null, margin: null, marginRate: null });
    expect(result.actual).toMatchObject({ labour: null, cost: null, margin: null, marginRate: null });
    expect(result.hoursOverrun).toBe(3333);
    expect(result.flags).toEqual({ hoursOverEstimate: true, negativeMargin: false, hourlyCostMissing: true });

    const oneUnknown = contractProfitability({
      ...building,
      hourlyCost: null,
      workedByWorker: [
        { minutes: hours(40), hourlyCost: da(300) },
        { minutes: hours(29, 20), hourlyCost: null },
      ],
    });
    expect(oneUnknown.actual.labour).toBeNull();
    expect(oneUnknown.flags.hourlyCostMissing).toBe(true);
  });

  it("gives no rate with no revenue and no overrun with no estimate", () => {
    const result = contractProfitability({ ...building, revenue: 0, estimatedMinutes: 0 });
    expect(result.actual.marginRate).toBeNull();
    expect(result.hoursOverrun).toBeNull();
    expect(result.flags.hoursOverEstimate).toBe(false);
    expect(result.flags.negativeMargin).toBe(true);
  });

  it("refuses minutes that are not whole", () => {
    expect(() => contractProfitability({ ...building, workedMinutes: 69.33 })).toThrow(RangeError);
  });
});
