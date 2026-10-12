import { isLowStock, type StockLevelRow } from "./alerts";

/**
 * Where an item stands against its minimum: the chip on «جرد المخزون».
 *
 *  - `OUT`: nothing left in the store, minimum or not.
 *  - `LOW`: at or below the minimum, the alert's own condition (`isLowStock`):
 *    "when stock reaches the minimum: purchase request", his first study.
 *  - `OK`: above the minimum.
 *  - `UNWATCHED`: no minimum set. An empty field is not a minimum of zero, so
 *    such an item never alerts.
 */
export const STOCK_STATES = ["OUT", "LOW", "OK", "UNWATCHED"] as const;
export type StockState = (typeof STOCK_STATES)[number];

export function stockState(row: StockLevelRow): StockState {
  if (row.onHandQty <= 0) return "OUT";
  if (row.minLevel === null) return "UNWATCHED";
  return isLowStock(row) ? "LOW" : "OK";
}

/** The states that call for a purchase request: the inventory's "to buy" filter. */
export function needsPurchase(state: StockState): boolean {
  return state === "OUT" || state === "LOW";
}
