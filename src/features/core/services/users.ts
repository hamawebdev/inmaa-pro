import { MANAGER_ROLE, ROLE_CODES, type RoleCode } from "@/lib/access/catalogue";
import { requireCapability } from "@/lib/access/session";
import { hashSecret, isPasswordLongEnough, normalizePassword } from "@/lib/auth";
import { newId } from "@/lib/db/rows";
import { logCollect, logSecurity } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

/**
 * Sign-in accounts (plan feature 23, DESIGN.md section 12).
 *
 * An account is made by someone who may manage accounts, with a role, and is
 * logged as personal data collected. It has no password yet: the sign-in
 * window asks its owner to choose one the first time
 * (src/features/core/services/sign-in.ts).
 *
 * `giveAccountPassword` is for the person who forgot his: the manager types a
 * password for him, and the sign-in window asks him to replace it at once.
 * The manager's own way back is his recovery code, never this.
 */
export interface CreateAccountInput {
  /** The sign-in name. Stored in lower case. */
  username: string;
  /** Shown in the list of accounts and written beside every log entry. */
  displayName: string;
  roleId: RoleCode;
  /** People's row of kind EMPLOYEE, when there is one (CONTRACTS: `linkAccountToStaff`). */
  staffMemberId?: string | null;
  branchId?: string | null;
}

export async function createAccount(
  ex: Executor,
  ctx: ServiceContext,
  input: CreateAccountInput,
): Promise<{ id: string }> {
  requireCapability(ctx, "users.manage");

  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  if (!username) throw new ServiceError("A sign-in name is required.");
  if (!displayName) throw new ServiceError("A name is required.");
  if (!(ROLE_CODES as readonly string[]).includes(input.roleId)) throw new ServiceError("This role does not exist.");
  const role = await ex.selectFrom("Role").select(["id", "isActive"]).where("id", "=", input.roleId).executeTakeFirst();
  if (!role?.isActive) throw new ServiceError("This role does not exist.");
  const taken = await ex.selectFrom("User").select("id").where("username", "=", username).executeTakeFirst();
  if (taken) throw new ServiceError("This sign-in name is already taken.");

  const id = newId();
  await ex
    .insertInto("User")
    .values({
      id,
      username,
      displayName,
      passwordHash: "",
      recoveryHash: null,
      roleId: input.roleId,
      staffMemberId: input.staffMemberId ?? null,
      branchId: input.branchId ?? ctx.branchId,
      mustChangePassword: 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logCollect(ex, ctx, {
    owner: "FOUNDATION",
    action: "CREATE",
    entity: "User",
    entityId: id,
    entityLabel: username,
    subject: { kind: "USER", id, label: displayName },
    context: { roleId: input.roleId },
  });
  return { id };
}

/** A password given by whoever manages accounts. Its owner must replace it the first time he signs in with it. */
export async function giveAccountPassword(
  ex: Executor,
  ctx: ServiceContext,
  input: { userId: string; password: string; iterations?: number },
): Promise<{ id: string }> {
  requireCapability(ctx, "users.manage");
  const account = await ex
    .selectFrom("User")
    .select(["id", "username", "displayName", "roleId", "isActive"])
    .where("id", "=", input.userId)
    .executeTakeFirst();
  if (!account?.isActive) throw new ServiceError("This account does not exist or is not active.");
  if (account.roleId === MANAGER_ROLE && account.id !== ctx.userId) {
    throw new ServiceError("A manager's password is changed by himself, or with his recovery code.");
  }
  if (!isPasswordLongEnough(input.password)) throw new ServiceError("The password is too short.");

  await ex
    .updateTable("User")
    .set({
      passwordHash: await hashSecret(normalizePassword(input.password), input.iterations),
      // His own password is his own: only one given to somebody else must be replaced.
      mustChangePassword: account.id === ctx.userId ? 0 : 1,
      failedSignInCount: 0,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
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
    changes: { passwordHash: [null, null] },
    context: { how: "GIVEN" },
  });
  return { id: account.id };
}
