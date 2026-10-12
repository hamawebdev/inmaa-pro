import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";

import { isSystemSetting, SETTING_DEFAULTS, type SettingKey, type SettingValue } from "./catalogue";

export { SETTING_DEFAULTS, SETTING_KEYS, type SettingKey, type SettingValue } from "./catalogue";

/**
 * Settings: one value per key, typed, with its default when nobody changed it.
 *
 * Both functions take the executor, so they are safe inside a transaction.
 * Nothing caches a value across actions: a rule changed in Settings applies to
 * the next thing saved.
 */
export async function getSetting<K extends SettingKey>(ex: Executor, key: K): Promise<SettingValue<K>> {
  const row = await ex.selectFrom("Setting").select("value").where("key", "=", key).executeTakeFirst();
  if (!row) return SETTING_DEFAULTS[key];
  return JSON.parse(row.value) as SettingValue<K>;
}

/** Several settings in one query, for a screen or a computation that needs a handful. */
export async function getSettings<K extends SettingKey>(
  ex: Executor,
  keys: readonly K[],
): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = keys.length
    ? await ex.selectFrom("Setting").select(["key", "value"]).where("key", "in", keys).execute()
    : [];
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const out = {} as { [P in K]: SettingValue<P> };
  for (const key of keys) {
    const text = stored.get(key);
    out[key] = (text === undefined ? SETTING_DEFAULTS[key] : JSON.parse(text)) as SettingValue<typeof key>;
  }
  return out;
}

/**
 * Writes one setting. A change a person made is logged with its old and new
 * value; the keys the program writes for itself (`system.*`, `shell.*`) are not.
 */
export async function setSetting<K extends SettingKey>(
  ex: Executor,
  ctx: ServiceContext,
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  const system = isSystemSetting(key);
  if (!system) requireSection(ctx, "SETTINGS", "WRITE");

  const before = await ex.selectFrom("Setting").select(["id", "value"]).where("key", "=", key).executeTakeFirst();
  const text = JSON.stringify(value);
  if (before?.value === text) return;

  if (before) {
    await ex
      .updateTable("Setting")
      .set({ value: text, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
  } else {
    await ex
      .insertInto("Setting")
      .values({ id: newId(), key, value: text, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .execute();
  }

  if (!system) {
    await logChange(ex, ctx, {
      owner: "FOUNDATION",
      action: "SETTINGS_CHANGE",
      entity: "Setting",
      entityId: key,
      entityLabel: key,
      changes: { [key]: [before ? JSON.parse(before.value) : SETTING_DEFAULTS[key], value] },
    });
  }
}
