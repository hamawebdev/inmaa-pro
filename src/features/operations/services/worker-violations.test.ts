import { afterEach, beforeEach, expect, it } from "vitest";

import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listViolationCandidates, recordWorkerViolation } from "./worker-violations";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const violationsOf = (staffId: string) =>
  test.db
    .selectFrom("Violation")
    .select([
      "sourceKind",
      "complaintId",
      "inspectionId",
      "problemReportId",
      "date",
      "severity",
      "status",
      "description",
    ])
    .where("staffId", "=", staffId)
    .execute();

it("hands the worker a complaint settled at fault names to HR, once", async () => {
  const worker = await test.rows.insert("StaffMember", { kind: "WORKER" });
  const visit = await test.rows.insert("Visit", { visitDate: localDate("2026-10-08"), status: "DONE" });
  const complaint = await test.rows.insert("Complaint", {
    workerId: worker.id,
    visitId: visit.id,
    receivedAt: "2026-10-09T09:00:00.000Z",
    status: "SETTLED",
    centreAtFault: "YES",
    description: "تأخر الفريق ساعة كاملة",
  });

  const [candidate] = await test.transact((ex, ctx) =>
    listViolationCandidates(ex, ctx, { kind: "COMPLAINT", sourceId: complaint.id }),
  );
  expect(candidate).toMatchObject({ workerId: worker.id, date: "2026-10-08", violation: null });

  const { number } = await test.transact((ex, ctx) =>
    recordWorkerViolation(ex, ctx, { kind: "COMPLAINT", sourceId: complaint.id, workerId: worker.id, description: "" }),
  );
  expect(number).toBeTruthy();
  expect(await violationsOf(worker.id)).toEqual([
    {
      sourceKind: "COMPLAINT",
      complaintId: complaint.id,
      inspectionId: null,
      problemReportId: null,
      date: "2026-10-08",
      severity: "MINOR",
      status: "OPEN",
      description: "تأخر الفريق ساعة كاملة",
    },
  ]);
  await expect(
    test.transact((ex, ctx) =>
      recordWorkerViolation(ex, ctx, {
        kind: "COMPLAINT",
        sourceId: complaint.id,
        workerId: worker.id,
        description: "",
      }),
    ),
  ).rejects.toThrow("A violation is already recorded for this worker on this record.");
});

it("offers the workers an inspection noted or found absent, and a damage report's team, and nobody else", async () => {
  const noted = await test.rows.insert("StaffMember", { kind: "WORKER" });
  const absent = await test.rows.insert("StaffMember", { kind: "WORKER" });
  const fine = await test.rows.insert("StaffMember", { kind: "WORKER" });
  const inspection = await test.rows.insert("Inspection", {
    status: "DONE",
    plannedDate: localDate("2026-10-05"),
    doneDate: localDate("2026-10-05"),
  });
  await test.rows.insert("InspectionWorkerNote", {
    inspectionId: inspection.id,
    workerId: noted.id,
    present: 1,
    remark: "لم ينظف المصعد",
  });
  await test.rows.insert("InspectionWorkerNote", { inspectionId: inspection.id, workerId: absent.id, present: 0 });
  await test.rows.insert("InspectionWorkerNote", { inspectionId: inspection.id, workerId: fine.id, present: 1 });

  const offered = await test.transact((ex, ctx) =>
    listViolationCandidates(ex, ctx, { kind: "INSPECTION", sourceId: inspection.id }),
  );
  expect(offered.map((each) => each.workerId).sort()).toEqual([noted.id, absent.id].sort());
  expect(offered.find((each) => each.workerId === noted.id)?.description).toBe("لم ينظف المصعد");

  await expect(
    test.transact((ex, ctx) =>
      recordWorkerViolation(ex, ctx, {
        kind: "INSPECTION",
        sourceId: inspection.id,
        workerId: fine.id,
        description: "x",
      }),
    ),
  ).rejects.toThrow("This record does not find this worker at fault.");
  await test.transact((ex, ctx) =>
    recordWorkerViolation(ex, ctx, {
      kind: "INSPECTION",
      sourceId: inspection.id,
      workerId: absent.id,
      description: "",
      serious: true,
    }),
  );
  expect(await violationsOf(absent.id)).toEqual([
    expect.objectContaining({
      sourceKind: "INSPECTION",
      inspectionId: inspection.id,
      severity: "SERIOUS",
      date: "2026-10-05",
    }),
  ]);

  const visit = await test.rows.insert("Visit", { visitDate: localDate("2026-10-10"), status: "DONE" });
  await test.rows.insert("VisitWorker", { visitId: visit.id, workerId: fine.id, seatStatus: "ASSIGNED" });
  const shortage = await test.rows.insert("ProblemReport", {
    visitId: visit.id,
    kind: "MATERIAL_SHORTAGE",
    occurredDate: localDate("2026-10-10"),
  });
  const damage = await test.rows.insert("ProblemReport", {
    visitId: visit.id,
    kind: "DAMAGE_DURING_WORK",
    occurredDate: localDate("2026-10-10"),
  });
  expect(
    await test.transact((ex, ctx) =>
      listViolationCandidates(ex, ctx, { kind: "PROBLEM_REPORT", sourceId: shortage.id }),
    ),
  ).toEqual([]);
  expect(
    await test.transact((ex, ctx) => listViolationCandidates(ex, ctx, { kind: "PROBLEM_REPORT", sourceId: damage.id })),
  ).toEqual([
    expect.objectContaining({ workerId: fine.id, date: "2026-10-10", description: "تلف أو كسر أثناء العمل" }),
  ]);
});

it("is refused to a reader of the requests section", async () => {
  const worker = await test.rows.insert("StaffMember", { kind: "WORKER" });
  const complaint = await test.rows.insert("Complaint", {
    workerId: worker.id,
    status: "SETTLED",
    centreAtFault: "YES",
  });
  await expect(
    test.transact(
      (ex, ctx) =>
        recordWorkerViolation(ex, ctx, {
          kind: "COMPLAINT",
          sourceId: complaint.id,
          workerId: worker.id,
          description: "",
        }),
      await test.sessionFor("ACCOUNTANT"),
    ),
  ).rejects.toThrow("You do not have permission to do this.");
});
