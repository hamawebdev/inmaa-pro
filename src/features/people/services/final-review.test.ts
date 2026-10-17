import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveBranch } from "@/features/core/services/branches";
import { emptyWorkerValues, SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import { payslipColumns } from "@/features/people/sheets/payslip-columns";
import { emptyEmployeeValues } from "@/features/people/validators/employee";
import type { WorkerFormValues } from "@/features/people/validators/worker";
import type { Session } from "@/lib/service/context";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { staffCardsForPrint } from "./cards";
import { cancelEmployeeLeave, recordCheck, recordEmployeeAbsence, requestEmployeeLeave } from "./employee-attendance";
import { readmitEmployee, recordEmployeeLeaving, registerEmployee, updateEmployee } from "./employees";
import { decideHiring } from "./hiring";
import { addPayItem } from "./pay-items";
import { closePayRun, getPayRun, getPayslip, preparePayRun, refreshPayRun, updatePayslip } from "./pay-runs";
import { addDebtEntry, recordPayout } from "./payouts";
import { answerDecision, requestDecision } from "./sanction-decisions";
import { setSanction } from "./sanctions";
import { readmitWorker, recordWorkerLeaving, registerWorker, updateWorker, workerIdentity } from "./workers";

/**
 * The findings of the final review in People's area (PEO-01 to PEO-13), each
 * proved by the scenario that showed it.
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

let phones = 0;
/** A worker paid by the month, 30,000 DA, accepted on 1 August, not declared (no IRG to type). */
function workerValues(over: Partial<WorkerFormValues> = {}): WorkerFormValues {
  phones += 1;
  return {
    ...emptyWorkerValues("2026-08-01"),
    sex: "FEMALE",
    lastName: "قاسمي",
    firstName: `نوال ${phones}`,
    birthDate: "1996-01-12",
    phone: `0555 31 42 ${String(phones).padStart(2, "0")}`,
    hiringDecision: "ACCEPTED",
    issuedDate: "2026-08-01",
    payBasis: "MONTHLY",
    payRate: "30000",
    payPeriod: "MONTHLY",
    cnasDeclared: false,
    ...over,
  };
}

const aWorker = async (over: Partial<WorkerFormValues> = {}, session?: Session) =>
  (await test.transact((ex, ctx) => registerWorker(ex, ctx, workerValues(over)), session)).id;

async function anEmployee(over: Record<string, unknown> = {}, session?: Session) {
  phones += 1;
  return (
    await test.transact(
      (ex, ctx) =>
        registerEmployee(ex, ctx, {
          ...emptyEmployeeValues("2026-08-01"),
          sex: "MALE",
          lastName: "بن عمر",
          firstName: `ياسين ${phones}`,
          birthDate: "1990-03-04",
          phone: `0661 20 31 ${String(phones).padStart(2, "0")}`,
          jobPosition: "ACCOUNTANT",
          startDate: "2026-08-01",
          payBasis: "MONTHLY",
          payRate: "41600",
          cnasDeclared: false,
          ...over,
        }),
      session,
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

const prepare = (staffKind: "WORKER" | "EMPLOYEE", month: string, session?: Session) =>
  test.transact((ex, ctx) => preparePayRun(ex, ctx, { staffKind, month }), session);
const runOf = (payRunId: string) => test.transact((ex, ctx) => getPayRun(ex, ctx, { payRunId }));
const close = (payRunId: string) => test.transact((ex, ctx) => closePayRun(ex, ctx, { payRunId }));
const slipOf = (payslipId: string) => test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId }));
const at = (instant: string) => test.clock.set(instant);

describe("PEO-01: a pay run pays people in post, for the days in post", () => {
  it("PEO-01: pays neither a candidate never decided on nor a refused worker, and pays the accepted one", async () => {
    const candidate = await aWorker({ hiringDecision: undefined, registrationDate: "2026-09-01" });
    const refused = await aWorker({
      hiringDecision: "REFUSED_FINAL",
      registrationDate: "2026-09-01",
      issuedDate: "2026-09-01",
    });
    const accepted = await aWorker();
    const { payRunId } = await prepare("WORKER", "2026-09");
    const run = await runOf(payRunId);
    expect(run.payslips.map((slip) => slip.staffId)).toEqual([accepted]);
    expect(run.payslips[0].grossAmount).toBe(3_000_000);
    expect([candidate, refused]).not.toContain(run.payslips[0].staffId);
  });

  it("PEO-01: pays a worker refused on the 16th her fifteen days in post, and nothing the month after", async () => {
    const id = await aWorker();
    await test.transact((ex, ctx) =>
      decideHiring(ex, ctx, { staffId: id, decision: "REFUSED_FINAL", date: "2026-09-16" }),
    );
    const september = await prepare("WORKER", "2026-09");
    expect((await runOf(september.payRunId)).payslips[0]).toMatchObject({ staffId: id, grossAmount: 1_500_000 });
    await close(september.payRunId);
    const october = await prepare("WORKER", "2026-10");
    expect(october.payslips).toBe(0);
  });

  it("PEO-01: pays a worker readmitted on the 26th from the day she is in post again", async () => {
    const id = await aWorker();
    await test.transact((ex, ctx) =>
      recordWorkerLeaving(ex, ctx, { id, leftDate: "2026-08-20", reason: "ظروف عائلية" }),
    );
    at("2026-09-26T08:00:00.000Z");
    await test.transact((ex, ctx) => readmitWorker(ex, ctx, { id }));
    // Readmitted, she is a candidate again: the administration takes her back the same day.
    await test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: id, decision: "ACCEPTED" }));
    at("2026-10-12T08:00:00.000Z");
    const { payRunId } = await prepare("WORKER", "2026-09");
    // Five days of thirty: 26 to 30 September.
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ staffId: id, grossAmount: 500_000 });
  });

  it("PEO-01: pays an employee readmitted on the 26th from his readmission, not the whole month", async () => {
    const id = await anEmployee();
    await test.transact((ex, ctx) => recordEmployeeLeaving(ex, ctx, { id, leftDate: "2026-09-01", reason: "استقالة" }));
    at("2026-09-26T08:00:00.000Z");
    await test.transact((ex, ctx) => readmitEmployee(ex, ctx, { id }));
    at("2026-10-12T08:00:00.000Z");
    const { payRunId } = await prepare("EMPLOYEE", "2026-09");
    // 41,600 DA × 5 / 30.
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ staffId: id, grossAmount: 693_333 });
  });

  it("PEO-01: takes out a worker whose pay terms were cleared on her file", async () => {
    const values = workerValues({ payBasis: "HOURLY", payRate: "250" });
    const { id } = await test.transact((ex, ctx) => registerWorker(ex, ctx, values));
    await seat(id, "2026-09-01", 480);
    await test.transact((ex, ctx) =>
      updateWorker(ex, ctx, { id, values: { ...values, payBasis: undefined, payRate: "", payPeriod: undefined } }),
    );
    expect((await prepare("WORKER", "2026-09")).payslips).toBe(0);
  });
});

