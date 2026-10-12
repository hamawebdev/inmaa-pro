import { z } from "zod";

import { isIsoDate, type IsoDate } from "../rules/dates";

import { EXPENSE_CATEGORIES, EXPENSE_DIVISIONS, PAYMENT_METHODS, RECURRENCES } from "./option-codes";

/** The largest amount the program writes, in dinars: the amount in words goes no further. */
export const MAX_AMOUNT_DINARS = 999_999_999.99;

/** Trimmed text; an empty field is no value at all. */
function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" ? (value.trim() === "" ? undefined : value.trim()) : value),
    z.string().max(max).optional(),
  );
}

/** Whether a number of dinars has no more than two decimals (whole centimes). */
export function isWholeCentimes(dinars: number): boolean {
  return Math.abs(dinars * 100 - Math.round(dinars * 100)) < 1e-6;
}

/**
 * The expense dialog: an expense typed by hand (`Expense.source = MANUAL`).
 *
 * The amount is in dinars as the office types it (450.5); the service turns it
 * into centimes with `dinarsToMoney`. `today` is the centre's today: an expense
 * is money that already went out, so it is never dated after it.
 *
 * The payment method is required here although the column is optional: rows
 * written by the program from a maintenance record have none.
 */
export function expenseFormSchema(today: IsoDate) {
  return z.object({
    division: z.enum(EXPENSE_DIVISIONS),
    category: z.enum(EXPENSE_CATEGORIES),
    date: z
      .string()
      .min(1)
      .refine(isIsoDate, { message: "Enter a valid date." })
      .refine((date) => date <= today, { message: "An expense cannot be dated after today." }),
    amount: z
      .number()
      .positive({ message: "An amount must be more than zero." })
      .max(MAX_AMOUNT_DINARS)
      .refine(isWholeCentimes, { message: "An amount has at most two decimals." }),
    method: z.enum(PAYMENT_METHODS),
    paidTo: optionalText(120),
    spentByName: optionalText(120),
    recurrence: z.enum(RECURRENCES),
    note: optionalText(500),
  });
}

export type ExpenseFormValues = z.infer<ReturnType<typeof expenseFormSchema>>;
