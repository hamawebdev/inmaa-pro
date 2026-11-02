import { sql } from "kysely";

import { CHAINED_TABLES } from "@/lib/db/chain-columns";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { afterApplyRow, beforeApplyRow } from "@/lib/sync/books";

import { hlcDevice, maxHlc } from "./hlc";
import type { RemoteChange } from "./payload";
import type { SqlValue, SyncHeldReason } from "./services/types";
import { readState, writeState, type LineIntents } from "./state";

/**
 * The merge (docs/sync/DECISION.md section 4): the other laptop's changes,
 * applied to this database through the same triggers, checks, unique indexes
 * and foreign keys as a local change.
 *
 * - An insert of a missing row inserts it; an insert of a row this laptop
 *   already has (a seed, a setting, a zone made on both) merges field by field,
 *   the later insert winning each field.
 * - An update, field by field, by the stamps in `SyncCell`: a field whose stamp
 *   here is the one the change replaced moves forward; otherwise both laptops
 *   changed it while apart, the later stamp wins on both, and the value that
 *   lost goes to `SyncConflict` when it differs.
 * - A delete stands where the database allows it; what this laptop had changed
 *   on the record since goes to `SyncConflict`.
 * - A change the database refuses is held in `SyncHeld` with its reason, and
 *   the rest goes on. Each change is one statement, so SQLite's own statement
 *   rollback leaves nothing of a refused one.
 * - Two lines given the same number inside one document while apart: every
 *   device places the lines of that document by one rule (creation time, then
 *   id: the earlier keeps its number, the later goes to the next free one), so
 *   all devices show the same numbers once they hold the same lines, however
 *   many devices added one (`placeLines`).
 *
 * Everything here runs inside the caller's transaction with
 * `SyncSession.applying = 1` (`beginApplying` / `endApplying`), so nothing it
 * writes is captured again: not even a line's placement, which every device
 * works out for itself.
 */

/** Tables that stay on each laptop: never applied, whatever arrives. */
const LOCAL_TABLES = new Set([
  "Sequence",
  "ChainHead",
  "BackupRun",
  "SyncSession",
  "SyncOutbox",
  "SyncCell",
  "SyncState",
  "SyncHeld",
  "SyncConflict",
  "_license",
  "_sqlx_migrations",
]);

/** Fields that stay on each laptop, and the cached totals each laptop recomputes from the rows it receives. */
const LOCAL_ON_INSERT: Readonly<Record<string, Readonly<Record<string, SqlValue>>>> = {
  PaymentDue: { paidAmount: 0 },
  StockItem: { onHandQty: 0 },
  User: { failedSignInCount: 0, lastSignInAt: null },
};
const LOCAL_COLUMNS: Readonly<Record<string, ReadonlySet<string>>> = {
  PaymentDue: new Set(["paidAmount"]),
  StockItem: new Set(["onHandQty"]),
  User: new Set(["failedSignInCount", "lastSignInAt"]),
};

/** A setting kept per laptop (`system.*` except the database id, `backup.*`). */
export function isLocalSettingKey(key: unknown): boolean {
  return (
    typeof key === "string" && (key.startsWith("backup.") || (key.startsWith("system.") && key !== "system.databaseId"))
  );
}

/** Columns that change with every save: merged by their stamps like any field, never shown as a conflict. */
const BOOKKEEPING = new Set(["createdAt", "updatedAt", "createdByUserId", "updatedByUserId"]);

/**
 * Numbers of lines inside one document: `(parent…, seq)` unique, filled on
 * several devices while apart. Only a table whose number can be changed is
 * placed; on an append-only one (`PurchaseLine`) the clash is held on every
 * device for the office, and the books' tables (`InvoiceLine`,
 * `InvoiceVisit`, `StaffDebtEntry`) are written on one device only.
 */
export const LINE_NUMBERS: Readonly<Record<string, { parent: readonly string[]; seq: string }>> = {
  PaymentDue: { parent: ["fileId"], seq: "seq" },
};

