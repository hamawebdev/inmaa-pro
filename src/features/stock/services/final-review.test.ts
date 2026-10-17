import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { onHandOf, stockItem, workerOnFile } from "../testing/fixtures";

import { closeCount, getCount, openCount, saveCountLine } from "./counts";
import { createHandOut, recordHandOutReturn } from "./handouts";
import { getEquipmentIncidents, settleEquipmentCharge } from "./incidents";
import {
  bringUnitToStore,
  cancelMaintenanceRecord,
  listEquipmentUnits,
  listMaintenance,
  recordMaintenance,
  retireUnit,
  setMaintenancePlan,
} from "./maintenance";
import { cancelPurchase, createSupplier, recordPurchase } from "./purchases";
import { getFileHandOutSummary, getWorkerHoldings, listEquipmentToRecover } from "./recovery";

/**
 * The final independent review's findings on the store (snapshot e83d8dc), each proved by the test that
 * carries its id.
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** A building under contract with a visit today, a worker, and a store with floor cleaner and buckets. */
async function arrange() {
  const site = await test.rows.insert("Site", { division: "BUILDING", address: "حي النصر، عمارة B7" } as never);
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "BUILDING",
    serviceType: "CONTRACT",
    stage: "CONTRACTED",
    contractedAt: "2026-10-01T08:00:00.000Z",
  } as never);
  const visit = await test.rows.insert("Visit", {
    fileId: file.id,
    visitDate: "2026-10-12",
    status: "CONFIRMED",
  } as never);
  const worker = await workerOnFile(test);
  const cleaner = await stockItem(test);
  const buckets = await stockItem(test, {
    nameAr: "دلاء",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    openingQty: 3,
    minLevel: 1,
  });
  // A machine followed piece by piece, none in the store yet.
  const machines = await stockItem(test, {
    nameAr: "مكنسة كهربائية",
    kind: "EQUIPMENT",
    category: "MACHINE",
    unit: "PIECE",
    tracking: "UNIT",
    openingQty: 0,
    minLevel: 0,
  });
  return { file, visit, worker, cleaner, buckets, machines };
}

describe("a count left open while the store moves (MON-07)", () => {
  it("adjusts only what the shelf and the record disagree on, never a hand-out made meanwhile (MON-07)", async () => {
    const { file, visit, worker, cleaner } = await arrange();
    const count = await test.transact((ex, ctx) => openCount(ex, ctx, { kind: "MATERIAL" }));
    // While the count is open, 5 L go out to a job: the record says 25.
    await test.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "JOB",
        fileId: file.id,
        visitId: visit.id,
        workerId: worker.id,
        lines: [{ itemId: cleaner.id, qty: 5 }],
      }),
    );
    const sheet = await test.transact((ex, ctx) => getCount(ex, ctx, { countId: count.id }));
    for (const line of sheet.lines) {
      // The shelf, counted that afternoon: 25 L of cleaner, the rest as the record says.
      const onHand = await onHandOf(test, line.itemId);
      await test.transact((ex, ctx) => saveCountLine(ex, ctx, { lineId: line.id, countedQty: onHand / 1000 }));
    }
    const typed = await test.transact((ex, ctx) => getCount(ex, ctx, { countId: count.id }));
    expect(typed.lines.find((line) => line.itemId === cleaner.id)).toMatchObject({
      systemQty: 25_000,
      countedQty: 25_000,
      difference: 0,
    });
    expect(await test.transact((ex, ctx) => closeCount(ex, ctx, { countId: count.id }))).toMatchObject({ adjusted: 0 });
    expect(await onHandOf(test, cleaner.id)).toBe(25_000);
  });
});

