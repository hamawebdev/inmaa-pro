import { listEmployees } from "@/features/people/services/employees";
import {
  CAPABILITY_KEYS,
  MANAGER_ONLY_CAPABILITY,
  MANAGER_ROLE,
  ROLE_CODES,
  SECTION_CODES,
  type Capability,
  type RoleCode,
  type SectionCode,
  type SectionLevel,
} from "@/lib/access/catalogue";
import { requireCapability } from "@/lib/access/session";
import { hashSecret, isPasswordLongEnough, normalizePassword } from "@/lib/auth";
import { newId } from "@/lib/db/rows";
import { logChange, logCollect, logSecurity } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
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
  if (input.staffMemberId) await checkLinkableStaff(ex, input.staffMemberId, null);

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

// ── The users tab: accounts ─────────────────────────────────────────────────

export interface AccountRow {
  id: string;
  username: string;
  displayName: string;
  roleId: string;
  role: { ar: string; fr: string; en: string };
  isActive: boolean;
  /** No password yet: its owner chooses one at the sign-in window. */
  needsPassword: boolean;
  /** A password the manager gave, to be replaced at the next sign-in. */
  mustChangePassword: boolean;
  staffMemberId: string | null;
  /** The linked employee as People numbers and names him: «7 — بن عمر سعاد». */
  staffLabel: string | null;
  lastSignInAt: string | null;
  failedSignInCount: number;
}

export async function listAccounts(ex: Executor, ctx: ServiceContext): Promise<AccountRow[]> {
  requireCapability(ctx, "users.manage");
  const rows = await ex
    .selectFrom("User as u")
    .innerJoin("Role as r", "r.id", "u.roleId")
    .leftJoin("StaffMember as s", "s.id", "u.staffMemberId")
    .select([
      "u.id",
      "u.username",
      "u.displayName",
      "u.roleId",
      "u.isActive",
      "u.passwordHash",
      "u.mustChangePassword",
      "u.staffMemberId",
      "u.lastSignInAt",
      "u.failedSignInCount",
      "r.labelAr",
      "r.labelFr",
      "r.labelEn",
      "r.sortOrder",
      "s.number as staffNumber",
      "s.lastName as staffLastName",
      "s.firstName as staffFirstName",
    ])
    .orderBy("u.isActive", "desc")
    .orderBy("r.sortOrder")
    .orderBy("u.displayName")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    roleId: row.roleId,
    role: { ar: row.labelAr, fr: row.labelFr, en: row.labelEn },
    isActive: row.isActive === 1,
    needsPassword: row.passwordHash.trim() === "",
    mustChangePassword: row.mustChangePassword === 1,
    staffMemberId: row.staffMemberId,
    staffLabel: row.staffMemberId ? `${row.staffNumber} — ${row.staffLastName} ${row.staffFirstName}` : null,
    lastSignInAt: row.lastSignInAt,
    failedSignInCount: row.failedSignInCount,
  }));
}

async function accountFor(ex: Executor, userId: string) {
  const account = await ex
    .selectFrom("User")
    .select(["id", "username", "displayName", "roleId", "isActive", "staffMemberId"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!account) throw new ServiceError("This account does not exist or is not active.");
  return account;
}

/** A new name or a new role for an account. A new role takes effect at its next sign-in. */
export async function updateAccount(
  ex: Executor,
  ctx: ServiceContext,
  input: { userId: string; displayName?: string; roleId?: RoleCode },
): Promise<{ id: string }> {
  requireCapability(ctx, "users.manage");
  const before = await accountFor(ex, input.userId);
  const patch: { displayName?: string; roleId?: string } = {};
  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim().replace(/\s+/g, " ");
    if (!displayName) throw new ServiceError("A name is required.");
    patch.displayName = displayName;
  }
  if (input.roleId !== undefined) {
    const role = await ex
      .selectFrom("Role")
      .select(["id", "isActive"])
      .where("id", "=", input.roleId)
      .executeTakeFirst();
    if (!role?.isActive) throw new ServiceError("This role does not exist.");
    patch.roleId = input.roleId;
  }
  const { set, changes } = changedColumns(before, patch);
  if (!changes) return { id: before.id };
  await ex
    .updateTable("User")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "UPDATE",
    entity: "User",
    entityId: before.id,
    entityLabel: before.username,
    subject: { kind: "USER", id: before.id, label: patch.displayName ?? before.displayName },
    changes,
  });
  return { id: before.id };
}

/**
 * Switches an account off, or on again. An account is never deleted: the log
 * names it. Nobody switches off the account he is signed in with, and the
 * database keeps one active manager whatever is asked.
 */
