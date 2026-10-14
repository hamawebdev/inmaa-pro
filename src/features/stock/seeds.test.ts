import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { SEEDED_STOCK_ITEMS, seededItemId, seedStockItems } from "./seeds";
import { updateStockItem } from "./services/items";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("starts the store with his 29 items: 14 materials, 9 pieces of equipment, 6 of the protective kit", async () => {
  const rows = await test.db.selectFrom("StockItem").select(["id", "code", "kind", "category", "onHandQty"]).execute();
  expect(rows).toHaveLength(29);
  expect(SEEDED_STOCK_ITEMS).toHaveLength(29);
  expect(rows.filter((row) => row.kind === "EQUIPMENT")).toHaveLength(9);
  expect(rows.filter((row) => row.category === "PPE")).toHaveLength(6);
  expect(rows.filter((row) => row.kind === "MATERIAL" && row.category !== "PPE")).toHaveLength(14);
  expect(rows.find((row) => row.code === "FLOOR_CLEANER")).toMatchObject({
    id: "stock-item-floor-cleaner",
    onHandQty: 0,
  });
});

it("adds only what is missing, and never undoes what the office edited", async () => {
  await test.transact((ex, ctx) =>
    updateStockItem(ex, ctx, {
      id: seededItemId("FLOOR_CLEANER"),
      values: {
        nameAr: "منظف الأرضيات بالليمون",
        kind: "MATERIAL",
        category: "CLEANING_PRODUCT",
        unit: "LITRE",
        tracking: "QUANTITY",
        minLevel: 10,
      },
    }),
  );
  await test.raw.exec(`delete from "StockItem" where code = 'BRUSHES'`);

  const added = await test.transact((ex, ctx) => seedStockItems(ex, ctx));
  expect(added).toBe(1);
  const again = await test.transact((ex, ctx) => seedStockItems(ex, ctx));
  expect(again).toBe(0);
  const edited = await test.db
    .selectFrom("StockItem")
    .select(["nameAr", "minLevel"])
    .where("code", "=", "FLOOR_CLEANER")
    .executeTakeFirstOrThrow();
  expect(edited).toEqual({ nameAr: "منظف الأرضيات بالليمون", minLevel: 10_000 });
});
