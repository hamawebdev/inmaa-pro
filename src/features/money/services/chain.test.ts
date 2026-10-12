import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonical, genesisHash, invoiceContentDigest, sha256Hex, verifyChains } from "@/lib/chain";
import { createTestDatabase, TEST_DATABASE_ID, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { syncDues } from "./dues";
import { issueInvoice, voidInvoice } from "./invoices";
import { recordPayment } from "./payments";

/**
 * What Money's legal records promise, checked on what Money's own services
 * write: every invoice, line, visit row, payment, allocation, receipt and
 * event goes through Foundation's chain (src/lib/chain), so a row changed or
 * removed afterwards is found.
 *
 * The reference hashes were computed outside this program (Python's hashlib),
 * so two independent implementations are compared. To tamper, a test drops the
 * trigger that would refuse it: what somebody with the database file and a
 * tool could do, and what the chain is for.
 */

/** sha256("GENESIS\n00000000-0000-4000-8000-000000000001\nInvoice"), computed outside. */
const GENESIS_INVOICE = "e200764b2a197823b3997666234c0bb9a035b7a4a14dd25e630cd7041447545f";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

/** Two months invoiced (November and December), November paid in cash. */
async function history() {
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  for (const date of ["2026-12-01", "2026-12-08"]) await visitOn(test, file.id, date);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  const dues = await test.db
    .selectFrom("PaymentDue")
    .select("id")
    .where("fileId", "=", file.id)
    .orderBy("seq")
    .execute();

  await openDay(test, "2026-12-01T08:00:00.000Z");
  const november = await test.transact((ex, ctx) =>
    issueInvoice(ex, ctx, { fileId: file.id, dueIds: [dues[0].id], paymentMethod: "CASH" }),
  );
  await openDay(test, "2026-12-03T09:00:00.000Z");
  const payment = await test.transact((ex, ctx) =>
    recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) }),
  );
  await openDay(test, "2027-01-02T08:00:00.000Z");
  const december = await test.transact((ex, ctx) =>
    issueInvoice(ex, ctx, { fileId: file.id, dueIds: [dues[1].id], paymentMethod: "BANK_TRANSFER" }),
  );
  return { file, november, december, payment, dueIds: dues.map((due) => due.id) };
}

/** 45 000,00 made 44 000,00 on every column that carries it: the stamp stays, the net follows. */
const LOWER_AMOUNT = `"grossAmount" = 4400000, "totalHT" = 4400000, "totalTTC" = 4400000, "netToPay" = 4467500`;

const chainOf = async (table: Parameters<typeof canonical>[0]) =>
  (await verifyChains(test.db)).chains.find((chain) => chain.table === table);

describe("the hashes, against values computed outside the program", () => {
  it("SHA-256 matches the published vectors, and hashes Arabic as its UTF-8 bytes", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex("فاتورة")).toBe("46d160ab502a0622eca25abfef41b6b14dceabfe8cdd5f47eedc2f295987ffcd");
  });

  it("each table's chain starts from its own genesis, which depends on the database", async () => {
    expect(await genesisHash(TEST_DATABASE_ID, "Invoice")).toBe(GENESIS_INVOICE);
    expect(await genesisHash(TEST_DATABASE_ID, "Payment")).not.toBe(GENESIS_INVOICE);
    expect(await genesisHash("00000000-0000-4000-8000-000000000002", "Invoice")).not.toBe(GENESIS_INVOICE);
  });
});

