import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyEmployeeValues } from "@/features/people/validators/employee";
import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { registerHandler } from "@/lib/events";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { recordCheck, recordEmployeeAbsence } from "./employee-attendance";
import { registerEmployee } from "./employees";
import {
  closePayRun,
  deletePayRun,
  getPayRun,
  getPayslip,
  listPayRuns,
  preparePayRun,
  refreshPayRun,
  updatePayslip,
  voidPayRun,
} from "./pay-runs";
import { debtBalanceOf, getClosedPayroll, getPaidMinutes, recordPayout, voidPayout } from "./payouts";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** A worker paid 250 DA an hour, declared to the CNAS. */
async function aWorker(over: Record<string, unknown> = {}) {
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
        ...over,
      }),
    )
  ).id;
}

async function seat(workerId: string, date: string, worked: number | null, status = "DONE") {
  const visit = await test.rows.insert("Visit", {
    visitDate: localDate(date),
    plannedStartTime: "08:00" as never,
    plannedDurationMin: 480 as never,
    status,
  });
  return test.rows.insert("VisitWorker", {
    visitId: visit.id,
    workerId,
    role: "CLEANER",
    seatStatus: "ASSIGNED",
    workedMin: worked as never,
    arrivedTime: (worked === null ? null : "08:00") as never,
    leftTime: (worked === null ? null : "16:00") as never,
  });
}

const september = () => test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-09" }));
const runOf = (payRunId: string) => test.transact((ex, ctx) => getPayRun(ex, ctx, { payRunId }));

