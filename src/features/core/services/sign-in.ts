import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { accountName, loadSession } from "@/lib/access/session";
import {
  generateRecoveryCode,
  hashSecret,
  isPasswordLongEnough,
  normalizePassword,
  normalizeRecoveryCode,
  verifySecret,
} from "@/lib/auth";
import { CLOCK_BEHIND, checkClock, type SessionClockNote } from "@/lib/clock/sanity";
import { logSecurity } from "@/lib/log";
import { action, asProgram, query } from "@/lib/service/action";
import type { Executor, ServiceContext, Session } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";

/**
 * Sign-in (plan feature 23, DESIGN.md section 12).
 *
 * Everyone who uses the program has an account with one role. The sign-in
 * window lists the active accounts; a person picks his name and types his
 * password. What he may then open follows from his role's grants, loaded once
 * into the session.
 *
 *  - `listSignInAccounts`: the names on the sign-in window.
 *  - `signIn`: checks the password. A wrong one is an answer, not an error: the
 *    failure is counted and logged, and that must be kept. A password the
 *    manager gave is replaced by one the person chooses, in the same step.
 *  - `setFirstPassword`: an account that has no password yet (the manager on a
 *    new installation, an account the manager has just made) chooses one, and
 *    is signed in. The manager is given his recovery code, once.
 *  - `changeOwnPassword`: the signed-in user's own password, checked against
 *    the current one.
 *  - `resetManagerPassword`: the manager's way back in with his recovery code.
 *    The code is spent and a new one is given.
 *  - `renewRecoveryCode`: a new code for a manager who lost the paper.
 *  - `signOut`: «قفل الآن». Logged; the window goes back to the list of names.
 *
 * Every one of these but `changeOwnPassword`, `renewRecoveryCode` and `signOut`
 * runs before anybody is signed in, as the program itself (`ctx.userId` null);
 * the log entry is then written under the account concerned.
 */

export interface SignInAccount {
  id: string;
  username: string;
  displayName: string;
  roleId: string;
  role: { ar: string; fr: string; en: string };
  /** The manager: the one account that has a recovery code. */
  isManager: boolean;
  /** No password yet: the window asks for one to be chosen instead of typed. */
  needsPassword: boolean;
}

export async function listSignInAccounts(ex: Executor): Promise<SignInAccount[]> {
  const rows = await ex
    .selectFrom("User as u")
    .innerJoin("Role as r", "r.id", "u.roleId")
    .leftJoin("StaffMember as s", "s.id", "u.staffMemberId")
    .select([
      "u.id",
      "u.username",
      "u.displayName",
      "u.staffMemberId",
      "s.lastName",
      "s.firstName",
      "u.roleId",
      "u.passwordHash",
      "r.labelAr",
      "r.labelFr",
      "r.labelEn",
      "r.sortOrder",
    ])
    .where("u.isActive", "=", 1)
    .where("r.isActive", "=", 1)
    .orderBy("r.sortOrder")
    .orderBy("u.displayName")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: accountName(row),
    roleId: row.roleId,
    role: { ar: row.labelAr, fr: row.labelFr, en: row.labelEn },
    isManager: row.roleId === MANAGER_ROLE,
    needsPassword: row.passwordHash.trim() === "",
  }));
}

/** The log's own name for the account: the entry is written under the person, not under the program. */
function asAccount(ctx: ServiceContext, account: { id: string; displayName: string }): ServiceContext {
  return { ...ctx, userId: account.id, userName: account.displayName };
}

async function activeAccount(ex: Executor, userId: string) {
  const account = await ex
    .selectFrom("User")
    .select(["id", "username", "displayName", "roleId", "passwordHash", "recoveryHash", "mustChangePassword"])
    .where("id", "=", userId)
    .where("isActive", "=", 1)
    .executeTakeFirst();
  if (!account) throw new ServiceError("This account does not exist or is not active.");
  return account;
}

