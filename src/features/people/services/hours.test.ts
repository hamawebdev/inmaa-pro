import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { localDate, type LocalDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { addHoursAdjustment, removeHoursAdjustment, weekStart, workerHours } from "./hours";
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
        ...emptyWorkerValues("2026-09-01"),
        sex: "FEMALE",
        lastName: "قاسمي",
        firstName: "نوال",
        birthDate: "1996-01-12",
        phone: "0555 31 42 53",
        hiringDecision: "ACCEPTED",
        issuedDate: "2026-09-01",
        payBasis: "HOURLY",
        payRate: "250",
      }),
    )
  ).id;
}

/** A seat of hers on a visit of that day, with the minutes typed in from the order (or not). */
async function seat(
  workerId: string,
  date: string,
  worked: number | null,
  over: { seatStatus?: string; lateMin?: number; status?: string; statusReason?: string } = {},
) {
  const visit = await test.rows.insert("Visit", {
    visitDate: localDate(date),
    plannedStartTime: "08:00" as never,
    plannedDurationMin: 480 as never,
    status: over.status ?? "DONE",
    statusReason: over.statusReason ?? null,
  });
  return test.rows.insert("VisitWorker", {
    visitId: visit.id,
    workerId,
    role: "CLEANER",
    seatStatus: over.seatStatus ?? "ASSIGNED",
    workedMin: worked as never,
    lateMin: (over.lateMin ?? null) as never,
    arrivedTime: (worked === null ? null : "08:00") as never,
    leftTime: (worked === null ? null : "16:00") as never,
  });
}

const hoursOf = async (from: string, to: string) =>
  (await test.transact((ex, ctx) => workerHours(ex, ctx, { from, to })))[0];

