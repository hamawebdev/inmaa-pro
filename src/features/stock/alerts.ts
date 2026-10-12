import { PackageMinus, Wrench } from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";
import type { Executor, ServiceContext } from "@/lib/service/context";

import { isLowStock, maintenanceAlert } from "./rules/alerts";
import { INVENTORY_PATH, MAINTENANCE_PATH } from "./services/paths";
import type { ItemCondition, StockKind } from "./validators/option-codes";

/**
 * Stock's alerts (docs/data-model/DESIGN.md section 13).
 *
 *  - `stock.low`: an item at or below its minimum, his own words ("when stock
 *    reaches the minimum: purchase request"). The tile opens the inventory on
 *    the kind that needs buying, materials first.
 *  - `maintenance.due`: a piece of equipment whose maintenance date is within
 *    the lead time or past, or that was reported in need of it.
 */

export async function findLowStock(ex: Executor): Promise<{ count: number; kind: StockKind | null }> {
  const items = await ex
    .selectFrom("StockItem")
    .select(["kind", "isActive", "minLevel", "onHandQty"])
    .where("deletedAt", "is", null)
    .where("isActive", "=", 1)
    .where("minLevel", "is not", null)
    .execute();
  const low = items.filter((item) =>
    isLowStock({ isActive: item.isActive === 1, minLevel: item.minLevel, onHandQty: item.onHandQty }),
  );
  const kind: StockKind | null = low.some((item) => item.kind === "MATERIAL")
    ? "MATERIAL"
    : low.length > 0
      ? "EQUIPMENT"
      : null;
  return { count: low.length, kind };
}

export async function countMaintenanceDue(
  ex: Executor,
  ctx: ServiceContext,
  input: { leadDays: number },
): Promise<number> {
  const units = await ex
    .selectFrom("EquipmentUnit")
    .select(["condition", "nextMaintenanceDate", "retiredAt"])
    .where("retiredAt", "is", null)
    .where((eb) => eb.or([eb("nextMaintenanceDate", "is not", null), eb("condition", "=", "NEEDS_MAINTENANCE")]))
    .execute();
  return units.filter(
    (unit) =>
      maintenanceAlert(
        {
          retired: unit.retiredAt !== null,
          condition: unit.condition as ItemCondition,
          nextMaintenanceDate: unit.nextMaintenanceDate,
        },
        ctx.today,
        input.leadDays,
      ) !== null,
  ).length;
}

export function registerAlerts(register: RegisterAlert) {
  register({
    key: "stock.low",
    section: "stock",
    severity: "warning",
    name: "StockLow",
    icon: PackageMinus,
    route: `${INVENTORY_PATH}?kind=MATERIAL&state=TO_BUY`,
    count: async (ex) => {
      const low = await findLowStock(ex);
      return { count: low.count, route: `${INVENTORY_PATH}?kind=${low.kind ?? "MATERIAL"}&state=TO_BUY` };
    },
  });
  register({
    key: "maintenance.due",
    section: "stock",
    severity: "warning",
    name: "MaintenanceDue",
    icon: Wrench,
    leadSetting: "alerts.maintenanceLeadDays",
    route: MAINTENANCE_PATH,
    count: (ex, ctx, { days }) => countMaintenanceDue(ex, ctx, { leadDays: days ?? 7 }),
  });
}
