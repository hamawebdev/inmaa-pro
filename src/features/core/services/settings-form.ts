import { requireCapability, requireSection } from "@/lib/access/session";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings, setSetting, type SettingKey, type SettingValue } from "@/lib/settings";

import { schemaOf, SETTING_FIELDS, type SettingsTab } from "../validators/settings-form";

/**
 * The settings a person sets, as Settings › عام and قواعد العمل show them
 * (the forms are described in ../validators/settings-form.ts).
 *
 * Reading needs the Settings section. Writing a work rule needs the
 * capability `settings.rules` as well; every write is one CHANGE in the log
 * per key that changed (`setSetting`).
 */
export const SETTINGS_PATH = "/dashboard/settings";

export async function readSettingValues(
  ex: Executor,
  ctx: ServiceContext,
  input: { tab: SettingsTab },
): Promise<Partial<Record<SettingKey, unknown>>> {
  requireSection(ctx, "SETTINGS", "READ");
  const keys = [...SETTING_FIELDS.values()].filter((field) => field.tab === input.tab).map((field) => field.key);
  return getSettings(ex, keys);
}

/** Checks a value against its form, and the few rules that join two settings. */
function checked(key: SettingKey, value: unknown): unknown {
  const field = SETTING_FIELDS.get(key);
  if (!field) throw new Error(`settings: ${key} has no form`);
  const parsed = schemaOf(field.field).safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    // A rule of the form says what is wrong in its own words; any other refusal is the generic one.
    if (message === "The end must come after the start." || message?.startsWith("Each band must")) {
      throw new ServiceError(message);
    }
    throw new ServiceError("One of the values is not allowed here.");
  }
  return parsed.data;
}

export async function saveSettingValues(
  ex: Executor,
  ctx: ServiceContext,
  input: { values: Partial<Record<SettingKey, unknown>> },
): Promise<{ changed: SettingKey[] }> {
  requireSection(ctx, "SETTINGS", "WRITE");
  const entries = Object.entries(input.values) as Array<[SettingKey, unknown]>;
  const values = new Map(entries.map(([key, value]) => [key, checked(key, value)] as const));
  if ([...values.keys()].some((key) => SETTING_FIELDS.get(key)?.tab === "rules")) {
    requireCapability(ctx, "settings.rules");
  }

  // The rules that join two settings, on the values as they will be.
  const after = {
    ...(await getSettings(ex, ["work.days", "work.restDay", "invoice.missedVisitRule", "invoice.missedVisitAmount"])),
  };
  for (const [key, value] of values) (after as Record<string, unknown>)[key] = value;
  if ((after["work.days"] as string[]).includes(after["work.restDay"] as string)) {
    throw new ServiceError("The rest day cannot be a working day.");
  }
  if (after["invoice.missedVisitRule"] === "FIXED_AMOUNT" && after["invoice.missedVisitAmount"] === null) {
    throw new ServiceError("Type the amount billed for a missed visit.");
  }

  const before = await getSettings(ex, [...values.keys()]);
  const changed: SettingKey[] = [];
  for (const [key, value] of values) {
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    await setSetting(ex, ctx, key, value as SettingValue<typeof key>);
    changed.push(key);
  }
  return { changed };
}

export const readSettingValuesQuery = query(readSettingValues);
export const saveSettingValuesAction = action(saveSettingValues, { revalidate: [SETTINGS_PATH] });