/**
 * The PC's clock, checked before anybody signs in (src/lib/clock/sanity.ts).
 *
 *  - Earlier than the work already recorded: nobody signs in, everything they
 *    did would be logged at a wrong date. The manager alone is let in, to the
 *    screen that tells him so (src/components/security/clock-screen.tsx): he
 *    corrects the PC's date, or, if the recorded date was the wrong one, says
 *    so with his reason. Without him the program could not be opened at all.
 *  - Several days later than the work recorded: the sign-in goes on, and its
 *    entry says so (`context.clock`). Nothing that session writes is then a
 *    reference for the clock, nothing legal is issued and the day's own work
 *    waits until the manager confirms the date.
 */
async function clockAtSignIn(
  ex: Executor,
  ctx: ServiceContext,
  account: { roleId: string },
): Promise<SessionClockNote | null> {
  const found = await checkClock(ex, ctx);
  if (found.state === "ok") return null;
  if (found.state === "behind" && account.roleId !== MANAGER_ROLE) throw new ServiceError(CLOCK_BEHIND);
  return { state: found.state, lastAt: found.lastAt, jumpDays: found.jumpDays };
}

async function recordSignIn(
  ex: Executor,
  ctx: ServiceContext,
  account: { id: string; username: string; displayName: string },
  how: "PASSWORD" | "FIRST_PASSWORD" | "RECOVERY_CODE",
  clock: SessionClockNote | null,
): Promise<Session> {
  await ex
    .updateTable("User")
    .set({ failedSignInCount: 0, lastSignInAt: ctx.now })
    .where("id", "=", account.id)
    .execute();
  await logSecurity(ex, asAccount(ctx, account), {
    owner: "FOUNDATION",
    action: "SIGN_IN",
    entity: "User",
    entityId: account.id,
    entityLabel: account.username,
    subject: { kind: "USER", id: account.id, label: account.displayName },
    context: clock ? { how, clock } : { how },
  });
  return loadSession(ex, account.id);
}

async function recordFailure(
  ex: Executor,
  ctx: ServiceContext,
  account: { id: string; username: string; displayName: string },
  how: "PASSWORD" | "RECOVERY_CODE",
): Promise<void> {
  await ex
    .updateTable("User")
    .set((eb) => ({ failedSignInCount: eb("failedSignInCount", "+", 1) }))
    .where("id", "=", account.id)
    .execute();
  // Under nobody's name: whoever typed it is exactly what is not known.
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "SIGN_IN_FAILED",
    entity: "User",
    entityId: account.id,
    entityLabel: account.username,
    subject: { kind: "USER", id: account.id, label: account.displayName },
    context: { how },
  });
}

export type SignInResult =
  | { ok: true; session: Session }
  /**
   * Not in. A wrong password is counted and logged. `NEW_PASSWORD_NEEDED`: the
   * password was right, but it is one the manager gave: the window asks for a
   * new one and calls again with both.
   */
  | { ok: false; reason: "WRONG_PASSWORD" | "NO_PASSWORD_YET" | "NEW_PASSWORD_NEEDED" };

export async function signIn(
  ex: Executor,
  ctx: ServiceContext,
  input: { userId: string; password: string; newPassword?: string } & NewPasswordOptions,
): Promise<SignInResult> {
  const account = await activeAccount(ex, input.userId);
  const stored = account.passwordHash.trim();
  if (!stored) return { ok: false, reason: "NO_PASSWORD_YET" };

  if (!(await verifySecret(normalizePassword(input.password), stored))) {
    // Unlimited attempts, as the academy's lock: this stands between an office
    // and its own work, and every failure is counted and in the log.
    await recordFailure(ex, ctx, account, "PASSWORD");
    return { ok: false, reason: "WRONG_PASSWORD" };
  }
  const clock = await clockAtSignIn(ex, ctx, account);
  if (account.mustChangePassword === 1) {
    if (input.newPassword === undefined) return { ok: false, reason: "NEW_PASSWORD_NEEDED" };
    if (normalizePassword(input.newPassword) === normalizePassword(input.password)) {
      throw new ServiceError("Choose a password different from the one you were given.");
    }
    await writePassword(ex, ctx, account, input.newPassword, "OWN", {
      iterations: input.iterations,
      newRecoveryCode: false,
    });
  }
  return { ok: true, session: await recordSignIn(ex, ctx, account, "PASSWORD", clock) };
}

