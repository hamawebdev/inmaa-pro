import { requireCapability } from "@/lib/access/session";
import { CHAINED_TABLES, type ChainedTable } from "@/lib/db/chain-columns";
import { newId } from "@/lib/db/rows";
import { logSecurity } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

import { genesisHash, readChainHeads, readDatabaseId, verifyChains } from "./index";

/**
 * The anchor: how a restored old copy is detected.
 *
 * The chains prove a database file is consistent with itself. They cannot prove
 * it is the latest one: a backup from last month is perfectly consistent. So
 * the heads of the chains and the tops of the two legal sequences are also kept
 * outside the database and outside every backup, and compared with the
 * database when the program starts, before a backup and after a restore.
 *
 * `AnchorStore` is where that record lives. The program's is a Rust command
 * (src-tauri/src/anchor.rs: the same places as the licence vault, signed with
 * the product secret); a test passes one in memory or on a file. Nothing here
 * knows which.
 */

export type LegalKey = "INVOICE" | "RECEIPT";
const LEGAL_KEYS: readonly LegalKey[] = ["INVOICE", "RECEIPT"];

/** The chains whose every commit is anchored at once. The log's is anchored at most once a minute. */
export const LEGAL_CHAINS: ReadonlySet<string> = new Set(CHAINED_TABLES.filter((table) => table !== "AuditLog"));

export interface AnchorRecord {
  v: 1;
  databaseId: string;
  writtenAt: string;
  heads: Record<ChainedTable, { seq: number; hash: string }>;
  /** Per key, per year: the legal counters. By year, so a restore across 1 January still knows the old year's top. */
  legal: Record<LegalKey, Record<string, { lastValue: number; lastDate: string | null }>>;
  lastInvoice: { number: string; issueDate: string } | null;
}

export interface AnchorStore {
  read(): Promise<AnchorRecord | null>;
  write(record: AnchorRecord): Promise<void>;
}

/** An anchor kept in memory: for tests, and for one database "restored" over another in a scenario. */
export function memoryAnchorStore(initial: AnchorRecord | null = null): AnchorStore & { writes: number } {
  let held = initial ? (JSON.parse(JSON.stringify(initial)) as AnchorRecord) : null;
  return {
    writes: 0,
    async read() {
      return held ? (JSON.parse(JSON.stringify(held)) as AnchorRecord) : null;
    },
    async write(record) {
      held = JSON.parse(JSON.stringify(record)) as AnchorRecord;
      this.writes += 1;
    },
  };
}

/** What the database says of itself, in the shape of an anchor. */
export async function snapshotAnchor(ex: Executor, writtenAt: string): Promise<AnchorRecord> {
  const legal: AnchorRecord["legal"] = { INVOICE: {}, RECEIPT: {} };
  const counters = await ex
    .selectFrom("Sequence")
    .select(["key", "year", "lastValue", "lastDate"])
    .where("key", "in", LEGAL_KEYS)
    .execute();
  for (const counter of counters) {
    legal[counter.key as LegalKey][String(counter.year)] = { lastValue: counter.lastValue, lastDate: counter.lastDate };
  }
  const lastInvoice = await ex
    .selectFrom("Invoice")
    .select(["number", "issueDate"])
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirst();
  return {
    v: 1,
    databaseId: await readDatabaseId(ex),
    writtenAt,
    heads: await readChainHeads(ex),
    legal,
    lastInvoice: lastInvoice ? { number: lastInvoice.number, issueDate: lastInvoice.issueDate } : null,
  };
}

/** Writes the anchor from the database as it stands. After a commit, never inside a transaction. */
export async function writeAnchor(ex: Executor, store: AnchorStore, writtenAt: string): Promise<AnchorRecord> {
  const record = await snapshotAnchor(ex, writtenAt);
  await store.write(record);
  return record;
}

/**
 * normal     the database is where the anchor says
 * ahead      the database went on and the anchor write was missed (a crash, a power cut)
 * behind     an older copy was restored, or rows were removed
 * altered    a record was changed: same place, another hash
 * foreign    the anchor belongs to another database
 * unanchored no anchor, and the database already holds chained rows (a reinstalled system)
 */
export type AnchorState = "normal" | "ahead" | "behind" | "altered" | "foreign" | "unanchored";

export interface AnchorComparison {
  state: AnchorState;
  anchor: AnchorRecord | null;
  database: AnchorRecord;
  /** Per chain, where the database stands against the anchor. */
  chains: Array<{ table: ChainedTable; state: "same" | "ahead" | "behind" | "altered" }>;
  /** Legal numbers the anchor knows and this database does not hold: what a confirmation will declare as gaps. */
  lostNumbers: Array<{ key: LegalKey; year: number; fromValue: number; toValue: number; lastDate: string | null }>;
}