export async function setAccountActive(
  ex: Executor,
  ctx: ServiceContext,
  input: { userId: string; active: boolean },
): Promise<{ id: string }> {
  requireCapability(ctx, "users.manage");
  const before = await accountFor(ex, input.userId);
  if (!input.active && before.id === ctx.userId) {
    throw new ServiceError("You cannot switch off the account you are signed in with.");
  }
  if ((before.isActive === 1) === input.active) return { id: before.id };
  await ex
    .updateTable("User")
    .set({
      isActive: input.active ? 1 : 0,
      deactivatedAt: input.active ? null : ctx.now,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "STATUS_CHANGE",
    entity: "User",
    entityId: before.id,
    entityLabel: before.username,
    subject: { kind: "USER", id: before.id, label: before.displayName },
    changes: { isActive: [before.isActive === 1, input.active] },
  });
  return { id: before.id };
}

/** An account is linked to a centre employee who has no other account. */
async function checkLinkableStaff(ex: Executor, staffMemberId: string, exceptUserId: string | null): Promise<void> {
  const staff = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "deletedAt"])
    .where("id", "=", staffMemberId)
    .executeTakeFirst();
  if (!staff || staff.kind !== "EMPLOYEE" || staff.deletedAt !== null) {
    throw new ServiceError("An account can be linked only to a centre employee.");
  }
  let taken = ex.selectFrom("User").select("id").where("staffMemberId", "=", staffMemberId);
  if (exceptUserId) taken = taken.where("id", "<>", exceptUserId);
  if (await taken.executeTakeFirst()) throw new ServiceError("This employee already has an account.");
}

/**
 * Links an account to the centre employee who uses it (A2), or unlinks it
 * (`staffMemberId` null). An employee has one account at most.
 */
export async function linkAccountToStaff(
  ex: Executor,
  ctx: ServiceContext,
  input: { userId: string; staffMemberId: string | null },
): Promise<{ id: string }> {
  requireCapability(ctx, "users.manage");
  const before = await accountFor(ex, input.userId);
  if (input.staffMemberId !== null) await checkLinkableStaff(ex, input.staffMemberId, before.id);
  const { set, changes } = changedColumns(before, { staffMemberId: input.staffMemberId });
  if (!changes) return { id: before.id };
  await ex
    .updateTable("User")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "UPDATE",
    entity: "User",
    entityId: before.id,
    entityLabel: before.username,
    subject: { kind: "USER", id: before.id, label: before.displayName },
    changes,
  });
  return { id: before.id };
}

/** The centre's employees an account can be linked to: People's list, read through its own service. */
export async function listLinkableEmployees(
  ex: Executor,
  ctx: ServiceContext,
): Promise<Array<{ id: string; label: string; account: string | null }>> {
  requireCapability(ctx, "users.manage");
  const employees = await listEmployees(ex, ctx, {});
  return employees
    .filter((employee) => employee.status !== "LEFT")
    .map((employee) => ({
      id: employee.id,
      label: `${employee.number} — ${employee.lastName} ${employee.firstName}`,
      account: employee.account,
    }));
}

// ── The users tab: what each role may do ────────────────────────────────────

export interface RoleGrants {
  roleId: string;
  role: { ar: string; fr: string; en: string };
  isSystem: boolean;
  sections: Partial<Record<SectionCode, SectionLevel>>;
  capabilities: Capability[];
}

export async function listRoleGrants(ex: Executor, ctx: ServiceContext): Promise<RoleGrants[]> {
  requireCapability(ctx, "users.manage");
  const roles = await ex
    .selectFrom("Role")
    .select(["id", "labelAr", "labelFr", "labelEn", "isSystem"])
    .where("isActive", "=", 1)
    .orderBy("sortOrder")
    .execute();
  const grants = await ex.selectFrom("RoleGrant").select(["roleId", "kind", "key", "access"]).execute();
  return roles.map((role) => {
    const own = grants.filter((grant) => grant.roleId === role.id);
    return {
      roleId: role.id,
      role: { ar: role.labelAr, fr: role.labelFr, en: role.labelEn },
      isSystem: role.isSystem === 1,
      sections: Object.fromEntries(
        own.filter((grant) => grant.kind === "SECTION").map((grant) => [grant.key, grant.access as SectionLevel]),
      ),
      capabilities: own
        .filter((grant) => grant.kind === "CAPABILITY")
        .map((grant) => grant.key as Capability)
        .sort(),
    };
  });
}

/**
 * What a role may open and do: its level on each bar section and its
 * capabilities, as a whole. The manager's role holds everything and is not
 * edited; restoring a backup is the manager's alone. It takes effect at each
 * account's next sign-in.
 */
