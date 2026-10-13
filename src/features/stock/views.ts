import type { StockItemRow } from "@/lib/db/models";

/**
 * What Stock's screens show, typed against the generated rows.
 *
 * The services that read the database return these shapes.
 */

/**
 * A line of «جرد المخزون». The average cost stays out: the inventory is a count
 * of what is in the store, and what it cost belongs to the purchases.
 */
export type StockItemView = Pick<
  StockItemRow,
  | "id"
  | "code"
  | "nameAr"
  | "nameFr"
  | "nameEn"
  | "kind"
  | "category"
  | "unit"
  | "tracking"
  | "minLevel"
  | "onHandQty"
  | "isActive"
>;