describe("workerHours", () => {
  it("adds up her typed orders by week, with overtime past 40 hours and her rest day", async () => {
    const id = await aWorker();
    // The week of Saturday 3 to Friday 9 October: six days of 8 hours, the sixth her rest day (Friday).
    for (const day of ["03", "04", "05", "06", "07", "09"]) await seat(id, `2026-10-${day}`, 480);
    // Thursday 8th: late 25 minutes, 9 hours.
    await seat(id, "2026-10-08", 540, { lateMin: 25 });

    const hours = await hoursOf("2026-10-03", "2026-10-09");
    expect(hours.weeks).toEqual([
      {
        start: "2026-10-03",
        end: "2026-10-09",
        workedMin: 3420,
        overtimeMin: 1020,
        overCap: true,
        restDate: "2026-10-09",
        restDayMin: 480,
        beyondDayMin: 60,
      },
    ]);
    expect(hours.totals).toMatchObject({
      workedMin: 3420,
      daysWorked: 7,
      lateMin: 25,
      lateCount: 1,
      ordersNotTyped: 0,
      overtimeMin: 1020,
      restDayMin: 480,
    });
  });

  it("counts a week's overtime in the period where it ends, from every seat of the week", async () => {
    const id = await aWorker();
    // The week of Saturday 26 September to Friday 2 October straddles two months.
    for (const day of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]) {
      await seat(id, day, 480);
    }
    const september = await hoursOf("2026-09-01", "2026-09-30");
    expect(september.totals).toMatchObject({ workedMin: 2400, overtimeMin: 0 });
    const october = await hoursOf("2026-10-01", "2026-10-31");
    expect(october.totals.workedMin).toBe(480);
    expect(october.weeks[0]).toMatchObject({ start: "2026-09-26", end: "2026-10-02", workedMin: 2880, overtimeMin: 480 });
    expect(october.totals.overtimeMin).toBe(480);
  });

  it("takes her rotated rest day from a resting seat, and leaves out what is not hers", async () => {
    const id = await aWorker();
    await seat(id, "2026-10-06", null, { seatStatus: "RESTING" });
    await seat(id, "2026-10-06", 240);
    // Replaced and removed seats, a postponed visit and a programme change pay nothing.
    await seat(id, "2026-10-05", 480, { seatStatus: "REPLACED" });
    await seat(id, "2026-10-07", 480, { status: "POSTPONED", statusReason: "CLIENT_REQUEST" });
    await seat(id, "2026-10-08", 480, { status: "CANCELLED", statusReason: "PROGRAMME_CHANGED" });
    const hours = await hoursOf("2026-10-03", "2026-10-09");
    expect(hours.weeks[0]).toMatchObject({ restDate: "2026-10-06", restDayMin: 240, workedMin: 240 });
  });

  it("counts the orders not typed in by today, and her absences of the period", async () => {
    const id = await aWorker();
    await seat(id, "2026-10-10", null);
    await seat(id, "2026-10-11", null);
    await seat(id, "2026-10-13", null); // tomorrow: not late to type yet
    await test.rows.insert("WorkerAbsence", {
      workerId: id,
      startDate: localDate("2026-09-29"),
      endDate: localDate("2026-10-02"),
      type: "FULL_DAY",
      absenceMin: 1920 as never,
      category: "SICK",
      paid: 1,
      status: "RECORDED",
    });
    await test.rows.insert("WorkerAbsence", {
      workerId: id,
      startDate: localDate("2026-10-07"),
      endDate: localDate("2026-10-07"),
      type: "FULL_DAY",
      absenceMin: 480 as never,
      category: "UNJUSTIFIED",
      status: "RECORDED",
    });
    // A leave refused is not an absence.
    await test.rows.insert("WorkerAbsence", {
      workerId: id,
      startDate: localDate("2026-10-20"),
      endDate: localDate("2026-10-21"),
      type: "FULL_DAY",
      absenceMin: 960 as never,
      category: "LEAVE",
      leaveType: "ANNUAL",
      days: 2 as never,
      status: "REFUSED",
    });
    const hours = await hoursOf("2026-10-01", "2026-10-31");
    expect(hours.totals).toMatchObject({
      ordersNotTyped: 2,
      // Two of the sick days fall in October: half of 1920.
      absenceMin: 960 + 480,
      paidAbsenceMin: 960,
      unpaidAbsenceMin: 480,
    });
  });

  it("adds People's corrections to the day, and refuses one without a reason", async () => {
    const id = await aWorker();
    await seat(id, "2026-10-06", 480);
    const { id: lineId } = await test.transact((ex, ctx) =>
      addHoursAdjustment(ex, ctx, { staffId: id, date: "2026-10-06", adjustMin: 90, kind: "TRAINING", reason: "تكوين السلامة" }),
    );
    let hours = await hoursOf("2026-10-03", "2026-10-09");
    expect(hours.totals).toMatchObject({ workedMin: 570, adjustMin: 90, divisionMin: { HOUSING: 480, COMMON: 90 } });
    await expect(
      test.transact((ex, ctx) =>
        addHoursAdjustment(ex, ctx, { staffId: id, date: "2026-10-06", adjustMin: 30, kind: "OTHER", reason: " " }),
      ),
    ).rejects.toThrow("Write the reason for the correction.");
    await test.transact((ex, ctx) => removeHoursAdjustment(ex, ctx, { id: lineId, reason: "أدخلت خطأ" }));
    hours = await hoursOf("2026-10-03", "2026-10-09");
    expect(hours.totals.workedMin).toBe(480);
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact((ex, ctx) => workerHours(ex, ctx, { from: "2026-10-01", to: "2026-10-31" }), reception),
    ).rejects.toThrow("You do not have permission to do this.");
  });

  it("starts a week on Saturday", () => {
    const of = (date: string) => weekStart(localDate(date) as LocalDate);
    expect([of("2026-10-03"), of("2026-10-09"), of("2026-10-10"), of("2026-10-12")]).toEqual([
      "2026-10-03",
      "2026-10-03",
      "2026-10-10",
      "2026-10-10",
    ]);
  });
});
