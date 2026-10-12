import { sql } from "kysely";

import { CHAIN_COLUMNS, CHAINED_TABLES, CURRENT_HASH_VERSION, type ChainedTable } from "@/lib/db/chain-columns";
import type { Executor, ServiceContext } from "@/lib/service/context";

import { canonical, genesisHash, invoiceContentDigest, rowHash } from "./canonical";

export { canonical, genesisHash, invoiceContentDigest, sha256Hex } from "./canonical";
export { CHAINED_TABLES, type ChainedTable } from "@/lib/db/chain-columns";

/**
 * The hash chains.
 *
 * Eight tables are append-only and chained: the access log, invoices and their
 * lines and visit statements, payments and their allocations, receipts, and
 * what later happens to any of them (`LegalEvent`). Each table is its own
 * chain: every row carries the hash of the row before it, so a row cannot be
 * changed or removed without every later hash disagreeing.
 *
 * The database's triggers refuse an update, a delete, and an insert that is
 * not the head plus one. This module is the only writer: nothing else inserts
 * into these tables.
 */

/**
 * Adds one row to a chained table, inside the caller's transaction.
 *
 * `row` is the whole row as the database stores it, without `hashV`,
 * `chainSeq`, `prevHash` and `hash`: every other column is given, an empty one
 * as `null`, a yes/no as 0 or 1, an instant as its ISO string.
 */
export async function appendChained<T extends ChainedTable>(
  ex: Executor,
  ctx: ServiceContext,
  table: T,
  row: Record<string, unknown>,
): Promise<{ hashV: number; chainSeq: number; prevHash: string; hash: string }> {
  const head = await ex
    .selectFrom("ChainHead")
    .select(["lastSeq", "lastHash"])
    .where("id", "=", table)
    .executeTakeFirst();
  if (!head) throw new Error(`chain: ${table} has no head. First run has not completed.`);

  const hashV = CURRENT_HASH_VERSION[table];
  const full = { ...row, hashV, chainSeq: head.lastSeq + 1, prevHash: head.lastHash };
  const hash = await rowHash(table, head.lastHash, canonical(table, hashV, full));

  // The triggers check the sequence and the previous hash again, and move the head.
  await ex
    .insertInto(table)
    .values({ ...full, hash } as never)
    .execute();

  ctx.touchedChains.add(table);
  return { hashV, chainSeq: full.chainSeq, prevHash: head.lastHash, hash };
}

/** The heads of the eight chains, as `ChainHead` holds them. */
export async function readChainHeads(ex: Executor): Promise<Record<ChainedTable, { seq: number; hash: string }>> {
  const rows = await ex.selectFrom("ChainHead").select(["id", "lastSeq", "lastHash"]).execute();
  const heads = {} as Record<ChainedTable, { seq: number; hash: string }>;
  for (const table of CHAINED_TABLES) {
    const row = rows.find((candidate) => candidate.id === table);
    if (!row) throw new Error(`chain: ${table} has no head.`);
    heads[table] = { seq: row.lastSeq, hash: row.lastHash };
  }
  return heads;
}

export interface ChainReport {
  table: ChainedTable;
  rows: number;
  /** The `chainSeq` of the first row that does not verify, or null when the chain is whole. */
  firstBroken: number | null;
  /** What is wrong with it, in a few words. */
  problem: string | null;
}

export interface VerifyReport {
  ok: boolean;
  chains: ChainReport[];
  /** Invoices whose stored digest is not the digest of their lines and visit statement. */
  brokenDigests: string[];
  /** Legal numbers that are neither on a document nor covered by a declared gap: "INVOICE 2026: 12". */
  missingNumbers: string[];
  /** Cached totals that are not the sum of their ledger: "PaymentDue <id>". */
  brokenTotals: string[];
}

/**
 * Checks everything the chains promise, from the rows themselves:
 *
 *  - each chain: numbered 1, 2, 3 with no gap, each row carrying the hash of
 *    the one before, each hash the hash of its row, and the last one equal to
 *    the table's head;
 *  - every invoice still commits to its lines and its visit statement;
 *  - the two legal sequences have no hole in any year, save declared gaps;
 *  - the two cached totals equal the sum of their ledgers.
 *
 * It reads; it never repairs.
 */