const CHAINED: ReadonlySet<string> = new Set(CHAINED_TABLES);

// ─── Small helpers ───────────────────────────────────────────────────────────

const columnCache = new Map<string, ReadonlySet<string>>();

/** The columns this database's table has, or null for a table it does not have. */
export async function columnsOf(ex: Executor, table: string): Promise<ReadonlySet<string> | null> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const { rows } = await sql<{ name: string }>`SELECT "name" FROM pragma_table_info(${table})`.execute(ex);
  if (rows.length === 0) return null;
  const columns = new Set(rows.map((row) => row.name));
  columnCache.set(table, columns);
  return columns;
}

function norm(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  return JSON.stringify(value);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return norm(a) === norm(b);
}

export async function readRow(ex: Executor, table: string, id: string): Promise<Record<string, SqlValue> | null> {
  const { rows } = await sql<Record<string, unknown>>`SELECT * FROM ${sql.table(table)} WHERE "id" = ${id}`.execute(ex);
  const row = rows[0];
  if (!row) return null;
  const out: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(row)) out[key] = norm(value);
  return out;
}

async function cellsOf(ex: Executor, table: string, id: string): Promise<Map<string, string>> {
  const rows = await ex
    .selectFrom("SyncCell")
    .select(["col", "hlc"])
    .where("tbl", "=", table)
    .where("rowId", "=", id)
    .execute();
  return new Map(rows.map((row) => [row.col, row.hlc]));
}

