import type { CodeLabelCase } from "@/i18n/code-labels";

import {
  EQUIPMENT_LOCATIONS,
  HANDOUT_PURPOSES,
  ITEM_CONDITIONS,
  MAINTENANCE_KINDS,
  STOCK_CATEGORIES,
  STOCK_KINDS,
  STOCK_TRACKINGS,
  UNITS,
} from "./validators/option-codes";

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
  ["StockCodes.Trackings", STOCK_TRACKINGS],
  // «الحالة عند الاستلام» of a hand-out line.
  ["StockCodes.Conditions", ITEM_CONDITIONS],
  ["StockCodes.Purposes", HANDOUT_PURPOSES],
  ["StockCodes.Locations", EQUIPMENT_LOCATIONS],
  ["StockCodes.MaintenanceKinds", MAINTENANCE_KINDS],
];
