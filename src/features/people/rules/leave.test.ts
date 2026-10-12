import { describe, expect, it } from "vitest";

import { completedMonths } from "./dates";
import { leaveBalance, leaveEarned } from "./leave";

/** The defaults of the settings: 2.5 days a month, at most 30 days, the year from 1 July. */
const RULES = { perMonth: 2500, cap: 30000, yearStart: "07-01" };

describe("whole months between two days", () => {
  it.each([
    ["2026-07-01", "2026-09-30", 3],
    ["2026-07-01", "2026-09-29", 2],
    ["2026-07-15", "2026-08-13", 0],
    ["2026-07-15", "2026-08-14", 1],
    ["2026-01-31", "2026-02-28", 1],
    ["2026-01-31", "2026-02-27", 0],
    ["2024-01-31", "2024-02-29", 1],
    ["2025-07-01", "2026-06-30", 12],
    ["2026-10-12", "2026-10-01", 0],
  ])("%s to %s is %i", (from, to, months) => {
    expect(completedMonths(from, to)).toBe(months);
  });
});

describe("leave earned at 2.5 days a month", () => {
  it("counts the months of the current year of reference", () => {
    // From 1 July 2026: July, August and September are complete on 12 October.
    expect(leaveEarned({ startDate: "2024-01-10", asOf: "2026-10-12" }, RULES)).toEqual({
      from: "2026-07-01",
      months: 3,
      earned: 7500,
    });
  });

  it("starts at the first day of work when that is later", () => {
    // 15 August to 14 September is the one complete month.
    expect(leaveEarned({ startDate: "2026-08-15", asOf: "2026-10-12" }, RULES)).toEqual({
      from: "2026-08-15",
      months: 1,
      earned: 2500,
    });
  });

  it("earns thirty days in a whole year, and no more", () => {
    expect(leaveEarned({ startDate: "2020-01-01", asOf: "2027-06-30" }, RULES).earned).toBe(30000);
    expect(leaveEarned({ startDate: "2020-01-01", asOf: "2026-06-30" }, { ...RULES, cap: 20000 }).earned).toBe(20000);
  });

  it("takes off the months that do not count", () => {
    expect(leaveEarned({ startDate: "2024-01-10", asOf: "2026-10-12", monthsNotCounted: 1 }, RULES).earned).toBe(5000);
  });

  it("earns nothing before the first day of work", () => {
    expect(leaveEarned({ startDate: "2026-11-01", asOf: "2026-10-12" }, RULES)).toEqual({
      from: "2026-11-01",
      months: 0,
      earned: 0,
    });
  });

  it("refuses what is not a date", () => {
    expect(() => leaveEarned({ startDate: "2026-02-30", asOf: "2026-10-12" }, RULES)).toThrow(RangeError);
  });

  it("gives what is left", () => {
    expect(leaveBalance({ broughtForward: 10000, earned: 7500, taken: 12000 })).toBe(5500);
  });
});
