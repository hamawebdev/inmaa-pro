import { z } from "zod";

import { isIsoDate, type IsoDate } from "../rules/dates";

import { EXPENSE_CATEGORIES, EXPENSE_DIVISIONS, PAYMENT_METHODS, RECURRENCES } from "./option-codes";

/** The largest amount the program writes, in dinars: the amount in words goes no further. */
export const MAX_AMOUNT_DINARS = 999_999_999.99;

/**
 * Trimmed text; an empty field is no value at all.
 *
 * Every message is written here, in words the catalogue has: the same schema
 * checks the dialog and the service, and the service runs where no global
 * error map is installed (the tests).
 */
export function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" ? (value.trim() === "" ? undefined : value.trim()) : (value ?? undefined)),
    z
      .string({ invalid_type_error: "Invalid form submission." })
      .max(max, `Must be at most ${max} characters.`)
      .optional(),
  );
}

/** One code of a list. A value that is not on it, or none, asks for a choice. */
export function choice<const T extends readonly [string, ...string[]]>(codes: T) {
  return z.enum(codes, { errorMap: () => ({ message: "Choose one of the options." }) });
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
    division: choice(EXPENSE_DIVISIONS),
    /** The contract this expense is a cost of, when it is one (MON-11): its profitability counts it. */
    fileId: optionalText(64),
    category: choice(EXPENSE_CATEGORIES),
    date: z
      .string({ required_error: "This field is required.", invalid_type_error: "This field is required." })
      .min(1, "This field is required.")
      .refine(isIsoDate, { message: "Enter a valid date." })
      .refine((date) => date <= today, { message: "An expense cannot be dated after today." }),
    amount: z
      .number({ required_error: "This field is required.", invalid_type_error: "Must be a number." })
      .positive({ message: "An amount must be more than zero." })
      .max(MAX_AMOUNT_DINARS, "This amount is too large.")
      .refine(isWholeCentimes, { message: "An amount has at most two decimals." }),
    method: choice(PAYMENT_METHODS),
    paidTo: optionalText(120),
    spentByName: optionalText(120),
    recurrence: choice(RECURRENCES),
    note: optionalText(500),
  });
}

export type ExpenseFormValues = z.infer<ReturnType<typeof expenseFormSchema>>;
