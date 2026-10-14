import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { genesisHash } from "@/lib/chain";
import { CHAINED_TABLES } from "@/lib/db/chain-columns";
import { newId } from "@/lib/db/rows";
import { logCollect, logSecurity } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { runSeeds } from "@/lib/seeds";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * What a new database needs before anything can be saved in it, and that no
 * migration can hold because it is only known on the machine: its own id, the
 * starting point of each hash chain (which depends on that id), and the first
 * manager account. One transaction, done once, guarded by `system.firstRunDone`.
 *
 * The manager account is made here with a fixed id and no password: the first
 * time the program opens, the sign-in window asks him to choose one and shows
 * him his recovery code (src/features/core/services/sign-in.ts). The centre's
 * identity, tax mode, backup folder and paper numbers are filled in Settings.
 */
export const FIRST_MANAGER_ID = "user-manager";

export interface FirstRunInput {
  /** False leaves out the owners' seed steps (src/lib/seeds): a test that wants an empty database. */
  seeds?: boolean;
  /** Given by tests, so that hashes can be compared between runs. A new UUID otherwise. */
  databaseId?: string;
  manager?: {
    id?: string;
    username?: string;
    displayName?: string;
    passwordHash?: string;
    recoveryHash?: string | null;
  };
}

export async function isFirstRunDone(ex: Executor): Promise<boolean> {
  return getSetting(ex, "system.firstRunDone");
}

export async function firstRun(
  ex: Executor,
  ctx: ServiceContext,
  input: FirstRunInput = {},
): Promise<{ databaseId: string; managerId: string }> {
  if (await isFirstRunDone(ex)) throw new Error("first run: this database is already set up");

  // 1. The database's own id. A trigger refuses any later change.
  const databaseId = input.databaseId ?? newId();
  await setSetting(ex, ctx, "system.databaseId", databaseId);

  // 2. Where each of the eight chains starts.
  for (const table of CHAINED_TABLES) {
    await ex
      .insertInto("ChainHead")
      .values({ id: table, lastSeq: 0, lastHash: await genesisHash(databaseId, table), updatedAt: ctx.now })
      .execute();
  }

  // 3. The first entry of the log: the database exists from here.
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "CREATE",
    entity: "Database",
    entityId: databaseId,
    context: { firstRun: true },
  });

  // 4. The first manager account. It exists before any employee, so it points at none.
  const managerId = input.manager?.id ?? FIRST_MANAGER_ID;
  const username = (input.manager?.username ?? "manager").trim().toLowerCase();
  const displayName = input.manager?.displayName?.trim() || "المدير";
  await ex
    .insertInto("User")
    .values({
      id: managerId,
      username,
      displayName,
      // Empty means "no password yet": the sign-in window asks for one to be chosen.
      passwordHash: input.manager?.passwordHash ?? "",
      recoveryHash: input.manager?.recoveryHash ?? null,
      roleId: MANAGER_ROLE,
      staffMemberId: null,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: null,
      updatedByUserId: null,
    })
    .execute();
  await logCollect(ex, ctx, {
    owner: "FOUNDATION",
    action: "CREATE",
    entity: "User",
    entityId: managerId,
    entityLabel: username,
    subject: { kind: "USER", id: managerId, label: displayName },
  });

  // 5. The owners' own starting rows (training modules, inspection criteria, stock items): src/lib/seeds.
  if (input.seeds !== false) await runSeeds(ex, ctx);

  await setSetting(ex, ctx, "system.firstRunDone", true);
  return { databaseId, managerId };
}
