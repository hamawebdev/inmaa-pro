import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSession } from "@/lib/access/session";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listBranches, saveBranch, setBranchActive } from "./branches";
import { createAccount, setAccountActive, updateAccount } from "./users";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

describe("branches (F-47)", () => {
  it("are added, renamed and switched off by the manager alone, the main one first and never off (F-47)", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => saveBranch(ex, ctx, { code: "AB", name: "عين البيضاء" }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");

    await expect(test.transact((ex, ctx) => saveBranch(ex, ctx, { code: "A/B", name: "عين البيضاء" }))).rejects.toThrow(
      "A branch's code is up to six capital letters or digits.",
    );
    const { id } = await test.transact((ex, ctx) =>
      saveBranch(ex, ctx, { code: "ab", name: " فرع  عين البيضاء ", address: "حي 500 مسكن" }),
    );
    const main = (await listBranches(test.db))[0];
    await expect(test.transact((ex, ctx) => saveBranch(ex, ctx, { code: main.code, name: "x" }))).rejects.toThrow(
      "Another branch already has this code.",
    );
    await test.transact((ex, ctx) => saveBranch(ex, ctx, { id, code: "AB", name: "فرع عين البيضاء" }));

    const rows = await listBranches(test.db);
    expect(rows.map((row) => [row.code, row.name, row.isDefault, row.isActive])).toEqual([
      [main.code, main.name, true, true],
      ["AB", "فرع عين البيضاء", false, true],
    ]);
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "entity"])
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({ operation: "CHANGE", action: "UPDATE", entity: "Branch" });

    await expect(test.transact((ex, ctx) => setBranchActive(ex, ctx, { id: main.id, active: false }))).rejects.toThrow(
      "The main branch cannot be switched off.",
    );
    await test.transact((ex, ctx) => setBranchActive(ex, ctx, { id, active: false }));
    expect((await listBranches(test.db)).find((row) => row.id === id)?.isActive).toBe(false);
  });

  it("give an account its branch, which is the ctx.branchId of everything it writes (F-47)", async () => {
    const { id: branchId } = await test.transact((ex, ctx) =>
      saveBranch(ex, ctx, { code: "AM", name: "فرع عين مليلة" }),
    );
    const { id: userId } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "clerk", displayName: "كاتب", roleId: "RECEPTION_SALES", branchId }),
    );
    expect((await loadSession(test.db, userId)).branchId).toBe(branchId);

    // A branch with an active account is not switched off; an account is not moved to a branch switched off.
    await expect(test.transact((ex, ctx) => setBranchActive(ex, ctx, { id: branchId, active: false }))).rejects.toThrow(
      "Move this branch's accounts to another branch first.",
    );
    const main = (await listBranches(test.db))[0];
    await test.transact((ex, ctx) => updateAccount(ex, ctx, { userId, branchId: main.id }));
    expect((await loadSession(test.db, userId)).branchId).toBe(main.id);
    await test.transact((ex, ctx) => setBranchActive(ex, ctx, { id: branchId, active: false }));
    await expect(test.transact((ex, ctx) => updateAccount(ex, ctx, { userId, branchId }))).rejects.toThrow(
      "This branch does not exist or is switched off.",
    );
    await test.transact((ex, ctx) => setAccountActive(ex, ctx, { userId, active: false }));
  });
});
