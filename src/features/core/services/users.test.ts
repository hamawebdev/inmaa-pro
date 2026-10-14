import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { createAccount } from "./users";

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
