import { sql } from "kysely";

import { CHAIN_COLUMNS, CHAINED_TABLES, CURRENT_HASH_VERSION, type ChainedTable } from "@/lib/db/chain-columns";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { deviceOf, logChainOf, requireBooks, syncIsSetUp } from "@/lib/sync/books/guard";

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
 * A chain: one of the eight tables, or a laptop's own log chain once sync is
 * set up (DECISION section 5). The access log is written on both laptops all
 * day, so it cannot be one chain with two writers: rows written before sync
 * keep the 1.0.0 chain (`AuditLog`, column `chain` null), and from set-up each
 * laptop writes its own (`AuditLog:<deviceId>`, its own genesis, hash version
 * 2). The seven legal chains stay single: only the laptop that holds the books
 * writes them.
 */
export type ChainId = ChainedTable | `AuditLog:${string}`;

const isLogChain = (id: string): id is `AuditLog:${string}` => id.startsWith("AuditLog:");

/**
 * Whether the schema has the log's `chain` column (migration 0005). Generated
 * with the schema, so it is the same answer as the database's.
 */
export const LOG_HAS_CHAIN = (CHAIN_COLUMNS.AuditLog[CURRENT_HASH_VERSION.AuditLog] ?? []).some(
  ([name]) => name === "chain",
);

/** A head first met: a laptop chain seeded at its genesis. */
const NOT_YET = "1970-01-01T00:00:00.000Z";

/**
 * The head of a laptop's log chain, created at its genesis the first time the
 * chain is met: when this laptop starts its own chain, and before the first
 * row of the other laptop's chain is applied (the trigger checks every row
 * against its head). Idempotent. Only `AuditLog:<id>` chains: the eight table
 * heads are made by first run.
 */
export async function ensureChainHead(
  ex: Executor,
  chain: string,
  at: string = NOT_YET,
): Promise<{ seq: number; hash: string }> {
  const found = await ex
    .selectFrom("ChainHead")
    .select(["lastSeq", "lastHash"])
    .where("id", "=", chain)
    .executeTakeFirst();
  if (found) return { seq: found.lastSeq, hash: found.lastHash };
  if (!isLogChain(chain) || chain.length <= "AuditLog:".length)
    throw new Error(`chain: ${chain} has no head, and only a laptop's log chain is made on first meeting`);
  const hash = await genesisHash(await readDatabaseId(ex), chain);
  await ex.insertInto("ChainHead").values({ id: chain, lastSeq: 0, lastHash: hash, updatedAt: at }).execute();
  return { seq: 0, hash };
}

/**
 * Starts this laptop's own log chain: at sync set-up on the director's
 * laptop, and when a laptop joins, before its first log entry. Idempotent.
 */
export async function startOwnLogChain(
  ex: Executor,
  ctx: ServiceContext,
  deviceId: string,
): Promise<{ chain: string }> {
  const chain = logChainOf(deviceId);
  await ensureChainHead(ex, chain, ctx.now);
  return { chain };
}

/**
 * Adds one row to a chained table, inside the caller's transaction.
 *
 * `row` is the whole row as the database stores it, without `hashV`,
 * `chainSeq`, `prevHash` and `hash` (and, for the log, `chain`): every other
 * column is given, an empty one as `null`, a yes/no as 0 or 1, an instant as
 * its ISO string.
 *
 * Once sync is set up, a row of the seven legal tables is written only on the
 * laptop that holds the books (`requireBooks`): this is the guarantee, the
 * services' own early refusals only say it sooner. A log row goes to this
 * laptop's own chain.
 */
export async function appendChained<T extends ChainedTable>(
  ex: Executor,
  ctx: ServiceContext,
  table: T,
  row: Record<string, unknown>,
): Promise<{ hashV: number; chainSeq: number; prevHash: string; hash: string }> {
  const device = LOG_HAS_CHAIN ? deviceOf(ctx) : null;
  if (LOG_HAS_CHAIN) {
    if (table !== "AuditLog") await requireBooks(ex, ctx);
    else if (device === null && (await syncIsSetUp(ex)))
      throw new Error("ledger: sync is set up but this context has no device");
  }
  const chain = table === "AuditLog" && device !== null ? logChainOf(device) : null;
  const headId: string = chain ?? table;

  const found = await ex
    .selectFrom("ChainHead")
    .select(["lastSeq", "lastHash"])
    .where("id", "=", headId)
    .executeTakeFirst();
  const head = found
    ? { lastSeq: found.lastSeq, lastHash: found.lastHash }
    : chain
      ? await ensureChainHead(ex, chain, ctx.now).then((made) => ({ lastSeq: made.seq, lastHash: made.hash }))
      : null;
  if (!head) throw new Error(`chain: ${table} has no head. First run has not completed.`);

  const hashV = CURRENT_HASH_VERSION[table];
  const full = {
    ...row,
    ...(table === "AuditLog" && LOG_HAS_CHAIN ? { chain } : {}),
    hashV,
    chainSeq: head.lastSeq + 1,
    prevHash: head.lastHash,
  };
  const hash = await rowHash(table, head.lastHash, canonical(table, hashV, full));

  // The triggers check the sequence and the previous hash again, and move the head.
  await ex
    .insertInto(table)
    .values({ ...full, hash } as never)
    .execute();

  ctx.touchedChains.add(headId);
  return { hashV, chainSeq: full.chainSeq, prevHash: head.lastHash, hash };
}