describe("PEO-02: each branch pays its own people", () => {
  it("PEO-02: a second branch's run pays only that branch's employees, and its months are its own", async () => {
    const { id: branchId } = await test.transact((ex, ctx) =>
      saveBranch(ex, ctx, { code: "AMB", name: "فرع عين مليلة", address: "", phone: "", city: "عين مليلة" }),
    );
    const other: Session = { ...test.manager, branchId };
    const main = await anEmployee();
    const theirs = await anEmployee({}, other);

    const mainRun = await prepare("EMPLOYEE", "2026-09");
    expect((await runOf(mainRun.payRunId)).payslips.map((slip) => slip.staffId)).toEqual([main]);
    // The main branch's September is still a draft: the other branch's October is not held up by it.
    await expect(prepare("EMPLOYEE", "2026-10", other)).resolves.toMatchObject({ payslips: 1 });
    const theirRun = await prepare("EMPLOYEE", "2026-09", other);
    expect(theirRun.payRunId).not.toBe(mainRun.payRunId);
    expect((await runOf(theirRun.payRunId)).payslips.map((slip) => slip.staffId)).toEqual([theirs]);
  });
});

describe("PEO-03: what a closed run paid stays what it paid, and nothing is lost", () => {
  it("PEO-03: computes the draft again at closing, and refuses to close what changed since it was looked at", async () => {
    const id = await anEmployee();
    const { payRunId } = await prepare("EMPLOYEE", "2026-09");
    expect((await runOf(payRunId)).payslips[0].grossAmount).toBe(4_160_000);
    await test.transact((ex, ctx) =>
      recordEmployeeAbsence(ex, ctx, {
        staffId: id,
        date: "2026-09-29",
        type: "FULL_DAY",
        justified: false,
        paid: false,
      }),
    );
    await expect(close(payRunId)).rejects.toThrow(
      "The hours or the pay changed since this run was computed: compute it again and check it.",
    );
    await test.transact((ex, ctx) => refreshPayRun(ex, ctx, { payRunId }));
    await close(payRunId);
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ grossAmount: 3_968_000, netAmount: 3_968_000 });
  });

  it("PEO-03: refuses a check, an absence or a leave typed for a day a closed run paid, payslip or not", async () => {
    const monthly = await anEmployee();
    const hourly = await anEmployee({ payBasis: "HOURLY", payRate: "240" });
    // A leave across the month's end, granted before September closed.
    const { ids } = await test.transact((ex, ctx) =>
      requestEmployeeLeave(ex, ctx, {
        staffId: monthly,
        type: "ANNUAL",
        startDate: "2026-09-28",
        endDate: "2026-10-03",
        approved: true,
      }),
    );
    const { payRunId } = await prepare("EMPLOYEE", "2026-09");
    // The hourly employee typed no time in September: she has no payslip in the run.
    expect((await runOf(payRunId)).payslips.map((slip) => slip.staffId)).toEqual([monthly]);
    await close(payRunId);

    const refusal = "This day is in a closed pay run: it can no longer be corrected.";
    await expect(
      test.transact((ex, ctx) =>
        recordCheck(ex, ctx, { staffId: hourly, type: "CHECK_IN", date: "2026-09-30", time: "08:00" }),
      ),
    ).rejects.toThrow(refusal);
    await expect(
      test.transact((ex, ctx) =>
        recordEmployeeAbsence(ex, ctx, {
          staffId: monthly,
          date: "2026-09-29",
          type: "FULL_DAY",
          justified: false,
          paid: false,
        }),
      ),
    ).rejects.toThrow(refusal);
    await expect(
      test.transact((ex, ctx) =>
        requestEmployeeLeave(ex, ctx, {
          staffId: hourly,
          type: "UNPAID",
          startDate: "2026-09-30",
          endDate: "2026-10-02",
        }),
      ),
    ).rejects.toThrow(refusal);
    // October is open.
    await test.transact((ex, ctx) =>
      recordCheck(ex, ctx, { staffId: hourly, type: "CHECK_IN", date: "2026-10-01", time: "08:00" }),
    );

    // Cancelling the leave cancels its October part; its September part stays as it was paid.
    await test.transact((ex, ctx) => cancelEmployeeLeave(ex, ctx, { leaveId: ids[0], reason: "عاد إلى العمل" }));
    const parts = await test.db
      .selectFrom("EmployeeLeave")
      .select(["startDate", "status"])
      .where("id", "in", ids)
      .orderBy("startDate")
      .execute();
    expect(parts).toEqual([
      { startDate: "2026-09-28", status: "APPROVED" },
      { startDate: "2026-10-01", status: "CANCELLED" },
    ]);
  });
});

