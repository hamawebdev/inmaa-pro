import { sql } from "kysely";

import type { Executor, ServiceContext } from "@/lib/service/context";

import { nextHlc } from "./hlc";

/**
 * Capture stamping (docs/sync/BUILD.md 2.2).
 *
 * The capture triggers copy every write to a shared table into `SyncOutbox`
 * while `SyncSession.capturing = 1 AND applying = 0`, under the transaction id
 * and stamp in `SyncSession`, and refuse (`SYNC_UNSTAMPED`) when there is
 * none. So every write transaction starts with `stampTransaction` and ends with
 * `unstampTransaction`:
 *
 *     await db.transaction().execute(async (trx) => {
 *       const stamp = await stampTransaction(trx, ctx);
 *       const output = await work(trx, ctx);
 *       await unstampTransaction(trx, stamp);
 *       return output;
 *     });
 *
 * `runner.transact` (every action) does it; so must every other path that
 * writes: first run, the day-start runner, start-up, sign-in. Before sync is
 * set up it costs one read and changes nothing. `withStampedTransaction`
 * wraps the three lines for a path that has none of its own.
 */

/** This laptop's identity in sync (`SyncState` key "device"). */
export interface SyncDeviceIdentity {
  id: string;
  slot: 0 | 1;
  centreId: string;
  name: string;
}

/** The clock's correction (`SyncState` key "clock"): the mailbox's time minus this PC's. */
export interface SyncClockState {
  offsetMs: number;
  measuredAt: string | null;
}

export interface TransactionStamp {
  /** False when sync is not set up: nothing was written, and `unstampTransaction` does nothing. */
  stamped: boolean;
  txId: string | null;
  hlc: string | null;
}

const NOT_STAMPED: TransactionStamp = { stamped: false, txId: null, hlc: null };

function parseJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** A fresh transaction id. */
function newTxId(): string {
  return globalThis.crypto.randomUUID();
}

interface SessionRow {
  capturing: number;
  hlc: string | null;
  device: string | null;
  clock: string | null;
}

async function readSession(ex: Executor): Promise<SessionRow | undefined> {
  const { rows } = await sql<SessionRow>`
    SELECT s."capturing" AS "capturing", s."hlc" AS "hlc",
           (SELECT "value" FROM "SyncState" WHERE "key" = 'device') AS "device",
           (SELECT "value" FROM "SyncState" WHERE "key" = 'clock') AS "clock"
    FROM "SyncSession" s WHERE s."id" = 'session'`.execute(ex);
  return rows[0];
}

/**
 * The first statement of every write transaction: gives it an id and a stamp
 * when sync is set up, and fills `ctx.syncDeviceId`.
 */
export async function stampTransaction(ex: Executor, ctx: ServiceContext): Promise<TransactionStamp> {
  const session = await readSession(ex);
  if (!session) throw new Error("sync: the SyncSession row is missing");
  const device = parseJson<SyncDeviceIdentity>(session.device);
  ctx.syncDeviceId = device?.id ?? null;
  if (session.capturing !== 1 || !device) return NOT_STAMPED;
  const clock = parseJson<SyncClockState>(session.clock);
  const physical = Date.parse(ctx.now) + (clock?.offsetMs ?? 0);
  const hlc = nextHlc(session.hlc, physical, device.id);
  const txId = newTxId();
  await sql`UPDATE "SyncSession" SET "txId" = ${txId}, "hlc" = ${hlc} WHERE "id" = 'session'`.execute(ex);
  return { stamped: true, txId, hlc };
}

/** A UUID made by `newId()`: such a row cannot be made twice on two laptops, so its insert needs no stamp of its own. */
const RANDOM_ID_GLOB = "????????-????-????-????-????????????";

/**
 * The last statement of every write transaction. Rows inserted under an id
 * that is not random (a seed, a setting, a zone made for a commune) keep the
 * stamp of their insert in `SyncCell` under the column "*": two laptops that
 * made the same row merge it field by field, the later insert winning.
 */
export async function unstampTransaction(ex: Executor, stamp: TransactionStamp): Promise<void> {
  if (!stamp.stamped) return;
  await sql`
    INSERT INTO "SyncCell" ("tbl", "rowId", "col", "hlc")
    SELECT o."tbl", o."rowId", '*', o."hlc" FROM "SyncOutbox" o
    WHERE o."txId" = ${stamp.txId} AND o."op" = 'I'
      AND NOT (length(o."rowId") = 36 AND o."rowId" GLOB ${RANDOM_ID_GLOB})
    ON CONFLICT ("tbl", "rowId", "col") DO UPDATE SET "hlc" = excluded."hlc"`.execute(ex);
  await sql`UPDATE "SyncSession" SET "txId" = NULL WHERE "id" = 'session'`.execute(ex);
  notifyLocalWrite();
}

/** One stamped transaction on a root handle, for a path that has no runner. */
export async function withStampedTransaction<T>(
  db: Executor,
  ctx: ServiceContext,
  work: (ex: Executor, ctx: ServiceContext) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    const stamp = await stampTransaction(trx, ctx);
    const output = await work(trx, ctx);
    await unstampTransaction(trx, stamp);
    return output;
  });
}

/** This laptop's id in sync, or null before it is set up: for a context that opened no write transaction. */
export async function syncDeviceIdOf(ex: Executor): Promise<string | null> {
  const identity = await readDeviceIdentity(ex);
  return identity?.id ?? null;
}

export async function readDeviceIdentity(ex: Executor): Promise<SyncDeviceIdentity | null> {
  const { rows } = await sql<{ value: string }>`SELECT "value" FROM "SyncState" WHERE "key" = 'device'`.execute(ex);
  return parseJson<SyncDeviceIdentity>(rows[0]?.value);
}

/** Whether this laptop captures its writes (sync set up and not taken out). */
export async function isCapturing(ex: Executor): Promise<boolean> {
  const session = await readSession(ex);
  return session?.capturing === 1;
}

// ─── A save wakes the sync loop ──────────────────────────────────────────────

const writeListeners = new Set<() => void>();

/** Called after every stamped transaction's last statement (the commit follows): the loop syncs soon after a save. */
export function onLocalWrite(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function notifyLocalWrite(): void {
  for (const listener of writeListeners) {
    try {
      listener();
    } catch (error) {
      console.error("sync: a write listener failed", error);
    }
  }
}
