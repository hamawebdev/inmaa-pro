import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import { stockItem, workerOnFile } from "../testing/fixtures";

import { createHandOut, recordHandOutReturn } from "./handouts";
import { getEquipmentIncidents, settleEquipmentCharge } from "./incidents";
import { createSupplier, recordPurchase } from "./purchases";

/**
 * An equipment charge settled on the laptop without the books (coordinator's
 * ruling): the manager's decision saves there and the charge reads as
 * settled; the books' laptop posts its debt lines, once, when it receives it.
 */

let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const ledgerOf = (laptop: SyncLaptop, staffId: string) =>
  laptop.test.db
    .selectFrom("StaffDebtEntry")
    .select(["seq", "direction", "reason", "amount", "balanceAfter"])
    .where("staffId", "=", staffId)
    .orderBy("seq")
    .execute();

describe("an equipment charge settled on the laptop without the books", () => {
  it("saves there, reads as settled, and is posted once on the books' laptop", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    // On the books' laptop: a worker given three buckets at 450,00, who brings back one lost and one broken.
    const worker = await workerOnFile(a.test);
    const staffId = String(worker.id);
    const buckets = await stockItem(a.test, {
      nameAr: "دلاء",
      kind: "EQUIPMENT",
      category: "TOOL",
      unit: "PIECE",
      openingQty: 0,
    });
    const { id: supplierId } = await a.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
    await a.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-12",
        supplierId,
        division: "COMMON",
        method: "CASH",
        lines: [{ itemId: buckets.id, qty: 4, unitPrice: 45_000 }],
      }),
    );
    const handOut = await a.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "WORKER_KIT",
        workerId: staffId,
        lines: [{ itemId: buckets.id, qty: 3, condition: "GOOD" }],
      }),
    );
    const [line] = await a.test.db.selectFrom("HandOutLine").select("id").where("handOutId", "=", handOut.id).execute();
    const back = await a.transact((ex, ctx) =>
      recordHandOutReturn(ex, ctx, {
        handOutLineId: line.id,
        date: "2026-10-12",
        qtyReturned: 1,
        condition: "GOOD",
        qtyLost: 1,
        qtyDamaged: 1,
        note: "سقط دلو من السطح وانكسر آخر",
      }),
    );
    await pair.syncAll();

    // On the assistant's laptop the manager charges 600,00 of the 900,00.
    await b.transact((ex, ctx) =>
      settleEquipmentCharge(ex, ctx, { handOutReturnId: back.id, amount: 60_000, reason: "إهمال جزئي" }),
    );
    expect(await ledgerOf(b, staffId)).toEqual([]);
    const [waiting] = await b.transact((ex, ctx) => getEquipmentIncidents(ex, ctx, { workerId: staffId }));
    expect(waiting).toMatchObject({ state: "CHARGED", charged: 60_000 });
    // Settled once, even while it waits.
    await expect(
      b.transact((ex, ctx) => settleEquipmentCharge(ex, ctx, { handOutReturnId: back.id, amount: 0, reason: "عفو" })),
    ).rejects.toThrow("This charge is already settled.");

    await pair.syncAll();
    await pair.syncAll();
    for (const laptop of [a, b]) {
      expect(await ledgerOf(laptop, staffId)).toEqual([
        { seq: 1, direction: "INCREASE", reason: "LOSS", amount: 45_000, balanceAfter: 45_000 },
        { seq: 2, direction: "INCREASE", reason: "DAMAGE", amount: 45_000, balanceAfter: 90_000 },
        { seq: 3, direction: "DECREASE", reason: "WRITTEN_OFF", amount: 30_000, balanceAfter: 60_000 },
      ]);
      const [settled] = await laptop.transact((ex, ctx) => getEquipmentIncidents(ex, ctx, { workerId: staffId }));
      expect(settled).toMatchObject({ state: "CHARGED", charged: 60_000 });
      expect((await verifyChains(laptop.test.db)).ok).toBe(true);
    }
    pair.expectSame();
  });
});
