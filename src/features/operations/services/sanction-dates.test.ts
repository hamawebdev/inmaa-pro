import { afterEach, beforeEach, expect, it } from "vitest";

import { setSanction } from "@/features/people/services/sanctions";
import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { assignVisitWorker, listSeatCandidates } from "./assignment";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const EVERY_DAY = JSON.stringify(["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"]);

async function contract(before?: (fileId: string) => Promise<void>) {
  const site = await test.rows.insert("Site", { division: "ORGANISATION" });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    formKind: "ORG_CONTRACT",
    stage: "CONTRACTED",
    executionDays: JSON.stringify(["MON"]),
    period: "MORNING",
    arrivalTime: localTime("08:00"),
    departureTime: localTime("11:00"),
    startDate: localDate("2026-10-19"),
    endDate: localDate("2026-11-30"),
    workersCount: 1,
    visitsPerWeek: 1,
  } as never);
  await before?.(file.id);
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
  return test.db.selectFrom("Visit").selectAll().where("fileId", "=", file.id).orderBy("visitDate").execute();
}

const worker = () =>
  test.rows.insert("StaffMember", {
    kind: "WORKER",
    role: "CLEANER",
    sex: "FEMALE",
    engagementStatus: "ACCEPTED",
    availableDays: EVERY_DAY,
  } as never);

const suspend = (workerId: string) =>
  test.transact((ex, ctx) =>
    setSanction(ex, ctx, {
      subjectKind: "WORKER",
      subjectId: workerId,
      state: "SUSPENDED",
      reason: "غياب متكرر دون مبرر",
      startDate: "2026-11-01",
      endDate: "2026-11-15",
    }),
  );

it("keeps a worker suspended from a later day off the seats of those days, by hand (INT-4, OPS-01)", async () => {
  const visits = await contract();
  const one = await worker();
  await suspend(one.id);
  const before = visits.find((visit) => visit.visitDate === "2026-10-26")!;
  const during = visits.find((visit) => visit.visitDate === "2026-11-02")!;
  const after = visits.find((visit) => visit.visitDate === "2026-11-16")!;

  const candidates = await test.transact((ex, ctx) => listSeatCandidates(ex, ctx, { visitId: during.id }));
  expect(candidates.find((candidate) => candidate.id === one.id)?.sanctioned).toBe(true);
  await expect(
    test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId: during.id, workerId: one.id })),
  ).rejects.toThrow("This worker is suspended or penalised.");
  // Before it starts and after it ends, she is seated as anyone.
  await test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId: before.id, workerId: one.id }));
  await test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId: after.id, workerId: one.id }));
});

it("leaves the seats of a standing member suspended from a later day open at generation (INT-4, OPS-01)", async () => {
  const one = await worker();
  await suspend(one.id);
  const visits = await contract(async (fileId) => {
    await test.rows.insert("FileAssignment", {
      fileId,
      workerId: one.id,
      role: "LEADER",
      validFrom: localDate("2026-10-01"),
      sortOrder: 0,
    });
  });
  const seated = async (date: string) => {
    const visit = visits.find((each) => each.visitDate === date)!;
    return (await test.db.selectFrom("VisitWorker").select("workerId").where("visitId", "=", visit.id).execute())
      .length;
  };
  expect(await seated("2026-10-26")).toBe(1);
  expect(await seated("2026-11-02")).toBe(0);
  expect(await seated("2026-11-09")).toBe(0);
  expect(await seated("2026-11-16")).toBe(1);
});
