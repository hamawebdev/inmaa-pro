import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { readRestricted } from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

async function logCount(): Promise<number> {
  const row = await test.db
    .selectFrom("AuditLog")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

async function workerWithAnswers() {
  const staff = await test.rows.insert("StaffMember", { lastName: "بن علي", firstName: "فاطمة", number: "12/F" });
  await test.rows.insert("StaffConfidential", {
    staffId: staff.id,
    conditions: '["ASTHMA"]',
    scoreAppearance: 8,
    total: 80,
  });
  return staff;
}

describe("restricted data", () => {
  it("opens one group at a time, for the capability that opens it, and logs each read", async () => {
    const staff = await workerWithAnswers();
    const hr = await test.sessionFor("HR_OFFICER");

    const health = await test.transact(
      (ex, ctx) =>
        readRestricted(ex, ctx, { capability: "staff.health.read", entity: "StaffConfidential", id: staff.id }),
      hr,
    );
    expect(health).toEqual({ conditions: '["ASTHMA"]', otherText: null, signedFormScanUrl: null });
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "CONSULT",
      action: "VIEW_RESTRICTED",
      entity: "StaffConfidential",
      entityId: staff.id,
      entityLabel: "12/F",
      subjectKind: "WORKER",
      subjectLabel: "بن علي فاطمة",
      userRole: "HR_OFFICER",
    });
    expect(JSON.parse(entry.context ?? "null")).toEqual({ group: "staff.health.read" });

    const score = await test.transact(
      (ex, ctx) =>
        readRestricted(ex, ctx, { capability: "staff.hiringScore.read", entity: "StaffConfidential", id: staff.id }),
      hr,
    );
    expect(score).toMatchObject({ scoreAppearance: 8, total: 80 });
    expect(score).not.toHaveProperty("conditions");
  });

  it("is refused to a role without the capability, and then nothing is logged", async () => {
    const staff = await workerWithAnswers();
    const accountant = await test.sessionFor("ACCOUNTANT");
    const before = await logCount();

    await expect(
      test.transact(
        (ex, ctx) =>
          readRestricted(ex, ctx, { capability: "staff.health.read", entity: "StaffConfidential", id: staff.id }),
        accountant,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
    expect(await logCount()).toBe(before);
  });
});