describe("PEO-04: a late seat on a day already paid is not another day", () => {
  it("PEO-04: a daily wage pays a late second seat only what it adds past the standard day", async () => {
    const id = await aWorker({ payBasis: "DAILY", payRate: "1500" });
    // Two visits on 15 September; only the morning one is typed before September closes.
    await seat(id, "2026-09-15", 240);
    const late = await seat(id, "2026-09-15", null, "CONFIRMED");
    const september = await prepare("WORKER", "2026-09");
    expect((await runOf(september.payRunId)).payslips[0]).toMatchObject({ daysWorked: 1000, grossAmount: 150_000 });
    await close(september.payRunId);

    // The afternoon is typed in October: six hours, the day is ten.
    test.raw
      .prepare(
        `UPDATE "VisitWorker" SET "workedMin" = 360, "arrivedTime" = '12:00', "leftTime" = '18:00' WHERE "id" = ?`,
      )
      .run(late.id);
    test.clock.advance({ days: 25 });
    const october = await prepare("WORKER", "2026-10");
    // No second daily wage: the two hours past the eight-hour day, at the hourly value and +50%.
    expect((await runOf(october.payRunId)).payslips[0]).toMatchObject({ daysWorked: 0, grossAmount: 56_250 });
  });
});

describe("PEO-05: a refused worker is no longer available", () => {
  it("PEO-05: refused at the end of her trial, she gives up her seats, as one who leaves", async () => {
    const onTrial = await aWorker({ hiringDecision: "ACCEPTED_ON_TRIAL", issuedDate: "2026-09-01" });
    const values = workerValues({ hiringDecision: "ACCEPTED_ON_TRIAL", issuedDate: "2026-09-01" });
    const { id: fromFile } = await test.transact((ex, ctx) => registerWorker(ex, ctx, values));
    const first = await seat(onTrial, "2026-10-20", null, "CONFIRMED");
    const second = await seat(fromFile, "2026-10-21", null, "CONFIRMED");

    await test.transact((ex, ctx) =>
      decideHiring(ex, ctx, { staffId: onTrial, decision: "REFUSED_FINAL", note: "لم تجتز فترة التجربة" }),
    );
    // «قرار الإدارة» changed on her file does the same.
    await test.transact((ex, ctx) =>
      updateWorker(ex, ctx, { id: fromFile, values: { ...values, hiringDecision: "REFUSED_FINAL" } }),
    );
    const seats = await test.db
      .selectFrom("VisitWorker")
      .select(["id", "seatStatus"])
      .where("id", "in", [first.id, second.id])
      .execute();
    expect(seats.map((each) => each.seatStatus)).toEqual(["REMOVED", "REMOVED"]);
  });
});

