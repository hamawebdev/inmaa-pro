import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { BOOKS_ELSEWHERE } from "@/lib/sync/books";
import { localDate } from "@/lib/units";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import { centreReady, contractedFile, da } from "../testing/fixtures";

import { fileCredit } from "./credit";
import { getFileMoney } from "./debts";
import { getFilePaymentSummary, listFileDues, syncDues } from "./dues";
import { getInvoiceSheet, recordInvoicePrinted } from "./invoices";
import { recordPayment } from "./payments";

/**
 * Money across two laptops (coordinator's rulings on the books, DECISION
 * section 5): what prints on the laptop without the books, and a due cut
 * there that the books' laptop rebalances.
 */

let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

async function deviceOf(laptop: SyncLaptop): Promise<string> {
  const row = await laptop.test.db
    .selectFrom("SyncState")
    .select("value")
    .where("key", "=", "device")
    .executeTakeFirstOrThrow();
  return (JSON.parse(row.value) as { id: string }).id;
}

const printedEvents = (laptop: SyncLaptop, invoiceId: string) =>
  laptop.test.db
    .selectFrom("LegalEvent")
    .select("id")
    .where("invoiceId", "=", invoiceId)
    .where("type", "=", "PRINTED")
    .execute();

describe("an invoice printed on the laptop without the books", () => {
  it("is a copy: marked, no event on the legal chain, the print in that laptop's own log", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    const invoice = await a.test.rows.insert("Invoice", {
      issueDate: localDate("2026-10-12"),
      division: "BUILDING",
      serviceType: "CONTRACT",
      taxMode: "IFU",
      paymentMethod: "CASH",
      ifuMention: JSON.stringify({ ar: "غير خاضع للرسم على القيمة المضافة", fr: "Non assujetti à la TVA" }),
      sellerSnapshot: JSON.stringify({ nameAr: "مركز إنماء برو", city: "أم البواقي" }),
      buyerSnapshot: JSON.stringify({ name: "رشيد بوزيد", fileNumber: "12/BLC", siteAddress: "حي النصر" }),
    });
    const id = String(invoice.id);
    await pair.syncAll();

    const sheetOnB = await b.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: id }));
    expect(sheetOnB.invoice.copy).toBe(true);
    expect(await b.transact((ex, ctx) => recordInvoicePrinted(ex, ctx, { invoiceId: id, asCopy: true }))).toEqual({
      id,
      copy: true,
    });
    expect(await printedEvents(b, id)).toEqual([]);
    const disclosure = await b.test.db
      .selectFrom("AuditLog")
      .select(["operation", "chain", "context"])
      .where("entity", "=", "Invoice")
      .where("entityId", "=", id)
      .executeTakeFirstOrThrow();
    expect(disclosure).toEqual({
      operation: "DISCLOSE",
      chain: `AuditLog:${await deviceOf(b)}`,
      context: JSON.stringify({ copy: true }),
    });
    // An original is never asked for where the books are not.
    await expect(
      b.transact((ex, ctx) => recordInvoicePrinted(ex, ctx, { invoiceId: id, asCopy: false })),
    ).rejects.toThrow(BOOKS_ELSEWHERE);

    await pair.syncAll();
    // On the books' laptop it prints as the original, and is counted.
    const sheetOnA = await a.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: id }));
    expect(sheetOnA.invoice.copy).toBe(false);
    expect(await a.transact((ex, ctx) => recordInvoicePrinted(ex, ctx, { invoiceId: id, asCopy: false }))).toEqual({
      id,
      copy: false,
    });
    expect(await printedEvents(a, id)).toHaveLength(1);
    await pair.syncAll();
    pair.expectSame();
    for (const laptop of [a, b]) expect((await verifyChains(laptop.test.db)).ok).toBe(true);
  });
});

describe("a paid due cut on the laptop without the books", () => {
  it("waits, over its amount but never negative, until the books' laptop rebalances the file; both converge", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    await centreReady(a.test);
    const file = await contractedFile(a.test);
    const fileId = String(file.id);
    await a.transact((ex, ctx) => syncDues(ex, ctx, { fileId }));
    // November and December paid in advance, by transfer.
    await a.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId,
        receivedDate: "2026-10-12",
        method: "BANK_TRANSFER",
        reference: "VIR-0042",
        amount: da(90_000),
      }),
    );
    await pair.syncAll();

    // On the assistant's laptop the contract ends on 15 November: November is cut, December and January cancelled.
    await b.transact((ex) =>
      ex
        .updateTable("File")
        .set({ stage: "CONTRACT_ENDED", endedDate: "2026-11-15", endKind: "ENDED_BY_CLIENT" } as never)
        .where("id", "=", fileId)
        .execute(),
    );
    await b.transact((ex, ctx) => syncDues(ex, ctx, { fileId }));
    // Nothing moved on the legal chain there; the screens show nothing negative while it waits.
    const waiting = await b.transact((ex, ctx) => listFileDues(ex, ctx, { fileId }));
    expect(waiting.every((due) => due.remaining >= 0)).toBe(true);
    expect(waiting.every((due) => due.paidAmount <= Math.max(0, due.amount))).toBe(true);
    const fileMoney = await b.transact((ex, ctx) => getFileMoney(ex, ctx, { fileId }));
    // 90 000,00 paid; November now asks 22 500,00 (half the month), December nothing: 67 500,00 waits.
    expect(fileMoney.creditPending).toBe(da(90_000) - waiting[0].amount);
    const summary = await b.transact((ex, ctx) => getFilePaymentSummary(ex, ctx, { fileId }));
    expect(summary.remaining).toBeGreaterThanOrEqual(0);
    expect(summary.paid).toBeLessThanOrEqual(summary.amount);

    await pair.syncAll();
    pair.expectSame();
    for (const laptop of [a, b]) {
      const dues = await laptop.test.db
        .selectFrom("PaymentDue")
        .select(["amount", "paidAmount"])
        .where("fileId", "=", fileId)
        .orderBy("seq")
        .execute();
      expect(
        dues.every((due) => due.paidAmount <= Math.max(0, due.amount)),
        `${laptop.name} ${JSON.stringify(dues)}`,
      ).toBe(true);
      // Half of November is owed; the rest of the 90 000,00 is the file's credit.
      expect(await fileCredit(laptop.test.db, fileId)).toBe(da(90_000) - dues[0].amount);
      expect((await verifyChains(laptop.test.db)).ok).toBe(true);
      expect((await laptop.transact((ex, ctx) => getFileMoney(ex, ctx, { fileId }))).creditPending).toBe(0);
    }
  });
});
