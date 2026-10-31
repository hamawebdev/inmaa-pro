import type { Kysely } from "kysely";

import type { DB } from "@/lib/db/schema";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { afterApplyingRound, booksState } from "@/lib/sync/books";

import { applyChange, beginApplying, emptyOutcome, endApplying, heldIdOf, type ApplyOutcome } from "./apply";
import { makeFullCopy } from "./centre";
import { emitSyncApplied } from "./events";
import {
  BehindMailbox,
  measureClock,
  receiveEnvelopes,
  restoredBehindMailbox,
  RestoredDatabase,
  sendOutbox,
  settleAfterCatchUp,
  syncContext,
} from "./exchange";
import { fetchFiles, sendFiles, type FilesEnv } from "./files";
import type { RemoteChange } from "./payload";
import { stampTransaction, unstampTransaction } from "./session";
import { readExchange, readReceive, readState, writeState } from "./state";

/**
 * One round of the sync loop (DECISION section 6): send what waits, the
 * files' bytes, receive and apply the other laptop's transactions, try held
 * changes again, let the books and the number blocks answer, fetch the files
 * applied, and tell the mailbox how far this laptop has applied.
 *
 * A laptop restored from a backup (the mailbox holds envelopes of its own it
 * does not have) first takes them back with the other laptop's, in the
 * mailbox's order, and only then sends: case 7.
 */

export interface RoundResult {
  sent: number;
  received: number;
  outcome: ApplyOutcome;
  /** Applying waits for a missing envelope. */
  waiting: boolean;
  /** This laptop took back what the mailbox held for it (after a restore). */
  caughtUp: boolean;
  filesSent: number;
  filesReceived: number;
  filesMissing: number;
  relayTime: number | null;
}

/** How often the books' holder puts a fresh full copy on the mailbox. */
export const FULL_COPY_EVERY_MS = 7 * 24 * 3_600_000;

async function fullCopyDue(env: FilesEnv): Promise<boolean> {
  const books = await booksState(env.db, syncContext(env));
  if (!books?.heldHere) return false;
  const copy = await readState(env.db, "copy");
  return !copy || env.clock.now().getTime() - Date.parse(copy.at) >= FULL_COPY_EVERY_MS;
}

export class NeedsFullCopy extends Error {
  constructor(readonly reason: "BEHIND" | "RESTORED") {
    super(`sync: this laptop must start again from the full copy (${reason})`);
    this.name = "NeedsFullCopy";
  }
}

export interface RoundOptions {
  onProgress?: (done: number, total: number | null) => void;
  /**
   * Ask the mailbox whether it holds envelopes of this laptop that this
   * database never sent (a restore). Default true; the loop asks at its first
   * round and after a refusal, to spare the free plan's requests.
   */
  checkRestore?: boolean;
}

export async function runRound(env: FilesEnv, options: RoundOptions = {}): Promise<RoundResult> {
  const result: RoundResult = {
    sent: 0,
    received: 0,
    outcome: emptyOutcome(),
    waiting: false,
    caughtUp: false,
    filesSent: 0,
    filesReceived: 0,
    filesMissing: 0,
    relayTime: null,
  };
  const note = (relayTime: number | null) => {
    if (relayTime !== null) result.relayTime = relayTime;
  };

  // A restored laptop takes back what it had sent, and the other laptop's, before anything else.
  const pendingCatchUp = await readState(env.db, "catchUp");
  let restored = false;
  if (options.checkRestore !== false || pendingCatchUp) {
    const check = await restoredBehindMailbox(env);
    note(check.relayTime);
    restored = check.restored;
  }
  if (pendingCatchUp || restored) {
    if (!pendingCatchUp) {
      await writeState(env.db, "catchUp", {
        reason: "RESTORED",
        since: env.clock.now().toISOString(),
        done: 0,
        total: null,
      });
    }
    try {
      const caught = await receiveEnvelopes(env, { includeOwn: true, onProgress: options.onProgress });
      merge(result, caught.outcome);
      result.received += caught.transactions;
      note(caught.relayTime);
      if (caught.waiting) {
        result.waiting = true;
        return result;
      }
      await settleAfterCatchUp(env, caught);
      result.caughtUp = true;
    } catch (error) {
      if (error instanceof BehindMailbox) throw new NeedsFullCopy("RESTORED");
      throw error;
    }
  }

  try {
    const sent = await sendOutbox(env);
    result.sent += sent.transactions;
    note(sent.relayTime);
  } catch (error) {
    if (error instanceof RestoredDatabase) {
      // Caught between the check and the put: the next round catches up.
      await writeState(env.db, "catchUp", {
        reason: "RESTORED",
        since: env.clock.now().toISOString(),
        done: 0,
        total: null,
      });
      return result;
    }
    throw error;
  }
  result.filesSent += await sendFiles(env);

  try {
    const received = await receiveEnvelopes(env, { onProgress: options.onProgress });
    merge(result, received.outcome);
    result.received += received.transactions;
    result.waiting = received.waiting;
    note(received.relayTime);
  } catch (error) {
    if (error instanceof BehindMailbox) throw new NeedsFullCopy("BEHIND");
    throw error;
  }

  if (await hasHeld(env.db)) {
    merge(result, await retryHeldChanges(env.db, syncContext(env)));
  }

  // The books and the number blocks answer what the other laptop asked; their answers go at once.
  const answered = await answerLedger(env);
  if (answered) {
    const sent = await sendOutbox(env);
    result.sent += sent.transactions;
  }

  const fetched = await fetchFiles(env);
  result.filesReceived += fetched.received;
  result.filesMissing += fetched.missing;

  // The laptop holding the books refreshes the full copy weekly (DECISION section 6).
  if (await fullCopyDue(env)) await makeFullCopy(env);

  // Acknowledged only when it moved: every request counts against the free plan.
  const { cursor } = await readReceive(env.db);
  const exchange = await readExchange(env.db);
  if (cursor > (exchange.ackedUpTo ?? 0)) {
    const acked = await env.mailbox.ack(cursor);
    note(acked.relayTime);
    await writeState(env.db, "exchange", { ...exchange, ackedUpTo: acked.ackedUpTo });
  }
  if (result.relayTime !== null) await measureClock(env, result.relayTime);
  emitSyncApplied({ tables: result.outcome.tables });
  return result;
}

