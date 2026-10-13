import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { registerHandler } from "@/lib/events";
import { setSetting } from "@/lib/settings";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { closePayRun, preparePayRun } from "./pay-runs";
import {
  addDebtEntry,
  getClosedPayroll,
  getPayoutForExpense,
  getStaffLedger,
  listDebtors,
  listPayouts,
  recordDebt,
  recordPayout,
  voidPayout,
} from "./payouts";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function aWorker() {
  return (
    await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, {
        ...emptyWorkerValues("2026-08-01"),
        sex: "FEMALE",
        lastName: "قاسمي",
        firstName: "نوال",
        birthDate: "1996-01-12",
        phone: "0555 31 42 53",
        hiringDecision: "ACCEPTED",
        issuedDate: "2026-08-01",
        payBasis: "HOURLY",
        payRate: "250",
        payPeriod: "MONTHLY",
        cnasDeclared: true,
        cnasNumber: "960112004512",
      }),
    )
  ).id;
}

async function seat(workerId: string, date: string) {
  const visit = await test.rows.insert("Visit", {
    visitDate: localDate(date),
    plannedStartTime: "08:00" as never,
    plannedDurationMin: 480 as never,
    status: "DONE",
  });
  await test.rows.insert("VisitWorker", {
    visitId: visit.id,
    workerId,
    role: "CLEANER",
    seatStatus: "ASSIGNED",
    workedMin: 480 as never,
    arrivedTime: "08:00" as never,
    leftTime: "16:00" as never,
  });
}

/** September closed for her: 3 days, 6,000 DA gross, 540 DA of CNAS, no IRG: 5,460 DA net. */
async function closedSeptember(workerId: string) {
  for (const day of ["01", "02", "03"]) await seat(workerId, `2026-09-${day}`);
  // A scale that exempts everybody: the payslips close without an IRG typed.
  await test.transact((ex, ctx) =>
    setSetting(ex, ctx, "pay.irgTable", {
      brackets: [{ upTo: 100_000_000, rateBp: 0 }],
      abatementBp: 0,
      abatementMin: 0,
      abatementMax: 0,
      exemptUpTo: 3_000_000,
    }),
  );
  const { payRunId } = await test.transact((ex, ctx) =>
    preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-09" }),
  );
  await test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId }));
  const slip = await test.db
    .selectFrom("Payslip")
    .selectAll()
    .where("payRunId", "=", payRunId)
    .executeTakeFirstOrThrow();
  return { payRunId, payslipId: slip.id, net: slip.netAmount };
}

