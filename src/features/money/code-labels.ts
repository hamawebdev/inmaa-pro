import type { CodeLabelCase } from "@/i18n/code-labels";

import { DUE_READINESS } from "./services/invoices";
import { DUE_STATES, EXPENSE_CATEGORIES, EXPENSE_SOURCES, PAYMENT_STATES, RECURRENCES } from "./validators/option-codes";

/**
 * The stored codes this folder shows through `useCodeLabel`, each paired with
 * the message namespace that labels them.
 *
 * src/i18n/code-labels.test.ts fails when a code has no label in one of the
 * three languages, which is what stops "FULL_DAY" appearing on an Arabic screen.
 */
export const codeLabelCases: readonly CodeLabelCase[] = [
  // «عام», the line of the expenses that belong to none of his four divisions (those are `Options.Division`).
  ["MoneyCodes.Divisions", ["COMMON"]],
  ["MoneyCodes.ExpenseCategories", EXPENSE_CATEGORIES],
  ["MoneyCodes.Recurrences", RECURRENCES],
  ["MoneyCodes.ExpenseSources", EXPENSE_SOURCES],
  // Derived, never stored, and shown as chips: «حالة الدفع» in his words, a due's state, whether it can be invoiced.
  ["MoneyCodes.PaymentStates", PAYMENT_STATES],
  ["MoneyCodes.DueStates", DUE_STATES],
  ["MoneyCodes.Readiness", DUE_READINESS],
];
