import { z } from "zod";

import { isIsoDate, type IsoDate } from "../rules/dates";

import { choice, isWholeCentimes, MAX_AMOUNT_DINARS, optionalText } from "./expense";
import { PAYMENT_METHODS } from "./option-codes";

/**
 * The payment dialog: money received for a file, at the desk or by transfer.
 *
 * The amount is in dinars as the office types it, the part that goes onto the
 * dues; on cash the service adds the stamp duty to it, never takes it from it.
 * A transfer, a postal order or a cheque carries its reference number.
 */
export function paymentFormSchema(today: IsoDate) {
  return z
    .object({
      fileId: z
        .string({ required_error: "This field is required.", invalid_type_error: "This field is required." })
        .min(1, "This field is required."),
      receivedDate: z
        .string({ required_error: "This field is required.", invalid_type_error: "This field is required." })
        .min(1, "This field is required.")
        .refine(isIsoDate, { message: "Enter a valid date." })
        .refine((date) => date <= today, { message: "A payment cannot be dated after today." }),
      method: choice(PAYMENT_METHODS),
      amount: z
        .number({ required_error: "This field is required.", invalid_type_error: "Must be a number." })
        .positive({ message: "An amount must be more than zero." })
        .max(MAX_AMOUNT_DINARS, "This amount is too large.")
        .refine(isWholeCentimes, { message: "An amount has at most two decimals." }),
      /** The dues it settles, in this order. None ticked: the oldest open ones first. */
      dueIds: z.array(z.string()),
      payerName: optionalText(120),
      reference: optionalText(80),
      note: optionalText(500),
    })
    .superRefine((values, context) => {
      if (values.method !== "CASH" && !values.reference) {
        context.addIssue({ code: "custom", path: ["reference"], message: "A transfer needs its reference number." });
      }
    });
}

export type PaymentFormValues = z.infer<ReturnType<typeof paymentFormSchema>>;