describe("PEO-06: the manager's yes is about the identity it named", () => {
  it("PEO-06: a yes for her sister registers neither the person under sanction nor anybody else", async () => {
    const { id: samira } = await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, { ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123" }),
    );
    const { sanctionId } = await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: samira,
        state: "SUSPENDED",
        reason: "غياب متكرر",
        startDate: "2026-10-01",
      }),
    );
    // Her sister gives the family's phone: the HR officer asks, the manager says yes.
    const sister: WorkerFormValues = {
      ...SAMPLE_WORKER_VALUES,
      lastName: "بن سعيد",
      firstName: "سامية",
      fullNameLatin: "",
      birthDate: "1997-06-02",
      nationalIdNumber: "",
      hiringDecision: undefined,
    };
    const hr = await test.sessionFor("HR_OFFICER");
    const { decisionId } = await test.transact(
      (ex, ctx) =>
        requestDecision(ex, ctx, {
          context: "WORKER_REGISTRATION",
          subjectKind: "WORKER",
          identity: workerIdentity(sister),
          sanctionId,
        }),
      hr,
    );
    await test.transact((ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: true, reason: "أختها، ليست هي" }));

    const blocked = "This person is suspended or penalised. The manager must allow the registration first.";
    // The person under sanction herself, with that yes.
    const herself: WorkerFormValues = { ...SAMPLE_WORKER_VALUES, nationalIdNumber: "", hiringDecision: undefined };
    await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, { ...herself, decisionId }), hr)).rejects.toThrow(
      blocked,
    );
    // The sister with another date of birth than the one the manager was asked about.
    await expect(
      test.transact((ex, ctx) => registerWorker(ex, ctx, { ...sister, birthDate: "1998-02-02", decisionId }), hr),
    ).rejects.toThrow(blocked);
    // The sister as asked about: allowed, once.
    await expect(
      test.transact((ex, ctx) => registerWorker(ex, ctx, { ...sister, decisionId }), hr),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });
});

