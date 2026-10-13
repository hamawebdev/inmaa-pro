import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { logConsult, logConsultOnce, type LogEntry } from "./index";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const consults = async () =>
  (
    await test.db
      .selectFrom("AuditLog")
      .select(["userId", "localDate", "entityId"])
      .where("operation", "=", "CONSULT")
      .orderBy("chainSeq")
      .execute()
  ).map((row) => `${row.userId}|${row.localDate}|${row.entityId}`);

const page = (entityId: string): LogEntry => ({
  owner: "PEOPLE",
  action: "VIEW",
  entity: "StaffMember",
  entityId,
  subject: { kind: "WORKER", id: entityId, label: "سميرة" },
});

it("logs a person's file page once per user, record and day (ruling 29)", async () => {
  const manager = test.manager.userId;
  const first = await test.transact((ex, ctx) => logConsultOnce(ex, ctx, page("w-1")));
  expect(first).toEqual(expect.any(String));
  // The same page again that day: nothing more is written.
  test.clock.advance({ hours: 2 });
  expect(await test.transact((ex, ctx) => logConsultOnce(ex, ctx, page("w-1")))).toBeNull();
  // Another record, another user and another day each count.
  await test.transact((ex, ctx) => logConsultOnce(ex, ctx, page("w-2")));
  const hr = await test.sessionFor("HR_OFFICER");
  await test.transact((ex, ctx) => logConsultOnce(ex, ctx, page("w-1")), hr);
  test.clock.advance({ days: 1 });
  await test.transact((ex, ctx) => logConsultOnce(ex, ctx, page("w-1")));

  expect(await consults()).toEqual([
    `${manager}|2026-10-12|w-1`,
    `${manager}|2026-10-12|w-2`,
    `${hr.userId}|2026-10-12|w-1`,
    `${manager}|2026-10-13|w-1`,
  ]);
});

it("leaves restricted data logged at every read", async () => {
  const restricted: LogEntry = { ...page("w-1"), action: "VIEW_RESTRICTED", entity: "StaffConfidential" };
  await test.transact((ex, ctx) => logConsult(ex, ctx, restricted));
  await test.transact((ex, ctx) => logConsult(ex, ctx, restricted));
  // And an ordinary opening is not hidden by a restricted read of the same person.
  await test.transact((ex, ctx) => logConsultOnce(ex, ctx, page("w-1")));
  expect(await consults()).toHaveLength(3);
});

it("needs the record it is about", async () => {
  await expect(
    test.transact((ex, ctx) => logConsultOnce(ex, ctx, { owner: "PEOPLE", action: "VIEW" })),
  ).rejects.toThrow("log: logConsultOnce needs the record's entity and id");
});
