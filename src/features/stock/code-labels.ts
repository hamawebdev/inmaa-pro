import type { CodeLabelCase } from "@/i18n/code-labels";

import { STOCK_CATEGORIES, STOCK_KINDS, UNITS } from "./validators/option-codes";

/**
 * The stored codes this folder shows through `useCodeLabel`, each paired with
 * the message namespace that labels them.
 *
 * src/i18n/code-labels.test.ts fails when a code has no label in one of the
 * three languages, which is what stops "FULL_DAY" appearing on an Arabic screen.
 */
export const codeLabelCases: readonly CodeLabelCase[] = [
  // His note, section 5: «المعدات» and «المواد».
  ["StockCodes.Kinds", STOCK_KINDS],
  ["StockCodes.Units", UNITS],
  ["StockCodes.Categories", STOCK_CATEGORIES],
];
