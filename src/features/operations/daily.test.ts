import { afterEach, beforeEach, expect, it } from "vitest";

import { loadFeatureDaily, runDayStart } from "@/lib/daily";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  loadFeatureDaily();
});
afterEach(() => test.close());

const statusOf = async (id: string) =>
  (await test.db.selectFrom("Inspection").select("status").where("id", "=", id).executeTakeFirstOrThrow()).status;

it("marks an inspection left planned past its days as missed, as the program, once", async () => {
  // Today is 12 October 2026; seven days are allowed by default.
  const late = await test.rows.insert("Inspection", { status: "PLANNED", plannedDate: "2026-10-04" });
  const recent = await test.rows.insert("Inspection", { status: "PLANNED", plannedDate: "2026-10-06" });

  const report = await runDayStart(test.db, test.clock);
  expect(report.failed).toEqual([]);
  expect(report.ran).toContain("operations");
  expect(await statusOf(late.id)).toBe("MISSED");
  expect(await statusOf(recent.id)).toBe("PLANNED");

  // The next day the second one passes its seventh day too; the first is left as it is.
  test.clock.advance({ days: 1 });
  await runDayStart(test.db, test.clock);
  expect(await statusOf(recent.id)).toBe("MISSED");
  const entries = await test.db
    .selectFrom("AuditLog")
    .select(["userId", "context"])
    .where("entity", "=", "Inspection")
    .where("operation", "=", "CHANGE")
    .execute();
  expect(entries).toHaveLength(2);
  expect(entries.every((entry) => entry.userId === null)).toBe(true);
});
