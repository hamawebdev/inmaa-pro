import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordPayout, voidPayout } from "@/features/people/services/payouts";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { da } from "../testing/fixtures";

import { postPayoutExpenses, removePayoutExpenses } from "./wages";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const expensesOf = async (staffPayoutId: string) =>
  (
    await test.db
      .selectFrom("Expense")
      .select(["division", "category", "amount", "source", "method", "deletedAt"])
      .where("staffPayoutId", "=", staffPayoutId)
      .orderBy("category")
      .orderBy("division")
      .execute()
  ).map((row) => [row.category, row.division, row.amount, row.deletedAt === null]);

/** A wage of 30 000,00 that pays a payslip whole: two thirds of its minutes on buildings, one third on homes. */
async function wagePayout() {
  const payslip = await test.rows.insert("Payslip", {
    netAmount: da(30_000),
    cnasAmount: da(2_700),
    employerCnasAmount: da(7_800),
    irgAmount: 0,
    divisionMin: JSON.stringify({ BUILDING: 600, HOUSING: 300 }),
  } as never);
  return test.rows.insert("StaffPayout", {
    staffId: payslip.staffId,
    payslipId: payslip.id,
    kind: "WAGE",
    amount: da(30_000),
    date: "2026-10-12",
    wageMethod: "CASH",
  } as never);
}

describe("a wage in the expenses", () => {
  it("is posted on the payout's day, split by the payslip's minutes, with its contributions when it completes the payslip", async () => {
    const payout = await wagePayout();
    const posted = await test.transact((ex, ctx) => postPayoutExpenses(ex, ctx, { staffPayoutId: payout.id }));
    expect(posted.created).toBe(4);
    expect(await expensesOf(payout.id)).toEqual([
      ["CONTRIBUTIONS", "BUILDING", da(7_000), true],
      ["CONTRIBUTIONS", "HOUSING", da(3_500), true],
      ["WAGES", "BUILDING", da(20_000), true],
      ["WAGES", "HOUSING", da(10_000), true],
    ]);
    const row = await test.db
      .selectFrom("Expense")
      .select(["date", "source", "method", "payRunId"])
      .where("staffPayoutId", "=", payout.id)
      .where("category", "=", "WAGES")
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ date: "2026-10-12", source: "PAYROLL", method: "CASH" });
    expect(row.payRunId).not.toBeNull();
  });

  it("is posted once, and leaves with a voided payout", async () => {
    const payout = await wagePayout();
    await test.transact((ex, ctx) => postPayoutExpenses(ex, ctx, { staffPayoutId: payout.id }));
    const again = await test.transact((ex, ctx) => postPayoutExpenses(ex, ctx, { staffPayoutId: payout.id }));
    expect(again.created).toBe(0);

    const removed = await test.transact((ex, ctx) => removePayoutExpenses(ex, ctx, { staffPayoutId: payout.id }));
    expect(removed.removed).toBe(4);
    expect((await expensesOf(payout.id)).every((row) => row[3] === false)).toBe(true);
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "ERASE", entity: "Expense" });
  });
});

describe("People's payout events", () => {
  it("post an advance on «عام» when it is paid, and take it out when it is voided", async () => {
    const worker = await test.rows.insert("StaffMember", { kind: "WORKER", engagementStatus: "ACCEPTED" } as never);
    const paid = await test.transact((ex, ctx) =>
      recordPayout(ex, ctx, {
        staffId: worker.id,
        kind: "ADVANCE",
        amount: da(5_000),
        date: "2026-10-12",
        wageMethod: "CASH",
      }),
    );
    expect(await expensesOf(paid.id)).toEqual([["WAGES", "COMMON", da(5_000), true]]);

    await test.transact((ex, ctx) => voidPayout(ex, ctx, { payoutId: paid.id, reason: "خطأ في المبلغ" }));
    expect(await expensesOf(paid.id)).toEqual([["WAGES", "COMMON", da(5_000), false]]);
  });
});
