/**
 * Every option list Stock's rules and sheets use, each written once, here.
 *
 * The codes follow the data model's draft list of option codes. A few may still
 * be renamed: that is a change to this file only, and the compiler then points
 * at every use.
 *
 * Lists more than one owner uses (his four divisions, «نوع الخدمة», the
 * protective kit) are Foundation's, in `src/lib/options`, re-exported here so
 * that Stock's files import from one place.
 *
 * Arabic wording for paper is in ../sheets/print-labels.ts.
 */

export { DIVISIONS, SERVICE_TYPES, type Division, type ServiceType } from "@/lib/options";

/** His two branches of «قسم إدارة المخزون»: «المعدات» and «المواد». */
export const STOCK_KINDS = ["EQUIPMENT", "MATERIAL"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

/** Counted by quantity, or followed piece by piece (a machine). */
export const STOCK_TRACKINGS = ["QUANTITY", "UNIT"] as const;
export type StockTracking = (typeof STOCK_TRACKINGS)[number];

/** A filter on the inventory list. Our wording: his documents give no such list. */
export const STOCK_CATEGORIES = ["CLEANING_PRODUCT", "CONSUMABLE", "TOOL", "MACHINE", "PPE"] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];

/** What an item is counted in. Our wording: his documents give no list. */
export const UNITS = ["PIECE", "LITRE", "KG", "BOX", "BAG", "PAIR", "ROLL"] as const;
export type Unit = (typeof UNITS)[number];

/** «الحالة عند الاستلام» on his buildings worker card (item 11), and one of ours. */
export const ITEM_CONDITIONS = ["GOOD", "NEEDS_MAINTENANCE", "OUT_OF_SERVICE"] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

/** Where a piece of equipment is. */
export const EQUIPMENT_LOCATIONS = ["STORE", "WITH_WORKER", "AT_SITE", "IN_MAINTENANCE"] as const;
export type EquipmentLocation = (typeof EQUIPMENT_LOCATIONS)[number];

/** A hand-out is for a job, or is a worker's own kit. */
export const HANDOUT_PURPOSES = ["JOB", "WORKER_KIT"] as const;
export type HandoutPurpose = (typeof HANDOUT_PURPOSES)[number];

/** «معدات الوقاية» on his buildings worker card (item 12): shared, in src/lib/options. */
export { PPE, type Ppe } from "@/lib/options";

/** Narrows a stored code to one of the two branches of his inventory. */
export function isStockKind(code: string): code is StockKind {
  return (STOCK_KINDS as readonly string[]).includes(code);
}

/** What was done to a piece of equipment: its periodic service, or a repair. */
export const MAINTENANCE_KINDS = ["PREVENTIVE", "REPAIR"] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];