async function hashAt(ex: Executor, table: ChainedTable, seq: number, databaseId: string): Promise<string | null> {
  if (seq === 0) return genesisHash(databaseId, table);
  const row = await ex.selectFrom(table).select("hash").where("chainSeq", "=", seq).executeTakeFirst();
  return row?.hash ?? null;
}

export async function compareAnchor(ex: Executor, store: AnchorStore, now: string): Promise<AnchorComparison> {
  const database = await snapshotAnchor(ex, now);
  const anchor = await store.read();

  if (!anchor) {
    const holdsRows = CHAINED_TABLES.some((table) => database.heads[table].seq > 0);
    return { state: holdsRows ? "unanchored" : "normal", anchor: null, database, chains: [], lostNumbers: [] };
  }
  if (anchor.databaseId !== database.databaseId) {
    return { state: "foreign", anchor, database, chains: [], lostNumbers: [] };
  }

  const chains: AnchorComparison["chains"] = [];
  for (const table of CHAINED_TABLES) {
    const here = database.heads[table];
    const there = anchor.heads[table];
    if (!there) {
      chains.push({ table, state: "ahead" });
    } else if (here.seq < there.seq) {
      chains.push({ table, state: "behind" });
    } else if (here.seq === there.seq) {
      chains.push({ table, state: here.hash === there.hash ? "same" : "altered" });
    } else {
      chains.push({
        table,
        state: (await hashAt(ex, table, there.seq, database.databaseId)) === there.hash ? "ahead" : "altered",
      });
    }
  }

  const lostNumbers: AnchorComparison["lostNumbers"] = [];
  for (const key of LEGAL_KEYS) {
    for (const [year, top] of Object.entries(anchor.legal[key] ?? {})) {
      const here = database.legal[key][year]?.lastValue ?? 0;
      if (top.lastValue > here)
        lostNumbers.push({
          key,
          year: Number(year),
          fromValue: here + 1,
          toValue: top.lastValue,
          lastDate: top.lastDate,
        });
    }
  }

  const has = (state: string) => chains.some((chain) => chain.state === state);
  const state: AnchorState = has("altered")
    ? "altered"
    : has("behind") || lostNumbers.length
      ? "behind"
      : has("ahead")
        ? "ahead"
        : "normal";
  return { state, anchor, database, chains, lostNumbers };
}

/**
 * What the program does with the anchor when it starts, and before a backup.
 *
 * A database that is where the anchor says, or that only went on after a
 * missed write and still verifies, needs nobody: the anchor is brought up to
 * date and the answer is "normal". Every other state is returned as it is, for
 * the screen that asks the manager; nothing is written until he answers.
 */
export async function reconcileAnchor(ex: Executor, store: AnchorStore, now: string): Promise<AnchorComparison> {
  const comparison = await compareAnchor(ex, store, now);
  if (comparison.state === "normal") {
    if (!comparison.anchor) await store.write(comparison.database);
    return comparison;
  }
  if (comparison.state === "ahead") {
    const report = await verifyChains(ex);
    if (!report.ok) return { ...comparison, state: "altered" };
    await store.write(comparison.database);
    return { ...comparison, state: "normal" };
  }
  return comparison;
}

/**
 * The manager's answer to a database that is behind its anchor: he keeps this
 * older copy, and says why.
 *
 * One transaction, the caller's. For each legal sequence and year, the numbers
 * that were issued and are not in this copy are declared as a gap, and the
 * counter and its date floor are moved past them: no invoice or receipt number
 * is ever given twice, and the next one cannot be dated before the lost ones.
 * The log keeps the act with both sets of heads; `BackupRun` keeps the restore
 * and protects the copy made of the replaced database from rotation.
 *
 * After the commit, the caller writes the anchor (`writeAnchor`).
 */