describe("a month of pay for the workers", () => {
  it("drafts a payslip from the typed orders, and closes only once the IRG is typed", async () => {
    const id = await aWorker();
    for (const day of ["01", "02", "03"]) await seat(id, `2026-09-${day}`, 480);
    await seat(id, "2026-09-05", null, "CONFIRMED"); // an order not typed in: paid nothing, counted

    const { payRunId, payslips } = await september();
    expect(payslips).toBe(1);
    let run = await runOf(payRunId);
    expect(run).toMatchObject({ status: "DRAFT", number: null, month: "2026-09" });
    // 24 hours at 250 DA: 6,000 DA; CNAS 9%: 540 DA; the IRG scale is not in Settings.
    expect(run.payslips[0]).toMatchObject({
      staffId: id,
      payBasis: "HOURLY",
      daysWorked: 3000,
      visitsDone: 3,
      ordersNotTypedCount: 1,
      normalMin: 1440,
      grossAmount: 600_000,
      cnasAmount: 54_000,
      irgAmount: 0,
      employerCnasAmount: 156_000,
      missing: ["IRG"],
    });
    await expect(test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId }))).rejects.toThrow(
      "Type the IRG of every payslip first: its scale is not in Settings.",
    );

    const payslipId = run.payslips[0].id;
    await test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId, irg: 12_000 }));
    // What was typed is kept when the draft is computed again, and the payslip keeps its id.
    await seat(id, "2026-09-07", 240);
    await test.transact((ex, ctx) => refreshPayRun(ex, ctx, { payRunId }));
    run = await runOf(payRunId);
    expect(run.payslips[0]).toMatchObject({
      id: payslipId,
      grossAmount: 700_000,
      cnasAmount: 63_000,
      irgAmount: 12_000,
      netAmount: 625_000,
      missing: [],
      typed: { irg: 12_000 },
    });

    const closed = await test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId }));
    expect(closed.number).toMatch(/\d/);
    run = await runOf(payRunId);
    expect(run.status).toBe("CLOSED");
    expect(run.payslips[0].number).toMatch(/\d/);
    const slip = await test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId }));
    expect(slip.items.map((item) => [item.type, item.amount])).toEqual([
      ["BASE", 700_000],
      ["CNAS", -63_000],
      ["IRG", -12_000],
    ]);
    expect(slip.seats).toHaveLength(4);
    expect(slip.divisionMin).toEqual({ HOUSING: 1680 });

    // Closed: the services refuse, and so does the database.
    await expect(test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId, irg: 0 }))).rejects.toThrow(
      "A closed payslip can no longer be changed.",
    );
    await expect(test.transact((ex, ctx) => refreshPayRun(ex, ctx, { payRunId }))).rejects.toThrow(
      "Only a draft pay run can be computed again.",
    );
    await expect(test.transact((ex, ctx) => deletePayRun(ex, ctx, { payRunId }))).rejects.toThrow(
      "Only a draft pay run can be taken away; a closed one is voided.",
    );
    expect(() => test.raw.prepare(`UPDATE "Payslip" SET "grossAmount" = 1 WHERE "id" = ?`).run(payslipId)).toThrow(
      /FROZEN/,
    );
    expect(() => test.raw.prepare(`DELETE FROM "PayslipSeat" WHERE "payslipId" = ?`).run(payslipId)).toThrow(/FROZEN/);
    await expect(september()).rejects.toThrow("This month's pay run is already closed.");
  });

  it("pays an order typed after the month closed in the next run, as arrears", async () => {
    const id = await aWorker({ cnasDeclared: false, cnasNumber: "" });
    await seat(id, "2026-09-01", 480);
    const late = await seat(id, "2026-09-02", null, "CONFIRMED");
    const first = await september();
    await test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId: first.payRunId }));

    // The order of 2 September is typed in October.
    test.raw
      .prepare(
        `UPDATE "VisitWorker" SET "workedMin" = 480, "arrivedTime" = '08:00', "leftTime" = '16:00' WHERE "id" = ?`,
      )
      .run(late.id);
    await seat(id, "2026-10-05", 480);
    test.clock.advance({ days: 25 }); // 6 November
    const second = await test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-10" }));
    const run = await runOf(second.payRunId);
    expect(run.payslips[0]).toMatchObject({ grossAmount: 400_000, visitsDone: 2 });
    const slip = await test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId: run.payslips[0].id }));
    expect(slip.seats.map((each) => [each.visitDate, each.isArrears])).toEqual([
      ["2026-09-02", true],
      ["2026-10-05", false],
    ]);
    await test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId: second.payRunId }));
    // Each seat is paid once: minutes paid for September's visits are the two days.
    const paid = await test.transact((ex, ctx) => getPaidMinutes(ex, ctx, { from: "2026-09-01", to: "2026-09-30" }));
    expect(paid).toEqual({ [id]: 960 });
  });

  it("pays the overtime a late order adds to a week already closed (LAB-5)", async () => {
    const id = await aWorker({ cnasDeclared: false, cnasNumber: "" });
    // Saturday 19 to Wednesday 23 September: 40 hours; Thursday 24th typed only after September closed.
    for (const day of ["19", "20", "21", "22", "23"]) await seat(id, `2026-09-${day}`, 480);
    const late = await seat(id, "2026-09-24", null, "CONFIRMED");
    const first = await september();
    expect((await runOf(first.payRunId)).payslips[0]).toMatchObject({ overtimeMin: 0, grossAmount: 1_000_000 });
    await test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId: first.payRunId }));

    test.raw
      .prepare(
        `UPDATE "VisitWorker" SET "workedMin" = 480, "arrivedTime" = '08:00', "leftTime" = '16:00' WHERE "id" = ?`,
      )
      .run(late.id);
    test.clock.advance({ days: 25 });
    const second = await test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-10" }));
    // The late 8 hours at 250 DA, and the week's 8 hours past 40 at +50%: 2,000 + 1,000 DA.
    expect((await runOf(second.payRunId)).payslips[0]).toMatchObject({ overtimeMin: 480, grossAmount: 300_000 });
  });

  it("pays a done visit's seat with no typed times its planned minutes, flagged (LAB-14)", async () => {
    const id = await aWorker({ cnasDeclared: false, cnasNumber: "" });
    await seat(id, "2026-09-01", 480);
    await seat(id, "2026-09-02", null);
    const { payRunId } = await september();
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({
      grossAmount: 400_000,
      plannedSeats: 1,
      ordersNotTypedCount: 0,
    });
  });

  it("refuses a month still to come, a month not over at closing, and an earlier draft left open", async () => {
    const id = await aWorker({ cnasDeclared: false, cnasNumber: "" });
    await seat(id, "2026-09-01", 480);
    await seat(id, "2026-10-05", 480);
    await expect(
      test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-11" })),
    ).rejects.toThrow("A month still to come cannot be paid yet.");
    const draft = await september();
    await expect(
      test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-10" })),
    ).rejects.toThrow("An earlier pay run is still a draft: close it first.");
    // Preparing the same month again computes the draft again: no second run.
    const again = await september();
    expect(again.payRunId).toBe(draft.payRunId);
    await test.transact((ex, ctx) => deletePayRun(ex, ctx, { payRunId: draft.payRunId }));
    const october = await test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-10" }));
    await expect(test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId: october.payRunId }))).rejects.toThrow(
      "A month is closed once it is over.",
    );
    expect(await test.transact((ex, ctx) => listPayRuns(ex, ctx, {}))).toHaveLength(1);
  });

  it("takes an advance back on the payslip, and puts it back when the run is voided", async () => {
    const id = await aWorker({ cnasDeclared: false, cnasNumber: "" });
    for (const day of ["01", "02", "03"]) await seat(id, `2026-09-${day}`, 480);
    await test.transact((ex, ctx) =>
      recordPayout(ex, ctx, { staffId: id, date: "2026-09-20", amount: 200_000, kind: "ADVANCE", wageMethod: "CASH" }),
    );
    expect(await debtBalanceOf(test.db, id)).toBe(200_000);

    const { payRunId } = await september();
    let run = await runOf(payRunId);
    expect(run.payslips[0]).toMatchObject({ grossAmount: 600_000, advanceRepayment: 200_000, netAmount: 400_000 });
    // The office spreads the repayment: 500 DA this month.
    await test.transact((ex, ctx) =>
      updatePayslip(ex, ctx, { payslipId: run.payslips[0].id, advanceRepayment: 50_000 }),
    );
    run = await runOf(payRunId);
    expect(run.payslips[0]).toMatchObject({ advanceRepayment: 50_000, netAmount: 550_000 });

    const closed: string[] = [];
    registerHandler("money", "payrun.closed", async (_ex, _ctx, payload) => void closed.push(payload.payRunId));
    await test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId }));
    expect(closed).toEqual([payRunId]);
    expect(await debtBalanceOf(test.db, id)).toBe(150_000);

    // The wage is paid; the run cannot be voided before that payout is.
    const wage = await test.transact((ex, ctx) =>
      recordPayout(ex, ctx, {
        staffId: id,
        date: "2026-10-05",
        amount: 550_000,
        kind: "WAGE",
        wageMethod: "CASH",
        payslipId: run.payslips[0].id,
      }),
    );
    await expect(
      test.transact((ex, ctx) => voidPayRun(ex, ctx, { payRunId, reason: "خطأ في الساعات" })),
    ).rejects.toThrow("Void the wages paid on this run first.");
    await test.transact((ex, ctx) => voidPayout(ex, ctx, { payoutId: wage.id, reason: "خطأ في الساعات" }));
    await expect(test.transact((ex, ctx) => voidPayRun(ex, ctx, { payRunId, reason: " " }))).rejects.toThrow(
      "Write the reason for voiding.",
    );
    await test.transact((ex, ctx) => voidPayRun(ex, ctx, { payRunId, reason: "خطأ في الساعات" }));
    expect(await debtBalanceOf(test.db, id)).toBe(200_000);
    expect(
      await test.transact((ex, ctx) => getClosedPayroll(ex, ctx, { from: "2026-09-01", to: "2026-09-30" })),
    ).toEqual([]);

    // Its seats are free again: the month is run anew.
    const anew = await september();
    expect(anew.payRunId).not.toBe(payRunId);
    expect((await runOf(anew.payRunId)).payslips[0]).toMatchObject({ grossAmount: 600_000, visitsDone: 3 });
  });

  it("leaves an advance given after the month ended to the next month's payslip", async () => {
    const id = await aWorker({ cnasDeclared: false, cnasNumber: "" });
    await seat(id, "2026-09-01", 480);
    await test.transact((ex, ctx) =>
      recordPayout(ex, ctx, { staffId: id, date: "2026-10-08", amount: 100_000, kind: "ADVANCE", wageMethod: "CASH" }),
    );
    const { payRunId } = await september();
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ advanceRepayment: 0, netAmount: 200_000 });
    // The office may still take it back at once, by typing it.
    const payslipId = (await runOf(payRunId)).payslips[0].id;
    await test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId, advanceRepayment: 100_000 }));
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ advanceRepayment: 100_000, netAmount: 100_000 });
  });

  it("does not close a wage per task until its overtime is priced (LAB-1)", async () => {
    const id = await aWorker({ payBasis: "PER_TASK", payRate: "1500", cnasDeclared: false, cnasNumber: "" });
    // Saturday 5 to Thursday 10 September: six tasks of 8 hours, 48 hours, 8 past the legal week.
    for (const day of ["05", "06", "07", "08", "09", "10"]) await seat(id, `2026-09-${day}`, 480);
    const { payRunId } = await september();
    let run = await runOf(payRunId);
    expect(run.payslips[0]).toMatchObject({ grossAmount: 900_000, overtimeMin: 480, missing: ["OVERTIME"] });
    await expect(test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId }))).rejects.toThrow(
      "Price the overtime and the rest-day work of every payslip paid per task first.",
    );
    await test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId: run.payslips[0].id, overtime: 75_000 }));
    run = await runOf(payRunId);
    expect(run.payslips[0]).toMatchObject({ grossAmount: 975_000, missing: [] });
    await test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId }));
    const slip = await test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId: run.payslips[0].id }));
    expect(slip.items.map((item) => [item.type, item.amount])).toEqual([
      ["BASE", 900_000],
      ["OVERTIME_50", 75_000],
    ]);
  });

  it("is the pay holders' to prepare, and nobody else's to read", async () => {
    const id = await aWorker({ cnasDeclared: false, cnasNumber: "" });
    await seat(id, "2026-09-01", 480);
    const reception = await test.sessionFor("RECEPTION_SALES");
    const operations = await test.sessionFor("OPERATIONS");
    for (const session of [reception, operations]) {
      await expect(
        test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-09" }), session),
      ).rejects.toThrow("You do not have permission to do this.");
      await expect(test.transact((ex, ctx) => listPayRuns(ex, ctx, {}), session)).rejects.toThrow(
        "You do not have permission to do this.",
      );
    }
    const accountant = await test.sessionFor("ACCOUNTANT");
    const { payRunId } = await test.transact(
      (ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-09" }),
      accountant,
    );
    const hr = await test.sessionFor("HR_OFFICER");
    expect((await test.transact((ex, ctx) => getPayRun(ex, ctx, { payRunId }), hr)).payslips).toHaveLength(1);
  });
});