describe("a purchase or a maintenance typed wrong is cancelled, its expense reversed (MON-08)", () => {
  const liveExpenses = async (column: "purchaseId" | "maintenanceRecordId", id: string) =>
    (
      await test.db
        .selectFrom("Expense")
        .select(["date", "category", "amount"])
        .where(column, "=", id)
        .where("deletedAt", "is", null)
        .orderBy("createdAt")
        .execute()
    ).map((row) => [row.date, row.category, row.amount]);

  it("takes a mistyped purchase back out of the store, restores the average cost and reverses its expense (MON-08)", async () => {
    const { cleaner, machines } = await arrange();
    const { id: supplierId } = await test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
    const avgBefore = (
      await test.db.selectFrom("StockItem").select("avgCost").where("id", "=", cleaner.id).executeTakeFirstOrThrow()
    ).avgCost;
    // 10 L at 1 200 000,00 instead of 12 000,00: a slipped key. And two machines.
    const wrong = await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-12",
        supplierId,
        division: "BUILDING",
        method: "CASH",
        lines: [
          { itemId: cleaner.id, qty: 10, unitPrice: 120_000_000 },
          { itemId: machines.id, qty: 2, unitPrice: 45_000 },
        ],
      }),
    );
    expect(await onHandOf(test, cleaner.id)).toBe(40_000);
    const storeman = await test.sessionFor("OPERATIONS");
    await test.transact(
      (ex, ctx) => cancelPurchase(ex, ctx, { purchaseId: wrong.id, reason: "خطأ في سعر الوحدة" }),
      storeman,
    );

    expect(await onHandOf(test, cleaner.id)).toBe(30_000);
    expect(await onHandOf(test, machines.id)).toBe(0);
    const after = await test.db
      .selectFrom("StockItem")
      .select("avgCost")
      .where("id", "=", cleaner.id)
      .executeTakeFirstOrThrow();
    expect(after.avgCost).toBe(avgBefore);
    // The pieces it made are retired; the expense stays, with its opposite beside it, on the purchase's day.
    const pieces = await test.db
      .selectFrom("EquipmentUnit")
      .select(["retiredAt", "retireReason"])
      .where("supplierId", "=", supplierId)
      .execute();
    expect(pieces).toHaveLength(2);
    expect(pieces.every((piece) => piece.retiredAt !== null && piece.retireReason === "PURCHASE_CANCELLED")).toBe(true);
    expect(await liveExpenses("purchaseId", wrong.id)).toEqual([
      ["2026-10-12", "MATERIALS", 1_200_000_000],
      ["2026-10-12", "EQUIPMENT", 90_000],
      ["2026-10-12", "MATERIALS", -1_200_000_000],
      ["2026-10-12", "EQUIPMENT", -90_000],
    ]);
    const row = await test.db.selectFrom("Purchase").selectAll().where("id", "=", wrong.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ cancelReason: "خطأ في سعر الوحدة" });
    await expect(
      test.transact((ex, ctx) => cancelPurchase(ex, ctx, { purchaseId: wrong.id, reason: "مرة أخرى" })),
    ).rejects.toThrow("This purchase is already cancelled.");
  });

  it("refuses to cancel a purchase part of which has left the store (MON-08)", async () => {
    const { file, visit, worker, cleaner } = await arrange();
    const { id: supplierId } = await test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
    const bought = await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-12",
        supplierId,
        method: "CASH",
        lines: [{ itemId: cleaner.id, qty: 10, unitPrice: 12_000 }],
      }),
    );
    await test.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "JOB",
        fileId: file.id,
        visitId: visit.id,
        workerId: worker.id,
        lines: [{ itemId: cleaner.id, qty: 35 }],
      }),
    );
    await expect(
      test.transact((ex, ctx) => cancelPurchase(ex, ctx, { purchaseId: bought.id, reason: "خطأ" })),
    ).rejects.toThrow("Part of this purchase has already left the store: it cannot be cancelled.");
  });

  it("reverses a mistyped maintenance cost, and puts the piece back on its record before (MON-08)", async () => {
    const { machines: buckets } = await arrange();
    const { id: supplierId } = await test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
    await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-01",
        supplierId,
        method: "CASH",
        lines: [{ itemId: buckets.id, qty: 1, unitPrice: 45_000 }],
      }),
    );
    const unit = await test.db
      .selectFrom("EquipmentUnit")
      .select("id")
      .where("supplierId", "=", supplierId)
      .executeTakeFirstOrThrow();
    await test.transact((ex, ctx) => setMaintenancePlan(ex, ctx, { unitId: unit.id, intervalDays: 30 }));
    await test.transact((ex, ctx) =>
      recordMaintenance(ex, ctx, {
        unitId: unit.id,
        date: "2026-10-05",
        kind: "PREVENTIVE",
        description: "تنظيف",
        cost: 0,
        conditionAfter: "GOOD",
      }),
    );
    const wrong = await test.transact((ex, ctx) =>
      recordMaintenance(ex, ctx, {
        unitId: unit.id,
        date: "2026-10-12",
        kind: "REPAIR",
        description: "تغيير المقبض",
        cost: 500_000_00,
        conditionAfter: "NEEDS_MAINTENANCE",
      }),
    );
    await test.transact((ex, ctx) => cancelMaintenanceRecord(ex, ctx, { recordId: wrong.id, reason: "المبلغ خاطئ" }));
    expect(await liveExpenses("maintenanceRecordId", wrong.id)).toEqual([
      ["2026-10-12", "MAINTENANCE", 500_000_00],
      ["2026-10-12", "MAINTENANCE", -500_000_00],
    ]);
    const piece = await test.db
      .selectFrom("EquipmentUnit")
      .selectAll()
      .where("id", "=", unit.id)
      .executeTakeFirstOrThrow();
    expect(piece).toMatchObject({
      lastMaintenanceDate: "2026-10-05",
      nextMaintenanceDate: "2026-11-04",
      condition: "GOOD",
    });
    const history = await test.transact((ex, ctx) => listMaintenance(ex, ctx, { unitId: unit.id }));
    expect(history.map((line) => [line.date, line.cancelled])).toEqual([
      ["2026-10-12", true],
      ["2026-10-05", false],
    ]);
    await expect(
      test.transact((ex, ctx) => cancelMaintenanceRecord(ex, ctx, { recordId: wrong.id, reason: "مرة أخرى" })),
    ).rejects.toThrow("This maintenance record is already cancelled.");
    const marked = await test.db
      .selectFrom("MaintenanceRecord")
      .select(["cancelReason", "cancelledAt"])
      .where("id", "=", wrong.id)
      .executeTakeFirstOrThrow();
    expect(marked.cancelReason).toBe("المبلغ خاطئ");
    expect(marked.cancelledAt).not.toBeNull();
  });

  it("cancels a maintenance that cost nothing too: marked, no expense, the piece back on its record before (MON-08)", async () => {
    const { machines } = await arrange();
    const { id: supplierId } = await test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
    await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-01",
        supplierId,
        method: "CASH",
        lines: [{ itemId: machines.id, qty: 1, unitPrice: 45_000 }],
      }),
    );
    const unit = await test.db
      .selectFrom("EquipmentUnit")
      .select("id")
      .where("supplierId", "=", supplierId)
      .executeTakeFirstOrThrow();
    await test.transact((ex, ctx) => setMaintenancePlan(ex, ctx, { unitId: unit.id, intervalDays: 30 }));
    const wrong = await test.transact((ex, ctx) =>
      recordMaintenance(ex, ctx, {
        unitId: unit.id,
        date: "2026-10-12",
        kind: "PREVENTIVE",
        description: "تنظيف داخلي",
        cost: 0,
        conditionAfter: "GOOD",
      }),
    );
    await expect(
      test.transact((ex, ctx) => cancelMaintenanceRecord(ex, ctx, { recordId: wrong.id, reason: "  " })),
    ).rejects.toThrow("A reason is required.");
    await test.transact((ex, ctx) =>
      cancelMaintenanceRecord(ex, ctx, { recordId: wrong.id, reason: "سُجّلت لقطعة أخرى" }),
    );
    expect(await liveExpenses("maintenanceRecordId", wrong.id)).toEqual([]);
    const piece = await test.db
      .selectFrom("EquipmentUnit")
      .selectAll()
      .where("id", "=", unit.id)
      .executeTakeFirstOrThrow();
    expect(piece).toMatchObject({ lastMaintenanceDate: null, nextMaintenanceDate: "2026-10-31" });
    const [line] = await test.transact((ex, ctx) => listMaintenance(ex, ctx, { unitId: unit.id }));
    expect(line).toMatchObject({ id: wrong.id, cancelled: true });
  });
});