describe("PEO-07: the printed payslip adds up", () => {
  it("PEO-07: with an unpaid absence, what is earned less what is taken off is the net", async () => {
    const id = await anEmployee({ cnasDeclared: true, cnasNumber: "900304001277" });
    await test.transact((ex, ctx) =>
      recordEmployeeAbsence(ex, ctx, {
        staffId: id,
        date: "2026-09-15",
        type: "FULL_DAY",
        justified: false,
        paid: false,
      }),
    );
    const { payRunId } = await prepare("EMPLOYEE", "2026-09");
    const slip = await slipOf((await runOf(payRunId)).payslips[0].id);
    const columns = payslipColumns(slip.items);
    expect(columns.earned).toBe(slip.grossAmount);
    expect(columns.earned).toBe(3_968_000);
    expect(columns.earned - columns.takenOff).toBe(slip.netAmount);
  });
});

describe("PEO-08: pay terms take effect on a day, and a payslip's base can be corrected", () => {
  it("PEO-08: a rate corrected from the first of the month reaches that month's draft; one from today does not", async () => {
    const values = workerValues({ registrationDate: "2026-09-01", issuedDate: "2026-09-01", payRate: "3000" });
    const { id } = await test.transact((ex, ctx) => registerWorker(ex, ctx, values));
    const { payRunId } = await prepare("WORKER", "2026-09");
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ payRate: 300_000, grossAmount: 300_000 });

    // Changed with no date: from today, so September keeps its rate.
    test.clock.advance({ minutes: 5 });
    await test.transact((ex, ctx) => updateWorker(ex, ctx, { id, values: { ...values, payRate: "29000" } }));
    await test.transact((ex, ctx) => refreshPayRun(ex, ctx, { payRunId }));
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ payRate: 300_000 });

    // Corrected from 1 September: the draft reads it, and the file and October agree with it.
    test.clock.advance({ minutes: 5 });
    await test.transact((ex, ctx) =>
      updateWorker(ex, ctx, { id, values: { ...values, payRate: "30000" }, payTermsFrom: "2026-09-01" }),
    );
    await test.transact((ex, ctx) => refreshPayRun(ex, ctx, { payRunId }));
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ payRate: 3_000_000, grossAmount: 3_000_000 });
  });

  it("PEO-08: refuses new terms dated in a month whose pay is closed, or before the start", async () => {
    const values = workerValues();
    const { id } = await test.transact((ex, ctx) => registerWorker(ex, ctx, values));
    await close((await prepare("WORKER", "2026-09")).payRunId);
    await expect(
      test.transact((ex, ctx) =>
        updateWorker(ex, ctx, { id, values: { ...values, payRate: "32000" }, payTermsFrom: "2026-09-15" }),
      ),
    ).rejects.toThrow("New pay terms cannot take effect in a month whose pay is closed.");
    await expect(
      test.transact((ex, ctx) =>
        updateWorker(ex, ctx, { id, values: { ...values, payRate: "32000" }, payTermsFrom: "2026-07-01" }),
      ),
    ).rejects.toThrow("New pay terms cannot take effect before the person started.");
    const employee = await anEmployee();
    await expect(
      test.transact((ex, ctx) =>
        updateEmployee(ex, ctx, {
          id: employee,
          values: {
            ...emptyEmployeeValues("2026-08-01"),
            sex: "MALE",
            lastName: "بن عمر",
            firstName: `ياسين ${phones}`,
            birthDate: "1990-03-04",
            phone: `0661 20 31 ${String(phones).padStart(2, "0")}`,
            jobPosition: "ACCOUNTANT",
            startDate: "2026-08-01",
            payBasis: "MONTHLY",
            payRate: "45000",
            cnasDeclared: false,
          },
          payTermsFrom: "2026-07-31",
        }),
      ),
    ).rejects.toThrow("New pay terms cannot take effect before the person started.");
  });

  it("PEO-08: a payslip's base is corrected, up or down, with the reason, never below nothing", async () => {
    const id = await aWorker();
    const { payRunId } = await prepare("WORKER", "2026-09");
    const payslipId = (await runOf(payRunId)).payslips[0].id;
    await expect(
      test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId, baseCorrection: 500_000 })),
    ).rejects.toThrow("Write the reason for correcting the base pay.");
    await test.transact((ex, ctx) =>
      updatePayslip(ex, ctx, { payslipId, baseCorrection: 500_000, baseCorrectionReason: "زيادة ابتداء من سبتمبر" }),
    );
    let slip = await slipOf(payslipId);
    expect(slip).toMatchObject({ staffId: id, grossAmount: 3_500_000, netAmount: 3_500_000 });
    expect(slip.items.map((item) => [item.type, item.label, item.amount])).toContainEqual([
      "OTHER",
      "تصحيح الأجر الأساسي: زيادة ابتداء من سبتمبر",
      500_000,
    ]);
    // Kept through a refresh; downwards too, never past the base.
    await test.transact((ex, ctx) => refreshPayRun(ex, ctx, { payRunId }));
    expect((await slipOf(payslipId)).grossAmount).toBe(3_500_000);
    await test.transact((ex, ctx) =>
      updatePayslip(ex, ctx, { payslipId, baseCorrection: -1_000_000, baseCorrectionReason: "خطأ في الأجر" }),
    );
    expect((await slipOf(payslipId)).grossAmount).toBe(2_000_000);
    await expect(
      test.transact((ex, ctx) =>
        updatePayslip(ex, ctx, { payslipId, baseCorrection: -3_500_000, baseCorrectionReason: "خطأ" }),
      ),
    ).rejects.toThrow("A correction cannot take off more than the base pay.");
    // Taken off again: back to the computed base.
    await test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId, baseCorrection: null }));
    slip = await slipOf(payslipId);
    expect(slip.grossAmount).toBe(3_000_000);
    expect(slip.typed).toEqual({});
  });
});

