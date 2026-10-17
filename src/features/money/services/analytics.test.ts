import { afterEach, beforeEach, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { getPeriodAnalytics } from "./analytics";
import { createExpense } from "./expenses";
import { syncDues } from "./dues";
import { recordPayment } from "./payments";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

const november = { from: "2026-11-01", to: "2026-11-30" };

/** A building contract's November: four visits done, 45 000,00; labour at 250,00 an hour. */
async function novemberWorked() {
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  await test.transact((ex, ctx) => setSetting(ex, ctx, "costing.hourlyLabourCost", da(250)));
  return file;
}

it("gives each contract its revenue, cost and result, for who may see costs, its reading logged (F-30b)", async () => {
  const file = await novemberWorked();
  const report = await test.transact((ex, ctx) => getPeriodAnalytics(ex, ctx, november));
  expect(report.seesCost).toBe(true);
  // 24 hours at 250,00: 6 000,00 against 45 000,00.
  expect(report.contracts).toEqual([
    expect.objectContaining({
      fileId: file.id,
      revenue: da(45_000),
      actualCost: da(6_000),
      result: da(39_000),
      serviceType: "CONTRACT",
    }),
  ]);
  const entry = await test.db
    .selectFrom("AuditLog")
    .selectAll()
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirstOrThrow();
  expect(entry).toMatchObject({ operation: "CONSULT", entity: "PeriodReport" });
});

it("hides the costs from who may not see them, the revenue still shown (F-30b, F-41)", async () => {
  await novemberWorked();
  const accountant = await test.sessionFor("ACCOUNTANT");
  const report = await test.transact((ex, ctx) => getPeriodAnalytics(ex, ctx, november), accountant);
  expect(report.seesCost).toBe(false);
  expect(report.contracts[0]).toMatchObject({ revenue: da(45_000), actualCost: null, result: null });
  expect(report.byClient[0]).toMatchObject({ revenue: da(45_000), cost: null, result: null });
});

it("sums revenue, cost and result by service type, by zone and by client (F-41)", async () => {
  const file = await novemberWorked();
  const report = await test.transact((ex, ctx) => getPeriodAnalytics(ex, ctx, november));
  expect(report.byServiceType).toEqual([
    { key: "CONTRACT", label: "CONTRACT", revenue: da(45_000), cost: da(6_000), result: da(39_000) },
  ]);
  expect(report.byClient).toEqual([
    expect.objectContaining({ key: file.clientId, revenue: da(45_000), result: da(39_000) }),
  ]);
  expect(report.byZone).toHaveLength(1);
});

it("follows the money in and out month by month over the period, as the cash box saw it (F-41)", async () => {
  const file = await novemberWorked();
  await openDay(test, "2026-12-03T09:00:00.000Z");
  await test.transact(async (ex, ctx) => {
    // Paid in cash: the 675 DA of stamp duty came into the box with it (and go out later as «ضرائب»).
    await recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) });
    await createExpense(ex, ctx, {
      values: {
        division: "COMMON",
        category: "RENT",
        date: "2026-11-02",
        amount: 30_000,
        method: "CASH",
        recurrence: "NONE",
      } as never,
    });
  });
  const report = await test.transact((ex, ctx) =>
    getPeriodAnalytics(ex, ctx, { from: "2026-11-01", to: "2026-12-31" }),
  );
  expect(report.cashFlow).toEqual([
    { month: "2026-11", moneyIn: 0, moneyOut: da(30_000), net: -da(30_000), running: -da(30_000) },
    { month: "2026-12", moneyIn: da(45_675), moneyOut: 0, net: da(45_675), running: da(15_675) },
  ]);
});

it("reports one branch, or the whole centre (F-47)", async () => {
  await novemberWorked();
  const other = await test.rows.insert("Branch", { name: "فرع عين البيضاء" } as never);
  const main = await test.transact((ex, ctx) => getPeriodAnalytics(ex, ctx, { ...november, branchId: "branch-main" }));
  expect(main.contracts).toHaveLength(1);
  const elsewhere = await test.transact((ex, ctx) => getPeriodAnalytics(ex, ctx, { ...november, branchId: other.id }));
  expect(elsewhere.contracts).toEqual([]);
});
