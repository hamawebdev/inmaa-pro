import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyEmployeeValues } from "@/features/people/validators/employee";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  cancelEmployeeLeave,
  cutAtMonthEnds,
  decideEmployeeLeave,
  deleteCheck,
  deleteEmployeeAbsence,
  editCheck,
  editEmployeeAbsence,
  leaveDays,
  listEmployeeAttendance,
  minutesFromChecks,
  recordCheck,
  recordEmployeeAbsence,
  requestEmployeeLeave,
} from "./employee-attendance";
import { registerEmployee } from "./employees";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function anEmployee(startDate = "2026-07-01") {
  return (
    await test.transact((ex, ctx) =>
      registerEmployee(ex, ctx, {
        ...emptyEmployeeValues("2026-07-01"),
        sex: "FEMALE",
        lastName: "بن عمر",
        firstName: "سعاد",
        phone: "0661 70 80 90",
        jobPosition: "HR_OFFICER",
        startDate,
      }),
    )
  ).id;
}
const attendance = async (from: string, to: string) =>
  (await test.transact((ex, ctx) => listEmployeeAttendance(ex, ctx, { from, to })))[0];

describe("checks in and out", () => {
  it("pairs each check in with the next check out, day by day", () => {
    expect(
      minutesFromChecks([
        { type: "CHECK_IN", localTime: "08:05" },
        { type: "CHECK_OUT", localTime: "12:00" },
        { type: "CHECK_IN", localTime: "13:00" },
        { type: "CHECK_OUT", localTime: "16:30" },
      ]),
    ).toEqual({ minutes: 445, complete: true });
    expect(minutesFromChecks([{ type: "CHECK_IN", localTime: "08:00" }])).toEqual({ minutes: 0, complete: false });
    expect(minutesFromChecks([{ type: "CHECK_OUT", localTime: "16:00" }])).toEqual({ minutes: 0, complete: false });
  });

  it("records the times the office types, corrects one with its reason, and takes one off", async () => {
    const id = await anEmployee();
    const check = (type: "CHECK_IN" | "CHECK_OUT", date: string, time: string) =>
      test.transact((ex, ctx) => recordCheck(ex, ctx, { staffId: id, type, date, time }));
    await check("CHECK_IN", "2026-10-11", "08:10");
    const out = await check("CHECK_OUT", "2026-10-11", "16:00");
    const wrong = await check("CHECK_IN", "2026-10-11", "17:00");

    let seen = await attendance("2026-10-01", "2026-10-31");
    expect(seen.days[0]).toMatchObject({ date: "2026-10-11", minutes: 470, complete: false });

    await test.transact((ex, ctx) => deleteCheck(ex, ctx, { id: wrong.id, reason: "ضغطة خاطئة" }));
    await test.transact((ex, ctx) =>
      editCheck(ex, ctx, { id: out.id, type: "CHECK_OUT", date: "2026-10-11", time: "16:30", reason: "نسيت تسجيل الخروج" }),
    );
    seen = await attendance("2026-10-01", "2026-10-31");
    expect(seen.days[0]).toMatchObject({ minutes: 500, complete: true });
    expect(seen.totals).toMatchObject({ workedMin: 500, daysPresent: 1, incompleteDays: 0 });

    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("entity", "=", "EmployeeCheckRecord")
      .where("operation", "=", "CHANGE")
      .executeTakeFirstOrThrow();
    expect(entry.reason).toBe("نسيت تسجيل الخروج");
    expect(JSON.parse(entry.changes ?? "{}")).toEqual({ localTime: ["16:00", "16:30"] });

    await expect(check("CHECK_IN", "2026-10-13", "08:00")).rejects.toThrow(
      "A time cannot be recorded for a day still to come.",
    );
    // The HR officer may change what was recorded; somebody who only reads the section may record nothing.
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => recordCheck(ex, ctx, { staffId: id, type: "CHECK_IN", date: "2026-10-12", time: "08:00" }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => editCheck(ex, ctx, { id: out.id, type: "CHECK_OUT", date: "2026-10-11", time: "16:00", reason: " " })),
    ).rejects.toThrow("Write the reason for the change.");
  });
});

