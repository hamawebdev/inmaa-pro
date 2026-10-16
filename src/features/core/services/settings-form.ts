import { requireCapability, requireSection } from "@/lib/access/session";
import { yearOf } from "@/lib/clock";
import { logConsult } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import {
  COST_SETTING_KEYS,
  getSettings,
  isCostSetting,
  setSetting,
  type SettingKey,
  type SettingValue,
} from "@/lib/settings";

import { schemaOf, SETTING_FIELDS, type SettingsTab } from "../validators/settings-form";

/**
 * The settings a person sets, as Settings › عام and قواعد العمل show them
 * (the forms are described in ../validators/settings-form.ts).
 *
 * Reading needs the Settings section. Writing a work rule needs the
 * capability `settings.rules` as well; every write is one CHANGE in the log
 * per key that changed (`setSetting`).
 *
 * The centre's costs (`COST_SETTING_KEYS`) are not in the tab's read: they are
 * read with `cost.read` by `readCostSettings`, an action, because each read is
 * a CONSULT in the log; changed with `cost.read` too; and logged without their
 * values (audit LOG-7).
 */
export const SETTINGS_PATH = "/dashboard/settings";

export async function readSettingValues(
  ex: Executor,
  ctx: ServiceContext,
  input: { tab: SettingsTab },
): Promise<Partial<Record<SettingKey, unknown>>> {
  requireSection(ctx, "SETTINGS", "READ");
  const keys = [...SETTING_FIELDS.values()]
    .filter((field) => field.tab === input.tab && !isCostSetting(field.key))
    .map((field) => field.key);
  return getSettings(ex, keys);
}

/** The centre's costs, for the costing card: `cost.read`, and a CONSULT at every read. */
export async function readCostSettings(
  ex: Executor,
  ctx: ServiceContext,
): Promise<Partial<Record<SettingKey, unknown>>> {
  requireSection(ctx, "SETTINGS", "READ");
  requireCapability(ctx, "cost.read");
  await logConsult(ex, ctx, {
    owner: "FOUNDATION",
    action: "VIEW_RESTRICTED",
    entity: "Setting",
    entityLabel: "costing",
    context: { keys: COST_SETTING_KEYS },
  });
  return getSettings(ex, [...COST_SETTING_KEYS]);
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

/**
 * The series in front of every invoice and receipt number (a second PC's,
 * DESIGN.md section 6) is a short code, and frozen for the year once a legal
 * number exists in it: one year's numbers are one series (audit INV-5,
 * coordinator's ruling). A new series starts on 1 January.
 */
async function assertLegalSeriesMayChange(ex: Executor, ctx: ServiceContext, series: string): Promise<void> {
  if (!/^[A-Z0-9-]{0,4}$/.test(series)) {
    throw new ServiceError("The series is a short code of up to four capital letters or digits.");
  }
  const numbered = await ex
    .selectFrom("Sequence")
    .select("id")
    .where("key", "in", ["INVOICE", "RECEIPT"])
    .where("year", "=", yearOf(ctx.today))
    .where("lastValue", ">", 0)
    .executeTakeFirst();
  if (numbered) {
    throw new ServiceError(
      "The series cannot change during a year in which an invoice or a receipt has been numbered. Change it from 1 January.",
    );
  }
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
  if ([...values.keys()].some(isCostSetting)) requireCapability(ctx, "cost.read");

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
  if (values.has("numbering.legalSeries") && values.get("numbering.legalSeries") !== before["numbering.legalSeries"]) {
    await assertLegalSeriesMayChange(ex, ctx, String(values.get("numbering.legalSeries") ?? ""));
  }
  const changed: SettingKey[] = [];
  for (const [key, value] of values) {
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    await setSetting(ex, ctx, key, value as SettingValue<typeof key>);
    changed.push(key);
  }
  return { changed };
}

export const readSettingValuesQuery = query(readSettingValues);
export const readCostSettingsAction = action(readCostSettings, { revalidate: [] });
export const saveSettingValuesAction = action(saveSettingValues, { revalidate: [SETTINGS_PATH] });
