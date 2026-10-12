import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listEmployees } from "./services/employees";
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
  expect(workers.map((worker) => worker.number).reverse()).toEqual(["1/F", "2/F", "3/F", "4/F", "5/H", "6/H", "7/F", "8/F"]);

  const suspended = workers.filter((worker) => worker.sanction !== null);
  expect(suspended.map((worker) => [worker.id, worker.sanction?.state, worker.sanction?.since])).toEqual([
    [names.workerSuspended, "SUSPENDED", "2026-10-05"],
  ]);
  const inForce = await test.transact((ex, ctx) => listSanctions(ex, ctx, { inForceOnly: true }));
  expect(inForce.map((sanction) => sanction.id)).toEqual([names.suspension]);
  // One medical certificate about to expire, one expired.
  expect(workers.filter((worker) => worker.documentsToRenew > 0).map((worker) => worker.id).sort()).toEqual(
    [names.workerSenior, names.workerDaily].sort(),
  );

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
