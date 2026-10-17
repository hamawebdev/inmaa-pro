import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

/**
 * Branches (plan feature 47: "a branch field, filters and reports in one
 * database"). One database holds every branch; each account belongs to one
 * (`User.branchId`, chosen on the accounts tab), and that is the `ctx.branchId`
 * every document and list row it writes carries. The main branch is the row
 * with `isDefault` (seeded `branch-main`), first in every list, and the branch
 * of an account that has none.
 *
 * The card is in Settings › عام; adding, renaming and switching off are the
 * manager's alone. A branch is never deleted (the rows that carry it stay);
 * it is switched off, and only once no active account belongs to it. The main
 * branch is never switched off.
 *
 * A list filters by branch with `<BranchPicker>` (src/components/branch-picker.tsx)
 * and, in its service, `.$if(input.branchId != null, (qb) => qb.where("x.branchId", "=", input.branchId!))`.
 */
export const BRANCHES_PATH = "/dashboard/settings";

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  isDefault: boolean;
  isActive: boolean;
  /** Active accounts that belong to it. */
  accounts: number;
}

/** Every branch, the main one first, then the active ones, by name. Not personal data: any signed-in reader. */
export async function listBranches(ex: Executor): Promise<BranchRow[]> {
  const rows = await ex
    .selectFrom("Branch as b")
    .select((eb) => [
      "b.id",
      "b.code",
      "b.name",
      "b.address",
      "b.phone",
      "b.city",
      "b.isDefault",
      "b.isActive",
      eb
        .selectFrom("User as u")
        .select((inner) => inner.fn.countAll<number>().as("n"))
        .whereRef("u.branchId", "=", "b.id")
        .where("u.isActive", "=", 1)
        .as("accounts"),
    ])
    .orderBy("b.isDefault", "desc")
    .orderBy("b.isActive", "desc")
    .orderBy("b.name")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    phone: row.phone,
    city: row.city,
    isDefault: row.isDefault === 1,
    isActive: row.isActive === 1,
    accounts: Number(row.accounts ?? 0),
  }));
}

function requireManager(ctx: ServiceContext): void {
  if (ctx.userId !== null && ctx.roleId !== MANAGER_ROLE) {
    throw new ServiceError("You do not have permission to do this.");
  }
}

const text = (value: string | null | undefined) => {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed : null;
};

export interface SaveBranchInput {
  /** Absent for a new branch. */
  id?: string;
  /** The short code lists and reports show: up to six capital letters or digits. */
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  /** «حررت: بـ…» on this branch's sheets; empty means the centre's city. */
  city?: string | null;
}

/** Adds a branch, or renames one and changes its address. The manager's. */
export async function saveBranch(ex: Executor, ctx: ServiceContext, input: SaveBranchInput): Promise<{ id: string }> {
  requireManager(ctx);
  const name = text(input.name);
  if (!name) throw new ServiceError("A name is required.");
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,6}$/.test(code)) {
    throw new ServiceError("A branch's code is up to six capital letters or digits.");
  }
  const taken = await ex
    .selectFrom("Branch")
    .select("id")
    .where("code", "=", code)
    .$if(input.id !== undefined, (qb) => qb.where("id", "!=", input.id ?? ""))
    .executeTakeFirst();
  if (taken) throw new ServiceError("Another branch already has this code.");
  const values = { code, name, address: text(input.address), phone: text(input.phone), city: text(input.city) };

  if (input.id === undefined) {
    const id = newId();
    await ex
      .insertInto("Branch")
      .values({
        id,
        ...values,
        isDefault: 0,
        isActive: 1,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    await logChange(ex, ctx, {
      owner: "FOUNDATION",
      action: "CREATE",
      entity: "Branch",
      entityId: id,
      entityLabel: name,
      changes: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [null, value] as const])),
    });
    return { id };
  }

  const before = await ex
    .selectFrom("Branch")
    .select(["id", "code", "name", "address", "phone", "city"])
    .where("id", "=", input.id)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This branch does not exist.");
  const { set, changes } = changedColumns(before, values);
  if (!changes) return { id: before.id };
  await ex
    .updateTable("Branch")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "UPDATE",
    entity: "Branch",
    entityId: before.id,
    entityLabel: name,
    changes,
  });
  return { id: before.id };
}

/** Switches a branch off, or on again. Never the main one; off only once no active account belongs to it. */
export async function setBranchActive(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; active: boolean },
): Promise<{ id: string }> {
  requireManager(ctx);
  const branch = await ex
    .selectFrom("Branch")
    .select(["id", "name", "isDefault", "isActive"])
    .where("id", "=", input.id)
    .executeTakeFirst();
  if (!branch) throw new ServiceError("This branch does not exist.");
  if ((branch.isActive === 1) === input.active) return { id: branch.id };
  if (!input.active) {
    if (branch.isDefault === 1) throw new ServiceError("The main branch cannot be switched off.");
    const accounts = await ex
      .selectFrom("User")
      .select("id")
      .where("branchId", "=", branch.id)
      .where("isActive", "=", 1)
      .executeTakeFirst();
    if (accounts) throw new ServiceError("Move this branch's accounts to another branch first.");
  }
  await ex
    .updateTable("Branch")
    .set({ isActive: input.active ? 1 : 0, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", branch.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "STATUS_CHANGE",
    entity: "Branch",
    entityId: branch.id,
    entityLabel: branch.name,
    changes: { isActive: [branch.isActive === 1, input.active] },
  });
  return { id: branch.id };
}

/** An account may belong only to a branch that exists and is switched on. */
export async function requireActiveBranch(ex: Executor, branchId: string): Promise<void> {
  const branch = await ex.selectFrom("Branch").select("isActive").where("id", "=", branchId).executeTakeFirst();
  if (!branch?.isActive) throw new ServiceError("This branch does not exist or is switched off.");
}

export const listBranchesQuery = query((ex: Executor) => listBranches(ex));
export const saveBranchAction = action(saveBranch, { revalidate: [BRANCHES_PATH] });
export const setBranchActiveAction = action(setBranchActive, { revalidate: [BRANCHES_PATH] });