export async function verifyChains(
  ex: Executor,
  options: { tables?: readonly ChainedTable[] } = {},
): Promise<VerifyReport> {
  const databaseId = await readDatabaseId(ex);
  const heads = await readChainHeads(ex);
  const tables = options.tables ?? CHAINED_TABLES;
  const chains: ChainReport[] = [];

  for (const table of tables) {
    const rows = (await sql`SELECT * FROM ${sql.table(table)} ORDER BY "chainSeq"`.execute(ex)).rows as Array<
      Record<string, unknown>
    >;
    let previous = await genesisHash(databaseId, table);
    let firstBroken: number | null = null;
    let problem: string | null = null;
    let expectedSeq = 0;

    for (const row of rows) {
      expectedSeq += 1;
      const seq = Number(row.chainSeq);
      const hashV = Number(row.hashV);
      let reason: string | null = null;
      if (seq !== expectedSeq) reason = "a row is missing before it";
      else if (row.prevHash !== previous) reason = "it does not follow the row before it";
      else if (!CHAIN_COLUMNS[table][hashV]) reason = "its hash version is unknown";
      else if (row.hash !== (await rowHash(table, previous, canonical(table, hashV, row))))
        reason = "its content was changed";
      if (reason) {
        firstBroken = seq;
        problem = reason;
        break;
      }
      previous = String(row.hash);
    }

    if (firstBroken === null && (heads[table].seq !== rows.length || heads[table].hash !== previous)) {
      firstBroken = rows.length + 1;
      problem = "the head of the chain does not match its last row";
    }
    chains.push({ table, rows: rows.length, firstBroken, problem });
  }

  const brokenDigests = tables.includes("Invoice") ? await findBrokenDigests(ex) : [];
  const missingNumbers = await findMissingLegalNumbers(ex);
  const brokenTotals = await findBrokenTotals(ex);

  return {
    ok:
      chains.every((chain) => chain.firstBroken === null) &&
      !brokenDigests.length &&
      !missingNumbers.length &&
      !brokenTotals.length,
    chains,
    brokenDigests,
    missingNumbers,
    brokenTotals,
  };
}

export async function readDatabaseId(ex: Executor): Promise<string> {
  const row = await ex.selectFrom("Setting").select("value").where("key", "=", "system.databaseId").executeTakeFirst();
  if (!row) throw new Error("chain: this database has no id. First run has not completed.");
  return JSON.parse(row.value) as string;
}

async function findBrokenDigests(ex: Executor): Promise<string[]> {
  const invoices = await ex
    .selectFrom("Invoice")
    .select(["id", "number", "contentDigest"])
    .orderBy("chainSeq")
    .execute();
  const broken: string[] = [];
  for (const invoice of invoices) {
    const lines = await ex.selectFrom("InvoiceLine").selectAll().where("invoiceId", "=", invoice.id).execute();
    const visits = await ex.selectFrom("InvoiceVisit").selectAll().where("invoiceId", "=", invoice.id).execute();
    if ((await invoiceContentDigest({ lines, visits })) !== invoice.contentDigest) broken.push(invoice.number);
  }
  return broken;
}

async function findMissingLegalNumbers(ex: Executor): Promise<string[]> {
  const missing: string[] = [];
  const counters = await ex
    .selectFrom("Sequence")
    .select(["key", "year", "lastValue"])
    .where("key", "in", ["INVOICE", "RECEIPT"])
    .execute();
  for (const counter of counters) {
    const table = counter.key === "INVOICE" ? "Invoice" : "Receipt";
    const held = new Set(
      (await ex.selectFrom(table).select("numberSeq").where("numberYear", "=", counter.year).execute()).map(
        (row) => row.numberSeq,
      ),
    );
    const gaps = await ex
      .selectFrom("SequenceGap")
      .select(["fromValue", "toValue"])
      .where("key", "=", counter.key)
      .where("year", "=", counter.year)
      .execute();
    for (let value = 1; value <= counter.lastValue; value += 1) {
      if (held.has(value)) continue;
      if (gaps.some((gap) => value >= gap.fromValue && value <= gap.toValue)) continue;
      missing.push(`${counter.key} ${counter.year}: ${value}`);
    }
  }
  return missing;
}

async function findBrokenTotals(ex: Executor): Promise<string[]> {
  const dues = await sql<{ id: string }>`
    SELECT d."id" FROM "PaymentDue" d
    WHERE d."paidAmount" IS NOT (SELECT COALESCE(SUM(a."amount"), 0) FROM "PaymentAllocation" a WHERE a."dueId" = d."id")`.execute(
    ex,
  );
  const items = await sql<{ id: string }>`
    SELECT i."id" FROM "StockItem" i
    WHERE i."onHandQty" IS NOT (SELECT COALESCE(SUM(v."qty"), 0) FROM "StockMovement" v WHERE v."itemId" = i."id")`.execute(
    ex,
  );
  return [...dues.rows.map((row) => `PaymentDue ${row.id}`), ...items.rows.map((row) => `StockItem ${row.id}`)];
}
