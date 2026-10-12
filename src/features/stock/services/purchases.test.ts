import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listExpenses } from "@/features/money/services/expenses";
import { verifyChains } from "@/lib/chain";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { onHandOf, stockItem } from "../testing/fixtures";

import { createSupplier, listPurchases, listSuppliers, recordPurchase } from "./purchases";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const da = (dinars: number) => Math.round(dinars * 100);
const supplier = () =>
  test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء لمواد التنظيف", phone: "032 44 55 66" }));

describe("a purchase", () => {
  it("puts its lines in the store, moves the average cost, and writes its expense", async () => {
    const { id: supplierId } = await supplier();
    const cleaner = await stockItem(test);
    const buckets = await stockItem(test, {
      nameAr: "دلاء",
      kind: "EQUIPMENT",
      category: "TOOL",
      unit: "PIECE",
      openingQty: 3,
    });

    const bought = await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-12",
        supplierId,
        supplierInvoiceNo: "F-2026/118",
        division: "BUILDING",
        method: "CASH",
        lines: [
          { itemId: cleaner.id, qty: 20, unitPrice: da(180) },
          { itemId: buckets.id, qty: 5, unitPrice: da(450) },
        ],
      }),
    );
    expect(bought).toMatchObject({ number: "0001/2026", total: da(5_850) });
    expect(await onHandOf(test, cleaner.id)).toBe(50_000);
    expect(await onHandOf(test, buckets.id)).toBe(8_000);

    // 30 l held at no recorded cost, 20 l bought at 180,00: the 50 l cost 72,00 each on average.
    const costs = await test.db.selectFrom("StockItem").select(["id", "avgCost"]).execute();
    expect(costs.find((item) => item.id === cleaner.id)?.avgCost).toBe(da(72));
    expect(costs.find((item) => item.id === buckets.id)?.avgCost).toBe(da(281.25));

    const expenses = await test.transact((ex, ctx) =>
      listExpenses(ex, ctx, { from: "2026-10-01", to: "2026-10-31" } as never),
    );
    expect(expenses.map((row) => [row.category, row.division, row.amount, row.source, row.paidTo]).sort()).toEqual([
      ["EQUIPMENT", "BUILDING", da(2_250), "PURCHASE", "مؤسسة الصفاء لمواد التنظيف"],
      ["MATERIALS", "BUILDING", da(3_600), "PURCHASE", "مؤسسة الصفاء لمواد التنظيف"],
    ]);
    const [listed] = await test.transact((ex, ctx) => listPurchases(ex, ctx));
    expect(listed).toMatchObject({
      number: "0001/2026",
      supplierName: "مؤسسة الصفاء لمواد التنظيف",
      supplierInvoiceNo: "F-2026/118",
      division: "BUILDING",
      total: da(5_850),
      lines: 2,
      cancelled: false,
    });
    expect(await verifyChains(test.db)).toMatchObject({ brokenTotals: [] });
  });

  it("averages the cost over what the shelf already cost", async () => {
    const { id: supplierId } = await supplier();
    const cleaner = await stockItem(test, { openingQty: 0 });
    const buy = (qty: number, unitPrice: number) =>
      test.transact((ex, ctx) =>
        recordPurchase(ex, ctx, {
          date: "2026-10-12",
          supplierId,
          method: "CASH",
          lines: [{ itemId: cleaner.id, qty, unitPrice }],
        }),
      );
    await buy(10, da(100));
    await buy(30, da(200));
    const item = await test.db
      .selectFrom("StockItem")
      .select(["avgCost", "onHandQty"])
      .where("id", "=", cleaner.id)
      .executeTakeFirstOrThrow();
    // (10 × 100 + 30 × 200) ÷ 40 = 175,00
    expect(item).toEqual({ avgCost: da(175), onHandQty: 40_000 });
    // With no division named, it is the centre's as a whole.
    expect((await test.db.selectFrom("Expense").select("division").execute()).map((row) => row.division)).toEqual([
      "COMMON",
      "COMMON",
    ]);
  });

  it("gives each piece of a machine its own number", async () => {
    const { id: supplierId } = await supplier();
    const vacuum = await stockItem(test, {
      nameAr: "مكانس كهربائية",
      kind: "EQUIPMENT",
      category: "MACHINE",
      unit: "PIECE",
      tracking: "UNIT",
      openingQty: 0,
      minLevel: 1,
    });
    await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-12",
        supplierId,
        method: "BANK_TRANSFER",
        lines: [{ itemId: vacuum.id, qty: 2, unitPrice: da(24_000) }],
      }),
    );
    const units = await test.db
      .selectFrom("EquipmentUnit")
      .select(["number", "condition", "locationKind", "purchaseCost", "purchaseDate"])
      .where("itemId", "=", vacuum.id)
      .orderBy("numberSeq")
      .execute();
    expect(units).toEqual([
      {
        number: "0001",
        condition: "GOOD",
        locationKind: "STORE",
        purchaseCost: da(24_000),
        purchaseDate: "2026-10-12",
      },
      {
        number: "0002",
        condition: "GOOD",
        locationKind: "STORE",
        purchaseCost: da(24_000),
        purchaseDate: "2026-10-12",
      },
    ]);
    expect(await onHandOf(test, vacuum.id)).toBe(2_000);
    await expect(
      test.transact((ex, ctx) =>
        recordPurchase(ex, ctx, {
          date: "2026-10-12",
          supplierId,
          method: "CASH",
          lines: [{ itemId: vacuum.id, qty: 1.5, unitPrice: da(24_000) }],
        }),
      ),
    ).rejects.toThrow("Pieces followed one by one are bought in whole numbers.");
  });

  it("refuses what cannot be a purchase, and those who may not buy", async () => {
    const { id: supplierId } = await supplier();
    const cleaner = await stockItem(test);
    const base = { date: "2026-10-12", supplierId, method: "CASH" as const };
    const buy = (input: Partial<Parameters<typeof recordPurchase>[2]>) =>
      test.transact((ex, ctx) =>
        recordPurchase(ex, ctx, { ...base, lines: [{ itemId: cleaner.id, qty: 1, unitPrice: da(100) }], ...input }),
      );
    await expect(buy({ supplierId: "nobody" })).rejects.toThrow("Choose the supplier.");
    await expect(buy({ lines: [] })).rejects.toThrow("A purchase needs at least one line.");
    await expect(buy({ date: "2026-10-13" })).rejects.toThrow("A purchase cannot be dated after today.");
    await expect(buy({ lines: [{ itemId: cleaner.id, qty: 0, unitPrice: da(100) }] })).rejects.toThrow(
      "A quantity must be more than zero.",
    );
    await expect(buy({ lines: [{ itemId: cleaner.id, qty: 1, unitPrice: -1 }] })).rejects.toThrow(
      "A price cannot be negative.",
    );
    await expect(buy({ lines: [{ itemId: "nothing", qty: 1, unitPrice: 1 }] })).rejects.toThrow(
      "This item does not exist.",
    );
    const supervisor = await test.sessionFor("SUPERVISOR");
    await expect(
      test.transact(
        (ex, ctx) => recordPurchase(ex, ctx, { ...base, lines: [{ itemId: cleaner.id, qty: 1, unitPrice: da(100) }] }),
        supervisor,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
    expect(await test.db.selectFrom("Purchase").select("id").execute()).toEqual([]);
    expect(await test.transact((ex, ctx) => listSuppliers(ex, ctx))).toEqual([
      { id: supplierId, name: "مؤسسة الصفاء لمواد التنظيف", phone: "032 44 55 66" },
    ]);
  });
});