describe("payouts", () => {
  it("pays a closed payslip in two times, tells Money each time, and never pays more than is left", async () => {
    const id = await aWorker();
    const { payslipId, payRunId, net } = await closedSeptember(id);
    const told: string[] = [];
    registerHandler("money", "payout.recorded", async (_ex, _ctx, payload) => void told.push(payload.staffPayoutId));
    registerHandler(
      "money",
      "payout.voided",
      async (_ex, _ctx, payload) => void told.push(`void ${payload.staffPayoutId}`),
    );

    const pay = (amount: number, date: string) =>
      test.transact((ex, ctx) =>
        recordPayout(ex, ctx, { staffId: id, date, amount, kind: "WAGE", wageMethod: "CASH", payslipId }),
      );
    const first = await pay(300_000, "2026-10-05");
    expect(first.number).toMatch(/\d/);
    let slip = await test.db.selectFrom("Payslip").selectAll().where("id", "=", payslipId).executeTakeFirstOrThrow();
    expect(slip).toMatchObject({ paidAmount: 300_000, paidDate: null, wageMethod: "CASH" });
    await expect(pay(net - 300_000 + 1, "2026-10-08")).rejects.toThrow(
      "This is more than what is left to pay on this payslip.",
    );
    const second = await pay(net - 300_000, "2026-10-08");
    slip = await test.db.selectFrom("Payslip").selectAll().where("id", "=", payslipId).executeTakeFirstOrThrow();
    expect(slip).toMatchObject({ paidAmount: net, paidDate: "2026-10-08" });
    expect(told).toEqual([first.id, second.id]);

    // What Money posts from: the first is a part, the second completes it and carries the contributions.
    const part = await test.transact((ex, ctx) => getPayoutForExpense(ex, ctx, { staffPayoutId: first.id }));
    expect(part).toMatchObject({
      date: "2026-10-05",
      amount: 300_000,
      method: "CASH",
      kind: "WAGE",
      staffKind: "WORKER",
      payslip: { id: payslipId, payRunId, divisionMin: { HOUSING: 1440 }, completes: false, contributions: null },
    });
    const last = await test.transact((ex, ctx) => getPayoutForExpense(ex, ctx, { staffPayoutId: second.id }));
    expect(last?.payslip).toMatchObject({
      completes: true,
      contributions: { employee: 54_000, employer: 156_000, irg: 0 },
    });
    expect(
      await test.transact((ex, ctx) => getClosedPayroll(ex, ctx, { from: "2026-09-01", to: "2026-09-30" })),
    ).toEqual([
      expect.objectContaining({ staffId: id, gross: 600_000, net, employeeContributions: 54_000, paid: net }),
    ]);

    // Voided with its reason: owed again, and Money is told.
    await expect(test.transact((ex, ctx) => voidPayout(ex, ctx, { payoutId: second.id, reason: "" }))).rejects.toThrow(
      "Write the reason for voiding.",
    );
    await test.transact((ex, ctx) => voidPayout(ex, ctx, { payoutId: second.id, reason: "دفع مرتين" }));
    slip = await test.db.selectFrom("Payslip").selectAll().where("id", "=", payslipId).executeTakeFirstOrThrow();
    expect(slip).toMatchObject({ paidAmount: 300_000, paidDate: null });
    expect(told.at(-1)).toBe(`void ${second.id}`);
    await expect(
      test.transact((ex, ctx) => voidPayout(ex, ctx, { payoutId: second.id, reason: "دفع مرتين" })),
    ).rejects.toThrow("This payout is already voided.");
    const rows = await test.transact((ex, ctx) => listPayouts(ex, ctx, { staffId: id }));
    expect(rows.map((row) => [row.number, row.voided])).toEqual([
      [second.number, true],
      [first.number, false],
    ]);
    expect(() => test.raw.prepare(`DELETE FROM "StaffPayout" WHERE "id" = ?`).run(first.id)).toThrow(/NO_DELETE/);
  });

  it("refuses a wage without a closed payslip, a date still to come, and an amount of nothing", async () => {
    const id = await aWorker();
    await seat(id, "2026-09-01");
    const { payRunId } = await test.transact((ex, ctx) =>
      preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-09" }),
    );
    const draft = await test.db
      .selectFrom("Payslip")
      .select("id")
      .where("payRunId", "=", payRunId)
      .executeTakeFirstOrThrow();
    const pay = (over: Record<string, unknown>) =>
      test.transact((ex, ctx) =>
        recordPayout(ex, ctx, {
          staffId: id,
          date: "2026-10-05",
          amount: 100_000,
          kind: "ADVANCE",
          wageMethod: "CASH",
          ...over,
        }),
      );
    await expect(pay({ kind: "WAGE" })).rejects.toThrow("Choose the payslip this wage pays.");
    await expect(pay({ kind: "WAGE", payslipId: draft.id })).rejects.toThrow("A wage is paid on a closed pay run.");
    await expect(pay({ date: "2026-10-13" })).rejects.toThrow("The date cannot be after today.");
    await expect(pay({ amount: 0 })).rejects.toThrow("Enter an amount above zero.");
    await expect(pay({ kind: "OTHER" })).rejects.toThrow("Write what the amount is for.");
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact(
        (ex, ctx) =>
          recordPayout(ex, ctx, {
            staffId: id,
            date: "2026-10-05",
            amount: 100_000,
            kind: "ADVANCE",
            wageMethod: "CASH",
          }),
        reception,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("the ledger of advances and debts", () => {
  it("keeps every line with its balance, and undoes an advance by a line of its own", async () => {
    const id = await aWorker();
    const advance = await test.transact((ex, ctx) =>
      recordPayout(ex, ctx, { staffId: id, date: "2026-10-01", amount: 300_000, kind: "ADVANCE", wageMethod: "CASH" }),
    );
    await test.transact((ex, ctx) =>
      recordDebt(ex, ctx, {
        staffId: id,
        date: "2026-10-03",
        reason: "DAMAGE",
        amount: 120_000,
        note: "مكنسة كهربائية",
      }),
    );
    await test.transact((ex, ctx) =>
      recordDebt(ex, ctx, {
        staffId: id,
        date: "2026-10-06",
        reason: "REPAID_IN_CASH",
        amount: 20_000,
        note: "وصل 14",
      }),
    );
    // Money's line for equipment lost goes through the same door.
    await test.transact((ex, ctx) =>
      addDebtEntry(ex, ctx, { staffId: id, date: "2026-10-07", direction: "INCREASE", reason: "LOSS", amount: 50_000 }),
    );
    let ledger = await test.transact((ex, ctx) => getStaffLedger(ex, ctx, { staffId: id }));
    expect(ledger.balance).toBe(450_000);
    expect(ledger.lines.map((line) => [line.seq, line.reason, line.direction, line.balanceAfter])).toEqual([
      [4, "LOSS", "INCREASE", 450_000],
      [3, "REPAID_IN_CASH", "DECREASE", 400_000],
      [2, "DAMAGE", "INCREASE", 420_000],
      [1, "ADVANCE", "INCREASE", 300_000],
    ]);
    expect(await test.transact((ex, ctx) => listDebtors(ex, ctx))).toEqual([
      expect.objectContaining({ staffId: id, balance: 450_000, lastDate: "2026-10-07" }),
    ]);

    await expect(
      test.transact((ex, ctx) =>
        recordDebt(ex, ctx, { staffId: id, date: "2026-10-08", reason: "WRITTEN_OFF", amount: 450_001, note: "إعفاء" }),
      ),
    ).rejects.toThrow("This is more than the person owes.");
    await expect(
      test.transact((ex, ctx) =>
        recordDebt(ex, ctx, { staffId: id, date: "2026-10-08", reason: "DAMAGE", amount: 1000, note: " " }),
      ),
    ).rejects.toThrow("Write what the amount is for.");

    await test.transact((ex, ctx) => voidPayout(ex, ctx, { payoutId: advance.id, reason: "لم تستلم المبلغ" }));
    ledger = await test.transact((ex, ctx) => getStaffLedger(ex, ctx, { staffId: id }));
    expect(ledger.lines[0]).toMatchObject({ seq: 5, reason: "REVERSAL", direction: "DECREASE", balanceAfter: 150_000 });
    // A line is never changed or taken away.
    expect(() => test.raw.prepare(`UPDATE "StaffDebtEntry" SET "amount" = 1 WHERE "staffId" = ?`).run(id)).toThrow();
  });

  it("refuses to void an advance already taken back", async () => {
    const id = await aWorker();
    const advance = await test.transact((ex, ctx) =>
      recordPayout(ex, ctx, { staffId: id, date: "2026-10-01", amount: 300_000, kind: "ADVANCE", wageMethod: "CASH" }),
    );
    await test.transact((ex, ctx) =>
      recordDebt(ex, ctx, {
        staffId: id,
        date: "2026-10-06",
        reason: "REPAID_IN_CASH",
        amount: 100_000,
        note: "وصل 15",
      }),
    );
    await expect(
      test.transact((ex, ctx) => voidPayout(ex, ctx, { payoutId: advance.id, reason: "خطأ" })),
    ).rejects.toThrow("This advance has already been repaid: it can no longer be voided.");
  });
});
