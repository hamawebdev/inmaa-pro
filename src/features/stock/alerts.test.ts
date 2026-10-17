import { afterEach, beforeEach, expect, it } from "vitest";

import { evaluateAlerts } from "@/lib/alerts";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countChargesToSettle, countMaintenanceDue, findLowStock } from "./alerts";
import { createHandOut, recordHandOutReturn } from "./services/handouts";
import { settleEquipmentCharge } from "./services/incidents";
import { stockItem, workerOnFile } from "./testing/fixtures";

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

it("counts the equipment charges still to settle, and opens التسليم (MON-10)", async () => {
  const worker = await workerOnFile(test);
  const mops = await stockItem(test, {
    nameAr: "ممسحة",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    openingQty: 5,
  });
  const free = await stockItem(test, {
    nameAr: "دلو قديم",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    openingQty: 2,
  });
  await test.db
    .updateTable("StockItem")
    .set({ avgCost: 60_000 } as never)
    .where("id", "=", mops.id)
    .execute();
  const kit = await test.transact((ex, ctx) =>
    createHandOut(ex, ctx, {
      date: "2026-10-12",
      purpose: "WORKER_KIT",
      workerId: worker.id,
      lines: [
        { itemId: mops.id, qty: 2, condition: "GOOD" },
        { itemId: free.id, qty: 1, condition: "GOOD" },
      ],
    }),
  );
  const lines = await test.db
    .selectFrom("HandOutLine")
    .select(["id", "itemId"])
    .where("handOutId", "=", kit.id)
    .execute();
  const lineOf = (itemId: string) => lines.find((line) => line.itemId === itemId)?.id ?? "";
  const tile = async () =>
    (await test.transact((ex, ctx) => evaluateAlerts(ex, ctx))).find((alert) => alert.key === "stock.chargesToSettle");
  // A tile shows only above zero.
  expect((await tile())?.count).toBe(0);

  const broken = await test.transact((ex, ctx) =>
    recordHandOutReturn(ex, ctx, {
      handOutLineId: lineOf(mops.id),
      date: "2026-10-12",
      qtyReturned: 1,
      condition: "GOOD",
      qtyDamaged: 1,
      note: "انكسرت",
    }),
  );
  // A piece handed out at no recorded cost has nothing to charge: no tile for it.
  await test.transact((ex, ctx) =>
    recordHandOutReturn(ex, ctx, {
      handOutLineId: lineOf(free.id),
      date: "2026-10-12",
      qtyReturned: 0,
      qtyLost: 1,
      note: "ضاع",
    }),
  );
  expect(await test.transact((ex, ctx) => countChargesToSettle(ex, ctx))).toBe(1);
  expect(await tile()).toMatchObject({
    owner: "stock",
    section: "stock",
    severity: "warning",
    count: 1,
    route: "/dashboard/handouts",
  });

  await test.transact((ex, ctx) =>
    settleEquipmentCharge(ex, ctx, { handOutReturnId: broken.id, amount: 0, reason: "تآكل" }),
  );
  expect((await tile())?.count).toBe(0);
});