describe("a charge the manager waives (MON-10)", () => {
  it("leaves the worker owing nothing, the incident and its waiver both on her ledger (MON-10)", async () => {
    const { worker, buckets } = await arrange();
    await test.db
      .updateTable("StockItem")
      .set({ avgCost: 45_000 } as never)
      .where("id", "=", buckets.id)
      .execute();
    const kit = await test.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "WORKER_KIT",
        workerId: worker.id,
        lines: [{ itemId: buckets.id, qty: 1, condition: "GOOD" }],
      }),
    );
    const [line] = await test.db.selectFrom("HandOutLine").select("id").where("handOutId", "=", kit.id).execute();
    const back = await test.transact((ex, ctx) =>
      recordHandOutReturn(ex, ctx, {
        handOutLineId: line.id,
        date: "2026-10-12",
        qtyReturned: 0,
        qtyDamaged: 1,
        note: "انكسر المقبض",
      }),
    );
    await test.transact((ex, ctx) =>
      settleEquipmentCharge(ex, ctx, { handOutReturnId: back.id, amount: 0, reason: "تآكل عادي" }),
    );
    const ledger = await test.db
      .selectFrom("StaffDebtEntry")
      .select(["direction", "reason", "amount", "balanceAfter"])
      .where("staffId", "=", worker.id)
      .orderBy("seq")
      .execute();
    expect(ledger).toEqual([
      { direction: "INCREASE", reason: "DAMAGE", amount: 45_000, balanceAfter: 45_000 },
      { direction: "DECREASE", reason: "WRITTEN_OFF", amount: 45_000, balanceAfter: 0 },
    ]);
    const [incident] = await test.transact((ex, ctx) => getEquipmentIncidents(ex, ctx, { workerId: worker.id }));
    expect(incident).toMatchObject({ state: "WAIVED", charged: 0 });
  });
});

