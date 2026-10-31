import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { isCapturing, syncDeviceIdOf } from "@/lib/sync/session";

/**
 * Where the books are, checked where a legal row is written (DECISION section 5).
 *
 * Kept apart from `./index.ts` so that `src/lib/chain` can import it without
 * a cycle through the log: this file reads, it never writes.
 */

/** The refusal on the laptop that does not hold the books. */
export const BOOKS_ELSEWHERE = "The books are on the other laptop. Ask for them, and try again when they have arrived.";

/** The refusal on a laptop that holds the books but has not yet received every document issued before the hand-over. */
export const BOOKS_ARRIVING =
  "The books are on their way to this laptop: the last invoices and receipts have not all arrived yet. Try again in a minute.";

/** The refusal on a restored laptop that has not yet taken back from the mailbox what it did after its backup. */
export const CATCHING_UP =
  "This laptop is taking back from the mailbox what it did after the backup. Try again when it has caught up.";

/**
 * Refuses while this laptop catches up after a restore (DECISION section 7,
 * case 7: its invoices and its blocks continue as they were, so nothing
 * numbered is given before it has taken back what it had given after the
 * backup). Engine's `SyncState` key "catchUp" is set until then.
 */
export async function requireCaughtUp(ex: Executor): Promise<void> {
  const row = await ex.selectFrom("SyncState").select("key").where("key", "=", "catchUp").executeTakeFirst();
  if (row) throw new ServiceError(CATCHING_UP);
}

/** The refusal on a laptop taken out of sync while the other laptop held the books (coordinator's ruling). */
export const BOOKS_LEFT_BEHIND =
  "This laptop was taken out of sync while the other laptop held the books: invoices, receipts and payments are issued there only.";

/**
 * The laptop this database was before the manager took it out of sync
 * (engine's `SyncState` key "left", written by `leaveCentre`), or null. A
 * laptop taken out keeps the books state it had: without the books it never
 * issues again, and its ordinary numbers go on only in its own blocks.
 */
export async function leftDeviceOf(ex: Executor): Promise<string | null> {
  const row = await ex.selectFrom("SyncState").select("value").where("key", "=", "left").executeTakeFirst();
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as { deviceId?: unknown };
    return typeof value.deviceId === "string" ? value.deviceId : null;
  } catch {
    return null;
  }
}

/** The laptop whose blocks this context numbers in: this laptop in sync, or the one it was before leaving. Null: 1.0.0. */
export async function numberingDeviceOf(ex: Executor, ctx: ServiceContext): Promise<string | null> {
  return deviceOf(ctx) ?? (await leftDeviceOf(ex));
}

/**
 * This laptop's id once sync is set up on it, or null: the 1.0.0 behaviour.
 * Engine puts it in every context (`ctx.syncDeviceId`).
 */
export function deviceOf(ctx: ServiceContext): string | null {
  return (ctx as ServiceContext & { syncDeviceId?: string | null }).syncDeviceId ?? null;
}

/** The id of this laptop's own log chain: `AuditLog:<deviceId>`, or `AuditLog` (the 1.0.0 chain) before sync. */
export function ownLogChain(ctx: ServiceContext): string {
  const device = deviceOf(ctx);
  return device ? logChainOf(device) : "AuditLog";
}

export const logChainOf = (deviceId: string) => `AuditLog:${deviceId}`;

/** A per-year top of a legal key: what the hand-over carries. */
export type LegalTops = Record<string, { seq: number; date: string | null }>;

export interface BooksRow {
  holderDeviceId: string;
  epoch: number;
  lastInvoiceNumber: string | null;
  lastReceiptNumber: string | null;
}

export async function readBooksRow(ex: Executor): Promise<BooksRow | null> {
  const row = await ex
    .selectFrom("SyncBooks")
    .select(["holderDeviceId", "epoch", "lastInvoiceNumber", "lastReceiptNumber"])
    .where("id", "=", "books")
    .executeTakeFirst();
  return row ?? null;
}

export function parseTops(text: string | null): LegalTops {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as LegalTops) : {};
  } catch {
    return {};
  }
}

/**
 * Refuses unless this laptop holds the books. While this laptop is not in
 * sync (before set-up, or after the manager took it out: capture off) it lets
 * everything through: 1.0.0 exactly.
 *
 * A context without a device on a laptop in sync is a fault in the program (a
 * write path that was not stamped), not something the user can fix: it throws
 * an Error, so it is found in tests.
 */
export async function requireBooks(ex: Executor, ctx: ServiceContext): Promise<void> {
  if (!(await syncIsSetUp(ex))) {
    // Taken out of sync: it keeps issuing only if it held the books then.
    const left = await leftDeviceOf(ex);
    if (left === null) return;
    const books = await readBooksRow(ex);
    if (books && books.holderDeviceId !== left) throw new ServiceError(BOOKS_LEFT_BEHIND);
    return;
  }
  const device = deviceOf(ctx);
  if (device === null) throw new Error("ledger: sync is set up but this context has no device");
  await requireCaughtUp(ex);
  const books = await readBooksRow(ex);
  if (!books || books.holderDeviceId !== device) throw new ServiceError(BOOKS_ELSEWHERE);

  // The hand-over is applied after every document it covers; this only guards a database that skipped some.
  for (const [key, text] of [
    ["INVOICE", books.lastInvoiceNumber],
    ["RECEIPT", books.lastReceiptNumber],
  ] as const) {
    const tops = parseTops(text);
    const years = Object.keys(tops).map(Number);
    if (years.length === 0) continue;
    const counters = await ex
      .selectFrom("Sequence")
      .select(["year", "lastValue"])
      .where("key", "=", key)
      .where("year", "in", years)
      .execute();
    for (const year of years) {
      const here = counters.find((counter) => counter.year === year)?.lastValue ?? 0;
      if (here < tops[String(year)].seq) throw new ServiceError(BOOKS_ARRIVING);
    }
  }
}

/** Whether this laptop is in sync: capture on (set up, or joined, and not taken out since). */
export async function syncIsSetUp(ex: Executor): Promise<boolean> {
  return isCapturing(ex);
}

/**
 * Whether this laptop holds the books: always before sync is set up. For a
 * read (a sheet deciding whether it prints as the original or as a copy),
 * where the context may have no device yet.
 */
export async function holdsBooks(ex: Executor, ctx: ServiceContext): Promise<boolean> {
  if (!(await syncIsSetUp(ex))) {
    const left = await leftDeviceOf(ex);
    if (left === null) return true;
    const books = await readBooksRow(ex);
    return !books || books.holderDeviceId === left;
  }
  const books = await readBooksRow(ex);
  if (!books) return false;
  const device = deviceOf(ctx) ?? (await syncDeviceIdOf(ex));
  return books.holderDeviceId === device;
}
