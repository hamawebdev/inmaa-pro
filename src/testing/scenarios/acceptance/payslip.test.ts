import { afterEach, beforeEach, expect, it } from "vitest";

import { getPayslip, recordPayslipPrint } from "@/features/people/services/pay-runs";
import { getSettings } from "@/lib/settings";

import { createTestDatabase, type TestDatabase } from "../../database";

/**
 * The payslip's arithmetic, checked independently of People's own pay rules
 * (docs/checker/acceptance.md, feature 38): what a printed payslip says must add
 * up, with the rates the settings hold. And printing it is a disclosure.
 *
 * Reads People's demo payslips through `getPayslip`, as the print page does.
 */

/** A scenario builds a database and walks many steps: room for a machine six teammates are loading. */
const LONG = { timeout: 180_000 };

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase({ demo: ["people"] });
}, LONG.timeout);
afterEach(() => test?.close());

const round = (value: number) => Math.round(value);
const sum = (items: Array<{ type: string; amount: number }>, types: readonly string[]) =>
  items.filter((item) => types.includes(item.type)).reduce((total, item) => total + item.amount, 0);

it.each(["payslipSupervisor", "payslipHr"])("%s adds up, with the settings' rates", LONG, async (name) => {
  const accountant = await test.sessionFor("ACCOUNTANT");
  const slip = await getPayslip(test.db, test.ctx(accountant), { payslipId: test.demo.people[name] });
  const settings = await getSettings(test.db, [
    "pay.cnasEmployeeRate",
    "pay.cnasEmployerRate",
    "pay.overtimePremium",
    "pay.monthlyDivisorMin",
    "pay.leaveDaysPerMonth",
    "pay.irgTable",
  ]);

  // The rates printed are the settings' (9% and 26% by default).
  expect(slip.cnasRate).toBe(settings["pay.cnasEmployeeRate"]);
  expect(slip.employerCnasRate).toBe(settings["pay.cnasEmployerRate"]);

  // Gross: what the lines add, less an unpaid absence.
  const earned = sum(slip.items, ["BASE", "OVERTIME_50", "REST_DAY_PREMIUM", "LEAVE_PAY", "ALLOWANCE", "BONUS"]);
  const absence = sum(slip.items, ["ABSENCE"]);
  expect(slip.grossAmount).toBe(earned - Math.abs(absence));

  // Overtime at +50%: the minutes beyond the legal week at the hourly value of the monthly wage, with the premium.
  const overtime = slip.items.find((item) => item.type === "OVERTIME_50");
  if (slip.payBasis === "MONTHLY" && slip.overtimeMin > 0) {
    const hourly = (slip.payRate * 60) / settings["pay.monthlyDivisorMin"];
    const expected = round(((slip.overtimeMin / 60) * hourly * (10_000 + settings["pay.overtimePremium"])) / 10_000);
    expect(Math.abs(overtime!.amount - expected), "overtime at +50%").toBeLessThanOrEqual(1);
  }

  // CNAS, the employee's and the employer's, on the contributable base; unless typed on the payslip.
  if (slip.typed.cnas === undefined) {
    expect(Math.abs(slip.cnasAmount - round((slip.contributableBase * slip.cnasRate) / 10_000))).toBeLessThanOrEqual(1);
  }
  expect(
    Math.abs(slip.employerCnasAmount - round((slip.contributableBase * slip.employerCnasRate) / 10_000)),
  ).toBeLessThanOrEqual(1);

  // IRG: from the scale once the accountant has typed it; until then typed on the payslip, or missing and said so.
  if (settings["pay.irgTable"] === null && slip.typed.irg === undefined) {
    expect(slip.irgAmount).toBe(0);
    expect(slip.missing.length, "a payslip without its IRG says what is missing").toBeGreaterThan(0);
  }

  // Net: gross less the employee's CNAS, the IRG, the advance repaid and the other deductions.
  expect(slip.netAmount).toBe(
    slip.grossAmount - slip.cnasAmount - slip.irgAmount - slip.advanceRepayment - slip.otherDeductions,
  );

  // Leave: the month accrues 2.5 days (pay.leaveDaysPerMonth); the balance is what the year of reference has earned,
  // whole months at 2.5 days since 1 July or the start date, less what was taken (People's rules/leave.ts).
  expect(slip.leaveAccruedDays).toBe(settings["pay.leaveDaysPerMonth"]);
  expect((slip.leaveBalanceDays + slip.leaveTakenDays) % settings["pay.leaveDaysPerMonth"], "whole months").toBe(0);
  expect(slip.leaveBalanceDays + slip.leaveTakenDays).toBeGreaterThanOrEqual(slip.leaveAccruedDays);

  // For the report: what was checked, in dinars.
  console.log(
    `${name}: basis ${slip.payBasis}, rate ${slip.payRate / 100}, normal ${slip.normalMin} min, overtime ${slip.overtimeMin} min;` +
      ` gross ${slip.grossAmount / 100}, CNAS ${slip.cnasAmount / 100} (base ${slip.contributableBase / 100}),` +
      ` IRG ${slip.irgAmount / 100}, advance ${slip.advanceRepayment / 100}, other ${slip.otherDeductions / 100},` +
      ` net ${slip.netAmount / 100}, employer CNAS ${slip.employerCnasAmount / 100};` +
      ` leave accrued ${slip.leaveAccruedDays / 1000}, taken ${slip.leaveTakenDays / 1000}, balance ${slip.leaveBalanceDays / 1000};` +
      ` missing [${slip.missing.join(", ")}]; typed ${JSON.stringify(slip.typed)}; IRG scale ${settings["pay.irgTable"] ? "in Settings" : "not set"};` +
      ` employer CNAS number «${slip.employer.cnasEmployerNumber}»`,
  );
});

it("printing a payslip is logged as a disclosure about the person it names", LONG, async () => {
  const accountant = await test.sessionFor("ACCOUNTANT");
  const payslipId = test.demo.people.payslipSupervisor;
  await test.transact((ex, ctx) => recordPayslipPrint(ex, ctx, { payslipId }), accountant);
  const entry = await test.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "entity", "subjectKind", "userId"])
    .where("entity", "=", "Payslip")
    .where("entityId", "=", payslipId)
    .orderBy("chainSeq", "desc")
    .executeTakeFirstOrThrow();
  expect(entry).toMatchObject({ operation: "DISCLOSE", action: "PRINT", entity: "Payslip", userId: accountant.userId });
  expect(entry.subjectKind).toBe("EMPLOYEE");
});
