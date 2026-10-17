import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { syncDues } from "./dues";
import { issueReceiptBatch, recordPayment } from "./payments";
import {
  closeReconciliation,
  countUnreconciledReceipts,
  declareReceipt,
  getReconciliationDay,
  listReconciliationDays,
} from "./reconciliation";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

/** A contract with its dues, and a worker who collects: on 3 December the office hands him a block of three. */
async function blockForAWorker() {
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  // Her card authorises her to collect (article 12, MON-09).
  const worker = await test.rows.insert("StaffMember", {
    kind: "WORKER",
    engagementStatus: "ACCEPTED",
    canCollectCash: 1,
  } as never);
  await openDay(test, "2026-12-03T08:00:00.000Z");
  const block = await test.transact((ex, ctx) =>
    issueReceiptBatch(ex, ctx, { count: 3, collectorKind: "WORKER", collectorStaffId: worker.id }),
  );
  return {
    file,
    worker,
    block,
    key: { date: "2026-12-03", collectorKind: "WORKER" as const, collectorStaffId: worker.id },
  };
}

describe("a collector's day", () => {
  it("is open while a receipt is blank, and the tile counts the blanks of days gone by", async () => {
    const { block, key } = await blockForAWorker();
    const day = await test.transact((ex, ctx) => getReconciliationDay(ex, ctx, key));
    expect(day).toMatchObject({ receipts: expect.any(Array), pending: 3, expectedCash: 0, closed: null });
    expect(day.receipts.map((receipt) => receipt.id)).toEqual(block.receiptIds);
    // Today the blanks are with the collector: nothing to say yet.
    expect(await test.transact((ex, ctx) => countUnreconciledReceipts(ex, ctx))).toBe(0);
    await openDay(test, "2026-12-04T08:00:00.000Z");
    expect(await test.transact((ex, ctx) => countUnreconciledReceipts(ex, ctx))).toBe(3);
  });

  it("is closed once each receipt is used, returned or missing, and the cash counted", async () => {
    const { file, worker, block, key } = await blockForAWorker();
    // The worker took 20 000,00 in cash on the first receipt; the office types it in from his copy.
    await test.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.id,
        receivedDate: "2026-12-03",
        method: "CASH",
        amount: da(20_000),
        receiptId: block.receiptIds[0],
        collectorKind: "WORKER",
        collectorStaffId: worker.id,
      }),
    );
    await expect(
      test.transact((ex, ctx) => closeReconciliation(ex, ctx, { ...key, countedCash: da(20_200) })),
    ).rejects.toThrow("Say what became of every receipt before closing the day.");
    await test.transact((ex, ctx) =>
      declareReceipt(ex, ctx, { receiptId: block.receiptIds[1], outcome: "VOIDED", reason: "أُرجع دون استعمال" }),
    );
    await test.transact((ex, ctx) =>
      declareReceipt(ex, ctx, { receiptId: block.receiptIds[2], outcome: "MISSING", reason: "ضاع في الطريق" }),
    );
    await expect(
      test.transact((ex, ctx) =>
        declareReceipt(ex, ctx, { receiptId: block.receiptIds[0], outcome: "VOIDED", reason: "خطأ" }),
      ),
    ).rejects.toThrow("This receipt was already used or voided.");

    const day = await test.transact((ex, ctx) => getReconciliationDay(ex, ctx, key));
    expect(day.receipts.map((receipt) => receipt.outcome)).toEqual(["USED", "VOIDED", "MISSING"]);
    // 20 000,00 and its stamp duty of 200,00.
    expect(day.expectedCash).toBe(da(20_200));

    // A missing receipt needs a word, even when the cash agrees.
    await expect(
      test.transact((ex, ctx) => closeReconciliation(ex, ctx, { ...key, countedCash: da(20_200) })),
    ).rejects.toThrow("Say why the cash differs or a receipt is missing.");
    const closed = await test.transact((ex, ctx) =>
      closeReconciliation(ex, ctx, { ...key, countedCash: da(20_000), note: "نقص 200 دج، والسند الثالث ضائع" }),
    );
    expect(closed.difference).toBe(-da(200));
    const row = await test.db
      .selectFrom("CashReconciliation")
      .selectAll()
      .where("id", "=", closed.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      receiptsIssued: 3,
      receiptsUsed: 1,
      receiptsVoided: 1,
      receiptsMissing: 1,
      expectedCash: da(20_200),
      countedCash: da(20_000),
      difference: -da(200),
    });
    const lines = await test.db
      .selectFrom("CashReconciliationLine")
      .select(["receiptId", "outcome"])
      .where("reconciliationId", "=", closed.id)
      .execute();
    expect(lines).toHaveLength(3);
    const batch = await test.db.selectFrom("ReceiptBatch").select("returnedAt").executeTakeFirstOrThrow();
    expect(batch.returnedAt).not.toBeNull();

    await expect(
      test.transact((ex, ctx) => closeReconciliation(ex, ctx, { ...key, countedCash: da(20_000) })),
    ).rejects.toThrow("This day is already closed.");
    // A correction points at the closing it corrects, once.
    const corrected = await test.transact((ex, ctx) =>
      closeReconciliation(ex, ctx, {
        ...key,
        countedCash: da(20_200),
        note: "وُجدت 200 دج في الدرج",
        corrects: closed.id,
      }),
    );
    const after = await test.transact((ex, ctx) => getReconciliationDay(ex, ctx, key));
    expect(after.closed).toMatchObject({ id: corrected.id, difference: 0 });
    expect(await test.transact((ex, ctx) => countUnreconciledReceipts(ex, ctx))).toBe(0);
    expect((await test.transact((ex) => verifyChains(ex))).ok).toBe(true);
  });

  it("lists the office's own day too, from the receipts written at the desk", async () => {
    const file = await contractedFile(test);
    for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    await openDay(test, "2026-12-03T09:00:00.000Z");
    await test.transact((ex, ctx) =>
      recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) }),
    );
    const days = await test.transact((ex, ctx) => listReconciliationDays(ex, ctx));
    expect(days).toMatchObject([
      { date: "2026-12-03", collectorKind: "OFFICE", collectorStaffId: null, pending: 0, expectedCash: da(45_675) },
    ]);
  });

  it("is closed by the accountant, not by reception", async () => {
    const { key } = await blockForAWorker();
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact((ex, ctx) => closeReconciliation(ex, ctx, { ...key, countedCash: 0, note: "-" }), reception),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});