export interface NewPasswordOptions {
  /** For the demo data and tests only: their throw-away passwords need no work factor. */
  iterations?: number;
}

async function writePassword(
  ex: Executor,
  ctx: ServiceContext,
  account: { id: string; username: string; displayName: string; roleId: string },
  password: string,
  how: "FIRST" | "OWN" | "RECOVERY",
  options: NewPasswordOptions & { newRecoveryCode: boolean },
): Promise<{ recoveryCode: string | null }> {
  if (!isPasswordLongEnough(password)) throw new ServiceError("The password is too short.");

  const recoveryCode = options.newRecoveryCode && account.roleId === MANAGER_ROLE ? generateRecoveryCode() : null;
  const set = {
    passwordHash: await hashSecret(normalizePassword(password), options.iterations),
    ...(recoveryCode ? { recoveryHash: await hashSecret(recoveryCode, options.iterations) } : {}),
    mustChangePassword: 0,
    updatedAt: ctx.now,
    updatedByUserId: account.id,
  };
  await ex.updateTable("User").set(set).where("id", "=", account.id).execute();
  // The log says that it changed, and how. The values never enter it.
  await logSecurity(ex, asAccount(ctx, account), {
    owner: "FOUNDATION",
    action: "PASSWORD_CHANGE",
    entity: "User",
    entityId: account.id,
    entityLabel: account.username,
    subject: { kind: "USER", id: account.id, label: account.displayName },
    changes: {
      passwordHash: [null, null],
      ...(recoveryCode ? { recoveryHash: [null, null] as const } : {}),
    },
    context: { how },
  });
  return { recoveryCode };
}

export interface PasswordChosen {
  session: Session;
  /** The manager's recovery code, in the one moment it can be read. Null for everyone else. */
  recoveryCode: string | null;
}

/** An account with no password chooses its first one and is signed in. */
export async function setFirstPassword(
  ex: Executor,
  ctx: ServiceContext,
  input: { userId: string; password: string } & NewPasswordOptions,
): Promise<PasswordChosen> {
  const account = await activeAccount(ex, input.userId);
  if (account.passwordHash.trim() !== "") throw new ServiceError("This account already has a password.");
  const clock = await clockAtSignIn(ex, ctx, account);
  const { recoveryCode } = await writePassword(ex, ctx, account, input.password, "FIRST", {
    iterations: input.iterations,
    newRecoveryCode: true,
  });
  const session = await recordSignIn(ex, ctx, account, "FIRST_PASSWORD", clock);
  return { session, recoveryCode };
}

/** The signed-in user changes his own password. The recovery code stays as it is. */
export async function changeOwnPassword(
  ex: Executor,
  ctx: ServiceContext,
  input: { currentPassword: string; newPassword: string } & NewPasswordOptions,
): Promise<{ changed: boolean }> {
  if (!ctx.userId) throw new ServiceError("Nobody is signed in.");
  const account = await activeAccount(ex, ctx.userId);
  if (!(await verifySecret(normalizePassword(input.currentPassword), account.passwordHash.trim()))) {
    return { changed: false };
  }
  await writePassword(ex, ctx, account, input.newPassword, "OWN", {
    iterations: input.iterations,
    newRecoveryCode: false,
  });
  return { changed: true };
}

export type RecoveryResult = ({ ok: true } & PasswordChosen) | { ok: false; reason: "WRONG_CODE" };

/**
 * The manager's way back in: his recovery code, and a new password at once.
 * The code is spent: a new one is made and shown, once, as the first was.
 */
