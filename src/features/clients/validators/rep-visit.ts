import { z } from "zod";

import { DIVISIONS } from "@/lib/options";

import { isDate, isPhone } from "./file-values";

/** «زيارات المندوب التجاري» (plan feature 40): a prospect visited by the sales rep, typed in at the office. */

export const INTERESTS = ["HIGH", "MEDIUM", "LOW", "NONE"] as const;
export type Interest = (typeof INTERESTS)[number];

const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    });

export const repVisitSchema = z.object({
  date: z.string().refine(isDate, "Enter a valid date."),
  repEmployeeId: z.string().min(1, "Choose the sales rep who made the visit."),
  prospectName: z.string().trim().min(1, "The prospect's name is required.").max(200),
  prospectKind: z.enum(DIVISIONS),
  activity: text(200),
  contactName: text(200),
  contactRole: text(100),
  phone: text(30).refine((value) => value === null || isPhone(value), "The phone number has 9 or 10 digits."),
  address: text(400),
  communeId: z.string().nullable(),
  leftProfile: z.boolean(),
  interest: z.enum(INTERESTS).nullable(),
  outcome: text(2000),
  callBackDate: text(10).refine((value) => value === null || isDate(value), "Enter a valid date."),
  note: text(2000),
});
export type RepVisitInput = z.input<typeof repVisitSchema>;
export type RepVisitValues = z.output<typeof repVisitSchema>;
