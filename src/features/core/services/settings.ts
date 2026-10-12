import { revalidatePath } from "@/lib/compat/revalidate";
import { db, newId, nowIso } from "@/server/db";
import { getSessionOrThrow } from "@/server/tenant";

/**
 * Generic key/value app settings.
 *
 * Backed by the `Setting` table, which already existed for `classroom_count`
 * and carries a `(adminId, key)` unique index — so this needs no migration, and
 * that matters: src/lib/db/schema.ts is generated from prisma/schema.prisma and
 * must never be hand-edited.
 *
 * Everything here is read as one row set and cached under a single query key, so
 * the lock gate — which runs on *every* navigation — costs one query for the
 * whole session rather than one per key it wants to look at.
 */

/** Known keys. Free-form strings would work, but a typo in a lock key fails
 *  open, and a fail-open security setting is the one kind that must not be
 *  possible to write by accident. */
export type SettingKey = "manager_password_hash" | "manager_recovery_hash" | "locked_pages" | "classroom_count";

export type AppSettings = Partial<Record<SettingKey, string>>;

/** The query key every consumer shares. Not a `pathKey`: settings are not a
 *  page, and no `revalidatePath()` in the ported server actions targets them. */
export const SETTINGS_QUERY_KEY = ["settings"] as const;

export async function getAppSettings(): Promise<AppSettings> {
  const session = await getSessionOrThrow();
  const rows = await db.selectFrom("Setting").select(["key", "value"]).where("adminId", "=", session.user.id).execute();

  const out: AppSettings = {};
  for (const row of rows) out[row.key as SettingKey] = row.value;
  return out;
}

/**
 * Upserts each key in `patch`.
 *
 * Deliberately **not** wrapped in a transaction, matching the rest of this
 * codebase's settings writes. Callers that have an ordering requirement between
 * two keys — `createPassword` and `clearPassword` in src/lib/auth.ts do — call
 * this twice in the order that fails safe, rather than relying on
 * `Object.entries` insertion order, which survives exactly one refactor.
 */
export async function saveAppSettings(patch: AppSettings): Promise<void> {
  const session = await getSessionOrThrow();
  const now = nowIso();

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db
      .insertInto("Setting")
      .values({ id: newId(), key, value, adminId: session.user.id, updatedAt: now })
      .onConflict((oc) => oc.columns(["adminId", "key"]).doUpdateSet({ value, updatedAt: now }))
      .execute();
  }

  // The scheduling page reads `classroom_count` through its own query key, so a
  // write from the Settings screen has to reach it.
  if ("classroom_count" in patch) revalidatePath("/dashboard/scheduling");
}
