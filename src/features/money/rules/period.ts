import { periodSchema, type PeriodPreset } from "../validators/period";

import type { Centimes } from "./centimes";
import { addDays, diffDays, firstDayOfMonth, isWithin, monthOf, type IsoDate } from "./dates";

/**
 * The period a money screen shows, and the totals it is cut into.
 *
 * The address bar carries the choice (`?preset=7days`, or
 * `?preset=custom&from=…&to=…`), as the academy's finance screen does, so a
 * period survives a reload and Back goes to the previous one. One difference:
 * a named preset is worked out from today each time, so a screen left on "the
 * last seven days" still means the last seven days tomorrow.
 */

export interface Period {
  from: IsoDate;
  to: IsoDate;
  preset: PeriodPreset;
}

export function presetPeriod(preset: Exclude<PeriodPreset, "custom">, today: IsoDate): Period {
  switch (preset) {
    case "today":
      return { from: today, to: today, preset };
    case "7days":
      return { from: addDays(today, -6), to: today, preset };
    case "this-month":
      return { from: firstDayOfMonth(monthOf(today)), to: today, preset };
  }
}

/** The month so far: what a screen shows when the address names no period, or one that makes no sense. */
export function defaultPeriod(today: IsoDate): Period {
  return presetPeriod("this-month", today);
}

/** The period in the address bar. */
export function readPeriod(search: URLSearchParams, today: IsoDate): Period {
  const preset = search.get("preset");
  if (preset === "today" || preset === "7days" || preset === "this-month") return presetPeriod(preset, today);

  // A range of one's own, written either way: `preset=custom`, or just `from` and `to`.
  if (preset === null || preset === "custom") {
    const parsed = periodSchema.safeParse({ from: search.get("from"), to: search.get("to"), preset: "custom" });
    if (parsed.success) return { from: parsed.data.from, to: parsed.data.to, preset: "custom" };
  }
  return defaultPeriod(today);
}

/**
 * The address-bar query for a period, keeping whatever else is there (the
 * division being looked at, a filter). A named preset needs no dates.
 */
export function writePeriod(search: URLSearchParams, period: Period): string {
  const next = new URLSearchParams(search);
  next.set("preset", period.preset);
  if (period.preset === "custom") {
    next.set("from", period.from);
    next.set("to", period.to);
  } else {
    next.delete("from");
    next.delete("to");
  }
  return next.toString();
}

export function isInPeriod(date: IsoDate, period: Period): boolean {
  return isWithin(date, period.from, period.to);
}

/** Days in a period, both ends counted. */
export function periodLength(period: Period): number {
  return diffDays(period.from, period.to) + 1;
}

export type Granularity = "day" | "month";

/** The longest period drawn day by day; a longer one is drawn month by month. */
export const MAX_DAILY_BARS = 62;

export function granularityOf(period: Period): Granularity {
  return periodLength(period) > MAX_DAILY_BARS ? "month" : "day";
}

export interface Bucket {
  /** `YYYY-MM-DD` for a day, `YYYY-MM` for a month. */
  key: string;
  total: Centimes;
}

/**
 * Amounts summed by day, or by month for a long period, inside the period.
 *
 * Only the days (or months) that have something are returned, in order, as
 * the academy's chart does: a bar of zero says nothing a gap does not.
 */
export function bucketTotals(items: readonly { date: IsoDate; amount: Centimes }[], period: Period): Bucket[] {
  const byMonth = granularityOf(period) === "month";
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!isInPeriod(item.date, period)) continue;
    const key = byMonth ? monthOf(item.date) : item.date;
    totals.set(key, (totals.get(key) ?? 0) + item.amount);
  }
  return [...totals.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, total]) => ({ key, total }));
}