export type ChainHead = { seq: number; hash: string };
/** Every chain's head: the eight tables', and each laptop's log chain once sync is set up. */
export type ChainHeads = Record<ChainedTable, ChainHead> & { [chain: string]: ChainHead };

/** The heads of every chain, as `ChainHead` holds them: the eight tables first, then the laptops' log chains. */
export async function readChainHeads(ex: Executor): Promise<ChainHeads> {
  const rows = await ex.selectFrom("ChainHead").select(["id", "lastSeq", "lastHash"]).orderBy("id").execute();
  const heads = {} as ChainHeads;
  for (const table of CHAINED_TABLES) {
    const row = rows.find((candidate) => candidate.id === table);
    if (!row) throw new Error(`chain: ${table} has no head.`);
    heads[table] = { seq: row.lastSeq, hash: row.lastHash };
  }
  for (const row of rows) if (isLogChain(row.id)) heads[row.id] = { seq: row.lastSeq, hash: row.lastHash };
  return heads;
}

/** Which table a chain's rows are in. */
export const tableOfChain = (chain: string): ChainedTable => (isLogChain(chain) ? "AuditLog" : (chain as ChainedTable));

/**
 * The rows of one chain, in order. The 1.0.0 log chain is the rows whose
 * `chain` is null; a laptop's is the rows that name it.
 */
export async function chainRows(ex: Executor, chain: string): Promise<Array<Record<string, unknown>>> {
  const table = tableOfChain(chain);
  const filter =
    table !== "AuditLog" || !LOG_HAS_CHAIN
      ? sql``
      : isLogChain(chain)
        ? sql`WHERE "chain" = ${chain}`
        : sql`WHERE "chain" IS NULL`;
  return (await sql`SELECT * FROM ${sql.table(table)} ${filter} ORDER BY "chainSeq"`.execute(ex)).rows as Array<
    Record<string, unknown>
  >;
}

/** The hash of the row at a place in a chain (its genesis at 0), or null when there is no such row. */
export async function hashInChain(
  ex: Executor,
  chain: string,
  seq: number,
  databaseId: string,
): Promise<string | null> {
  if (seq === 0) return genesisHash(databaseId, chain as ChainId);
  const table = tableOfChain(chain);
  const filter =
    table !== "AuditLog" || !LOG_HAS_CHAIN
      ? sql``
      : isLogChain(chain)
        ? sql`AND "chain" = ${chain}`
        : sql`AND "chain" IS NULL`;
  const row = (
    await sql<{ hash: string }>`SELECT "hash" FROM ${sql.table(table)} WHERE "chainSeq" = ${seq} ${filter}`.execute(ex)
  ).rows[0];
  return row?.hash ?? null;
}

export interface ChainReport {
  table: ChainedTable;
  /** The chain: the table's name, or a laptop's log chain `AuditLog:<deviceId>`. */
  chain: string;
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
 *  - each chain (the eight tables', and every laptop's log chain present,
 *    whether written here or received): numbered 1, 2, 3 with no gap, each row carrying the hash of
 *    the one before, each hash the hash of its row, and the last one equal to
 *    the table's head;
 *  - every invoice still commits to its lines and its visit statement;
 *  - the two legal sequences have no hole in any year, save declared gaps
 *    (a restore, paper numbers, a lost laptop);
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

  const chainIds: string[] = [];
  for (const table of tables) {
    chainIds.push(table);
    if (table === "AuditLog" && LOG_HAS_CHAIN) {
      const named = await sql<{
        chain: string;
      }>`SELECT DISTINCT "chain" FROM "AuditLog" WHERE "chain" IS NOT NULL`.execute(ex);
      const laptops = new Set([...Object.keys(heads).filter(isLogChain), ...named.rows.map((row) => row.chain)]);
      chainIds.push(...[...laptops].sort());
    }
  }

  for (const chain of chainIds) {
    const table = tableOfChain(chain);
    const rows = await chainRows(ex, chain);
    let previous = await genesisHash(databaseId, chain as ChainId);
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

    const head = heads[chain] as ChainHead | undefined;
    if (firstBroken === null && !head) {
      firstBroken = 1;
      problem = "the chain has no head";
    } else if (firstBroken === null && head && (head.seq !== rows.length || head.hash !== previous)) {
      firstBroken = rows.length + 1;
      problem = "the head of the chain does not match its last row";
    }
    chains.push({ table, chain, rows: rows.length, firstBroken, problem });
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
