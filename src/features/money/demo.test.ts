import { afterAll, beforeAll, expect, it } from "vitest";

import { evaluateAlerts } from "@/lib/alerts";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { findEndingContracts } from "./alerts";
import { getPeriodReport } from "./services/reports";

/**
 * The demo data, as the acceptance script uses it (docs/checker/acceptance.md,
 * part D and step A11): on the demo's Monday each of Money's and Stock's
 * tiles is lit by a named record, and the paid invoice shows in the reports.
 */
let test: TestDatabase;
beforeAll(async () => {
  test = await createTestDatabase({ demo: true });
}, 120_000);
afterAll(() => test.close());

it("lights each of Money's and Stock's tiles on the demo's date", async () => {
  const tiles = await test.transact((ex, ctx) => evaluateAlerts(ex, ctx));
  const byKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const keys = ["contract.ending", "payment.overdue", "payment.dueSoon", "stock.low", "maintenance.due"] as const;
  for (const key of keys) {
    expect(byKey.get(key)?.count ?? 0, key).toBeGreaterThan(0);
  }
  expect(byKey.get("payment.overdue")?.route).toBe("/dashboard/payments?view=dues&state=OVERDUE");
  expect(byKey.get("payment.dueSoon")?.route).toBe("/dashboard/payments?view=dues&state=DUE_SOON");
  expect(byKey.get("maintenance.due")?.route).toBe("/dashboard/maintenance");
});

it("names the records that light them", async () => {
  const { money, stock } = test.demo;
  const ending = await test.transact((ex, ctx) => findEndingContracts(ex, ctx, { leadDays: 30 }));
  expect(ending).toContain(money.pastContract);

  const dues = await test.db
    .selectFrom("PaymentDue")
    .select(["id", "dueDate", "amount", "paidAmount"])
    .where("id", "in", [money.dueOverdue, money.dueSoon])
    .execute();
  expect(dues.find((due) => due.id === money.dueOverdue)).toMatchObject({ dueDate: "2026-09-15", paidAmount: 0 });
  expect(dues.find((due) => due.id === money.dueSoon)).toMatchObject({ dueDate: "2026-10-15", paidAmount: 0 });

  const item = await test.db
    .selectFrom("StockItem")
    .select(["onHandQty", "minLevel"])
    .where("id", "=", stock.itemLow)
    .executeTakeFirstOrThrow();
  expect(item.onHandQty).toBeLessThanOrEqual(item.minLevel ?? -1);
  const unit = await test.db
    .selectFrom("EquipmentUnit")
    .select("nextMaintenanceDate")
    .where("id", "=", stock.unitMaintenanceDue)
    .executeTakeFirstOrThrow();
  expect(unit.nextMaintenanceDate).toBe("2026-10-15");
});

it("shows the paid invoice in the month's report, under its division", async () => {
  const report = await test.transact((ex, ctx) =>
    getPeriodReport(ex, ctx, { from: "2026-10-01", to: "2026-10-31" } as never),
  );
  expect(report.result.byDivision.HOUSING.income).toBe(1_200_000);
  expect(report.counts).toMatchObject({ invoices: 2, payments: 1 });
  expect(report.contracts.find((line) => line.fileId === test.demo.money.pastContract)).toMatchObject({
    invoiced: 2_400_000,
    received: 1_200_000,
  });
});