function merge(into: RoundResult, outcome: ApplyOutcome): void {
  into.outcome.applied += outcome.applied;
  into.outcome.held += outcome.held;
  into.outcome.conflicts += outcome.conflicts;
  for (const table of outcome.tables) into.outcome.tables.add(table);
}

async function answerLedger(env: FilesEnv): Promise<boolean> {
  const ctx = syncContext(env);
  return env.db.transaction().execute(async (trx) => {
    const stamp = await stampTransaction(trx, ctx);
    // Ledger's: block claims answered, the books' holder's chores, the books handed over last, blocks topped up.
    await afterApplyingRound(trx, ctx);
    const wrote = await trx
      .selectFrom("SyncOutbox")
      .select("seq")
      .where("txId", "=", stamp.txId ?? "")
      .limit(1)
      .executeTakeFirst();
    await unstampTransaction(trx, stamp);
    return wrote !== undefined;
  });
}

async function hasHeld(db: Kysely<DB>): Promise<boolean> {
  const row = await db.selectFrom("SyncHeld").select("id").where("resolvedAt", "is", null).limit(1).executeTakeFirst();
  return row !== undefined;
}

/**
 * Tries held changes again, in the order they were made: every one, or one.
 * Each that applies now is marked resolved (APPLIED).
 */
export async function retryHeldChanges(
  db: Kysely<DB> | Executor,
  ctx: ServiceContext,
  input: { heldId?: string } = {},
): Promise<ApplyOutcome> {
  const outcome = emptyOutcome();
  const held = await db
    .selectFrom("SyncHeld")
    .selectAll()
    .where("resolvedAt", "is", null)
    .$if(input.heldId !== undefined, (qb) => qb.where("id", "=", input.heldId!))
    .orderBy("id")
    .execute();
  for (const row of held) {
    // Inside a service's transaction, inline; from the loop, one transaction each.
    if (db.isTransaction) await retryOne(db, ctx, row, outcome);
    else await db.transaction().execute(async (trx) => retryOne(trx, ctx, row, outcome));
  }
  return outcome;
}

/** Tries one held change again inside the caller's transaction. */
export async function retryOne(
  ex: Executor,
  ctx: ServiceContext,
  row: { id: string; originDeviceId: string; txSeq: number; hlc: string; change: string },
  outcome: ApplyOutcome,
): Promise<boolean> {
  const still = await ex.selectFrom("SyncHeld").select("resolvedAt").where("id", "=", row.id).executeTakeFirst();
  if (still?.resolvedAt) return true; // folded into an earlier insert meanwhile
  const change = JSON.parse(row.change) as RemoteChange & { index: number };
  const origin = { deviceId: row.originDeviceId, txSeq: row.txSeq, hlc: row.hlc, index: change.index };
  if (heldIdOf(origin) !== row.id) throw new Error(`sync: held change ${row.id} does not match its content`);
  // Changes to the same record held behind this insert are folded into it: the record arrives as they left it.
  const behind =
    change.op === "I"
      ? await ex
          .selectFrom("SyncHeld")
          .selectAll()
          .where("tbl", "=", change.t)
          .where("rowId", "=", change.id)
          .where("resolvedAt", "is", null)
          .where("id", ">", row.id)
          .orderBy("id")
          .execute()
      : [];
  const folded = behind.filter((later) => (JSON.parse(later.change) as RemoteChange).op === "U");
  const cells = new Map<string, string>();
  if (folded.length > 0) {
    const data = { ...change.data };
    for (const later of folded) {
      const update = JSON.parse(later.change) as RemoteChange;
      for (const [col, [value]] of Object.entries(update.data as Record<string, [unknown, unknown]>)) {
        data[col] = value;
        cells.set(col, later.hlc);
      }
    }
    change.data = data;
  }
  await beginApplying(ex, null);
  const result = await applyChange(ex, ctx, origin, change, outcome, { retrying: true });
  await endApplying(ex);
  if (result === "held") {
    outcome.held -= 1; // counted again, not newly held
    return false;
  }
  for (const [col, hlc] of cells) {
    await ex
      .insertInto("SyncCell")
      .values({ tbl: change.t, rowId: change.id, col, hlc })
      .onConflict((oc) => oc.columns(["tbl", "rowId", "col"]).doUpdateSet({ hlc }))
      .execute();
  }
  for (const later of folded) {
    await ex
      .updateTable("SyncHeld")
      .set({ resolvedAt: ctx.now, resolution: "APPLIED", lastTriedAt: ctx.now })
      .where("id", "=", later.id)
      .execute();
  }
  await ex
    .updateTable("SyncHeld")
    .set({ resolvedAt: ctx.now, resolution: "APPLIED", lastTriedAt: ctx.now })
    .where("id", "=", row.id)
    .execute();
  return true;
}