describe("a piece of equipment lost, or out of service for good (MON-14)", () => {
  async function pieceWithWorker() {
    const { worker, machines: buckets } = await arrange();
    const { id: supplierId } = await test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
    await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-01",
        supplierId,
        method: "CASH",
        lines: [{ itemId: buckets.id, qty: 1, unitPrice: 45_000 }],
      }),
    );
    const unit = await test.db
      .selectFrom("EquipmentUnit")
      .select("id")
      .where("supplierId", "=", supplierId)
      .executeTakeFirstOrThrow();
    // Due for service in two days: the maintenance tile would count it.
    await test.transact((ex, ctx) =>
      setMaintenancePlan(ex, ctx, { unitId: unit.id, intervalDays: 30, nextDate: "2026-10-14" }),
    );
    const kit = await test.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "WORKER_KIT",
        workerId: worker.id,
        lines: [{ itemId: buckets.id, unitId: unit.id, qty: 1, condition: "GOOD" }],
      }),
    );
    const [line] = await test.db.selectFrom("HandOutLine").select("id").where("handOutId", "=", kit.id).execute();
    return { unit, line };
  }

  it("retires a piece declared lost on its return: off the list and off the maintenance tile (MON-14)", async () => {
    const { unit, line } = await pieceWithWorker();
    await test.transact((ex, ctx) =>
      recordHandOutReturn(ex, ctx, {
        handOutLineId: line.id,
        date: "2026-10-12",
        qtyReturned: 0,
        qtyLost: 1,
        note: "ضاعت في الموقع",
      }),
    );
    const piece = await test.db
      .selectFrom("EquipmentUnit")
      .selectAll()
      .where("id", "=", unit.id)
      .executeTakeFirstOrThrow();
    expect(piece).toMatchObject({ retireReason: "LOST" });
    expect(piece.retiredAt).not.toBeNull();
    const units = await test.transact((ex, ctx) => listEquipmentUnits(ex, ctx));
    expect(units.some((row) => row.id === unit.id)).toBe(false);
  });

  it("brings back to the store a damaged piece left with the worker, or retires it with a reason (MON-14)", async () => {
    const { unit, line } = await pieceWithWorker();
    await expect(
      test.transact((ex, ctx) => bringUnitToStore(ex, ctx, { unitId: unit.id, reason: "وُجدت" })),
    ).rejects.toThrow("A hand-out still expects this piece back: record its return on the hand-out.");
    await test.transact((ex, ctx) =>
      recordHandOutReturn(ex, ctx, {
        handOutLineId: line.id,
        date: "2026-10-12",
        qtyReturned: 0,
        qtyDamaged: 1,
        note: "انكسرت",
      }),
    );
    const stockBefore = await onHandOf(
      test,
      (await test.db.selectFrom("EquipmentUnit").select("itemId").where("id", "=", unit.id).executeTakeFirstOrThrow())
        .itemId,
    );
    await test.transact((ex, ctx) => bringUnitToStore(ex, ctx, { unitId: unit.id, reason: "أعادتها العاملة للتصليح" }));
    const piece = await test.db
      .selectFrom("EquipmentUnit")
      .selectAll()
      .where("id", "=", unit.id)
      .executeTakeFirstOrThrow();
    expect(piece).toMatchObject({ locationKind: "STORE", locationWorkerId: null, condition: "NEEDS_MAINTENANCE" });
    expect(await onHandOf(test, piece.itemId)).toBe(stockBefore + 1_000);

    await test.transact((ex, ctx) => retireUnit(ex, ctx, { unitId: unit.id, reason: "لا تُصلح" }));
    expect(await onHandOf(test, piece.itemId)).toBe(stockBefore);
    const units = await test.transact((ex, ctx) => listEquipmentUnits(ex, ctx));
    expect(units.some((row) => row.id === unit.id)).toBe(false);
  });
});

