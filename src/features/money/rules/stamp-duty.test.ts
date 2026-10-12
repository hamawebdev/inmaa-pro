import { describe, expect, it } from "vitest";

import { cashToCollect, DEFAULT_STAMP_SETTINGS, stampDuty, type StampSettings } from "./stamp-duty";

const WHOLE = DEFAULT_STAMP_SETTINGS;
const PROGRESSIVE: StampSettings = { ...DEFAULT_STAMP_SETTINGS, mode: "PROGRESSIVE" };

/** Dinars written as in the study, turned into centimes. */
const da = (dinars: number) => Math.round(dinars * 100);

describe("stamp duty on cash", () => {
  // The table of the study, section c2: amount, started hundreds, duty in each mode.
  it.each([
    [250, 0, 0],
    [350, 5, 5],
    [10_000, 100, 100],
    [11_900, 119, 119],
    [30_000, 300, 300],
    [30_050, 451.5, 301.5],
    [41_538.46, 624, 474],
    [45_000, 675, 525],
    [47_600, 714, 564],
    [100_000, 1_500, 1_350],
    [142_800, 2_856, 2_206],
  ])("on %s DA is %s on the whole amount and %s band by band", (amount, whole, progressive) => {
    expect(stampDuty(da(amount), WHOLE)).toBe(da(whole));
    expect(stampDuty(da(amount), PROGRESSIVE)).toBe(da(progressive));
  });

  it("counts a started hundred as a whole one", () => {
    expect(stampDuty(da(10_000.01), WHOLE)).toBe(da(101));
    expect(stampDuty(da(10_099.99), WHOLE)).toBe(da(101));
    expect(stampDuty(da(10_100), WHOLE)).toBe(da(101));
  });

  it("charges nothing below 300 DA and at least 5 DA from 300 DA", () => {
    expect(stampDuty(da(299.99), WHOLE)).toBe(0);
    expect(stampDuty(da(300), WHOLE)).toBe(da(5));
    expect(stampDuty(da(499), WHOLE)).toBe(da(5));
    expect(stampDuty(da(500), WHOLE)).toBe(da(5));
    expect(stampDuty(da(600), WHOLE)).toBe(da(6));
  });

  it("changes band above the limit, not at it", () => {
    expect(stampDuty(da(30_000), WHOLE)).toBe(da(300));
    expect(stampDuty(da(30_000.01), WHOLE)).toBe(da(451.5));
    expect(stampDuty(da(100_000), WHOLE)).toBe(da(1_500));
    expect(stampDuty(da(100_000.01), WHOLE)).toBe(da(2_002));
    expect(stampDuty(da(100_050), PROGRESSIVE)).toBe(da(1_352));
  });

  it("charges nothing on nothing, on a negative amount, or when switched off", () => {
    expect(stampDuty(0, WHOLE)).toBe(0);
    expect(stampDuty(da(-5_000), WHOLE)).toBe(0);
    expect(stampDuty(da(45_000), { ...WHOLE, enabled: false })).toBe(0);
  });

  it("applies a ceiling and the rounding to the dinar when the settings ask", () => {
    expect(stampDuty(da(142_800), { ...WHOLE, maximum: da(2_500) })).toBe(da(2_500));
    expect(stampDuty(da(30_050), { ...WHOLE, roundUpToDinar: true })).toBe(da(452));
    expect(stampDuty(da(30_050), { ...PROGRESSIVE, roundUpToDinar: true })).toBe(da(302));
  });

  it("is charged on each cash payment: two halves pay a little more than the whole", () => {
    expect(stampDuty(da(11_900), WHOLE)).toBe(da(119));
    expect(stampDuty(da(5_950), WHOLE) * 2).toBe(da(120));
  });

  it("refuses an amount that is not whole centimes", () => {
    expect(() => stampDuty(4_500_000.5, WHOLE)).toThrow(RangeError);
  });

  it("gives the cash to collect", () => {
    expect(cashToCollect(da(45_000), WHOLE)).toBe(da(45_675));
    expect(cashToCollect(da(10_000), WHOLE)).toBe(da(10_100));
  });
});
