import { afterEach, beforeEach, expect, it } from "vitest";

import { localDate, localTime, minutes } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { assignVisitWorker } from "./assignment";

/**
 * The working-time rules read a worker's seats where they really fall: across
 * the Friday-to-Saturday edge of the program week (audit LAB-X1), and on the
 * day a typed time after midnight belongs to (audit LAB-11).
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const EVERY_DAY = JSON.stringify(["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"]);

async function man() {
  return test.rows.insert("StaffMember", {
    kind: "WORKER",
    sex: "MALE",
    role: "CLEANER",
    engagementStatus: "ACCEPTED",
    availableDays: EVERY_DAY,
  } as never);
}

async function visitAt(date: string, start: string, durationMin: number) {
  return test.rows.insert("Visit", {
    visitDate: localDate(date),
    plannedStartTime: localTime(start),
    plannedDurationMin: minutes(durationMin),
    workersNeeded: 1,
    status: "AWAITING_CONFIRMATION",
  } as never);
}

const assign = (visitId: string, workerId: string) =>
  test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId, workerId }));

it("refuses a Saturday visit at 01:00 to a worker on a Friday night visit until 04:00 (LAB-X1)", async () => {
  const worker = await man();
  const friday = await visitAt("2026-11-13", "22:00", 360);
  await assign(friday.id, worker.id);
  const saturday = await visitAt("2026-11-14", "01:00", 120);
  await expect(assign(saturday.id, worker.id)).rejects.toThrow("This worker already has a visit at that time.");
});

it("reads a night visit typed after midnight on the next day (LAB-11)", async () => {
  const worker = await man();
  // Planned Monday 23:00, typed 00:15 to 03:00: worked on Tuesday morning.
  const night = await visitAt("2026-11-02", "23:00", 180);
  await test.rows.insert("VisitWorker", {
    visitId: night.id,
    workerId: worker.id,
    seatStatus: "ASSIGNED",
    arrivedTime: localTime("00:15"),
    leftTime: localTime("03:00"),
    lateMin: minutes(75),
    workedMin: minutes(165),
  });
  // Monday afternoon is free: no 12-hour span is found against a Monday 00:15.
  const monday = await visitAt("2026-11-02", "13:00", 240);
  await expect(assign(monday.id, worker.id)).resolves.toMatchObject({ seatId: expect.any(String) });
  // Tuesday 02:00 is when he was still at work.
  const tuesday = await visitAt("2026-11-03", "02:00", 60);
  await expect(assign(tuesday.id, worker.id)).rejects.toThrow("This worker already has a visit at that time.");
});
