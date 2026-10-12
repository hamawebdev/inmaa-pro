import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, TEST_NOW, type TestDatabase } from "@/testing/database";

import { logChange, logCollect, logConsult, logDisclose, logErase, logSecurity, WITHHELD } from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

const last = () =>
  test.db.selectFrom("AuditLog").selectAll().orderBy("chainSeq", "desc").limit(1).executeTakeFirstOrThrow();

async function count(): Promise<number> {
  const row = await test.db
    .selectFrom("AuditLog")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

describe("the access and change log", () => {
  it("keeps the five things of Law 18-07: operation, reason, date, time and user", async () => {
    const hr = await test.sessionFor("HR_OFFICER");
    await test.transact(
      (ex, ctx) =>
        logChange(ex, ctx, {
          owner: "PEOPLE",
          action: "UPDATE",
          entity: "StaffMember",
          entityId: "staff-1",
          entityLabel: "12/F",
          subject: { kind: "WORKER", id: "staff-1", label: "بن علي فاطمة" },
          changes: { phone1: ["0659538183", "0660112233"] },
        }),
      hr,
    );

    const entry = await last();
    expect(entry).toMatchObject({
      operation: "CHANGE",
      action: "UPDATE",
      reason: "STANDARD:UPDATE",
      localDate: "2026-10-12",
      localTime: "09:00",
      occurredAt: TEST_NOW,
      userId: hr.userId,
      userName: hr.userName,
      userRole: "HR_OFFICER",
      ownerCode: "PEOPLE",
      entityLabel: "12/F",
      subjectKind: "WORKER",
      subjectLabel: "بن علي فاطمة",
    });
    expect(JSON.parse(entry.changes ?? "null")).toEqual({ phone1: ["0659538183", "0660112233"] });
  });

  it("names each operation, and a print as a disclosure", async () => {
    await test.transact(async (ex, ctx) => {
      await logCollect(ex, ctx, { owner: "CLIENTS", action: "CREATE", entity: "Client", entityId: "client-1" });
      await logConsult(ex, ctx, { owner: "CLIENTS", action: "VIEW", entity: "Resident", entityId: "file-1" });
      await logDisclose(ex, ctx, { owner: "CLIENTS", action: "PRINT", entity: "File", entityId: "file-1" });
      await logErase(ex, ctx, {
        owner: "CLIENTS",
        action: "SOFT_DELETE",
        reason: "ملف مكرر",
        entity: "Client",
        entityId: "client-1",
      });
      await logSecurity(ex, ctx, { owner: "FOUNDATION", action: "SIGN_IN" });
    });

    const rows = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "disclosure"])
      .orderBy("chainSeq", "desc")
      .limit(5)
      .execute();
    expect(rows.reverse()).toEqual([
      { operation: "COLLECT", disclosure: null },
      { operation: "CONSULT", disclosure: null },
      { operation: "DISCLOSE", disclosure: "PRINT" },
      { operation: "ERASE", disclosure: null },
      { operation: "SECURITY", disclosure: null },
    ]);
  });

  it("keeps the reason the user typed, and refuses an act that needs one without it", async () => {
    await expect(
      test.transact((ex, ctx) =>
        logChange(ex, ctx, { owner: "MONEY", action: "VOID", entity: "Invoice", entityId: "invoice-1" }),
      ),
    ).rejects.toThrow("needs the reason the user typed");

    await test.transact((ex, ctx) =>
      logChange(ex, ctx, {
        owner: "MONEY",
        action: "VOID",
        reason: "  خطأ في المبلغ ",
        entity: "Invoice",
        entityId: "invoice-1",
      }),
    );
    expect((await last()).reason).toBe("خطأ في المبلغ");
  });

  it("never writes a health answer, a password hash or a cost, only that it changed", async () => {
    await test.transact(async (ex, ctx) => {
      await logChange(ex, ctx, {
        owner: "PEOPLE",
        action: "UPDATE",
        entity: "StaffConfidential",
        entityId: "staff-1",
        changes: { conditions: ["[]", '["ASTHMA"]'], total: [null, 80] },
      });
      await logChange(ex, ctx, {
        owner: "FOUNDATION",
        action: "UPDATE",
        entity: "User",
        entityId: "user-1",
        changes: { passwordHash: ["pbkdf2-sha256$1$a", "pbkdf2-sha256$1$b"], displayName: ["أحمد", "أحمد بن علي"] },
      });
      await logChange(ex, ctx, {
        owner: "CLIENTS",
        action: "UPDATE",
        entity: "CostStudy",
        entityId: "cost-1",
        changes: { totalCost: [100, 200] },
      });
    });

    const rows = await test.db.selectFrom("AuditLog").select("changes").orderBy("chainSeq", "desc").limit(3).execute();
    const [cost, user, health] = rows.map((row) => JSON.parse(row.changes ?? "null"));
    expect(health).toEqual({ conditions: [WITHHELD, WITHHELD], total: [WITHHELD, WITHHELD] });
    expect(user).toEqual({ passwordHash: [WITHHELD, WITHHELD], displayName: ["أحمد", "أحمد بن علي"] });
    expect(cost).toEqual({ totalCost: [WITHHELD, WITHHELD] });
  });

  it("is rolled back with the change it records, and nothing can be removed from it", async () => {
    const before = await count();

    await expect(
      test.transact(async (ex, ctx) => {
        await logSecurity(ex, ctx, { owner: "FOUNDATION", action: "LOCK" });
        throw new Error("core: failed after logging");
      }),
    ).rejects.toThrow("failed after logging");

    expect(await count()).toBe(before);
    expect(() => test.raw.prepare(`DELETE FROM "AuditLog"`).run()).toThrow("APPEND_ONLY:AuditLog:delete");
  });
});
