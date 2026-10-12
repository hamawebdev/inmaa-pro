import { z } from "zod";

import { isIsoDate } from "../rules/dates";

/**
 * The period a money screen covers, as the address bar carries it:
 * `?from=2026-11-01&to=2026-11-20&preset=this-month`.
 *
 * The presets are the academy's (finance analytics): today, the last seven
 * days, the month so far, and a range of one's own.
 */
export const PERIOD_PRESETS = ["today", "7days", "this-month", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const periodSchema = z
  .object({
    from: z.string().refine(isIsoDate, { message: "Enter a valid date." }),
    to: z.string().refine(isIsoDate, { message: "Enter a valid date." }),
    preset: z.enum(PERIOD_PRESETS),
  })
  .refine((period) => period.from <= period.to, {
    message: "The start of the period is after its end.",
    path: ["to"],
  });

export type PeriodInput = z.infer<typeof periodSchema>;