describe("PEO-09: a short month is not blocked by its recurring deductions", () => {
  it("PEO-09: the payslip takes the part of the recurring deductions the office types", async () => {
    const id = await aWorker({ payBasis: "HOURLY", payRate: "250" });
    await seat(id, "2026-09-01", 240);
    await test.transact((ex, ctx) =>
      addPayItem(ex, ctx, {
        staffId: id,
        type: "DEDUCTION",
        label: "تسديد قرض",
        amount: 300_000,
        fromDate: "2026-09-01",
        contributable: false,
        taxable: false,
      }),
    );
    const { payRunId } = await prepare("WORKER", "2026-09");
    const payslipId = (await runOf(payRunId)).payslips[0].id;
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ grossAmount: 100_000, netAmount: -200_000 });
    await expect(close(payRunId)).rejects.toThrow("A payslip takes off more than it pays: correct it first.");
    await test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId, recurringDeductions: 100_000 }));
    expect((await runOf(payRunId)).payslips[0]).toMatchObject({ otherDeductions: 100_000, netAmount: 0 });
    await close(payRunId);
  });
});

describe("PEO-10 and PEO-12: a refused worker comes back only by readmission", () => {
  it("PEO-10: «قرار الإدارة» does not take a refused worker back; readmission does", async () => {
    const values = workerValues({ hiringDecision: "REFUSED_FINAL", issuedDate: "2026-09-01" });
    const { id } = await test.transact((ex, ctx) => registerWorker(ex, ctx, values));
    const refusal = "This worker was refused: readmit her first.";
    await expect(
      test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: id, decision: "ACCEPTED" })),
    ).rejects.toThrow(refusal);
    await expect(
      test.transact((ex, ctx) => updateWorker(ex, ctx, { id, values: { ...values, hiringDecision: "ACCEPTED" } })),
    ).rejects.toThrow(refusal);
    await test.transact((ex, ctx) => readmitWorker(ex, ctx, { id }));
    await test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: id, decision: "ACCEPTED" }));
  });

  it("PEO-12: prints an ID card only for someone in post", async () => {
    const candidate = await aWorker({ hiringDecision: undefined });
    const refused = await aWorker({ hiringDecision: "REFUSED_FINAL" });
    const onTrial = await aWorker({ hiringDecision: "ACCEPTED_ON_TRIAL" });
    for (const id of [candidate, refused]) {
      await expect(test.transact((ex, ctx) => staffCardsForPrint(ex, ctx, { ids: [id] }))).rejects.toThrow(
        "This person is not in post: no card is printed.",
      );
    }
    const cards = await test.transact((ex, ctx) => staffCardsForPrint(ex, ctx, { ids: [onTrial] }));
    expect(cards.cards).toHaveLength(1);
  });
});

