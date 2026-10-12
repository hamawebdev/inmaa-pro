/** The screens Stock's actions refresh. */
export const INVENTORY_PATH = "/dashboard/inventory";
export const HANDOUTS_PATH = "/dashboard/handouts";
export const PURCHASES_PATH = "/dashboard/purchases";
export const MAINTENANCE_PATH = "/dashboard/maintenance";

/** What a movement of stock changes. */
export const STOCK_PATHS = [INVENTORY_PATH, HANDOUTS_PATH, PURCHASES_PATH] as const;