export async function saveRoleGrants(
  ex: Executor,
  ctx: ServiceContext,
  input: { roleId: string; sections: Partial<Record<SectionCode, SectionLevel>>; capabilities: Capability[] },
): Promise<{ roleId: string }> {
  requireCapability(ctx, "users.manage");
  const role = await ex
    .selectFrom("Role")
    .select(["id", "isSystem", "isActive"])
    .where("id", "=", input.roleId)
    .executeTakeFirst();
  if (!role?.isActive) throw new ServiceError("This role does not exist.");
  if (role.isSystem === 1) throw new ServiceError("The manager's role holds everything and is not changed.");
  if (input.capabilities.includes(MANAGER_ONLY_CAPABILITY)) {
    throw new ServiceError("Restoring a backup is the manager's alone.");
  }
  for (const [section, level] of Object.entries(input.sections)) {
    if (!(SECTION_CODES as readonly string[]).includes(section) || (level !== "READ" && level !== "WRITE")) {
      throw new ServiceError("One of the values is not allowed here.");
    }
  }
  if (input.capabilities.some((key) => !(CAPABILITY_KEYS as readonly string[]).includes(key))) {
    throw new ServiceError("One of the values is not allowed here.");
  }

  const wanted = new Map<string, { kind: "SECTION" | "CAPABILITY"; key: string; access: string }>();
  for (const [section, level] of Object.entries(input.sections)) {
    if (level) wanted.set(`SECTION:${section}`, { kind: "SECTION", key: section, access: level });
  }
  for (const key of new Set(input.capabilities)) {
    wanted.set(`CAPABILITY:${key}`, { kind: "CAPABILITY", key, access: "GRANTED" });
  }
  const existing = await ex
    .selectFrom("RoleGrant")
    .select(["id", "kind", "key", "access"])
    .where("roleId", "=", role.id)
    .execute();
  const describe = (grants: Array<{ kind: string; key: string; access: string }>) => ({
    sections: Object.fromEntries(
      grants
        .filter((grant) => grant.kind === "SECTION")
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((grant) => [grant.key, grant.access]),
    ),
    capabilities: grants
      .filter((grant) => grant.kind === "CAPABILITY")
      .map((grant) => grant.key)
      .sort(),
  });
  const before = describe(existing);
  const after = describe([...wanted.values()]);
  if (JSON.stringify(before) === JSON.stringify(after)) return { roleId: role.id };

  for (const grant of existing) {
    const keep = wanted.get(`${grant.kind}:${grant.key}`);
    if (!keep) {
      await ex.deleteFrom("RoleGrant").where("id", "=", grant.id).execute();
    } else if (keep.access !== grant.access) {
      await ex
        .updateTable("RoleGrant")
        .set({ access: keep.access, updatedAt: ctx.now })
        .where("id", "=", grant.id)
        .execute();
    }
  }
  for (const [id, grant] of wanted) {
    if (existing.some((row) => `${row.kind}:${row.key}` === id)) continue;
    await ex
      .insertInto("RoleGrant")
      .values({ id: newId(), roleId: role.id, ...grant, createdAt: ctx.now, updatedAt: ctx.now })
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "UPDATE",
    entity: "Role",
    entityId: role.id,
    entityLabel: role.id,
    changes: {
      ...(JSON.stringify(before.sections) !== JSON.stringify(after.sections)
        ? { sections: [before.sections, after.sections] as const }
        : {}),
      ...(JSON.stringify(before.capabilities) !== JSON.stringify(after.capabilities)
        ? { capabilities: [before.capabilities, after.capabilities] as const }
        : {}),
    },
  });
  return { roleId: role.id };
}

export const USERS_PATH = "/dashboard/settings/users";
export const listAccountsQuery = query(listAccounts);
export const listLinkableEmployeesQuery = query(listLinkableEmployees);
export const listRoleGrantsQuery = query(listRoleGrants);
export const createAccountAction = action(createAccount, { revalidate: [USERS_PATH] });
export const giveAccountPasswordAction = action(giveAccountPassword, { revalidate: [USERS_PATH] });
export const updateAccountAction = action(updateAccount, { revalidate: [USERS_PATH] });
export const setAccountActiveAction = action(setAccountActive, { revalidate: [USERS_PATH] });
export const linkAccountToStaffAction = action(linkAccountToStaff, {
  revalidate: [USERS_PATH, "/dashboard/employees"],
});
export const saveRoleGrantsAction = action(saveRoleGrants, { revalidate: [USERS_PATH] });
