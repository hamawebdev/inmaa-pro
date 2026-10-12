import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { isLowStock } from "../rules/alerts";
import { stockState } from "../rules/stock-state";
import { onHandOf, stockItem } from "../testing/fixtures";

import { closeCount, getCount, openCount, saveCountLine } from "./counts";
import { createStockItem, listInventory, updateStockItem } from "./items";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

describe("an item of the store", () => {
  it("is created with its unit and minimum, and what is on the shelf as its first movement", async () => {
    const item = await stockItem(test);
    expect(item.code).toBe("MAT-0001");
    const [row] = await test.transact((ex, ctx) => listInventory(ex, ctx));
    expect(row).toEqual({
      id: item.id,
      code: "MAT-0001",
      nameAr: "منظف أرضيات",
      nameFr: null,
      nameEn: null,
      kind: "MATERIAL",
      category: "CLEANING_PRODUCT",
      unit: "LITRE",
      tracking: "QUANTITY",
      minLevel: 10_000,
      onHandQty: 30_000,
      isActive: true,
    });
    expect(stockState(row)).toBe("OK");
    expect(await test.db.selectFrom("StockMovement").select(["type", "qty", "date"]).execute()).toEqual([
      { type: "OPENING", qty: 30_000, date: "2026-10-12" },
    ]);
    // The cached quantity is the sum of the ledger, and the database checks it.
    expect(await verifyChains(test.db)).toMatchObject({ brokenTotals: [] });
  });

  it("takes the next free code of its kind, or the one typed, once", async () => {
    await stockItem(test);
    const second = await stockItem(test, { nameAr: "منظف زجاج", openingQty: 20, minLevel: 5 });
    const bucket = await stockItem(test, {
      nameAr: "دلاء",
      kind: "EQUIPMENT",
      category: "TOOL",
      unit: "PIECE",
      openingQty: 3,
    });
    const typed = await stockItem(test, { nameAr: "قفازات", code: "PPE_GLOVES", unit: "PAIR" });
    expect([second.code, bucket.code, typed.code]).toEqual(["MAT-0002", "EQP-0001", "PPE_GLOVES"]);
    await expect(stockItem(test, { nameAr: "قفازات أخرى", code: "PPE_GLOVES" })).rejects.toThrow(
      "An item with this code already exists.",
    );
  });

  it("is changed without ever naming its quantity, and only what changed is logged", async () => {
    const item = await stockItem(test);
    await test.transact((ex, ctx) =>
      updateStockItem(ex, ctx, {
        id: item.id,
        values: {
          nameAr: "منظف أرضيات",
          nameFr: "Nettoyant sols",
          kind: "MATERIAL",
          category: "CLEANING_PRODUCT",
          unit: "LITRE",
          tracking: "QUANTITY",
          minLevel: 30,
        },
      }),
    );
    const [row] = await test.transact((ex, ctx) => listInventory(ex, ctx));
    expect(row).toMatchObject({ nameFr: "Nettoyant sols", minLevel: 30_000, onHandQty: 30_000 });
    // At its minimum: his rule, "when stock reaches the minimum".
    expect(isLowStock(row)).toBe(true);
    const entry = await test.db
      .selectFrom("AuditLog")
      .select("changes")
      .where("entityId", "=", item.id)
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(entry.changes ?? "{}")).toEqual({ nameFr: [null, "Nettoyant sols"], minLevel: [10_000, 30_000] });
  });

  it("checks what is typed, and who types it", async () => {
    await expect(stockItem(test, { nameAr: "  " })).rejects.toThrow("This field is required.");
    await expect(stockItem(test, { minLevel: -1 })).rejects.toThrow("A quantity cannot be negative.");
    await expect(stockItem(test, { openingQty: 1.0005 })).rejects.toThrow("A quantity has at most three decimals.");
    await expect(stockItem(test, { unit: "BARREL" as never })).rejects.toThrow("Choose one of the options.");
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact(
        (ex, ctx) =>
          createStockItem(ex, ctx, {
            values: { nameAr: "إسفنج", kind: "MATERIAL", unit: "PIECE", tracking: "QUANTITY" },
          }),
        reception,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
    // A supervisor reads the store and changes nothing.
    const supervisor = await test.sessionFor("SUPERVISOR");
    expect(await test.transact((ex, ctx) => listInventory(ex, ctx), supervisor)).toEqual([]);
  });
});

describe("counting the store", () => {
  it("freezes the record, takes what was counted, and adjusts each difference with its reason", async () => {
    const floor = await stockItem(test);
    const glass = await stockItem(test, { nameAr: "منظف زجاج", openingQty: 20, minLevel: 5 });
    await stockItem(test, { nameAr: "دلاء", kind: "EQUIPMENT", category: "TOOL", unit: "PIECE", openingQty: 3 });

    const count = await test.transact((ex, ctx) => openCount(ex, ctx, { kind: "MATERIAL" }));
    expect(count).toMatchObject({ number: "0001/2026", lines: 2 });
    await expect(test.transact((ex, ctx) => openCount(ex, ctx, { kind: "MATERIAL" }))).rejects.toThrow(
      "A count of this kind is already open.",
    );
    const sheet = await test.transact((ex, ctx) => getCount(ex, ctx, { countId: count.id }));
    expect(sheet.lines.map((line) => [line.itemName, line.systemQty, line.countedQty])).toEqual([
      ["منظف أرضيات", 30_000, null],
      ["منظف زجاج", 20_000, null],
    ]);
    await expect(test.transact((ex, ctx) => closeCount(ex, ctx, { countId: count.id }))).rejects.toThrow(
      "Type what was counted for every line before closing.",
    );

    await test.transact((ex, ctx) => saveCountLine(ex, ctx, { lineId: sheet.lines[0].id, countedQty: 27.5 }));
    await test.transact((ex, ctx) => saveCountLine(ex, ctx, { lineId: sheet.lines[1].id, countedQty: 20 }));
    await expect(test.transact((ex, ctx) => closeCount(ex, ctx, { countId: count.id }))).rejects.toThrow(
      "Say why the count differs from the record",
    );
    await test.transact((ex, ctx) =>
      saveCountLine(ex, ctx, { lineId: sheet.lines[0].id, countedQty: 27.5, note: "قارورة مكسورة" }),
    );
    expect(await test.transact((ex, ctx) => closeCount(ex, ctx, { countId: count.id }))).toMatchObject({ adjusted: 1 });

    expect(await onHandOf(test, floor.id)).toBe(27_500);
    expect(await onHandOf(test, glass.id)).toBe(20_000);
    const adjust = await test.db
      .selectFrom("StockMovement")
      .select(["type", "qty", "reason"])
      .where("type", "=", "COUNT_ADJUST")
      .execute();
    expect(adjust).toEqual([{ type: "COUNT_ADJUST", qty: -2_500, reason: "قارورة مكسورة" }]);
    await expect(
      test.transact((ex, ctx) => saveCountLine(ex, ctx, { lineId: sheet.lines[0].id, countedQty: 30 })),
    ).rejects.toThrow("This count is closed and can no longer be changed.");
    // The other kind can be counted the same day, and takes the next number.
    expect((await test.transact((ex, ctx) => openCount(ex, ctx, { kind: "EQUIPMENT" }))).number).toBe("0002/2026");
  });
});
