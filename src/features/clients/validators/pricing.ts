import { z } from "zod";

import { AMOUNT_BASES } from "@/lib/options";

import { isDate } from "./file-values";

/**
 * The codes and the inputs of the cost study («الدراسة المالية», plan feature
 * 4) and of the quote («عرض السعر», features 5 and 29). OPTION-CODES.md:
 * COST_LINE, QUOTE_STATUS, QUOTE_RESULT, QUOTE_LINE_KIND.
 */

export const COST_LINES = [
  "LABOUR",
  "SUPERVISION",
  "MATERIALS",
  "EQUIPMENT",
  "TRANSPORT",
  "SPECIAL_SERVICES",
  "OTHER",
  "RESERVE",
  "ADMIN_SHARE",
  "TAX_INSURANCE",
] as const;
export type CostLineCode = (typeof COST_LINES)[number];

/** The lines typed as a percentage of the direct costs. */
export const RATE_COST_LINES: readonly CostLineCode[] = ["RESERVE", "ADMIN_SHARE", "TAX_INSURANCE"];

export const QUOTE_STATUSES = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "NEEDS_REVIEW",
  "ISSUED",
  "SUPERSEDED",
  "CANCELLED",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_RESULTS = [
  "PENDING",
  "ACCEPTED",
  "REFUSED",
  "DISCOUNT_REQUESTED",
  "CHANGE_REQUESTED",
  "POSTPONED",
  "NO_ANSWER",
] as const;
export type QuoteResult = (typeof QUOTE_RESULTS)[number];

export const QUOTE_LINE_KINDS = ["INITIAL_JOB", "PERIODIC", "EXTRA"] as const;
export type QuoteLineKind = (typeof QUOTE_LINE_KINDS)[number];

const count = z.number().int().min(0).max(100000).nullable();
const amount = z.number().int().min(0).max(100_000_000_000).nullable();
const rate = z.number().int().min(0).max(100_000).nullable();
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
const date = z.string().refine(isDate, "Enter a valid date.");
const optionalDate = z
  .string()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isDate(value), "Enter a valid date.");

export const costLineSchema = z.object({
  code: z.enum(COST_LINES),
  label: text(200),
  amount: amount.transform((value) => value ?? 0),
  rateBp: rate,
});
export type CostLineInput = z.infer<typeof costLineSchema>;

export const costStudySchema = z.object({
  workers: count,
  perVisitMin: count,
  visitsPerWeek: z.number().int().min(0).max(21).nullable(),
  /** Thousandths of a week. */
  weeks: z.number().int().min(0).max(1_000_000).nullable(),
  hourlyRate: amount,
  lines: z.array(costLineSchema).max(40),
  marginPercent: rate,
  discount: amount,
});
export type CostStudyInput = z.infer<typeof costStudySchema>;

export const quoteLineSchema = z.object({
  kind: z.enum(QUOTE_LINE_KINDS),
  label: z.string().trim().min(1, "Every line of a quote needs a description.").max(300),
  description: text(1000),
  /** Thousandths. */
  quantity: z.number().int().min(1, "A quantity must be above zero.").max(1_000_000_000),
  unit: text(60),
  unitPrice: z.number().int().min(0).max(100_000_000_000),
});
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

export const quoteSchema = z.object({
  date,
  validUntil: optionalDate,
  includedText: text(4000),
  excludedText: text(4000),
  materialsIncluded: z.boolean().nullable(),
  equipmentIncluded: z.boolean().nullable(),
  workers: z.number().int().min(0).max(1000).nullable(),
  duration: text(200),
  visits: text(200),
  discount: amount.transform((value) => value ?? 0),
  amountBasis: z.enum(AMOUNT_BASES).nullable(),
  lines: z.array(quoteLineSchema).min(1, "A quote needs at least one line.").max(60),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const quoteResultSchema = z.object({
  result: z.enum(QUOTE_RESULTS),
  resultDate: date,
  note: text(1000),
  postponedUntil: optionalDate,
});

export const followUpSchema = z.object({
  date,
  note: text(1000),
  nextFollowUpDate: optionalDate,
});
