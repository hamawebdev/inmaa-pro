import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listEmployeeAttendance } from "./services/employee-attendance";
import { listEmployees } from "./services/employees";
import { getPayRun, getPayslip } from "./services/pay-runs";
import { listCandidates } from "./services/hiring";
import { listDebtors } from "./services/payouts";
import { listViolations } from "./services/violations";
import { listSanctions } from "./services/sanctions";
import { listWorkers, workerFormForPrint } from "./services/worker-reads";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase({ demo: ["people"] });
});
afterEach(() => test.close());

it("makes eight workers of both sexes in two zones and the three roles, one suspended, and two employees", async () => {
  const names = test.demo.people;
  const workers = await test.transact((ex, ctx) => listWorkers(ex, ctx));
  expect(workers).toHaveLength(8);
  expect(new Set(workers.map((worker) => worker.sex))).toEqual(new Set(["MALE", "FEMALE"]));
  expect(new Set(workers.map((worker) => worker.zoneName))).toEqual(new Set(["أم البواقي", "عين البيضاء"]));
  expect(new Set(workers.map((worker) => worker.role))).toEqual(new Set(["CLEANER", "SENIOR_WORKER", "TEAM_LEADER"]));
  expect(new Set(workers.map((worker) => worker.status))).toEqual(new Set(["ACCEPTED", "ON_TRIAL", "CANDIDATE"]));
  // Numbered in the order they were written, with the letter of each.
  expect(workers.map((worker) => worker.number).reverse()).toEqual([
    "1/F",
    "2/F",
    "3/F",
    "4/F",
    "5/H",
    "6/H",
    "7/F",
    "8/F",
  ]);

  const suspended = workers.filter((worker) => worker.sanction !== null);
  expect(suspended.map((worker) => [worker.id, worker.sanction?.state, worker.sanction?.since])).toEqual([
    [names.workerSuspended, "SUSPENDED", "2026-10-05"],
  ]);
  const inForce = await test.transact((ex, ctx) => listSanctions(ex, ctx, { inForceOnly: true }));
  expect(inForce.map((sanction) => sanction.id)).toEqual([names.suspension]);
  // One medical certificate about to expire, one expired.
  expect(
    workers
      .filter((worker) => worker.documentsToRenew > 0)
      .map((worker) => worker.id)
      .sort(),
  ).toEqual([names.workerSenior, names.workerDaily].sort());

  const employees = await test.transact((ex, ctx) => listEmployees(ex, ctx));
  expect(employees.map((employee) => [employee.id, employee.jobPosition])).toEqual([
    [names.employeeSupervisor, "SUPERVISOR"],
    [names.employeeHr, "HR_OFFICER"],
  ]);
});

it("prints his form from the stored sample worker", async () => {
  const printed = await test.transact((ex, ctx) =>
    workerFormForPrint(ex, ctx, { id: test.demo.people.workerSamira, reason: "ملف التوظيف" }),
  );
  expect(printed.number).toBe("1/F");
  expect(printed.data).toMatchObject({
    regNumber: "1",
    regSuffix: "F",
    lastName: "بوزيد",
    firstName: "سميرة",
    residenceCommune: "أم البواقي",
    healthConditions: ["OTHER"],
    hiringTotal: 78,
    hiringDecision: "ACCEPTED",
  });
});

it("has September's pay closed for the employees and drafted for the workers, an advance, and October's attendance", async () => {
  const names = test.demo.people;
  const closed = await test.transact((ex, ctx) => getPayRun(ex, ctx, { payRunId: names.payRunEmployees }));
  expect(closed).toMatchObject({ status: "CLOSED", staffKind: "EMPLOYEE", month: "2026-09" });
  expect(closed.payslips).toHaveLength(2);
  const hr = await test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId: names.payslipHr }));
  // 52,000 DA: 9% of CNAS, the IRG as typed, paid in full by transfer.
  expect(hr).toMatchObject({ grossAmount: 5_200_000, cnasAmount: 468_000, irgAmount: 550_000, netAmount: 4_182_000 });
  expect(hr.paidAmount).toBe(hr.netAmount);
  const supervisor = await test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId: names.payslipSupervisor }));
  // Two evenings to 19:00 in a week of 40 hours: 7 hours of overtime; and 20,000 DA paid so far.
  expect(supervisor.overtimeMin).toBe(420);
  expect(supervisor.paidAmount).toBe(2_000_000);

  const draft = await test.transact((ex, ctx) => getPayRun(ex, ctx, { payRunId: names.payRunWorkersDraft }));
  expect(draft.status).toBe("DRAFT");
  const ainBeida = draft.payslips.find((slip) => slip.staffId === names.workerAinBeida);
  expect(ainBeida).toMatchObject({ advanceRepayment: 500_000, netAmount: 2_500_000 });
  expect(
    draft.payslips
      .filter((slip) => slip.missing.includes("IRG"))
      .map((slip) => slip.staffId)
      .sort(),
  ).toEqual([names.workerSenior, names.workerLeader].sort());
  expect(await test.transact((ex, ctx) => listDebtors(ex, ctx))).toEqual([
    expect.objectContaining({ staffId: names.workerAinBeida, balance: 500_000 }),
  ]);

  const october = await test.transact((ex, ctx) =>
    listEmployeeAttendance(ex, ctx, { from: "2026-10-01", to: "2026-10-31" }),
  );
  const mourad = october.find((person) => person.staffId === names.employeeSupervisor);
  expect(mourad?.absences).toHaveLength(1);
  expect(mourad?.leaves.map((leave) => leave.status)).toEqual(["REQUESTED"]);
  expect(october.find((person) => person.staffId === names.employeeHr)?.leaves.map((leave) => leave.status)).toEqual([
    "APPROVED",
  ]);
});

it("has an interview, training days, two violations, an evaluation and an allowance", async () => {
  const names = test.demo.people;
  const candidates = await test.transact((ex, ctx) => listCandidates(ex, ctx));
  expect(candidates.find((row) => row.id === names.workerCandidate)?.interview).toMatchObject({ status: "SCHEDULED" });
  // Three days done for the worker on trial; the fourth is to come.
  expect(candidates.find((row) => row.id === names.workerOnTrial)?.training).toMatchObject({ done: 3, required: 8 });
  const violations = await test.transact((ex, ctx) => listViolations(ex, ctx, {}));
  expect(violations.map((row) => [row.status, row.action])).toEqual([
    ["OPEN", null],
    ["DECIDED", "WRITTEN_WARNING"],
  ]);
  expect(violations[0].id).toBe(names.violationOpen);
});
