import { afterEach, beforeEach, expect, it } from "vitest";

import { evaluateAlerts } from "@/lib/alerts";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countMaintenanceDue, findLowStock } from "./alerts";
import { stockItem } from "./testing/fixtures";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("counts the items at or below their minimum, and opens the kind that needs buying", async () => {
  await stockItem(test, { openingQty: 30, minLevel: 10 });
  expect(await findLowStock(test.db)).toEqual({ count: 0, kind: null });
  await stockItem(test, {
    nameAr: "دلاء",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    openingQty: 3,
    minLevel: 4,
  });
  expect(await findLowStock(test.db)).toEqual({ count: 1, kind: "EQUIPMENT" });
  await stockItem(test, { nameAr: "فوط", category: "CONSUMABLE", unit: "PIECE", openingQty: 30, minLevel: 30 });
  expect(await findLowStock(test.db)).toEqual({ count: 2, kind: "MATERIAL" });
  // No minimum: never an alert.
  await stockItem(test, { nameAr: "كمامات", category: "PPE", unit: "BOX", openingQty: 0, minLevel: undefined });
  expect((await findLowStock(test.db)).count).toBe(2);

  const states = await test.transact((ex, ctx) => evaluateAlerts(ex, ctx));
  expect(states.find((alert) => alert.key === "stock.low")).toMatchObject({
    owner: "stock",
    count: 2,
    route: "/dashboard/inventory?kind=MATERIAL&state=TO_BUY",
  });
});

it("counts the equipment whose maintenance is near, past, or asked for", async () => {
  const unit = (over: Record<string, unknown>) =>
    test.rows.insert("EquipmentUnit", { condition: "GOOD", ...over } as never);
  await unit({ nextMaintenanceDate: "2026-10-15" });
  await unit({ nextMaintenanceDate: "2026-10-01" });
  await unit({ nextMaintenanceDate: "2026-12-01" });
  await unit({ condition: "NEEDS_MAINTENANCE" });
  await unit({ nextMaintenanceDate: "2026-10-01", retiredAt: "2026-10-02T08:00:00.000Z", retireReason: "مكسورة" });
  expect(await test.transact((ex, ctx) => countMaintenanceDue(ex, ctx, { leadDays: 7 }))).toBe(3);
});