describe("what the services write", () => {
  it("the first invoice follows the genesis, the second follows the first, by the stated formula", async () => {
    await history();
    const invoices = await test.db.selectFrom("Invoice").selectAll().orderBy("chainSeq").execute();
    expect(invoices.map((invoice) => [invoice.chainSeq, invoice.number])).toEqual([
      [1, "000001/2026"],
      [2, "000001/2027"],
    ]);
    expect(invoices[0].prevHash).toBe(GENESIS_INVOICE);
    expect(invoices[1].prevHash).toBe(invoices[0].hash);
    for (const invoice of invoices) {
      // hash = sha256( prevHash + "\n" + table + "\n" + canonical(row) )
      expect(invoice.hash).toBe(
        await sha256Hex(`${invoice.prevHash}\nInvoice\n${canonical("Invoice", invoice.hashV, invoice)}`),
      );
    }
    // The canonical text: keys in ASCII order, values as stored, an empty column as null, no white space.
    const text = canonical("Invoice", invoices[0].hashV, invoices[0]);
    expect(text.startsWith('{"amountWordsAr":"')).toBe(true);
    expect(text).toContain('"note":null');
    expect(text).toContain('"totalTTC":4500000');
    expect(text).not.toContain('"hash":');
    expect(text).not.toMatch(/:\s|,\s"/);
  });

  it("an invoice commits to its lines and visit rows: the digest is the SHA-256 of their text", async () => {
    const { november } = await history();
    const invoice = await test.db
      .selectFrom("Invoice")
      .selectAll()
      .where("id", "=", november.id)
      .executeTakeFirstOrThrow();
    const lines = await test.db.selectFrom("InvoiceLine").selectAll().where("invoiceId", "=", november.id).execute();
    const visits = await test.db.selectFrom("InvoiceVisit").selectAll().where("invoiceId", "=", november.id).execute();
    expect(visits).toHaveLength(4);
    expect(await invoiceContentDigest({ lines, visits })).toBe(invoice.contentDigest);

    // The same text, built here by hand: each row without what it only has once chained.
    const LEFT_OUT = new Set(["id", "invoiceId", "chainSeq", "prevHash", "hash", "createdAt"]);
    const textOf = (row: Record<string, unknown>) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row)
            .filter(([key]) => !LEFT_OUT.has(key))
            .sort(([a], [b]) => (a < b ? -1 : 1)),
        ),
      );
    const bySeq = <T extends { seq: number }>(rows: T[]) => [...rows].sort((a, b) => a.seq - b.seq);
    const byHand = `{"lines":[${bySeq(lines).map(textOf).join(",")}],"visits":[${bySeq(visits).map(textOf).join(",")}]}`;
    expect(await sha256Hex(byHand)).toBe(invoice.contentDigest);

    // It moves when a visit's billing is flipped, and when a line is dropped.
    const flipped = visits.map((row, index) => (index === 0 ? { ...row, billable: 0 } : row));
    expect(await invoiceContentDigest({ lines, visits: flipped })).not.toBe(invoice.contentDigest);
    expect(await invoiceContentDigest({ lines: [], visits })).not.toBe(invoice.contentDigest);
  });

  it("verifies whole: chains, digests, both legal sequences and the cached totals", async () => {
    await history();
    expect(await verifyChains(test.db)).toMatchObject({
      ok: true,
      brokenDigests: [],
      missingNumbers: [],
      brokenTotals: [],
    });
  });
});

