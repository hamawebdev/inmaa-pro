import { afterEach, beforeEach, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, visitOn } from "../testing/fixtures";

import { syncDues } from "./dues";
import { getFileProfitability } from "./profitability";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

/** November of a building: 45 000,00, four Tuesdays of two workers for three hours, all done. */
async function novemberDone() {
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  return file;
}

it("compares the month's revenue with its labour, at the hourly cost set, and keeps it from who may not see costs", async () => {
  const file = await novemberDone();
  await test.transact((ex, ctx) => setSetting(ex, ctx, "costing.hourlyLabourCost", da(250)));
  // A transport expense tagged to the file.
  await test.rows.insert("Expense", {
    fileId: file.id,
    division: "BUILDING",
    category: "TRANSPORT",
    date: "2026-11-10",
    amount: da(1_000),
    method: "CASH",
  } as never);

  const report = await test.transact((ex, ctx) =>
    getFileProfitability(ex, ctx, { fileId: file.id, from: "2026-11-01", to: "2026-11-30" }),
  );
  expect(report.visits).toEqual({ planned: 4, done: 4 });
  // Four visits, two workers, three hours: 1 440 minutes planned and worked.
  expect(report.result.estimate.minutes).toBe(1_440);
  expect(report.result.actual.minutes).toBe(1_440);
  // 24 hours at 250,00 = 6 000,00; with 1 000,00 of transport, 7 000,00 against 45 000,00.
  expect(report.result).toMatchObject({
    revenue: da(45_000),
    actual: { labour: da(6_000), transport: da(1_000), cost: da(7_000), margin: da(38_000) },
    flags: { hoursOverEstimate: false, negativeMargin: false, hourlyCostMissing: false },
  });
  const entry = await test.db
    .selectFrom("AuditLog")
    .selectAll()
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirstOrThrow();
  expect(entry).toMatchObject({ operation: "CONSULT", entity: "File", entityId: file.id });

  const accountant = await test.sessionFor("ACCOUNTANT");
  await expect(
    test.transact((ex, ctx) => getFileProfitability(ex, ctx, { fileId: file.id }), accountant),
  ).rejects.toThrow("You do not have permission to do this.");
});

it("says the margin cannot be known while no hourly cost is set", async () => {
  const file = await novemberDone();
  const report = await test.transact((ex, ctx) =>
    getFileProfitability(ex, ctx, { fileId: file.id, from: "2026-11-01", to: "2026-11-30" }),
  );
  expect(report.result.actual.margin).toBeNull();
  expect(report.result.flags.hourlyCostMissing).toBe(true);
});
