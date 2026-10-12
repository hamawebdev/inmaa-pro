import { requireCapability, requireSection } from "@/lib/access/session";
import { logSecurity } from "@/lib/log";
import { query, transact } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSetting, setSetting } from "@/lib/settings";

import { STAND_IN_MANAGER_ID } from "./first-run";

/**
 * What the shell's lock reads: the manager's password and recovery code, and
 * which bar sections ask for it.
 *
 * The three names are the academy shell's (src/lib/auth.ts, the lock screen,
 * the route gate still use them); what is behind them is the data model:
 *
 *   manager_password_hash   User.passwordHash of the manager account ("" = none set)
 *   manager_recovery_hash   User.recoveryHash of the same account
 *   locked_pages            setting `shell.lockedSections`
 *
 * STAND-IN: real sign-in replaces the shared manager password. The typed
 * settings of the program are in src/lib/settings, not here.
 */
export type SettingKey = "manager_password_hash" | "manager_recovery_hash" | "locked_pages";

export type AppSettings = Partial<Record<SettingKey, string>>;

/** The query key every consumer shares. Not a `pathKey`: the lock is not a page. */
export const SETTINGS_QUERY_KEY = ["settings"] as const;

export async function readLockSettings(ex: Executor): Promise<AppSettings> {
  const manager = await ex
    .selectFrom("User")
    .select(["passwordHash", "recoveryHash"])
    .where("id", "=", STAND_IN_MANAGER_ID)
    .executeTakeFirst();
  const locked = await getSetting(ex, "shell.lockedSections");
  return {
    manager_password_hash: manager?.passwordHash ?? "",
    manager_recovery_hash: manager?.recoveryHash ?? "",
    // Left out when nobody chose: the lock then applies its own default sections.
    ...(locked === null ? {} : { locked_pages: locked }),
  };
}

/** Writes the keys present in `patch`; each key is one statement, so a caller that needs an order calls twice. */
export async function writeLockSettings(ex: Executor, ctx: ServiceContext, patch: AppSettings): Promise<void> {
  if (patch.locked_pages !== undefined) {
    requireSection(ctx, "SETTINGS", "WRITE");
    await setSetting(ex, ctx, "shell.lockedSections", patch.locked_pages);
  }

  const account: { passwordHash?: string; recoveryHash?: string | null } = {};
  if (patch.manager_password_hash !== undefined) account.passwordHash = patch.manager_password_hash;
  if (patch.manager_recovery_hash !== undefined) account.recoveryHash = patch.manager_recovery_hash || null;
  if (Object.keys(account).length === 0) return;

  requireCapability(ctx, "users.manage");
  await ex
    .updateTable("User")
    .set({ ...account, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", STAND_IN_MANAGER_ID)
    .execute();
  // The log says that it changed and who did it. The values never enter it.
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "PASSWORD_CHANGE",
    entity: "User",
    entityId: STAND_IN_MANAGER_ID,
    subject: { kind: "USER", id: STAND_IN_MANAGER_ID },
    changes: Object.fromEntries(Object.keys(account).map((column) => [column, [null, null] as const])),
  });
}

const readLock = query((ex: Executor) => readLockSettings(ex));

export function getAppSettings(): Promise<AppSettings> {
  return readLock(undefined);
}

/** Throws on failure: src/lib/auth.ts relies on a failed write stopping what follows it. */
export function saveAppSettings(patch: AppSettings): Promise<void> {
  return transact((ex, ctx) => writeLockSettings(ex, ctx, patch));
}
