import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SECTION_LEVELS } from "@/lib/access/catalogue";
import { loadSession } from "@/lib/access/session";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { FIRST_MANAGER_ID } from "./first-run";
import {
  createAccount,
  linkAccountToStaff,
  listAccounts,
  listRoleGrants,
  saveRoleGrants,
  setAccountActive,
  updateAccount,
} from "./users";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const lastEntry = () =>
  test.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "entity", "entityId", "changes"])
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirstOrThrow();

describe("accounts", () => {
  it("are listed for whoever manages them, active first", async () => {
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "hr", displayName: "سعاد بن عمر", roleId: "HR_OFFICER" }),
    );
    const rows = await test.transact((ex, ctx) => listAccounts(ex, ctx));
    expect(rows.map((row) => [row.username, row.roleId, row.isActive, row.needsPassword])).toEqual([
      ["manager", "MANAGER", true, true],
      ["hr", "HR_OFFICER", true, true],
    ]);
    const hr = await loadSession(test.db, id);
    await expect(test.transact((ex, ctx) => listAccounts(ex, ctx), hr)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });

  it("change name and role, and the database keeps one active manager", async () => {
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "admin", displayName: "كريم", roleId: "ADMINISTRATION" }),
    );
    await test.transact((ex, ctx) =>
      updateAccount(ex, ctx, { userId: id, displayName: "كريم بوزيد", roleId: "SUPERVISOR" }),
    );
    expect(await lastEntry()).toMatchObject({ operation: "CHANGE", action: "UPDATE", entity: "User", entityId: id });
    expect(JSON.parse((await lastEntry()).changes!)).toEqual({
      displayName: ["كريم", "كريم بوزيد"],
      roleId: ["ADMINISTRATION", "SUPERVISOR"],
    });

    await expect(
      test.transact((ex, ctx) => updateAccount(ex, ctx, { userId: FIRST_MANAGER_ID, roleId: "ACCOUNTANT" })),
    ).rejects.toThrow("LAST_MANAGER");
  });

  it("are switched off and on, never the one signed in", async () => {
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "reception", displayName: "أمينة", roleId: "RECEPTION_SALES" }),
    );
    await expect(
      test.transact((ex, ctx) => setAccountActive(ex, ctx, { userId: FIRST_MANAGER_ID, active: false })),
    ).rejects.toThrow("You cannot switch off the account you are signed in with.");

    await test.transact((ex, ctx) => setAccountActive(ex, ctx, { userId: id, active: false }));
    const off = await test.db
      .selectFrom("User")
      .select(["isActive", "deactivatedAt"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(off).toEqual({ isActive: 0, deactivatedAt: test.ctx().now });
    expect(await lastEntry()).toMatchObject({ action: "STATUS_CHANGE", entityId: id });
    await expect(loadSession(test.db, id)).rejects.toThrow("This account does not exist or is not active.");

    await test.transact((ex, ctx) => setAccountActive(ex, ctx, { userId: id, active: true }));
    expect((await loadSession(test.db, id)).roleId).toBe("RECEPTION_SALES");
  });

  it("are linked to one centre employee each", async () => {
    const employee = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" });
    const worker = await test.rows.insert("StaffMember", { kind: "WORKER" });
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "hr", displayName: "سعاد", roleId: "HR_OFFICER" }),
    );

    await expect(
      test.transact((ex, ctx) => linkAccountToStaff(ex, ctx, { userId: id, staffMemberId: worker.id })),
    ).rejects.toThrow("An account can be linked only to a centre employee.");
    await test.transact((ex, ctx) => linkAccountToStaff(ex, ctx, { userId: id, staffMemberId: employee.id }));
    expect((await loadSession(test.db, id)).staffMemberId).toBe(employee.id);
    expect(JSON.parse((await lastEntry()).changes!)).toEqual({ staffMemberId: [null, employee.id] });

    await expect(
      test.transact((ex, ctx) => linkAccountToStaff(ex, ctx, { userId: FIRST_MANAGER_ID, staffMemberId: employee.id })),
    ).rejects.toThrow("This employee already has an account.");

    await test.transact((ex, ctx) => linkAccountToStaff(ex, ctx, { userId: id, staffMemberId: null }));
    expect((await loadSession(test.db, id)).staffMemberId).toBeNull();
  });
});

describe("what a role may do", () => {
  it("is listed as the seed made it, the manager's role holding everything", async () => {
    const roles = await test.transact((ex, ctx) => listRoleGrants(ex, ctx));
    expect(roles[0]).toMatchObject({ roleId: "MANAGER", isSystem: true, sections: {}, capabilities: [] });
    expect(roles.find((role) => role.roleId === "ACCOUNTANT")?.sections).toEqual(DEFAULT_SECTION_LEVELS.ACCOUNTANT);
  });

  it("is changed as a whole, logged, and read at the next sign-in", async () => {
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "reception", displayName: "أمينة", roleId: "RECEPTION_SALES" }),
    );
    await test.transact((ex, ctx) =>
      saveRoleGrants(ex, ctx, {
        roleId: "RECEPTION_SALES",
        sections: { HOME: "READ", REQUESTS: "WRITE", MONEY: "READ" },
        capabilities: ["payment.record", "visit.enterOrder", "cost.read"],
      }),
    );
    const session = await loadSession(test.db, id);
    expect(session.sections).toEqual({ HOME: "READ", REQUESTS: "WRITE", MONEY: "READ" });
    expect([...session.capabilities].sort()).toEqual(["cost.read", "payment.record", "visit.enterOrder"]);
    const entry = await lastEntry();
    expect(entry).toMatchObject({ action: "UPDATE", entity: "Role", entityId: "RECEPTION_SALES" });
    expect(JSON.parse(entry.changes!)).toEqual({
      sections: [
        { HOME: "READ", REQUESTS: "WRITE" },
        { HOME: "READ", MONEY: "READ", REQUESTS: "WRITE" },
      ],
      capabilities: [
        ["payment.record", "visit.enterOrder"],
        ["cost.read", "payment.record", "visit.enterOrder"],
      ],
    });
  });

  it("never gives restoring a backup, and never edits the manager's role", async () => {
    await expect(
      test.transact((ex, ctx) =>
        saveRoleGrants(ex, ctx, { roleId: "ACCOUNTANT", sections: {}, capabilities: ["backup.restore"] }),
      ),
    ).rejects.toThrow("Restoring a backup is the manager's alone.");
    await expect(
      test.transact((ex, ctx) => saveRoleGrants(ex, ctx, { roleId: "MANAGER", sections: {}, capabilities: [] })),
    ).rejects.toThrow("The manager's role holds everything and is not changed.");
  });
});
