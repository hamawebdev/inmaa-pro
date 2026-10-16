import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Capability } from "@/lib/access/catalogue";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { createAccount, listRoleGrants, saveRoleGrants, setAccountActive, updateAccount } from "./users";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

describe("createAccount", () => {
  it("makes an account with a role, asks for a password at its first sign-in, and logs it", async () => {
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "  Accountant ", displayName: "لعريبي  نادية", roleId: "ACCOUNTANT" }),
    );

    const account = await test.db.selectFrom("User").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(account).toMatchObject({
      username: "accountant",
      displayName: "لعريبي نادية",
      roleId: "ACCOUNTANT",
      passwordHash: "",
      mustChangePassword: 1,
      branchId: "branch-main",
    });
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "COLLECT", entity: "User", entityId: id, subjectKind: "USER" });
  });

  it("refuses a name already taken, an empty one, and a role that may not manage accounts", async () => {
    const make = (username: string, session = test.manager) =>
      test.transact((ex, ctx) => createAccount(ex, ctx, { username, displayName: "س", roleId: "SUPERVISOR" }), session);

    await make("supervisor");
    await expect(make("SUPERVISOR")).rejects.toThrow("This sign-in name is already taken.");
    await expect(make("  ")).rejects.toThrow("A sign-in name is required.");
    await expect(make("other", await test.sessionFor("ADMINISTRATION"))).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});

describe("the manager's place (audit ACC-5)", () => {
  /** The administration's role, given `users.manage` by the manager, and one of its accounts. */
  async function delegate() {
    const grants = await test.transact((ex, ctx) => listRoleGrants(ex, ctx));
    const administration = grants.find((role) => role.roleId === "ADMINISTRATION");
    if (!administration) throw new Error("test: no ADMINISTRATION role");
    await test.transact((ex, ctx) =>
      saveRoleGrants(ex, ctx, {
        roleId: "ADMINISTRATION",
        sections: administration.sections,
        capabilities: [...administration.capabilities, "users.manage"],
      }),
    );
    return { administration, session: await test.sessionFor("ADMINISTRATION") };
  }

  it("is given only by the manager, to a new account or an existing one (ACC-5)", async () => {
    const { session } = await delegate();
    await expect(
      test.transact(
        (ex, ctx) => createAccount(ex, ctx, { username: "boss2", displayName: "مدير ثان", roleId: "MANAGER" }),
        session,
      ),
    ).rejects.toThrow("Only the manager gives or changes the manager's role.");
    const { id } = await test.transact(
      (ex, ctx) => createAccount(ex, ctx, { username: "clerk", displayName: "كاتب", roleId: "RECEPTION_SALES" }),
      session,
    );
    await expect(
      test.transact((ex, ctx) => updateAccount(ex, ctx, { userId: id, roleId: "MANAGER" }), session),
    ).rejects.toThrow("Only the manager gives or changes the manager's role.");
    // Nor his own account.
    await expect(
      test.transact((ex, ctx) => updateAccount(ex, ctx, { userId: session.userId ?? "", roleId: "MANAGER" }), session),
    ).rejects.toThrow("Nobody changes the role of the account he is signed in with.");

    // The manager may.
    await test.transact((ex, ctx) => updateAccount(ex, ctx, { userId: id, roleId: "MANAGER" }));
    const role = await test.db.selectFrom("User").select("roleId").where("id", "=", id).executeTakeFirstOrThrow();
    expect(role.roleId).toBe("MANAGER");
    // And a manager's account is then his to demote or switch off, not the delegate's.
    await expect(
      test.transact((ex, ctx) => updateAccount(ex, ctx, { userId: id, roleId: "ACCOUNTANT" }), session),
    ).rejects.toThrow("Only the manager gives or changes the manager's role.");
    await expect(
      test.transact((ex, ctx) => setAccountActive(ex, ctx, { userId: id, active: false }), session),
    ).rejects.toThrow("Only the manager gives or changes the manager's role.");
  });

  it("keeps the manager's own powers his to give, and nobody raises his own role's rights (ACC-5)", async () => {
    const { session } = await delegate();
    const grants = await test.transact((ex, ctx) => listRoleGrants(ex, ctx));
    const accountant = grants.find((role) => role.roleId === "ACCOUNTANT");
    const administration = grants.find((role) => role.roleId === "ADMINISTRATION");
    if (!accountant || !administration) throw new Error("test: roles missing");

    const save = (roleId: string, sections: typeof accountant.sections, capabilities: Capability[]) =>
      test.transact((ex, ctx) => saveRoleGrants(ex, ctx, { roleId, sections, capabilities }), session);
    await expect(save("ACCOUNTANT", accountant.sections, [...accountant.capabilities, "invoice.void"])).rejects.toThrow(
      "Only the manager gives or takes away the manager's own rights.",
    );
    await expect(
      save(
        "ADMINISTRATION",
        administration.sections,
        administration.capabilities.filter((key) => key !== "users.manage"),
      ),
    ).rejects.toThrow("Only the manager gives or takes away the manager's own rights.");
    await expect(
      save("ADMINISTRATION", { ...administration.sections, MONEY: "WRITE" }, administration.capabilities),
    ).rejects.toThrow("Nobody raises the rights of his own role.");

    // An ordinary grant to another role is his to give, and lowering his own role is allowed.
    await save("ACCOUNTANT", accountant.sections, [...accountant.capabilities, "visit.enterOrder"]);
    const { STOCK: _stock, ...withoutStock } = administration.sections;
    await save("ADMINISTRATION", withoutStock, administration.capabilities);
    const after = await test.transact((ex, ctx) => listRoleGrants(ex, ctx));
    expect(after.find((role) => role.roleId === "ACCOUNTANT")?.capabilities).toContain("visit.enterOrder");
    expect(after.find((role) => role.roleId === "ADMINISTRATION")?.sections.STOCK).toBeUndefined();
  });
});
