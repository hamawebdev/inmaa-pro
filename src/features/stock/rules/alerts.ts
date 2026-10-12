import { diffDays, type IsoDate } from "@/features/money/rules/dates";

import type { ItemCondition } from "../validators/option-codes";

/**
 * The conditions of Stock's two alerts, as predicates over plain rows.
 *
 * Like Money's (src/features/money/rules/alerts.ts): a tile, a list and a
 * desktop notification; nothing is sent; "today" is always passed in.
 */

// ── Stock at its minimum ────────────────────────────────────────────────────

export interface StockLevelRow {
  isActive: boolean;
  /** «الحد الأدنى», in thousandths of the item's unit. Empty: the item is not watched. */
  minLevel: number | null;
  /** «المخزون»: what is in the store, in thousandths of the item's unit. */
  onHandQty: number;
}

/**
 * His study: "when stock reaches the minimum: purchase request". So the alert
 * fires at the minimum, not only below it. An item with no minimum never
 * alerts: an empty field is not a minimum of zero.
 */
export function isLowStock(row: StockLevelRow): boolean {
  return row.isActive && row.minLevel !== null && row.onHandQty <= row.minLevel;
}

// ── Maintenance due ─────────────────────────────────────────────────────────

export interface EquipmentUnitRow {
  /** Withdrawn from use for good. */
  retired: boolean;
  condition: ItemCondition;
  nextMaintenanceDate: IsoDate | null;
}

export type MaintenanceAlertState =
  /** Its condition says so: «تحتاج صيانة». */
  | "NEEDS_MAINTENANCE"
  /** Its maintenance date has passed. */
  | "OVERDUE"
  /** Its maintenance date is within the lead time (today included). */
  | "DUE_SOON";

export interface MaintenanceAlert {
  state: MaintenanceAlertState;
  /** Days from today to the maintenance date; `null` when the unit has none. */
  daysLeft: number | null;
}

/**
 * A unit in service whose maintenance date is near or passed, or whose
 * condition is «تحتاج صيانة». The condition comes first: a machine reported
 * faulty is to be seen to whatever its calendar says. A unit out of service is
 * already being dealt with and alerts only by its date.
 */
export function maintenanceAlert(row: EquipmentUnitRow, today: IsoDate, leadDays: number): MaintenanceAlert | null {
  if (row.retired) return null;
  const daysLeft = row.nextMaintenanceDate === null ? null : diffDays(today, row.nextMaintenanceDate);

  if (row.condition === "NEEDS_MAINTENANCE") return { state: "NEEDS_MAINTENANCE", daysLeft };
  if (daysLeft === null) return null;
  if (daysLeft < 0) return { state: "OVERDUE", daysLeft };
  return daysLeft <= leadDays ? { state: "DUE_SOON", daysLeft } : null;
}