export async function resetManagerPassword(
  ex: Executor,
  ctx: ServiceContext,
  input: { userId: string; recoveryCode: string; newPassword: string } & NewPasswordOptions,
): Promise<RecoveryResult> {
  const account = await activeAccount(ex, input.userId);
  if (account.roleId !== MANAGER_ROLE) throw new ServiceError("Only the manager has a recovery code.");
  if (!isPasswordLongEnough(input.newPassword)) throw new ServiceError("The password is too short.");

  const code = normalizeRecoveryCode(input.recoveryCode);
  const stored = account.recoveryHash?.trim() ?? "";
  if (!code || !stored || !(await verifySecret(code, stored))) {
    await recordFailure(ex, ctx, account, "RECOVERY_CODE");
    return { ok: false, reason: "WRONG_CODE" };
  }
  const clock = await clockAtSignIn(ex, ctx, account);
  const { recoveryCode } = await writePassword(ex, ctx, account, input.newPassword, "RECOVERY", {
    iterations: input.iterations,
    newRecoveryCode: true,
  });
  const session = await recordSignIn(ex, ctx, account, "RECOVERY_CODE", clock);
  return { ok: true, session, recoveryCode };
}

/** A new recovery code for the signed-in manager, who types his password to get it. The old code stops working. */
export async function renewRecoveryCode(
  ex: Executor,
  ctx: ServiceContext,
  input: { password: string } & NewPasswordOptions,
): Promise<{ recoveryCode: string | null }> {
  if (!ctx.userId) throw new ServiceError("Nobody is signed in.");
  const account = await activeAccount(ex, ctx.userId);
  if (account.roleId !== MANAGER_ROLE) throw new ServiceError("Only the manager has a recovery code.");
  if (!(await verifySecret(normalizePassword(input.password), account.passwordHash.trim()))) {
    return { recoveryCode: null };
  }
  const recoveryCode = generateRecoveryCode();
  await ex
    .updateTable("User")
    .set({
      recoveryHash: await hashSecret(recoveryCode, input.iterations),
      updatedAt: ctx.now,
      updatedByUserId: account.id,
    })
    .where("id", "=", account.id)
    .execute();
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "PASSWORD_CHANGE",
    entity: "User",
    entityId: account.id,
    entityLabel: account.username,
    subject: { kind: "USER", id: account.id, label: account.displayName },
    changes: { recoveryHash: [null, null] },
    context: { how: "RECOVERY_CODE_RENEWED" },
  });
  return { recoveryCode };
}

/** Why a session ended: the user said so («قفل الآن»), or nobody touched the program for too long. */
export type LockCause = "USER" | "IDLE";

/**
 * The signed-in user leaves, by «قفل الآن» or by the idle lock
 * (`security.idleLockMinutes`). The window goes back to the list of names.
 */
export async function signOut(ex: Executor, ctx: ServiceContext, input: { cause?: LockCause } = {}): Promise<void> {
  if (!ctx.userId) return;
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "LOCK",
    entity: "User",
    entityId: ctx.userId,
    subject: { kind: "USER", id: ctx.userId, label: ctx.userName },
    context: { cause: input.cause ?? "USER" },
  });
}

/** The idle lock's delay in minutes, for whoever is signed in; 0 is off. */
export async function readIdleLockMinutes(ex: Executor): Promise<number> {
  const minutes = await getSetting(ex, "security.idleLockMinutes");
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

// Before anybody is signed in, the program itself asks.
export const listSignInAccountsQuery = asProgram.query((ex: Executor) => listSignInAccounts(ex));
export const signInAction = asProgram.action(signIn);
export const setFirstPasswordAction = asProgram.action(setFirstPassword);
export const resetManagerPasswordAction = asProgram.action(resetManagerPassword);

export const changeOwnPasswordAction = action(changeOwnPassword);
export const renewRecoveryCodeAction = action(renewRecoveryCode);
export const signOutAction = action(signOut);
export const readIdleLockMinutesQuery = query((ex: Executor) => readIdleLockMinutes(ex));