export async function acceptRestoredDatabase(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    comparison: AnchorComparison;
    reason: string;
    restoredFromPath?: string | null;
    preRestorePath?: string | null;
  },
): Promise<{ auditLogId: string; gaps: number }> {
  requireCapability(ctx, "backup.restore");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const { comparison } = input;
  if (comparison.state !== "behind" || !comparison.anchor)
    throw new Error("anchor: this database is not behind its anchor");

  const auditLogId = await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "RESTORE",
    reason,
    entity: "Database",
    entityId: comparison.database.databaseId,
    context: {
      anchorHeads: comparison.anchor.heads,
      databaseHeads: comparison.database.heads,
      anchorLastInvoice: comparison.anchor.lastInvoice,
      databaseLastInvoice: comparison.database.lastInvoice,
      lostNumbers: comparison.lostNumbers,
      restoredFromPath: input.restoredFromPath ?? null,
      preRestorePath: input.preRestorePath ?? null,
    },
  });

  for (const lost of comparison.lostNumbers) {
    const id = `${lost.key}-${lost.year}`;
    await ex
      .insertInto("Sequence")
      .values({ id, key: lost.key, year: lost.year, lastValue: 0, lastDate: null, updatedAt: ctx.now })
      .onConflict((conflict) => conflict.columns(["key", "year"]).doNothing())
      .execute();
    const counter = await ex
      .selectFrom("Sequence")
      .select(["id", "lastValue", "lastDate"])
      .where("key", "=", lost.key)
      .where("year", "=", lost.year)
      .executeTakeFirstOrThrow();

    await ex
      .insertInto("SequenceGap")
      .values({
        id: newId(),
        key: lost.key,
        year: lost.year,
        kind: "RESTORE",
        fromValue: counter.lastValue + 1,
        toValue: lost.toValue,
        reason,
        auditLogId,
        createdAt: ctx.now,
        createdByUserId: ctx.userId,
      })
      .execute();

    // The date floor never goes back: the later of the two.
    const floor =
      [counter.lastDate, lost.lastDate]
        .filter((date): date is NonNullable<typeof date> => date !== null)
        .sort()
        .at(-1) ?? null;
    await ex
      .updateTable("Sequence")
      .set({ lastValue: lost.toValue, lastDate: floor as typeof counter.lastDate, updatedAt: ctx.now })
      .where("id", "=", counter.id)
      .execute();
  }

  const heads = JSON.stringify({ heads: comparison.database.heads, legal: comparison.database.legal });
  if (input.preRestorePath) {
    await ex
      .insertInto("BackupRun")
      .values({
        id: newId(),
        kind: "PRE_RESTORE",
        startedAt: ctx.now,
        finishedAt: ctx.now,
        targetPath: input.preRestorePath,
        ok: 1,
        heads: JSON.stringify({ heads: comparison.anchor.heads, legal: comparison.anchor.legal }),
        lastInvoiceNumber: comparison.anchor.lastInvoice?.number ?? null,
        lastInvoiceDate: (comparison.anchor.lastInvoice?.issueDate ?? null) as never,
        isProtected: 1,
        userId: ctx.userId,
      })
      .execute();
  }
  await ex
    .insertInto("BackupRun")
    .values({
      id: newId(),
      kind: "RESTORE",
      startedAt: ctx.now,
      finishedAt: ctx.now,
      targetPath: input.restoredFromPath ?? "",
      ok: 1,
      heads,
      lastInvoiceNumber: comparison.database.lastInvoice?.number ?? null,
      lastInvoiceDate: (comparison.database.lastInvoice?.issueDate ?? null) as never,
      preRestorePath: input.preRestorePath ?? null,
      userId: ctx.userId,
    })
    .execute();

  return { auditLogId, gaps: comparison.lostNumbers.length };
}

/**
 * What the start-up made of the anchor: the comparison, or "unchecked" when it
 * could not be made at all (a read or the anchor command failed).
 */
export type StartupAnchor = AnchorComparison | { state: "unchecked"; error: string };

/**
 * `reconcileAnchor` at start-up, failing closed (audit LOG-11): a comparison
 * that throws is "unchecked", which the program treats as a database in
 * question (the anchor screen, with «try again»), never as "normal".
 */
export async function reconcileAnchorAtStart(ex: Executor, store: AnchorStore, now: string): Promise<StartupAnchor> {
  try {
    return await reconcileAnchor(ex, store, now);
  } catch (error) {
    console.error("anchor: could not be compared at start", error);
    return { state: "unchecked", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The manager's answer to an anchor that cannot be followed: another
 * database's, none at all, or one this database disagrees with. He keeps this
 * database as it is; the log says so, with what both sides held. After the
 * commit, the caller writes a new anchor.
 */
export async function acceptDatabaseAsItIs(
  ex: Executor,
  ctx: ServiceContext,
  input: { comparison: AnchorComparison; reason: string },
): Promise<{ auditLogId: string }> {
  requireCapability(ctx, "backup.restore");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  if (input.comparison.state === "behind")
    throw new Error("anchor: a database behind its anchor is accepted with acceptRestoredDatabase");

  const auditLogId = await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "ANCHOR_REBASE",
    // His words in the reason column the law reads (audit LOG-4), not only in the details.
    reason,
    entity: "Database",
    entityId: input.comparison.database.databaseId,
    context: {
      state: input.comparison.state,
      anchorDatabaseId: input.comparison.anchor?.databaseId ?? null,
      anchorHeads: input.comparison.anchor?.heads ?? null,
      databaseHeads: input.comparison.database.heads,
    },
  });
  return { auditLogId };
}
