import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getWorkerQualityFigures } from "./worker-quality";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** One visit on a day, her seat on it, and its returned order with the client's marks. */
async function workedVisit(
  workerId: string,
  visitDate: string,
  seat: { arrivedTime: string | null; lateMin: number | null },
  marks: { ratingOverall: number | null; ratingBehaviour: number | null },
  status: "DONE" | "PROBLEM" | "CANCELLED" = "DONE",
) {
  const visit = await test.rows.insert("Visit", { visitDate, status, plannedStartTime: "08:00" });
  await test.rows.insert("VisitWorker", { visitId: visit.id, workerId, seatStatus: "ASSIGNED", ...seat });
  await test.rows.insert("VisitReport", { visitId: visit.id, entryState: "COMPLETE", ...marks });
  return visit;
}

it("gives a worker's visits, lateness, ratings, complaints, inspections and damage over a period", async () => {
  const worker = await test.rows.insert("StaffMember", { kind: "WORKER" });
  const other = await test.rows.insert("StaffMember", { kind: "WORKER" });

  const first = await workedVisit(
    worker.id,
    "2026-09-03",
    { arrivedTime: "08:10", lateMin: 10 },
    { ratingOverall: 4, ratingBehaviour: 5 },
  );
  await workedVisit(
    worker.id,
    "2026-09-10",
    { arrivedTime: "07:55", lateMin: 0 },
    { ratingOverall: 5, ratingBehaviour: 4 },
  );
  await workedVisit(
    worker.id,
    "2026-09-17",
    { arrivedTime: null, lateMin: null },
    { ratingOverall: null, ratingBehaviour: null },
    "PROBLEM",
  );
  // Outside the period, cancelled, or somebody else's: not counted.
  await workedVisit(
    worker.id,
    "2026-10-02",
    { arrivedTime: "09:00", lateMin: 60 },
    { ratingOverall: 1, ratingBehaviour: 1 },
  );
  await workedVisit(
    worker.id,
    "2026-09-24",
    { arrivedTime: "08:30", lateMin: 30 },
    { ratingOverall: 2, ratingBehaviour: 2 },
    "CANCELLED",
  );
  await workedVisit(
    other.id,
    "2026-09-03",
    { arrivedTime: "09:00", lateMin: 60 },
    { ratingOverall: 1, ratingBehaviour: 1 },
  );

  // A complaint the last evening of the period (21:30 in Algiers is 20:30 UTC), settled at fault; one after it.
  const settled = await test.rows.insert("Complaint", {
    workerId: worker.id,
    receivedAt: "2026-09-30T20:30:00.000Z",
    kind: "DELAY",
    status: "SETTLED",
    centreAtFault: "YES",
  });
  await test.rows.insert("Complaint", { workerId: worker.id, receivedAt: "2026-09-30T23:30:00.000Z" });

  const inspection = await test.rows.insert("Inspection", {
    status: "DONE",
    plannedDate: "2026-09-15",
    doneDate: "2026-09-15",
    scoreTotal: 74,
    belowThreshold: 1,
  });
  await test.rows.insert("InspectionWorkerNote", {
    inspectionId: inspection.id,
    workerId: worker.id,
    present: 1,
    remark: "الدرج غير منظف جيداً",
  });
  const absentAt = await test.rows.insert("Inspection", {
    status: "DONE",
    plannedDate: "2026-09-22",
    doneDate: "2026-09-22",
    scoreTotal: 91,
    belowThreshold: 0,
  });
  await test.rows.insert("InspectionWorkerNote", { inspectionId: absentAt.id, workerId: worker.id, present: 0 });

  await test.rows.insert("ProblemReport", {
    visitId: first.id,
    kind: "DAMAGE_DURING_WORK",
    occurredDate: "2026-09-03",
  });

  const figures = await test.transact((ex, ctx) =>
    getWorkerQualityFigures(ex, ctx, { workerId: worker.id, from: "2026-09-01", to: "2026-09-30" }),
  );
  expect(figures).toMatchObject({
    workerId: worker.id,
    from: "2026-09-01",
    to: "2026-09-30",
    visits: { done: 3, withTimes: 2 },
    lateness: { count: 1, totalMin: 10, longestMin: 10 },
    ratings: { count: 2, average: 4.5, behaviourAverage: 4.5 },
    complaints: { count: 1, atFault: 1 },
    inspections: { count: 2, averageScore: 82.5, belowThreshold: 1, remarks: 1, absent: 1 },
    problemReports: { damage: 1 },
  });
  expect(figures.complaints.items).toEqual([
    expect.objectContaining({ id: settled.id, date: "2026-09-30", kind: "DELAY", status: "SETTLED" }),
  ]);
});

it("is refused to a role without the workers section, and for a period that ends before it starts", async () => {
  const worker = await test.rows.insert("StaffMember", { kind: "WORKER" });
  await expect(
    test.transact(
      (ex, ctx) => getWorkerQualityFigures(ex, ctx, { workerId: worker.id, from: "2026-09-01", to: "2026-09-30" }),
      await test.sessionFor("RECEPTION_SALES"),
    ),
  ).rejects.toThrow("You do not have permission to do this.");
  await expect(
    test.transact((ex, ctx) =>
      getWorkerQualityFigures(ex, ctx, { workerId: worker.id, from: "2026-09-30", to: "2026-09-01" }),
    ),
  ).rejects.toThrow("Enter a valid period.");
});
