import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CHAIN_COLUMNS, CHAINED_TABLES, CURRENT_HASH_VERSION, type ChainedTable } from "@/lib/db/chain-columns";
import type { TableName } from "@/lib/db/column-meta";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { appendChained, invoiceContentDigest, readChainHeads, verifyChains } from "./index";

/**
 * Append-only and the hash chains: BUILD-NOTES section 6 B, on a database
 * built from the real migrations, through the one writer of the chains.
 */
let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

const APPEND_ONLY: readonly TableName[] = [
  "SequenceGap",
  "StaffEvent",
  "StaffDebtEntry",
  "FileStageEvent",
  "CashReconciliation",
  "CashReconciliationLine",
  "ExportBatch",
  "StockMovement",
  "HandOutLine",
  "HandOutReturn",
  "PurchaseLine",
];

const bind = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? BigInt(value) : value);

/** Runs one raw statement and returns the database's refusal, or null when it was accepted. */
function refusal(statement: string, ...params: unknown[]): string | null {
  try {
    test.raw.prepare(statement).run(...(params.map(bind) as never[]));
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** An invoice with one line and one visit row, its digest computed before anything is written, as Money will. */
function invoiceWithContent() {
  return test.transact(async (ex, ctx) => {
    const at = { ex, ctx };
    const invoiceId = "invoice-with-content";
    const line = {
      ...(await test.rows.fill(
        "InvoiceLine",
        { invoiceId, seq: 1, quantity: 2, unitPrice: 1_500_000, amount: 3_000_000 },
        at,
      )),
      id: "line-1",
    };
    const visit = { ...(await test.rows.fill("InvoiceVisit", { invoiceId, seq: 1 }, at)), id: "visit-row-1" };
    const contentDigest = await invoiceContentDigest({ lines: [line], visits: [visit] });
    const invoice = await test.rows.insert("Invoice", { id: invoiceId, contentDigest }, at);
    await appendChained(ex, ctx, "InvoiceLine", line);
    await appendChained(ex, ctx, "InvoiceVisit", visit);
    return invoice;
  });
}

function rawInsert(table: string, row: Record<string, unknown>): string | null {
  const columns = Object.keys(row);
  return refusal(
    `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    ...columns.map((column) => row[column]),
  );
}

describe("append-only tables (B1)", () => {
  it.each([...CHAINED_TABLES, ...APPEND_ONLY])("%s refuses UPDATE, DELETE and INSERT OR REPLACE", async (table) => {
    const row = await test.rows.insert(table as TableName);
    const id = (row as { id: string }).id;
    const before = test.raw.prepare(`SELECT * FROM "${table}" WHERE "id" = ?`).get(id);

    expect(refusal(`UPDATE "${table}" SET "createdAt" = "createdAt" WHERE "id" = ?`, id)).toMatch(
      new RegExp(`^APPEND_ONLY:${table}:update`),
    );
    expect(refusal(`DELETE FROM "${table}" WHERE "id" = ?`, id)).toMatch(new RegExp(`^APPEND_ONLY:${table}:delete`));
    // recursive_triggers is on, so the delete that REPLACE does fires the delete trigger.
    expect(refusal(`INSERT OR REPLACE INTO "${table}" SELECT * FROM "${table}" WHERE "id" = ?`, id)).toMatch(
      /^(APPEND_ONLY|CHAIN|LEDGER|LEGAL_SEQUENCE):/,
    );
    expect(test.raw.prepare(`SELECT * FROM "${table}" WHERE "id" = ?`).get(id)).toEqual(before);
  });
});

describe("the chains (B2 to B6)", () => {
  it("refuses a row out of sequence; the head follows each row and cannot be rewound or deleted (B2)", async () => {
    const first = await test.rows.insert("LegalEvent");
    expect((await readChainHeads(test.db)).LegalEvent).toEqual({ seq: 1, hash: first.hash });

    const row = {
      ...(await test.rows.fill("LegalEvent")),
      id: "forged",
      hashV: 1,
      chainSeq: 2,
      prevHash: first.hash,
      hash: "a".repeat(64),
    };
    expect(rawInsert("LegalEvent", { ...row, chainSeq: 3 })).toMatch(/^CHAIN:LegalEvent:out_of_sequence/);
    expect(rawInsert("LegalEvent", { ...row, prevHash: "b".repeat(64) })).toMatch(/^CHAIN:LegalEvent:out_of_sequence/);
    expect(rawInsert("LegalEvent", { ...row, hash: "short" })).toMatch(/^CHAIN:LegalEvent:out_of_sequence/);
    expect(refusal(`UPDATE "ChainHead" SET "lastSeq" = 0 WHERE "id" = 'LegalEvent'`)).toMatch(/^CHAIN:ChainHead:step/);
    // One step forward by hand, with no row behind it, would hide a missing row: refused too.
    expect(refusal(`UPDATE "ChainHead" SET "lastSeq" = 2 WHERE "id" = 'LegalEvent'`)).toMatch(/^CHAIN:ChainHead:step/);
    expect(refusal(`DELETE FROM "ChainHead" WHERE "id" = 'LegalEvent'`)).toMatch(/^NO_DELETE:ChainHead/);

    const second = await test.rows.insert("LegalEvent");
    expect((await readChainHeads(test.db)).LegalEvent).toEqual({ seq: 2, hash: second.hash });
    expect(second.prevHash).toBe(first.hash);
  });

  it("verifies a whole database, and names the first row changed behind the triggers' back (B3)", async () => {
    for (const table of ["AuditLog", "Payment", "PaymentAllocation", "Receipt", "LegalEvent"] as const)
      await test.rows.insert(table);
    const invoice = await invoiceWithContent();
    expect(await verifyChains(test.db)).toMatchObject({
      ok: true,
      brokenDigests: [],
      missingNumbers: [],
      brokenTotals: [],
    });
    expect(invoice.contentDigest).toMatch(/^[0-9a-f]{64}$/);

    test.raw.exec(`DROP TRIGGER "AuditLog_no_update"`);
    refusal(`UPDATE "AuditLog" SET "reason" = 'STANDARD:CREATf' WHERE "chainSeq" = 2`);
    const report = await verifyChains(test.db);

    expect(report.ok).toBe(false);
    expect(report.chains.filter((chain) => chain.firstBroken !== null)).toEqual([
      { table: "AuditLog", chain: "AuditLog", rows: 3, firstBroken: 2, problem: "its content was changed" },
    ]);
  });

  it("finds a row removed from the middle of a chain (B3)", async () => {
    for (let index = 0; index < 3; index += 1) await test.rows.insert("LegalEvent");
    test.raw.exec(`DROP TRIGGER "LegalEvent_no_delete"`);
    refusal(`DELETE FROM "LegalEvent" WHERE "chainSeq" = 2`);

    const chain = (await verifyChains(test.db)).chains.find((candidate) => candidate.table === "LegalEvent");
    expect(chain).toMatchObject({ firstBroken: 3, problem: "a row is missing before it" });
  });

  it("hashes an empty column as null, and refuses what the database would not give back the same (B4)", async () => {
    const ctx = test.ctx();
    const event = await test.rows.fill("LegalEvent");
    expect(event.reason).toBeNull();
    await test.transact((ex) => appendChained(ex, ctx, "LegalEvent", { ...event, id: "event-empty-reason" }));
    expect((await verifyChains(test.db, { tables: ["LegalEvent"] })).ok).toBe(true);

    const line = await test.rows.fill("InvoiceLine");
    const append = (over: Record<string, unknown>) =>
      test.transact((ex) => appendChained(ex, ctx, "InvoiceLine", { ...line, id: "line-bad", ...over }));
    await expect(append({ quantity: 1.5 })).rejects.toThrow("InvoiceLine.quantity must be a whole number");
    await expect(append({ quantity: true })).rejects.toThrow("InvoiceLine.quantity must be a whole number");
    await expect(append({ createdAt: new Date() })).rejects.toThrow("InvoiceLine.createdAt must be text");
    await expect(append({ description: undefined })).rejects.toThrow("InvoiceLine.description is missing");
  });

  it("commits an invoice to its content: the digest computed before the insert is the one verified after", async () => {
    const invoice = await invoiceWithContent();
    const lines = await test.db.selectFrom("InvoiceLine").selectAll().where("invoiceId", "=", invoice.id).execute();
    const visits = await test.db.selectFrom("InvoiceVisit").selectAll().where("invoiceId", "=", invoice.id).execute();

    expect(await invoiceContentDigest({ lines, visits })).toBe(invoice.contentDigest);
    expect(await invoiceContentDigest({ lines: [{ ...lines[0], amount: 3_000_001 }], visits })).not.toBe(
      invoice.contentDigest,
    );
  });

  it("closes an invoice's lines with the invoice, and catches a line forged onto the newest one (B5)", async () => {
    const older = await test.rows.insert("Invoice");
    const newest = await test.rows.insert("Invoice");

    await expect(test.rows.insert("InvoiceLine", { invoiceId: older.id })).rejects.toThrow(
      "APPEND_ONLY:InvoiceLine:closed_parent",
    );
    test.clock.advance({ minutes: 5 });
    await expect(test.rows.insert("InvoiceLine", { invoiceId: newest.id })).rejects.toThrow(
      "APPEND_ONLY:InvoiceLine:closed_parent",
    );

    // A line on the newest invoice, written as if at its instant, passes the trigger; its digest gives it away.
    await test.rows.insert("InvoiceLine", { invoiceId: newest.id, createdAt: newest.createdAt });
    const report = await verifyChains(test.db);
    expect(report.ok).toBe(false);
    expect(report.brokenDigests).toEqual([newest.number]);
    expect(report.chains.every((chain) => chain.firstBroken === null)).toBe(true);
  });

  it("keeps old rows verifiable when a later migration adds a column to a chained table (B6)", async () => {
    await test.rows.insert("LegalEvent");
    test.raw.exec(`ALTER TABLE "LegalEvent" ADD COLUMN "note" TEXT`);
    const table: ChainedTable = "LegalEvent";
    CHAIN_COLUMNS[table][2] = [...CHAIN_COLUMNS[table][1], ["note", "TEXT"]];
    CURRENT_HASH_VERSION[table] = 2;
    try {
      const event = await test.rows.fill("LegalEvent");
      await test.transact((ex, ctx) =>
        appendChained(ex, ctx, "LegalEvent", { ...event, id: "event-v2", note: "ملاحظة" }),
      );

      const versions = await test.db.selectFrom("LegalEvent").select("hashV").orderBy("chainSeq").execute();
      expect(versions.map((row) => row.hashV)).toEqual([1, 2]);
      expect((await verifyChains(test.db, { tables: ["LegalEvent"] })).ok).toBe(true);
    } finally {
      delete CHAIN_COLUMNS[table][2];
      CURRENT_HASH_VERSION[table] = 1;
    }
  });
});

describe("the two cached totals (B9)", () => {
  it("equal their ledgers, and a direct write of either is refused", async () => {
    const due = await test.rows.insert("PaymentDue", { amount: 4_500_000, expectedAmount: 4_500_000 } as never);
    const payment = await test.rows.insert("Payment", { amount: 4_500_000, totalReceived: 4_500_000 } as never);
    await test.rows.insert("PaymentAllocation", { paymentId: payment.id, dueId: due.id, amount: 3_000_000 } as never);
    await test.rows.insert("PaymentAllocation", { paymentId: payment.id, dueId: due.id, amount: 1_500_000 } as never);
    const item = await test.rows.insert("StockItem");
    await test.rows.insert("StockMovement", { itemId: item.id, qty: 12_000 } as never);
    await test.rows.insert("StockMovement", { itemId: item.id, qty: -2_000 } as never);

    const paid = await test.db
      .selectFrom("PaymentDue")
      .select("paidAmount")
      .where("id", "=", due.id)
      .executeTakeFirstOrThrow();
    const onHand = await test.db
      .selectFrom("StockItem")
      .select("onHandQty")
      .where("id", "=", item.id)
      .executeTakeFirstOrThrow();
    expect(paid.paidAmount).toBe(4_500_000);
    expect(onHand.onHandQty).toBe(10_000);
    expect(refusal(`UPDATE "PaymentDue" SET "paidAmount" = 0 WHERE "id" = ?`, due.id)).toMatch(
      /^CACHE:PaymentDue:paidAmount/,
    );
    expect(refusal(`UPDATE "StockItem" SET "onHandQty" = 5 WHERE "id" = ?`, item.id)).toMatch(
      /^CACHE:StockItem:onHandQty/,
    );
    // Saving the whole row with the value it already has is accepted: only a wrong value is refused.
    expect(refusal(`UPDATE "PaymentDue" SET "paidAmount" = 4500000, "note" = 'x' WHERE "id" = ?`, due.id)).toBeNull();
    expect((await verifyChains(test.db)).brokenTotals).toEqual([]);
  });
});
