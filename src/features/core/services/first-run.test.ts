import { describe, expect, it } from "vitest";

import { genesisHash, verifyChains } from "@/lib/chain";
import { CHAINED_TABLES } from "@/lib/db/chain-columns";
import { SYSTEM_SESSION } from "@/lib/service/context";
import { getSetting } from "@/lib/settings";
import { createTestDatabase } from "@/testing/database";

import { firstRun, FIRST_MANAGER_ID } from "./first-run";

describe("first run", () => {
  it("sets up a new database once: its id, the eight chains, the first entries of the log, the manager", async () => {
    const test = await createTestDatabase({ firstRun: false });
    try {
      const result = await test.transact(
        (ex, ctx) => firstRun(ex, ctx, { databaseId: "db-first-run" }),
        SYSTEM_SESSION,
      );

      expect(result).toEqual({ databaseId: "db-first-run", managerId: FIRST_MANAGER_ID });
      expect(await getSetting(test.db, "system.databaseId")).toBe("db-first-run");
      expect(await getSetting(test.db, "system.firstRunDone")).toBe(true);

      const heads = await test.db.selectFrom("ChainHead").selectAll().execute();
      expect(heads.map((head) => head.id).sort()).toEqual([...CHAINED_TABLES].sort());
      for (const head of heads.filter((candidate) => candidate.id !== "AuditLog")) {
        expect(head).toMatchObject({
          lastSeq: 0,
          lastHash: await genesisHash("db-first-run", head.id as (typeof CHAINED_TABLES)[number]),
        });
      }

      const log = await test.db.selectFrom("AuditLog").selectAll().orderBy("chainSeq").execute();
      expect(log.map((entry) => [entry.chainSeq, entry.operation, entry.action, entry.entity, entry.userName])).toEqual(
        [
          [1, "SECURITY", "CREATE", "Database", "system"],
          [2, "COLLECT", "CREATE", "User", "system"],
        ],
      );
      expect(log[0].prevHash).toBe(await genesisHash("db-first-run", "AuditLog"));

      const manager = await test.db
        .selectFrom("User")
        .selectAll()
        .where("id", "=", FIRST_MANAGER_ID)
        .executeTakeFirstOrThrow();
      expect(manager).toMatchObject({
        username: "manager",
        displayName: "المدير",
        roleId: "MANAGER",
        passwordHash: "",
        staffMemberId: null,
        branchId: "branch-main",
      });
      expect((await verifyChains(test.db)).ok).toBe(true);

      await expect(test.transact((ex, ctx) => firstRun(ex, ctx), SYSTEM_SESSION)).rejects.toThrow("already set up");
      expect(() =>
        test.raw.prepare(`UPDATE "Setting" SET "value" = '"another"' WHERE "key" = 'system.databaseId'`).run(),
      ).toThrow("FROZEN:Setting:system.databaseId");
    } finally {
      test.close();
    }
  });

  it("leaves nothing behind when it fails half way", async () => {
    const test = await createTestDatabase({ firstRun: false });
    try {
      const now = test.ctx().now;
      // An account already holds the name the manager would take: the last step fails.
      test.raw
        .prepare(
          `INSERT INTO "User" ("id", "username", "displayName", "passwordHash", "roleId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("user-other", "manager", "x", "", "ADMINISTRATION", now, now);

      await expect(test.transact((ex, ctx) => firstRun(ex, ctx), SYSTEM_SESSION)).rejects.toThrow(
        "UNIQUE constraint failed",
      );

      expect(await test.db.selectFrom("ChainHead").select("id").execute()).toEqual([]);
      expect(await test.db.selectFrom("Setting").select("key").execute()).toEqual([]);
      expect(await test.db.selectFrom("AuditLog").select("id").execute()).toEqual([]);
    } finally {
      test.close();
    }
  });
});
