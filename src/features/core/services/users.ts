import { ROLE_CODES, type RoleCode } from "@/lib/access/catalogue";
import { requireCapability } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logCollect } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

/**
 * Sign-in accounts (plan feature 23, DESIGN.md section 12).
 *
 * The first step of what F3 builds around them: an account is made by someone
 * who may manage accounts, with a role, and is logged as personal data
 * collected. It has no password yet: `mustChangePassword` is set, and the
 * sign-in screen asks for one the first time.
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
