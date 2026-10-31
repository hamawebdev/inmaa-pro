import { sql } from "kysely";

import { requireCapability } from "@/lib/access/session";
import { logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

import {
  beginApplying,
  columnsOf,
  emptyOutcome,
  endApplying,
  heldReasonOf,
  insertRowValues,
  readRow,
  sameValue,
} from "../apply";
import { hlcDevice, hlcInstant } from "../hlc";
import type { RemoteChange } from "../payload";
import { retryHeldChanges } from "../round";
import type {
  ListConflictsInput,
  ResolveConflictInput,
  ResolveHeldInput,
  RetryHeldInput,
  SqlValue,
  SyncConflictList,
  SyncConflictRow,
  SyncHeldAction,
  SyncHeldRow,
} from "./types";

/**
 * «تعارضات المزامنة» (DECISION section 4): the values that lost a merge, and
 * the changes this database refused. Every resolution here is an ordinary
 * change of this laptop's, captured and sent: the other laptop takes it at
 * its next sync and both converge.
 */

export const CONFLICT_ERRORS = {
  conflictUnknown: "This conflict does not exist or was already settled.",
  heldUnknown: "This held change does not exist or was already settled.",
  recordGone: "This record was deleted on one of the laptops: its value cannot be put back.",
  actionNotAllowed: "This record cannot be settled that way.",
  stillRefused: "The database still refuses this change. Fix the cause first.",
} as const;

const SETTINGS_PATH = "/dashboard/settings/sync";

function parseValue(json: string): SqlValue {
  try {
    return JSON.parse(json) as SqlValue;
  } catch {
    return json;
  }
}

async function deviceNames(ex: Executor): Promise<Map<string, string>> {
  const rows = await ex.selectFrom("SyncDevice").select(["id", "name"]).execute();
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** A short label of a record when its table has an obvious one. */
async function recordLabel(_ex: Executor, table: string, row: Record<string, SqlValue> | null): Promise<string | null> {
  if (!row) return null;
  for (const col of ["number", "name", "labelAr", "displayName", "key", "code"]) {
    const value = row[col];
    if (typeof value === "string" && value) return value;
  }
  if (table === "StaffMember" && typeof row.lastName === "string")
    return `${row.lastName} ${row.firstName ?? ""}`.trim();
  return null;
}

async function tableTraits(ex: Executor, table: string): Promise<{ softDelete: boolean; hardDelete: boolean }> {
  const columns = await columnsOf(ex, table);
  const triggers = await sql<{ name: string }>`
    SELECT "name" FROM sqlite_master WHERE "type" = 'trigger' AND "tbl_name" = ${table}
      AND ("name" = ${`${table}_no_delete`} OR "name" = ${`${table}_append_only_delete`} OR "name" LIKE ${`${table}_%no_delete%`})`.execute(
    ex,
  );
  const deletable = await sql<{ name: string }>`
    SELECT "name" FROM sqlite_master WHERE "type" = 'trigger' AND "name" = ${`${table}_sync_delete`}`.execute(ex);
  return {
    softDelete: columns?.has("deletedAt") ?? false,
    hardDelete: triggers.rows.length === 0 && deletable.rows.length > 0,
  };
}

/** Columns kept by the services from another field for searching (`nameKey`, `phoneKeys`). */
function isDerivedKey(col: string): boolean {
  return /[a-z](Key|Keys)$/.test(col);
}

// ─── Listing ─────────────────────────────────────────────────────────────────

export async function listConflicts(
  ex: Executor,
  ctx: ServiceContext,
  input: ListConflictsInput = {},
): Promise<SyncConflictList> {
  requireCapability(ctx, "sync.manage");
  const names = await deviceNames(ex);
  const conflictRows = await ex
    .selectFrom("SyncConflict")
    .selectAll()
    .$if(!input.includeResolved, (qb) => qb.where("resolvedAt", "is", null))
    .orderBy("detectedAt", "desc")
    .orderBy("id")
    .limit(500)
    .execute();
  const books = await import("@/lib/sync/books");
  const booksTables = new Set<string>(books.BOOKS_TABLES);
  const removed = new Set(
    (await ex.selectFrom("SyncDevice").select("id").where("removedAt", "is not", null).execute()).map((r) => r.id),
  );

  const conflicts: SyncConflictRow[] = [];
  for (const row of conflictRows) {
    // A search key follows its field: settled with it, never listed alone.
    if (isDerivedKey(row.col)) continue;
    const record = await readRow(ex, row.tbl, row.rowId).catch(() => null);
    conflicts.push({
      id: row.id,
      tbl: row.tbl,
      rowId: row.rowId,
      col: row.col,
      kind: record ? "FIELD" : "DELETED",
      recordLabel: await recordLabel(ex, row.tbl, record),
      keptValue: parseValue(row.keptValue),
      keptAt: hlcInstant(row.keptHlc),
      keptDeviceId: row.keptHlc ? hlcDevice(row.keptHlc) : null,
      otherValue: parseValue(row.otherValue),
      otherAt: hlcInstant(row.otherHlc),
      otherDeviceId: row.otherDeviceId,
      otherDeviceName: names.get(row.otherDeviceId) ?? null,
      detectedAt: row.detectedAt,
      resolvedAt: row.resolvedAt,
      resolution: (row.resolution as SyncConflictRow["resolution"]) ?? null,
    });
  }

  const heldRows = await ex
    .selectFrom("SyncHeld")
    .selectAll()
    .$if(!input.includeResolved, (qb) => qb.where("resolvedAt", "is", null))
    .orderBy("id")
    .limit(500)
    .execute();
  const held: SyncHeldRow[] = [];
  for (const row of heldRows) {
    const change = JSON.parse(row.change) as RemoteChange;
    const mine = await readRow(ex, row.tbl, row.rowId).catch(() => null);
    const values: Record<string, SqlValue> = {};
    for (const [col, value] of Object.entries(change.data)) {
      values[col] = change.op === "U" ? ((value as [SqlValue, unknown])[0] ?? null) : (value as SqlValue);
    }
    const legal = booksTables.has(row.tbl) && removed.has(row.originDeviceId);
    conflicts.push(
      ...(legal
        ? [
            {
              id: `held:${row.id}`,
              tbl: row.tbl,
              rowId: row.rowId,
              col: "*",
              kind: "LEGAL_INCIDENT" as const,
              recordLabel: await recordLabel(ex, row.tbl, values),
              keptValue: null,
              keptAt: null,
              keptDeviceId: null,
              otherValue: JSON.stringify(values),
              otherAt: hlcInstant(row.hlc),
              otherDeviceId: row.originDeviceId,
              otherDeviceName: names.get(row.originDeviceId) ?? null,
              detectedAt: row.firstAt,
              resolvedAt: row.resolvedAt,
              resolution: null,
            },
          ]
        : []),
    );
    const traits = await tableTraits(ex, row.tbl);
    const actions: SyncHeldAction[] = ["RETRY"];
    if (change.op !== "I" || traits.hardDelete) actions.push("KEEP_MINE");
    if (change.op === "I" && traits.softDelete) actions.push("SET_ASIDE");
    held.push({
      id: row.id,
      tbl: row.tbl,
      rowId: row.rowId,
      op: change.op,
      recordLabel: await recordLabel(ex, row.tbl, change.op === "U" ? mine : values),
      reasonCode: heldReasonOf(row.reason, change.op),
      reason: row.reason,
      values,
      mine,
      originDeviceId: row.originDeviceId,
      originDeviceName: names.get(row.originDeviceId) ?? null,
      at: hlcInstant(row.hlc),
      firstAt: row.firstAt,
      lastTriedAt: row.lastTriedAt,
      tries: row.tries,
      actions,
      resolvedAt: row.resolvedAt,
      resolution: row.resolution,
    });
  }
  return { conflicts, held };
}

// ─── A change of this laptop's, written into the outbox ──────────────────────

/**
 * Sends a change the capture triggers cannot produce (a value written again
 * unchanged, a row this laptop does not keep) under this transaction's stamp,
 * replacing the stamp the other laptop holds for those fields.
 */
async function sendChange(ex: Executor, change: RemoteChange): Promise<string> {
  const session = await ex
    .selectFrom("SyncSession")
    .select(["txId", "hlc"])
    .where("id", "=", "session")
    .executeTakeFirst();
  if (!session?.txId || !session.hlc) throw new Error("sync: a resolution runs in a stamped transaction");
  // The outbox's rowid numbers it, as the capture triggers' rows.
  await sql`INSERT INTO "SyncOutbox" ("txId", "hlc", "tbl", "rowId", "op", "data")
    VALUES (${session.txId}, ${session.hlc}, ${change.t}, ${change.id}, ${change.op}, ${JSON.stringify(change.data)})`.execute(
    ex,
  );
  return session.hlc;
}

async function writeCell(ex: Executor, tbl: string, rowId: string, col: string, hlc: string): Promise<void> {
  await ex
    .insertInto("SyncCell")
    .values({ tbl, rowId, col, hlc })
    .onConflict((oc) => oc.columns(["tbl", "rowId", "col"]).doUpdateSet({ hlc }))
    .execute();
}

// ─── Conflicts ───────────────────────────────────────────────────────────────

/** «استعمال هذه القيمة» puts the other value back as a new change; «الإبقاء» dismisses. */
export async function resolveConflict(
  ex: Executor,
  ctx: ServiceContext,
  input: ResolveConflictInput,
): Promise<{ id: string }> {
  requireCapability(ctx, "sync.manage");
  const row = await ex.selectFrom("SyncConflict").selectAll().where("id", "=", input.conflictId).executeTakeFirst();
  if (!row || row.resolvedAt) throw new ServiceError(CONFLICT_ERRORS.conflictUnknown);
  // The fields one change wrote together (a phone and its search key) are settled together.
  const together = await ex
    .selectFrom("SyncConflict")
    .selectAll()
    .where("tbl", "=", row.tbl)
    .where("rowId", "=", row.rowId)
    .where("keptHlc", "=", row.keptHlc)
    .where("otherHlc", "=", row.otherHlc)
    .where("resolvedAt", "is", null)
    .execute();
  if (input.resolution === "USE_OTHER") {
    const record = await readRow(ex, row.tbl, row.rowId);
    if (!record || together.some((conflict) => conflict.col === "*")) {
      throw new ServiceError(CONFLICT_ERRORS.recordGone);
    }
    const set: Record<string, SqlValue> = {};
    for (const conflict of together) {
      const value = parseValue(conflict.otherValue);
      if (conflict.col in record && !sameValue(record[conflict.col], value)) set[conflict.col] = value;
    }
    const cols = Object.keys(set);
    if (cols.length > 0) {
      await sql`UPDATE ${sql.table(row.tbl)} SET ${sql.join(
        cols.map((col) => sql`${sql.ref(col)} = ${set[col]}`),
      )} WHERE "id" = ${row.rowId}`.execute(ex);
    }
  }
  if (input.resolution === "KEEP") {
    // Kept as it is: written again as a new change over both stamps, so the other laptop settles it too.
    const record = await readRow(ex, row.tbl, row.rowId);
    const cols = together.map((conflict) => conflict.col).filter((col) => record && col in record);
    if (record && cols.length > 0) {
      const data: Record<string, [SqlValue, string | null]> = {};
      for (const conflict of together) {
        if (conflict.col in record) data[conflict.col] = [record[conflict.col], conflict.keptHlc || null];
      }
      const hlc = await sendChange(ex, { t: row.tbl, id: row.rowId, op: "U", data });
      for (const col of cols) await writeCell(ex, row.tbl, row.rowId, col, hlc);
    }
  }
  await ex
    .updateTable("SyncConflict")
    .set({ resolvedAt: ctx.now, resolution: input.resolution })
    .where(
      "id",
      "in",
      together.map((conflict) => conflict.id),
    )
    .execute();
  return { id: row.id };
}

// ─── Held changes ────────────────────────────────────────────────────────────

/** Tries held changes again: every one, or one. */
export async function retryHeld(
  ex: Executor,
  ctx: ServiceContext,
  input: RetryHeldInput = {},
): Promise<{ applied: number; stillHeld: number }> {
  requireCapability(ctx, "sync.manage");
  const before = await ex
    .selectFrom("SyncHeld")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("resolvedAt", "is", null)
    .executeTakeFirst();
  await retryHeldChanges(ex, ctx, input);
  const after = await ex
    .selectFrom("SyncHeld")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("resolvedAt", "is", null)
    .executeTakeFirst();
  if (input.heldId) {
    const row = await ex.selectFrom("SyncHeld").select("resolvedAt").where("id", "=", input.heldId).executeTakeFirst();
    if (!row) throw new ServiceError(CONFLICT_ERRORS.heldUnknown);
  }
  return { applied: Number(before?.n ?? 0) - Number(after?.n ?? 0), stillHeld: Number(after?.n ?? 0) };
}

/**
 * Settles a held change.
 * - KEEP_MINE: the held change is dropped here, and this laptop's version is
 *   sent as a new change that replaces it on the other laptop (an update: this
 *   laptop's values of those fields; a delete refused here: this laptop's whole
 *   record; a record made on both: the other laptop's copy deleted, where its
 *   table allows a delete).
 * - SET_ASIDE: of the two records that clash, the newer is set aside (a soft
 *   delete, with the reason typed), on both laptops; the held one then applies.
 */
export async function resolveHeld(ex: Executor, ctx: ServiceContext, input: ResolveHeldInput): Promise<{ id: string }> {
  requireCapability(ctx, "sync.manage");
  const row = await ex.selectFrom("SyncHeld").selectAll().where("id", "=", input.heldId).executeTakeFirst();
  if (!row || row.resolvedAt) throw new ServiceError(CONFLICT_ERRORS.heldUnknown);
  const change = JSON.parse(row.change) as RemoteChange & { index: number };
  const traits = await tableTraits(ex, row.tbl);
  const mine = await readRow(ex, row.tbl, row.rowId);

  if (input.action === "KEEP_MINE") {
    if (change.op === "U") {
      if (mine) {
        const data: Record<string, [SqlValue, string]> = {};
        for (const col of Object.keys(change.data)) if (col in mine) data[col] = [mine[col], row.hlc];
        const hlc = await sendChange(ex, { t: row.tbl, id: row.rowId, op: "U", data });
        for (const col of Object.keys(data)) await writeCell(ex, row.tbl, row.rowId, col, hlc);
      }
    } else if (change.op === "D") {
      if (mine) await sendChange(ex, { t: row.tbl, id: row.rowId, op: "I", data: mine });
    } else {
      if (!traits.hardDelete) throw new ServiceError(CONFLICT_ERRORS.actionNotAllowed);
      await sendChange(ex, { t: row.tbl, id: row.rowId, op: "D", data: change.data });
    }
    await settle(ex, ctx, row.id, "KEEP_MINE");
    return { id: row.id };
  }

  // SET_ASIDE: a record made on both laptops that clash on a unique rule.
  if (change.op !== "I" || !traits.softDelete) throw new ServiceError(CONFLICT_ERRORS.actionNotAllowed);
  const reason = input.reason?.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const clash = await clashingRow(ex, row.tbl, change.data, row.reason);
  const theirs = change.data as Record<string, SqlValue>;
  const theirsNewer = !clash || orderKey(theirs) > orderKey(clash);
  const columns = (await columnsOf(ex, row.tbl))!;
  const aside = (values: Record<string, SqlValue>) => ({
    deletedAt: ctx.now,
    ...(columns.has("deletedByUserId") ? { deletedByUserId: ctx.userId } : {}),
    ...(columns.has("updatedAt") ? { updatedAt: ctx.now } : {}),
    ...(columns.has("updatedByUserId") ? { updatedByUserId: ctx.userId } : {}),
    _id: values.id,
  });
  if (theirsNewer) {
    // The other laptop's record is the newer: it comes in set aside here, and the setting aside is sent back.
    const set = aside(theirs);
    const { _id, ...fields } = set;
    void _id;
    const placeholder = new Date(Date.parse(ctx.now) - 1).toISOString();
    await beginApplying(ex, null);
    await insertRowValues(ex, row.tbl, { ...theirs, ...fields, deletedAt: placeholder });
    await endApplying(ex);
    const data: Record<string, [SqlValue, null]> = {};
    for (const [col, value] of Object.entries(fields)) data[col] = [value as SqlValue, null];
    const hlc = await sendChange(ex, { t: row.tbl, id: row.rowId, op: "U", data });
    await sql`UPDATE "SyncSession" SET "applying" = 1 WHERE "id" = 'session'`.execute(ex);
    await sql`UPDATE ${sql.table(row.tbl)} SET "deletedAt" = ${ctx.now} WHERE "id" = ${row.rowId}`.execute(ex);
    await sql`UPDATE "SyncSession" SET "applying" = 0 WHERE "id" = 'session'`.execute(ex);
    for (const col of Object.keys(data)) await writeCell(ex, row.tbl, row.rowId, col, hlc);
    await logErase(ex, ctx, {
      owner: "FOUNDATION",
      action: "SOFT_DELETE",
      reason,
      entity: row.tbl,
      entityId: row.rowId,
      context: { sync: "SET_ASIDE" },
    });
    await settle(ex, ctx, row.id, "SET_ASIDE");
    return { id: row.id };
  }
  // This laptop's record is the newer: set aside here (captured), then the held one applies.
  const set = aside(clash);
  const { _id, ...fields } = set;
  const cols = Object.keys(fields);
  await sql`UPDATE ${sql.table(row.tbl)} SET ${sql.join(
    cols.map((col) => sql`${sql.ref(col)} = ${(fields as Record<string, SqlValue>)[col]}`),
  )} WHERE "id" = ${_id}`.execute(ex);
  await logErase(ex, ctx, {
    owner: "FOUNDATION",
    action: "SOFT_DELETE",
    reason,
    entity: row.tbl,
    entityId: String(_id),
    context: { sync: "SET_ASIDE" },
  });
  const outcome = emptyOutcome();
  await retryHeldChanges(ex, ctx, { heldId: row.id });
  const after = await ex.selectFrom("SyncHeld").select("resolvedAt").where("id", "=", row.id).executeTakeFirst();
  if (!after?.resolvedAt) throw new ServiceError(CONFLICT_ERRORS.stillRefused);
  void outcome;
  return { id: row.id };
}

function orderKey(row: Record<string, SqlValue>): string {
  return `${String(row.createdAt ?? "")}\u0000${String(row.id)}`;
}

/** This laptop's record that a held insert clashes with, found from the unique rule the database named. */
async function clashingRow(
  ex: Executor,
  table: string,
  data: Record<string, unknown>,
  reason: string,
): Promise<Record<string, SqlValue> | null> {
  const match = /UNIQUE constraint failed: (.+)$/i.exec(reason);
  let cols: string[] = [];
  if (match) {
    cols = match[1].split(",").map((part) => part.trim().split(".").pop() ?? "");
  } else {
    // A partial or expression index names itself: read its columns.
    const index = /index '([^']+)'/i.exec(reason)?.[1];
    if (index) {
      const info = await sql<{ name: string | null }>`SELECT "name" FROM pragma_index_info(${index})`.execute(ex);
      cols = info.rows.map((r) => r.name ?? "").filter(Boolean);
    }
  }
  cols = cols.filter((col) => col && col in data);
  if (cols.length === 0) return null;
  let q = sql<Record<string, unknown>>`SELECT * FROM ${sql.table(table)} WHERE "id" <> ${String(data.id)}`;
  for (const col of cols) q = sql`${q} AND ${sql.ref(col)} IS ${data[col] as SqlValue}`;
  if ((await columnsOf(ex, table))?.has("deletedAt")) q = sql`${q} AND "deletedAt" IS NULL`;
  const found = (await q.execute(ex)).rows[0];
  if (!found) return null;
  return Object.fromEntries(
    Object.entries(found).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : (v as SqlValue)]),
  );
}

async function settle(ex: Executor, ctx: ServiceContext, id: string, resolution: string): Promise<void> {
  await ex
    .updateTable("SyncHeld")
    .set({ resolvedAt: ctx.now, resolution, lastTriedAt: ctx.now })
    .where("id", "=", id)
    .execute();
}

// ─── What the screens call ───────────────────────────────────────────────────

export const listConflictsQuery = query(listConflicts);
export const resolveConflictAction = action(resolveConflict, { revalidate: [SETTINGS_PATH] });
export const retryHeldAction = action(retryHeld, { revalidate: [SETTINGS_PATH] });
export const resolveHeldAction = action(resolveHeld, { revalidate: [SETTINGS_PATH] });