async function writeCells(ex: Executor, table: string, id: string, cells: ReadonlyMap<string, string>): Promise<void> {
  for (const [col, hlc] of cells) {
    await ex
      .insertInto("SyncCell")
      .values({ tbl: table, rowId: id, col, hlc })
      .onConflict((oc) => oc.columns(["tbl", "rowId", "col"]).doUpdateSet({ hlc }))
      .execute();
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return String(error);
}

/** A fault in the code (not a refusal by the database) is thrown on, never held. */
function isCodeFault(error: unknown): boolean {
  return error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError;
}

export function heldReasonOf(message: string, op: RemoteChange["op"]): SyncHeldReason {
  if (/UNIQUE constraint failed/i.test(message)) return "UNIQUE";
  if (/FOREIGN KEY constraint failed/i.test(message)) return op === "D" ? "IN_USE" : "MISSING_PARENT";
  if (/constraint failed|^[A-Z_]+:|SYNC_|CHAIN|CACHE/.test(message)) return "RULE";
  return "OTHER";
}

// ─── The applying flag ───────────────────────────────────────────────────────

export async function beginApplying(ex: Executor, hlc: string | null): Promise<void> {
  // The clock first: a change made here after seeing this one sorts after it.
  // A stamp already set (a service settling a held change) is kept for its own writes.
  const session = await ex.selectFrom("SyncSession").select("hlc").where("id", "=", "session").executeTakeFirst();
  const next = maxHlc(session?.hlc ?? null, hlc);
  await ex.updateTable("SyncSession").set({ applying: 1, hlc: next }).where("id", "=", "session").execute();
}

export async function endApplying(ex: Executor): Promise<void> {
  await ex.updateTable("SyncSession").set({ applying: 0 }).where("id", "=", "session").execute();
}

// ─── Outcome ─────────────────────────────────────────────────────────────────

export interface ApplyOutcome {
  applied: number;
  held: number;
  conflicts: number;
  /** The tables a change was applied to: the screens showing them are refreshed. */
  tables: Set<string>;
  /** Upload rows inserted: their bytes are fetched. */
  uploads: Array<Record<string, SqlValue>>;
}

/**
 * A transaction's changes as they are applied: an update of a row the same
 * transaction inserted is folded into the insert (they carry one stamp, and
 * the row arrives as the transaction left it).
 */
export function foldTransaction(changes: readonly RemoteChange[]): RemoteChange[] {
  const out: RemoteChange[] = [];
  const inserted = new Map<string, RemoteChange>();
  for (const change of changes) {
    const key = `${change.t}\u0000${change.id}`;
    if (change.op === "I") {
      const copy = { ...change, data: { ...change.data } };
      inserted.set(key, copy);
      out.push(copy);
      continue;
    }
    const insert = inserted.get(key);
    if (change.op === "U" && insert) {
      for (const [col, pair] of Object.entries(change.data as Record<string, [unknown, unknown]>)) {
        insert.data[col] = pair[0];
      }
      continue;
    }
    if (change.op === "D") inserted.delete(key);
    out.push(change);
  }
  return out;
}

export function emptyOutcome(): ApplyOutcome {
  return { applied: 0, held: 0, conflicts: 0, tables: new Set(), uploads: [] };
}

export interface ChangeOrigin {
  /** The laptop the change was made on. */
  deviceId: string;
  txSeq: number;
  /** The stamp of its transaction. */
  hlc: string;
  /** Its place in the transaction. */
  index: number;
}

/** The id of a held change: sorts in the order the changes were made. */
export function heldIdOf(origin: ChangeOrigin): string {
  return `${origin.hlc}:${String(origin.index).padStart(5, "0")}`;
}

// ─── Conflicts ───────────────────────────────────────────────────────────────

interface ConflictInput {
  tbl: string;
  rowId: string;
  col: string;
  keptValue: SqlValue;
  keptHlc: string | null;
  otherValue: SqlValue;
  otherHlc: string | null;
  otherDeviceId: string;
}

async function recordConflict(
  ex: Executor,
  ctx: ServiceContext,
  input: ConflictInput,
  outcome: ApplyOutcome,
): Promise<void> {
  const id = `${input.tbl}:${input.rowId}:${input.col}:${input.keptHlc ?? "-"}:${input.otherHlc ?? "-"}`;
  const inserted = await ex
    .insertInto("SyncConflict")
    .values({
      id,
      tbl: input.tbl,
      rowId: input.rowId,
      col: input.col,
      keptValue: JSON.stringify(input.keptValue),
      keptHlc: input.keptHlc ?? "",
      otherValue: JSON.stringify(input.otherValue),
      otherHlc: input.otherHlc ?? "",
      otherDeviceId: input.otherDeviceId,
      detectedAt: ctx.now,
      resolvedAt: null,
      resolution: null,
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .executeTakeFirst();
  if (Number(inserted.numInsertedOrUpdatedRows ?? 0) > 0) outcome.conflicts += 1;
}

// ─── Holding ─────────────────────────────────────────────────────────────────

async function hold(
  ex: Executor,
  ctx: ServiceContext,
  origin: ChangeOrigin,
  change: RemoteChange,
  reason: string,
  outcome: ApplyOutcome,
  retrying: boolean,
): Promise<"held"> {
  const id = heldIdOf(origin);
  if (retrying) {
    await ex
      .updateTable("SyncHeld")
      .set((eb) => ({ reason, lastTriedAt: ctx.now, tries: eb("tries", "+", 1) }))
      .where("id", "=", id)
      .execute();
  } else {
    await ex
      .insertInto("SyncHeld")
      .values({
        id,
        originDeviceId: origin.deviceId,
        txSeq: origin.txSeq,
        hlc: origin.hlc,
        tbl: change.t,
        rowId: change.id,
        change: JSON.stringify({ ...change, index: origin.index }),
        reason,
        firstAt: ctx.now,
        lastTriedAt: ctx.now,
        tries: 1,
        resolvedAt: null,
        resolution: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }
  outcome.held += 1;
  return "held";
}

/** Whether a change to this row made before this one is still held: this one waits behind it. */
async function waitsBehindHeld(ex: Executor, change: RemoteChange, beforeId: string | null): Promise<boolean> {
  const row = await ex
    .selectFrom("SyncHeld")
    .select("id")
    .where("tbl", "=", change.t)
    .where("rowId", "=", change.id)
    .where("resolvedAt", "is", null)
    .$if(beforeId !== null, (qb) => qb.where("id", "<", beforeId!))
    .executeTakeFirst();
  return row !== undefined;
}

// ─── Applying one change ─────────────────────────────────────────────────────

export type ChangeResult = "applied" | "held" | "skipped";

/**
 * Applies one change of the other laptop's. `retrying` is set when the change
 * is a held one tried again: it is then updated in place, never held twice.
 */
export async function applyChange(
  ex: Executor,
  ctx: ServiceContext,
  origin: ChangeOrigin,
  change: RemoteChange,
  outcome: ApplyOutcome,
  options: { retrying?: boolean } = {},
): Promise<ChangeResult> {
  const retrying = options.retrying === true;
  const table = change.t;
  if (LOCAL_TABLES.has(table)) return "skipped";
  if (table === "Setting") {
    const key = change.op === "U" ? null : change.data.key;
    if (key !== null && isLocalSettingKey(key)) return "skipped";
  }
  const columns = await columnsOf(ex, table);
  if (!columns) return hold(ex, ctx, origin, change, `unknown table ${table}`, outcome, retrying);
  if (await waitsBehindHeld(ex, change, retrying ? heldIdOf(origin) : null)) {
    return hold(ex, ctx, origin, change, "WAITS", outcome, retrying);
  }

  try {
    let result: ChangeResult;
    if (change.op === "I") result = await applyInsert(ex, ctx, origin, change, columns, outcome);
    else if (change.op === "U") result = await applyUpdate(ex, ctx, origin, change, columns, outcome);
    else result = await applyDelete(ex, ctx, origin, change, outcome);
    if (result === "applied") {
      outcome.applied += 1;
      outcome.tables.add(table);
    }
    return result;
  } catch (error) {
    if (isCodeFault(error)) throw error;
    return hold(ex, ctx, origin, change, messageOf(error), outcome, retrying);
  }
}

function insertValues(table: string, data: Record<string, unknown>, columns: ReadonlySet<string>) {
  const values: Record<string, SqlValue> = {};
  for (const [col, value] of Object.entries(data)) if (columns.has(col)) values[col] = norm(value);
  const local = LOCAL_ON_INSERT[table];
  if (local) for (const [col, value] of Object.entries(local)) if (col in values) values[col] = value;
  return values;
}

/** Inserts a row of the other laptop's as it is (the caller has set `applying`). */
export async function insertRowValues(ex: Executor, table: string, values: Record<string, SqlValue>): Promise<void> {
  const cols = Object.keys(values);
  await sql`INSERT INTO ${sql.table(table)} (${sql.join(cols.map((col) => sql.ref(col)))}) VALUES (${sql.join(
    cols.map((col) => values[col]),
  )})`.execute(ex);
}

async function updateRow(ex: Executor, table: string, id: string, set: Record<string, SqlValue>): Promise<void> {
  const cols = Object.keys(set);
  if (cols.length === 0) return;
  await sql`UPDATE ${sql.table(table)} SET ${sql.join(
    cols.map((col) => sql`${sql.ref(col)} = ${set[col]}`),
  )} WHERE "id" = ${id}`.execute(ex);
}

function touch(ctx: ServiceContext, table: string, values: Record<string, SqlValue>): void {
  if (!CHAINED.has(table)) return;
  ctx.touchedChains.add(table === "AuditLog" && typeof values.chain === "string" ? values.chain : table);
}

const RANDOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function applyInsert(
  ex: Executor,
  ctx: ServiceContext,
  origin: ChangeOrigin,
  change: RemoteChange,
  columns: ReadonlySet<string>,
  outcome: ApplyOutcome,
): Promise<ChangeResult> {
  const table = change.t;
  const values = insertValues(table, change.data, columns);
  const existing = await readRow(ex, table, change.id);
  if (existing) return mergeInsert(ex, ctx, origin, change, values, existing, outcome);

  await beforeApplyRow(ex, ctx, table, values);
  const line = LINE_NUMBERS[table];
  try {
    await insertRowValues(ex, table, values);
  } catch (error) {
    if (!line || !isLineClash(messageOf(error), table, line.seq)) throw error;
    // Another line holds its number here: in at a free number for now, then the document is placed by the rule.
    const intended = Number(values[line.seq]);
    values[line.seq] = (await topLine(ex, table, values)) + 1;
    await insertRowValues(ex, table, values);
    await noteIntent(ex, table, change.id, intended, Number(values[line.seq]));
    await placeLines(ex, table, values);
  }
  await afterApplyRow(ex, ctx, table, values);
  touch(ctx, table, values);
  if (!RANDOM_ID.test(change.id)) await writeCells(ex, table, change.id, new Map([["*", origin.hlc]]));
  if (table === "Upload") outcome.uploads.push(values);
  return "applied";
}

/** Two laptops made the same row (a seed, a setting, a zone): each field goes to the later insert. */
async function mergeInsert(
  ex: Executor,
  ctx: ServiceContext,
  origin: ChangeOrigin,
  change: RemoteChange,
  values: Record<string, SqlValue>,
  existing: Record<string, SqlValue>,
  outcome: ApplyOutcome,
): Promise<ChangeResult> {
  const table = change.t;
  const local = LOCAL_COLUMNS[table];
  const cells = await cellsOf(ex, table, change.id);
  const rowStamp = cells.get("*") ?? null;
  const set: Record<string, SqlValue> = {};
  const won = new Map<string, string>();
  const conflicts: ConflictInput[] = [];
  for (const [col, value] of Object.entries(values)) {
    if (col === "id" || local?.has(col) || !(col in existing)) continue;
    const mine = existing[col];
    const mineStamp = cells.get(col) ?? rowStamp;
    if (mineStamp !== null && origin.hlc <= mineStamp) {
      if (!sameValue(mine, value) && !BOOKKEEPING.has(col) && origin.hlc < mineStamp) {
        conflicts.push(conflict(table, change.id, col, mine, mineStamp, value, origin.hlc, origin.deviceId));
      }
      continue;
    }
    if (sameValue(mine, value)) continue;
    set[col] = value;
    won.set(col, origin.hlc);
    if (!BOOKKEEPING.has(col) && mineStamp !== null) {
      conflicts.push(conflict(table, change.id, col, value, origin.hlc, mine, mineStamp, hlcDevice(mineStamp)));
    }
  }
  if (Object.keys(set).length === 0 && conflicts.length === 0 && rowStamp !== null && origin.hlc <= rowStamp) {
    return "skipped";
  }
  await updateRow(ex, table, change.id, set);
  if (rowStamp === null || origin.hlc > rowStamp) won.set("*", origin.hlc);
  await writeCells(ex, table, change.id, won);
  for (const input of conflicts) await recordConflict(ex, ctx, input, outcome);
  return "applied";
}

function conflict(
  tbl: string,
  rowId: string,
  col: string,
  keptValue: SqlValue,
  keptHlc: string | null,
  otherValue: SqlValue,
  otherHlc: string | null,
  otherDeviceId: string,
): ConflictInput {
  return { tbl, rowId, col, keptValue, keptHlc, otherValue, otherHlc, otherDeviceId };
}

async function applyUpdate(
  ex: Executor,
  ctx: ServiceContext,
  origin: ChangeOrigin,
  change: RemoteChange,
  columns: ReadonlySet<string>,
  outcome: ApplyOutcome,
): Promise<ChangeResult> {
  const table = change.t;
  const existing = await readRow(ex, table, change.id);
  const fields = Object.entries(change.data as Record<string, [unknown, string | null]>).filter(
    ([col]) => columns.has(col) && !LOCAL_COLUMNS[table]?.has(col),
  );
  if (!existing) {
    // Deleted here while it was changed there: the delete stands, the changes are kept in the list.
    for (const [col, [value]] of fields) {
      if (BOOKKEEPING.has(col)) continue;
      await recordConflict(
        ex,
        ctx,
        conflict(table, change.id, col, null, null, norm(value), origin.hlc, origin.deviceId),
        outcome,
      );
    }
    return "skipped";
  }
  if (table === "Setting" && isLocalSettingKey(existing.key)) return "skipped";

  const cells = await cellsOf(ex, table, change.id);
  // The stamp of the row's insert here (a row with an id made from what it is: the later of the inserts that met).
  const rowStamp = cells.get("*") ?? null;
  const set: Record<string, SqlValue> = {};
  const won = new Map<string, string>();
  const conflicts: ConflictInput[] = [];
  for (const [col, [raw, replaced]] of fields) {
    const value = norm(raw);
    const mine = existing[col];
    const colStamp = cells.get(col) ?? null;
    if (colStamp === origin.hlc) {
      // Written earlier in this same transaction (or this change replayed): it moves forward, no conflict.
      if (!sameValue(mine, value)) set[col] = value;
      continue;
    }
    if (colStamp === null) {
      // Not changed here since the row's insert. The change moves forward unless an insert here is later than it
      // (two devices made the same row while apart, and the later insert holds every field it did not see changed).
      // A change made after seeing that insert is later than it: the hybrid clock never goes back.
      if (rowStamp === null || origin.hlc > rowStamp) {
        if (!sameValue(mine, value)) set[col] = value;
        won.set(col, origin.hlc);
      } else if (!sameValue(mine, value) && !BOOKKEEPING.has(col)) {
        conflicts.push(conflict(table, change.id, col, mine, rowStamp, value, origin.hlc, origin.deviceId));
      }
      continue;
    }
    if (colStamp === (replaced ?? null) || origin.hlc > colStamp) {
      // Moves forward: the change replaced what is here, or both changed it and this one is later.
      const concurrent = colStamp !== (replaced ?? null);
      if (!sameValue(mine, value)) set[col] = value;
      won.set(col, origin.hlc);
      if (concurrent && !sameValue(mine, value) && !BOOKKEEPING.has(col)) {
        conflicts.push(conflict(table, change.id, col, value, origin.hlc, mine, colStamp, hlcDevice(colStamp)));
      }
      continue;
    }
    // Both changed it while apart and this device's change is the later one: it stays.
    if (!sameValue(mine, value) && !BOOKKEEPING.has(col)) {
      conflicts.push(conflict(table, change.id, col, mine, colStamp, value, origin.hlc, origin.deviceId));
    }
  }
  await updateLineAware(ex, table, change.id, set, existing);
  await writeCells(ex, table, change.id, won);
  for (const input of conflicts) await recordConflict(ex, ctx, input, outcome);
  // A later change of a field settles the conflicts listed on it: both laptops moved on from them.
  for (const col of won.keys()) {
    await ex
      .updateTable("SyncConflict")
      .set({ resolvedAt: ctx.now, resolution: "SUPERSEDED" })
      .where("tbl", "=", table)
      .where("rowId", "=", change.id)
      .where("col", "=", col)
      .where("resolvedAt", "is", null)
      .where("keptHlc", "<", origin.hlc)
      .where("otherHlc", "<", origin.hlc)
      .execute();
  }
  return won.size > 0 || conflicts.length > 0 ? "applied" : "skipped";
}

async function applyDelete(
  ex: Executor,
  ctx: ServiceContext,
  origin: ChangeOrigin,
  change: RemoteChange,
  outcome: ApplyOutcome,
): Promise<ChangeResult> {
  const table = change.t;
  const existing = await readRow(ex, table, change.id);
  if (!existing) return "skipped"; // a cascade already took it, or it never came
  if (table === "Setting" && isLocalSettingKey(existing.key)) return "skipped";
  const cells = await cellsOf(ex, table, change.id);
  await sql`DELETE FROM ${sql.table(table)} WHERE "id" = ${change.id}`.execute(ex);
  // What this laptop changed on the record since the other laptop last saw it: kept in the list.
  const local = LOCAL_COLUMNS[table];
  for (const [col, mine] of Object.entries(existing)) {
    if (BOOKKEEPING.has(col) || local?.has(col) || col === "id") continue;
    const seen = change.data[col];
    const mineStamp = cells.get(col) ?? null;
    // Only a change made here that the other laptop had not seen when it deleted.
    if (seen === undefined || sameValue(seen, mine) || mineStamp === null) continue;
    await recordConflict(
      ex,
      ctx,
      conflict(table, change.id, col, null, origin.hlc, mine, mineStamp, hlcDevice(mineStamp)),
      outcome,
    );
  }
  await ex.deleteFrom("SyncCell").where("tbl", "=", table).where("rowId", "=", change.id).execute();
  if (LINE_NUMBERS[table]) {
    await dropIntent(ex, table, change.id);
    await placeLines(ex, table, existing);
  }
  return "applied";
}

// ─── Line numbers ────────────────────────────────────────────────────────────

function isLineClash(message: string, table: string, seq: string): boolean {
  return /UNIQUE constraint failed/i.test(message) && message.includes(`${table}.${seq}`);
}

/**
 * An update of another device's: a line whose new number another line holds here goes in with its other fields,
 * and the document is placed by the rule; the number it was given is remembered as the one it wants.
 */
async function updateLineAware(
  ex: Executor,
  table: string,
  id: string,
  set: Record<string, SqlValue>,
  existing: Record<string, SqlValue>,
): Promise<void> {
  const line = LINE_NUMBERS[table];
  if (!line || !(line.seq in set)) {
    await updateRow(ex, table, id, set);
    return;
  }
  const wanted = Number(set[line.seq]);
  try {
    await updateRow(ex, table, id, set);
    await noteIntent(ex, table, id, wanted, wanted);
  } catch (error) {
    if (!isLineClash(messageOf(error), table, line.seq)) throw error;
    const rest = { ...set };
    delete rest[line.seq];
    await updateRow(ex, table, id, rest);
    await noteIntent(ex, table, id, wanted, Number(existing[line.seq]));
  }
  await placeLines(ex, table, { ...existing, ...set });
}

const intentKey = (table: string, id: string) => `${table}:${id}`;

async function readIntents(ex: Executor): Promise<LineIntents> {
  return (await readState(ex, "lines")) ?? {};
}

async function writeIntents(ex: Executor, intents: LineIntents): Promise<void> {
  await writeState(ex, "lines", Object.keys(intents).length > 0 ? intents : null);
}

/** The number a line was given by its last change (insert or update), and where it stands here now. */
async function noteIntent(ex: Executor, table: string, id: string, intended: number, placed: number): Promise<void> {
  const intents = await readIntents(ex);
  const key = intentKey(table, id);
  if (intended === placed) {
    if (!(key in intents)) return;
    delete intents[key];
  } else {
    intents[key] = { intended, placed };
  }
  await writeIntents(ex, intents);
}

async function dropIntent(ex: Executor, table: string, id: string): Promise<void> {
  const intents = await readIntents(ex);
  const key = intentKey(table, id);
  if (!(key in intents)) return;
  delete intents[key];
  await writeIntents(ex, intents);
}

function documentFilter(table: string, parentValues: Record<string, unknown>) {
  const { parent } = LINE_NUMBERS[table];
  let where = sql`1 = 1`;
  for (const col of parent) where = sql`${where} AND ${sql.ref(col)} = ${norm(parentValues[col])}`;
  return where;
}

async function topLine(ex: Executor, table: string, parentValues: Record<string, unknown>): Promise<number> {
  const { seq } = LINE_NUMBERS[table];
  const { rows } = await sql<{ top: number | null }>`SELECT MAX(${sql.ref(seq)}) AS "top" FROM ${sql.table(
    table,
  )} WHERE ${documentFilter(table, parentValues)}`.execute(ex);
  return Number(rows[0]?.top ?? 0);
}

/**
 * Places the lines of one document by the rule every device applies the same way: in order of creation (then id),
 * each line takes the number its last change gave it, or the next number above it that no earlier line took. Lines
 * that do not clash keep their numbers; of two lines given one number while apart, the earlier keeps it. Nothing
 * here is captured: each device works it out from the same lines, so all show the same numbers once they hold the
 * same lines. A line not at the number it was given is remembered (`SyncState` "lines"), so that it goes back when
 * the number is free again. Runs with `applying` set.
 */
export async function placeLines(ex: Executor, table: string, parentValues: Record<string, unknown>): Promise<void> {
  const { seq } = LINE_NUMBERS[table];
  const { rows } = await sql<{ id: string; createdAt: string | null; at: number }>`SELECT "id", "createdAt", ${sql.ref(
    seq,
  )} AS "at" FROM ${sql.table(table)} WHERE ${documentFilter(table, parentValues)}`.execute(ex);
  if (rows.length === 0) return;
  const intents = await readIntents(ex);
  let intentsChanged = false;
  const lines = rows.map((row) => {
    const key = intentKey(table, row.id);
    const intent = intents[key];
    const at = Number(row.at);
    // A line moved since it was placed (a change made here, or applied) wants where it now is.
    const intended = intent && intent.placed === at ? intent.intended : at;
    return { id: row.id, createdAt: String(row.createdAt ?? ""), at, intended, key };
  });
  lines.sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : x.id < y.id ? -1 : 1));
  const taken = new Set<number>();
  const moves: Array<{ id: string; to: number }> = [];
  for (const line of lines) {
    let place = line.intended;
    while (taken.has(place)) place += 1;
    taken.add(place);
    if (place !== line.at) moves.push({ id: line.id, to: place });
    const had = intents[line.key];
    if (place === line.intended) {
      if (had) {
        delete intents[line.key];
        intentsChanged = true;
      }
    } else if (!had || had.intended !== line.intended || had.placed !== place) {
      intents[line.key] = { intended: line.intended, placed: place };
      intentsChanged = true;
    }
  }
  // Out of the way first (below every number), then in place: the unique index never sees two lines on one number.
  for (let i = 0; i < moves.length; i++) await updateRow(ex, table, moves[i].id, { [seq]: -(i + 1) });
  for (const move of moves) await updateRow(ex, table, move.id, { [seq]: move.to });
  if (intentsChanged) await writeIntents(ex, intents);
}

/**
 * Every document holding a line that is not at the number it was given is placed again: after a round of applying,
 * so that a number freed here (a line moved or removed on this device) is taken back by the line that wants it.
 * In the caller's transaction; sets `applying` itself.
 */
export async function placeWaitingLines(ex: Executor): Promise<number> {
  const intents = await readIntents(ex);
  const keys = Object.keys(intents);
  if (keys.length === 0) return 0;
  await beginApplying(ex, null);
  const seen = new Set<string>();
  let documents = 0;
  for (const key of keys) {
    const cut = key.indexOf(":");
    const table = key.slice(0, cut);
    const id = key.slice(cut + 1);
    if (!LINE_NUMBERS[table]) continue;
    const row = await readRow(ex, table, id);
    if (!row) {
      await dropIntent(ex, table, id);
      continue;
    }
    const doc = `${table}:${LINE_NUMBERS[table].parent.map((col) => String(row[col])).join("\u0000")}`;
    if (seen.has(doc)) continue;
    seen.add(doc);
    await placeLines(ex, table, row);
    documents += 1;
  }
  await endApplying(ex);
  return documents;
}
