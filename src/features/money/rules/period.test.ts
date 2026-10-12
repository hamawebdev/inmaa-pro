import { describe, expect, it } from "vitest";

import { expenseFormSchema, isWholeCentimes } from "../validators/expense";
import { periodSchema } from "../validators/period";

import {
  bucketTotals,
  defaultPeriod,
  granularityOf,
  presetPeriod,
  readPeriod,
  writePeriod,
  type Period,
} from "./period";

const TODAY = "2026-11-20";
const da = (dinars: number) => Math.round(dinars * 100);
const search = (query: string) => new URLSearchParams(query);

describe("the period in the address bar", () => {
  it("works the presets out from today", () => {
    expect(presetPeriod("today", TODAY)).toEqual({ from: TODAY, to: TODAY, preset: "today" });
    expect(presetPeriod("7days", TODAY)).toEqual({ from: "2026-11-14", to: TODAY, preset: "7days" });
    expect(presetPeriod("this-month", TODAY)).toEqual({ from: "2026-11-01", to: TODAY, preset: "this-month" });
    expect(presetPeriod("7days", "2026-03-03")).toMatchObject({ from: "2026-02-25" });
  });

  it("shows the month so far when the address names nothing", () => {
    expect(readPeriod(search(""), TODAY)).toEqual(defaultPeriod(TODAY));
    expect(defaultPeriod(TODAY)).toEqual({ from: "2026-11-01", to: TODAY, preset: "this-month" });
  });

  it("recomputes a named preset from today, whatever dates an old address carries", () => {
    expect(readPeriod(search("preset=7days&from=2025-01-01&to=2025-01-07"), TODAY)).toEqual(
      presetPeriod("7days", TODAY),
    );
  });

  it("reads a range of one's own, with or without the preset", () => {
    const expected: Period = { from: "2026-10-01", to: "2026-10-31", preset: "custom" };
    expect(readPeriod(search("preset=custom&from=2026-10-01&to=2026-10-31"), TODAY)).toEqual(expected);
    expect(readPeriod(search("from=2026-10-01&to=2026-10-31"), TODAY)).toEqual(expected);
  });

  it("falls back to the month so far on a range that makes no sense", () => {
    for (const query of [
      "preset=custom&from=2026-10-31&to=2026-10-01",
      "preset=custom&from=2026-02-30&to=2026-03-01",
      "preset=custom&from=yesterday&to=2026-10-01",
      "preset=custom",
      "preset=nonsense&from=2026-10-01&to=2026-10-31",
    ]) {
      expect(readPeriod(search(query), TODAY), query).toEqual(defaultPeriod(TODAY));
    }
  });

  it("writes a period back, keeping what else the address holds", () => {
    const current = search("division=BUILDING&from=2026-10-01&to=2026-10-31&preset=custom");
    expect(writePeriod(current, presetPeriod("today", TODAY))).toBe("division=BUILDING&preset=today");
    expect(writePeriod(search("division=COMMON"), { from: "2026-09-01", to: "2026-09-30", preset: "custom" })).toBe(
      "division=COMMON&preset=custom&from=2026-09-01&to=2026-09-30",
    );
  });

  it("validates a period with the schema the filter uses", () => {
    expect(periodSchema.safeParse({ from: "2026-11-01", to: "2026-11-01", preset: "custom" }).success).toBe(true);
    const reversed = periodSchema.safeParse({ from: "2026-11-02", to: "2026-11-01", preset: "custom" });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0].message).toBe("The start of the period is after its end.");
  });
});

describe("totals by day, or by month over a long period", () => {
  const items = [
    { date: "2026-11-03", amount: da(10_000) },
    { date: "2026-11-03", amount: da(2_500.5) },
    { date: "2026-11-01", amount: da(45_000) },
    { date: "2026-10-31", amount: da(99) },
    { date: "2026-11-21", amount: da(99) },
  ];

  it("sums each day inside the period, in order, leaving out empty days", () => {
    expect(bucketTotals(items, presetPeriod("this-month", TODAY))).toEqual([
      { key: "2026-11-01", total: da(45_000) },
      { key: "2026-11-03", total: da(12_500.5) },
    ]);
  });

  it("draws day by day up to 62 days, month by month beyond", () => {
    expect(granularityOf({ from: "2026-09-20", to: "2026-11-20", preset: "custom" })).toBe("day");
    expect(granularityOf({ from: "2026-09-19", to: "2026-11-20", preset: "custom" })).toBe("month");
    const year: Period = { from: "2026-01-01", to: "2026-12-31", preset: "custom" };
    expect(bucketTotals(items, year)).toEqual([
      { key: "2026-10", total: da(99) },
      { key: "2026-11", total: da(45_000) + da(12_500.5) + da(99) },
    ]);
  });
});

describe("the expense dialog's checks", () => {
  const schema = expenseFormSchema(TODAY);
  const valid = {
    division: "BUILDING",
    category: "MATERIALS",
    date: "2026-11-20",
    amount: 4_500.5,
    method: "CASH",
    paidTo: "  ",
    spentByName: " سميرة حداد ",
    recurrence: "NONE",
    note: "",
  };
  const firstMessage = (input: Record<string, unknown>) => {
    const result = schema.safeParse(input);
    return result.success ? null : result.error.issues[0].message;
  };

  it("accepts an expense of today, trims its text and drops empty fields", () => {
    const result = schema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ paidTo: undefined, spentByName: "سميرة حداد", note: undefined });
  });

  it("accepts «عام» as a line of its own", () => {
    expect(schema.safeParse({ ...valid, division: "COMMON" }).success).toBe(true);
  });

  it("refuses an expense dated after today, or on a date that does not exist", () => {
    expect(firstMessage({ ...valid, date: "2026-11-21" })).toBe("An expense cannot be dated after today.");
    expect(firstMessage({ ...valid, date: "2026-02-30" })).toBe("Enter a valid date.");
  });

  it("refuses an amount of nothing, below nothing, or with fractions of a centime", () => {
    expect(firstMessage({ ...valid, amount: 0 })).toBe("An amount must be more than zero.");
    expect(firstMessage({ ...valid, amount: -5 })).toBe("An amount must be more than zero.");
    expect(firstMessage({ ...valid, amount: 10.005 })).toBe("An amount has at most two decimals.");
    expect(isWholeCentimes(0.1 + 0.2)).toBe(true);
    expect(isWholeCentimes(4_500.55)).toBe(true);
  });

  it("refuses a division, category or method that is not on the lists", () => {
    expect(schema.safeParse({ ...valid, division: "OTHER" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, category: "FOOD" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, method: "CARD" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, recurrence: "WEEKLY" }).success).toBe(false);
  });
});