describe("tampering is found", () => {
  it("an amount changed in an old invoice", async () => {
    const { november } = await history();
    test.raw.exec(`DROP TRIGGER "Invoice_no_update"`);
    // Changed with care, so that the table's own sums still hold: only the chain can tell.
    test.raw.prepare(`UPDATE "Invoice" SET ${LOWER_AMOUNT} WHERE "id" = ?`).run(november.id);
    expect(await chainOf("Invoice")).toMatchObject({ firstBroken: 1, problem: "its content was changed" });
    expect((await verifyChains(test.db)).ok).toBe(false);
  });

  it("a single character changed in a text, and an empty column filled in afterwards", async () => {
    const { november, december } = await history();
    test.raw.exec(`DROP TRIGGER "Invoice_no_update"`);
    test.raw.prepare(`UPDATE "Invoice" SET "note" = 'x' WHERE "id" = ?`).run(december.id);
    expect(await chainOf("Invoice")).toMatchObject({ firstBroken: 2, problem: "its content was changed" });
    test.raw.prepare(`UPDATE "Invoice" SET "amountWordsAr" = "amountWordsAr" || ' ' WHERE "id" = ?`).run(november.id);
    expect(await chainOf("Invoice")).toMatchObject({ firstBroken: 1 });
  });

  it("an amount changed and the row's own hash recomputed to hide it: the next row no longer follows", async () => {
    const { november } = await history();
    test.raw.exec(`DROP TRIGGER "Invoice_no_update"`);
    const invoice = await test.db
      .selectFrom("Invoice")
      .selectAll()
      .where("id", "=", november.id)
      .executeTakeFirstOrThrow();
    const forged = {
      ...invoice,
      grossAmount: 4_400_000,
      totalHT: 4_400_000,
      totalTTC: 4_400_000,
      netToPay: 4_467_500,
    };
    const hash = await sha256Hex(`${forged.prevHash}\nInvoice\n${canonical("Invoice", forged.hashV, forged)}`);
    test.raw.prepare(`UPDATE "Invoice" SET ${LOWER_AMOUNT}, "hash" = ? WHERE "id" = ?`).run(hash, november.id);
    expect(await chainOf("Invoice")).toMatchObject({
      firstBroken: 2,
      problem: "it does not follow the row before it",
    });
  });

  it("a line changed after the invoice was issued: its chain breaks, and the invoice no longer commits to it", async () => {
    const { november } = await history();
    test.raw.exec(`DROP TRIGGER "InvoiceLine_no_update"`);
    test.raw.prepare(`UPDATE "InvoiceLine" SET "amount" = 4000000 WHERE "invoiceId" = ?`).run(november.id);
    const report = await verifyChains(test.db);
    expect(report.chains.find((chain) => chain.table === "InvoiceLine")).toMatchObject({ firstBroken: 1 });
    expect(report.brokenDigests).toEqual(["000001/2026"]);
  });

  it("a visit row removed from a statement", async () => {
    const { november } = await history();
    test.raw.exec(`DROP TRIGGER "InvoiceVisit_no_delete"`);
    test.raw.prepare(`DELETE FROM "InvoiceVisit" WHERE "invoiceId" = ? AND "seq" = 2`).run(november.id);
    const report = await verifyChains(test.db);
    expect(report.chains.find((chain) => chain.table === "InvoiceVisit")).toMatchObject({
      firstBroken: 3,
      problem: "a row is missing before it",
    });
    expect(report.brokenDigests).toEqual(["000001/2026"]);
  });

  it("the last invoice removed: its number is missing from the sequence, and the head is not its last row", async () => {
    const { december } = await history();
    for (const trigger of ["Invoice_no_delete", "InvoiceLine_no_delete", "InvoiceVisit_no_delete"]) {
      test.raw.exec(`DROP TRIGGER "${trigger}"`);
    }
    test.raw.exec("PRAGMA foreign_keys = OFF");
    test.raw.prepare(`DELETE FROM "Invoice" WHERE "id" = ?`).run(december.id);
    test.raw.exec("PRAGMA foreign_keys = ON");
    const report = await verifyChains(test.db);
    expect(report.chains.find((chain) => chain.table === "Invoice")).toMatchObject({
      firstBroken: 2,
      problem: "the head of the chain does not match its last row",
    });
    expect(report.missingNumbers).toEqual(["INVOICE 2027: 1"]);
  });

  it("a payment's amount changed, and what a due was paid edited by hand", async () => {
    const { payment, dueIds } = await history();
    test.raw.exec(`DROP TRIGGER "Payment_no_update"`);
    test.raw
      .prepare(`UPDATE "Payment" SET "amount" = 4000000, "totalReceived" = 4067500 WHERE "id" = ?`)
      .run(payment.id);
    expect(await chainOf("Payment")).toMatchObject({ firstBroken: 1, problem: "its content was changed" });

    // The cached total is guarded: a hand that sets it is refused...
    expect(() => test.raw.prepare(`UPDATE "PaymentDue" SET "paidAmount" = 0 WHERE "id" = ?`).run(dueIds[0])).toThrow(
      "CACHE:PaymentDue:paidAmount",
    );
    // ...and when the guard itself is dropped, the totals no longer add up.
    test.raw.exec(`DROP TRIGGER "PaymentDue_paid_guard"`);
    test.raw.prepare(`UPDATE "PaymentDue" SET "paidAmount" = 0 WHERE "id" = ?`).run(dueIds[0]);
    expect((await verifyChains(test.db)).brokenTotals).toEqual([`PaymentDue ${dueIds[0]}`]);
  });

  it("a void erased: the invoice would read as valid again", async () => {
    const { november } = await history();
    await test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: november.id, reason: "خطأ في المبلغ" }));
    expect((await verifyChains(test.db)).ok).toBe(true);
    test.raw.exec(`DROP TRIGGER "LegalEvent_no_delete"`);
    test.raw.prepare(`DELETE FROM "LegalEvent" WHERE "invoiceId" = ? AND "type" = 'VOIDED'`).run(november.id);
    expect(await chainOf("LegalEvent")).toMatchObject({
      firstBroken: 1,
      problem: "the head of the chain does not match its last row",
    });
  });

  it("is refused by the database itself while its rules stand", async () => {
    const { november, payment } = await history();
    expect(() => test.raw.prepare(`UPDATE "Invoice" SET "totalTTC" = 1 WHERE "id" = ?`).run(november.id)).toThrow(
      "APPEND_ONLY",
    );
    expect(() => test.raw.prepare(`DELETE FROM "Payment" WHERE "id" = ?`).run(payment.id)).toThrow("APPEND_ONLY");
    expect(() =>
      test.raw.prepare(`UPDATE "InvoiceLine" SET "amount" = 1 WHERE "invoiceId" = ?`).run(november.id),
    ).toThrow("APPEND_ONLY");
  });
});
