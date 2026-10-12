import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STAND_IN_MANAGER_ID } from "@/features/core/services/first-run";
import { SYSTEM_SESSION } from "@/lib/service/context";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { CAPABILITIES, DEFAULT_SECTION_LEVELS } from "./catalogue";
import { can, loadSession, requireCapability, requireSection, sectionLevel } from "./session";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

describe("roles and capabilities", () => {
  it("load a role's sections and capabilities at sign-in", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT");

    expect(accountant.sections).toEqual(DEFAULT_SECTION_LEVELS.ACCOUNTANT);
    expect(can(accountant, "invoice.issue")).toBe(true);
    expect(can(accountant, "staff.health.read")).toBe(false);
    expect(sectionLevel(accountant, "MONEY")).toBe("WRITE");
    expect(sectionLevel(accountant, "SETTINGS")).toBeNull();
    expect(() => requireSection(accountant, "WORKERS", "READ")).not.toThrow();
    expect(() => requireSection(accountant, "WORKERS", "WRITE")).toThrow("You do not have permission to do this.");
    expect(() => requireCapability(accountant, "payment.void")).toThrow("You do not have permission to do this.");
  });

  it("give the manager and the program itself everything, with no grant row", async () => {
    expect(can(test.manager, "backup.restore")).toBe(true);
    expect(sectionLevel(test.manager, "SETTINGS")).toBe("WRITE");
    expect(can(SYSTEM_SESSION, "invoice.void")).toBe(true);
    const managerGrants = await test.db.selectFrom("RoleGrant").select("id").where("roleId", "=", "MANAGER").execute();
    expect(managerGrants).toEqual([]);
  });

  it("are seeded as the catalogue says, and the database refuses backup.restore to any role", async () => {
    const grants = await test.db.selectFrom("RoleGrant").select(["roleId", "kind", "key", "access"]).execute();
    const wanted = [
      ...Object.entries(DEFAULT_SECTION_LEVELS).flatMap(([role, levels]) =>
        Object.entries(levels).map(([key, access]) => ({ roleId: role, kind: "SECTION", key, access })),
      ),
      ...Object.entries(CAPABILITIES).flatMap(([key, roles]) =>
        roles.map((role) => ({ roleId: role, kind: "CAPABILITY", key, access: "GRANTED" })),
      ),
    ];
    const sort = (rows: Array<{ roleId: string; key: string; kind: string }>) =>
      [...rows].sort((a, b) => `${a.roleId}${a.kind}${a.key}`.localeCompare(`${b.roleId}${b.kind}${b.key}`));
    expect(sort(grants)).toEqual(sort(wanted));

    await expect(test.rows.insert("RoleGrant", { roleId: "ADMINISTRATION", key: "backup.restore" })).rejects.toThrow(
      "CHECK constraint failed",
    );
  });

  it("sign in the stand-in manager until the sign-in screen exists", async () => {
    expect(test.manager).toMatchObject({
      userId: STAND_IN_MANAGER_ID,
      roleId: "MANAGER",
      userName: "المدير",
      branchId: "branch-main",
    });
    const account = await test.db
      .selectFrom("User")
      .selectAll()
      .where("id", "=", STAND_IN_MANAGER_ID)
      .executeTakeFirstOrThrow();
    expect(account).toMatchObject({ username: "manager", passwordHash: "", staffMemberId: null, isActive: 1 });
  });

  it("keep one active manager at least, and refuse an account that is not active", async () => {
    expect(() => test.raw.prepare(`UPDATE "User" SET "isActive" = 0 WHERE "id" = ?`).run(STAND_IN_MANAGER_ID)).toThrow(
      "LAST_MANAGER:User",
    );

    const clerk = await test.sessionFor("RECEPTION_SALES");
    test.raw.prepare(`UPDATE "User" SET "isActive" = 0 WHERE "id" = ?`).run(clerk.userId);
    await expect(loadSession(test.db, clerk.userId!)).rejects.toThrow("This account does not exist or is not active.");
  });
});
