import type { RegisterDaily } from "@/lib/daily";

import { addDays } from "./rules/calendar";
import { markMissedInspections, planInspections } from "./services/inspections";

/** How far ahead the day-start job keeps the inspections of the live files planned. */
export const INSPECTION_PLAN_DAYS = 28;

/**
 * What Operations does because the day changed, as the program.
 *
 * - An inspection still «مبرمجة» `inspection.missedAfterDays` days after its
 *   date becomes MISSED: it leaves the inspection.due tile and stays in the
 *   list as not done.
 * - The plans of the live files with a weekly or monthly inspection are kept
 *   four weeks ahead: a week or a month that has its inspection gets no other,
 *   and a contract's end is never passed.
 *
 * Neither depends on `since`: both look at every row, so a week the program
 * stayed closed is caught up, and a second run on the same day changes nothing.
 * Every other daily count (visits with no arrival, orders not returned,
 * complaints past their target) is read from the clock, not written.
 */
export function registerDaily(daily: RegisterDaily) {
  daily("mark the inspections not done in time as missed", async (ex, ctx, { today }) => {
    await markMissedInspections(ex, ctx, { today });
  });
  daily("keep the inspections planned four weeks ahead", async (ex, ctx, { today }) => {
    await planInspections(ex, ctx, { upTo: addDays(today, INSPECTION_PLAN_DAYS) });
  });
}