describe("absences", () => {
  it("records a day, a half day or some hours, changes and takes them off with a reason", async () => {
    const id = await anEmployee();
    const full = await test.transact((ex, ctx) =>
      recordEmployeeAbsence(ex, ctx, { staffId: id, date: "2026-10-05", type: "FULL_DAY", justified: false, paid: false }),
    );
    await test.transact((ex, ctx) =>
      recordEmployeeAbsence(ex, ctx, {
        staffId: id,
        date: "2026-10-06",
        type: "HOURS",
        startTime: "10:00",
        endTime: "11:30",
        justified: true,
        paid: true,
        reason: "موعد طبي",
      }),
    );
    let seen = await attendance("2026-10-01", "2026-10-31");
    expect(seen.absences.map((a) => [a.date, a.absenceMin, a.paid])).toEqual([
      ["2026-10-05", 480, false],
      ["2026-10-06", 90, true],
    ]);
    expect(seen.totals).toMatchObject({ absenceMin: 570, unpaidAbsenceMin: 480 });

    await test.transact((ex, ctx) =>
      editEmployeeAbsence(ex, ctx, {
        id: full.id,
        staffId: id,
        date: "2026-10-05",
        type: "HALF_DAY",
        justified: true,
        paid: false,
        reasonForChange: "عادت بعد الظهر",
      }),
    );
    await test.transact((ex, ctx) => deleteEmployeeAbsence(ex, ctx, { id: full.id, reason: "سُجّل خطأ" }));
    seen = await attendance("2026-10-01", "2026-10-31");
    expect(seen.absences.map((a) => a.date)).toEqual(["2026-10-06"]);
    await expect(
      test.transact((ex, ctx) =>
        recordEmployeeAbsence(ex, ctx, { staffId: id, date: "2026-10-07", type: "HOURS", startTime: "11:00", endTime: "10:00", justified: false, paid: false }),
      ),
    ).rejects.toThrow("The end must be after the start.");
  });
});

describe("leave", () => {
  it("counts days without the weekly rest, and cuts a leave at the end of each month", () => {
    // 28 October to 4 November 2026: eight days, one of them a Friday (30 October), another (6 November) outside.
    expect(leaveDays("2026-10-28", "2026-11-04", "FRI")).toBe(7);
    expect(cutAtMonthEnds("2026-10-28", "2026-11-04")).toEqual([
      { startDate: "2026-10-28", endDate: "2026-10-31" },
      { startDate: "2026-11-01", endDate: "2026-11-04" },
    ]);
    expect(cutAtMonthEnds("2026-10-05", "2026-10-06")).toEqual([{ startDate: "2026-10-05", endDate: "2026-10-06" }]);
  });

  it("asks, grants and cancels a leave across two months as one, and keeps the balance", async () => {
    const id = await anEmployee("2026-07-01");
    const { ids } = await test.transact((ex, ctx) =>
      requestEmployeeLeave(ex, ctx, { staffId: id, type: "ANNUAL", startDate: "2026-10-28", endDate: "2026-11-04" }),
    );
    expect(ids).toHaveLength(2);
    const rows = await test.db.selectFrom("EmployeeLeave").selectAll().orderBy("startDate").execute();
    expect(rows.map((row) => [row.startDate, row.endDate, row.days, row.status])).toEqual([
      ["2026-10-28", "2026-10-31", 3000, "REQUESTED"],
      ["2026-11-01", "2026-11-04", 4000, "REQUESTED"],
    ]);
    expect(rows[0].splitGroupId).toBe(rows[1].splitGroupId);

    await expect(
      test.transact((ex, ctx) =>
        requestEmployeeLeave(ex, ctx, { staffId: id, type: "ANNUAL", startDate: "2026-11-02", endDate: "2026-11-03" }),
      ),
    ).rejects.toThrow("This employee already has a leave on these days.");

    await test.transact((ex, ctx) => decideEmployeeLeave(ex, ctx, { leaveId: ids[1], status: "APPROVED" }));
    let seen = await attendance("2026-10-01", "2026-11-30");
    expect(seen.leaves.map((leave) => leave.status)).toEqual(["APPROVED", "APPROVED"]);
    // Since 1 July: three whole months by 12 October, 7.5 days earned; seven taken.
    expect(seen.leave).toMatchObject({ earned: 7500, taken: 7000, balance: 500, from: "2026-07-01" });

    await test.transact((ex, ctx) => cancelEmployeeLeave(ex, ctx, { leaveId: ids[0], reason: "أجلت عطلتها" }));
    seen = await attendance("2026-10-01", "2026-11-30");
    expect(seen.leaves.map((leave) => leave.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(seen.leave.balance).toBe(7500);
    await expect(
      test.transact((ex, ctx) => decideEmployeeLeave(ex, ctx, { leaveId: ids[0], status: "REFUSED", reason: "x" })),
    ).rejects.toThrow("This leave has already been decided.");
  });

  it("needs a reason to refuse, and never pays unpaid leave", async () => {
    const id = await anEmployee();
    const { ids } = await test.transact((ex, ctx) =>
      requestEmployeeLeave(ex, ctx, { staffId: id, type: "UNPAID", startDate: "2026-10-19", endDate: "2026-10-20", paid: true }),
    );
    const row = await test.db.selectFrom("EmployeeLeave").selectAll().executeTakeFirstOrThrow();
    expect(row.paid).toBe(0);
    await expect(
      test.transact((ex, ctx) => decideEmployeeLeave(ex, ctx, { leaveId: ids[0], status: "REFUSED" })),
    ).rejects.toThrow("Write the reason for the decision.");
  });
});