describe("equipment to bring back when a contract ends or a worker leaves (INT-8, MON-13)", () => {
  it("lists what an ended contract and a leaver still hold, never a renewed contract's (INT-8, MON-13)", async () => {
    const { file, visit, worker, buckets } = await arrange();
    const kit = await workerOnFile(test);
    await test.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "JOB",
        fileId: file.id,
        visitId: visit.id,
        workerId: worker.id,
        lines: [{ itemId: buckets.id, qty: 1, condition: "GOOD" }],
      }),
    );
    await test.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "WORKER_KIT",
        workerId: kit.id,
        lines: [{ itemId: buckets.id, qty: 1, condition: "GOOD" }],
      }),
    );
    expect(await test.transact((ex, ctx) => listEquipmentToRecover(ex, ctx))).toEqual([]);

    // The contract was renewed: its equipment stays where it is.
    await test.db
      .updateTable("File")
      .set({ stage: "CONTRACT_ENDED", endedDate: "2026-10-12", endKind: "RENEWED" } as never)
      .where("id", "=", file.id)
      .execute();
    expect(await test.transact((ex, ctx) => listEquipmentToRecover(ex, ctx))).toEqual([]);
    // Ended without renewal, and the kit's worker has left.
    await test.db
      .updateTable("File")
      .set({ endKind: "EXPIRED" } as never)
      .where("id", "=", file.id)
      .execute();
    await test.db
      .updateTable("StaffMember")
      .set({ engagementStatus: "LEFT" } as never)
      .where("id", "=", kit.id)
      .execute();
    const toRecover = await test.transact((ex, ctx) => listEquipmentToRecover(ex, ctx));
    expect(toRecover.map((row) => [row.why, row.workerId, row.fileId, row.qty])).toEqual([
      ["CONTRACT_ENDED", worker.id, file.id, 1_000],
      ["WORKER_LEFT", kit.id, null, 1_000],
    ]);

    const summary = await test.transact((ex, ctx) => getFileHandOutSummary(ex, ctx, { fileId: file.id }));
    expect(summary).toEqual({ handOuts: 1, equipmentOut: 1, atSite: 0 });
    const holdings = await test.transact((ex, ctx) => getWorkerHoldings(ex, ctx, { workerId: kit.id }));
    expect(holdings.equipment).toHaveLength(1);
    expect(holdings.receiptBlocks).toEqual([]);
  });
});