describe("PEO-13: a debt taken back on a payslip is printed as what it is", () => {
  it("PEO-13: an advance, a violation's deduction and a damage are three lines, in the order owed", async () => {
    const id = await aWorker();
    await test.transact((ex, ctx) =>
      recordPayout(ex, ctx, { staffId: id, date: "2026-09-05", amount: 200_000, kind: "ADVANCE", wageMethod: "CASH" }),
    );
    const violation = await test.rows.insert("Violation", { staffId: id, number: "4/2026" });
    await test.transact(async (ex, ctx) => {
      await addDebtEntry(ex, ctx, {
        staffId: id,
        date: "2026-09-10",
        direction: "INCREASE",
        reason: "OTHER",
        amount: 150_000,
        violationId: violation.id,
        note: "4/2026",
      });
      await addDebtEntry(ex, ctx, {
        staffId: id,
        date: "2026-09-12",
        direction: "INCREASE",
        reason: "DAMAGE",
        amount: 50_000,
        note: "كسر مكنسة كهربائية",
      });
    });
    const { payRunId } = await prepare("WORKER", "2026-09");
    const slip = await slipOf((await runOf(payRunId)).payslips[0].id);
    expect(slip.advanceRepayment).toBe(400_000);
    expect(
      slip.items.filter((item) => item.type === "ADVANCE_REPAYMENT").map((item) => [item.label, item.amount]),
    ).toEqual([
      ["تسديد التسبيقات", -200_000],
      ["اقتطاع: مخالفة رقم 4/2026", -150_000],
      ["تعويض ضرر", -50_000],
    ]);
    // A part taken back: the oldest first.
    await test.transact((ex, ctx) => updatePayslip(ex, ctx, { payslipId: slip.id, advanceRepayment: 250_000 }));
    const part = await slipOf(slip.id);
    expect(
      part.items.filter((item) => item.type === "ADVANCE_REPAYMENT").map((item) => [item.label, item.amount]),
    ).toEqual([
      ["تسديد التسبيقات", -200_000],
      ["اقتطاع: مخالفة رقم 4/2026", -50_000],
    ]);
  });
});
