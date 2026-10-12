import type { CodeLabelCase } from "@/i18n/code-labels";

import {
  EXPENSE_CATEGORIES,
  EXPENSE_DIVISIONS,
  EXPENSE_SOURCES,
  PAYMENT_METHODS,
  RECURRENCES,
} from "./validators/option-codes";

/**
 * The stored codes this folder shows through `useCodeLabel`, each paired with
 * the message namespace that labels them.
 *
 * src/i18n/code-labels.test.ts fails when a code has no label in one of the
 * three languages, which is what stops "FULL_DAY" appearing on an Arabic screen.
 */
export const codeLabelCases: readonly CodeLabelCase[] = [
  // His four divisions and «عام», the line of the expenses that belong to none.
  ["MoneyCodes.Divisions", EXPENSE_DIVISIONS],
  ["MoneyCodes.ExpenseCategories", EXPENSE_CATEGORIES],
  ["MoneyCodes.PaymentMethods", PAYMENT_METHODS],
  ["MoneyCodes.Recurrences", RECURRENCES],
  ["MoneyCodes.ExpenseSources", EXPENSE_SOURCES],
];