describe("a month of pay for the centre's employees", () => {
  it("pays the month, takes off unpaid absence, and adds the overtime of the weeks that end in it", async () => {
    const { id } = await test.transact((ex, ctx) =>
      registerEmployee(ex, ctx, {
        ...emptyEmployeeValues("2026-08-01"),
        sex: "MALE",
        lastName: "بن عمر",
        firstName: "ياسين",
        birthDate: "1990-03-04",
        phone: "0661 20 31 42",
        jobPosition: "ACCOUNTANT",
        startDate: "2026-08-01",
        payBasis: "MONTHLY",
        payRate: "41600",
        cnasDeclared: true,
        cnasNumber: "900304001277",
      }),
    );
    // The week of Saturday 5 to Friday 11 September: five days of 9 hours, 45 hours.
    for (const day of ["05", "06", "07", "08", "09"]) {
      const date = `2026-09-${day}`;
      await test.transact((ex, ctx) => recordCheck(ex, ctx, { staffId: id, type: "CHECK_IN", date, time: "08:00" }));
      await test.transact((ex, ctx) => recordCheck(ex, ctx, { staffId: id, type: "CHECK_OUT", date, time: "17:00" }));
    }
    await test.transact((ex, ctx) =>
      recordEmployeeAbsence(ex, ctx, {
        staffId: id,
        date: "2026-09-15",
        type: "FULL_DAY",
        justified: false,
        paid: false,
      }),
    );
    const { payRunId } = await test.transact((ex, ctx) =>
      preparePayRun(ex, ctx, { staffKind: "EMPLOYEE", month: "2026-09" }),
    );
    const run = await runOf(payRunId);
    const slip = await test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId: run.payslips[0].id }));
    // 41,600 DA a month is 240 DA an hour: a day off unpaid 1,920 DA, 5 hours of overtime at 360 DA.
    expect(slip.items.map((item) => [item.type, item.amount])).toEqual([
      ["BASE", 4_160_000],
      ["ABSENCE", -192_000],
      ["OVERTIME_50", 180_000],
      ["CNAS", -373_320],
    ]);
    expect(slip).toMatchObject({
      positionOrRole: "المحاسب",
      overtimeMin: 300,
      grossAmount: 4_148_000,
      leaveAccruedDays: 2500,
      divisionMin: { COMMON: 2700 },
    });
  });
});
