import { afterEach, beforeEach, expect, it } from "vitest";

import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { assignZoneSupervisor } from "./supervisors";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("names a zone's supervisor, ends the one before and re-stamps the visits to come", async () => {
  const zone = await test.rows.insert("Zone", { name: "عين مليلة" });
  const first = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" } as never);
  const second = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" } as never);
  const coming = await test.rows.insert("Visit", { zoneId: zone.id, visitDate: localDate("2026-10-20") } as never);
  const printed = await test.rows.insert("Visit", {
    zoneId: zone.id,
    visitDate: localDate("2026-10-21"),
    orderPrintedAt: "2026-10-12T08:00:00.000Z",
  } as never);
  const done = await test.rows.insert("Visit", {
    zoneId: zone.id,
    visitDate: localDate("2026-10-22"),
    status: "DONE",
  } as never);

  await test.transact((ex, ctx) =>
    assignZoneSupervisor(ex, ctx, {
      zoneId: zone.id,
      supervisorEmployeeId: first.id,
      fromDate: localDate("2026-10-01"),
    }),
  );
  const result = await test.transact((ex, ctx) =>
    assignZoneSupervisor(ex, ctx, {
      zoneId: zone.id,
      supervisorEmployeeId: second.id,
      fromDate: localDate("2026-10-15"),
    }),
  );
  expect(result).toMatchObject({ visitsRestamped: 1, ordersMarked: 1 });

  const rows = await test.db
    .selectFrom("SupervisorAssignment")
    .selectAll()
    .where("zoneId", "=", zone.id)
    .orderBy("fromDate")
    .execute();
  expect(rows.map((row) => [row.supervisorEmployeeId, row.fromDate, row.toDate])).toEqual([
    [first.id, "2026-10-01", "2026-10-14"],
    [second.id, "2026-10-15", null],
  ]);
  const visits = await test.db.selectFrom("Visit").select(["id", "supervisorEmployeeId", "planChangedAt"]).execute();
  const by = (id: string) => visits.find((visit) => visit.id === id)!;
  expect(by(coming.id).supervisorEmployeeId).toBe(second.id);
  expect(by(printed.id).planChangedAt).not.toBeNull();
  // A visit already done keeps what it had.
  expect(by(done.id).supervisorEmployeeId).toBeNull();
});

it("leaves a supervisor planned from a later day his days and his visits (OPS-10)", async () => {
  const zone = await test.rows.insert("Zone", { name: "أم البواقي" });
  const later = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" } as never);
  const sooner = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" } as never);
  const before = await test.rows.insert("Visit", { zoneId: zone.id, visitDate: localDate("2026-11-10") } as never);
  const after = await test.rows.insert("Visit", { zoneId: zone.id, visitDate: localDate("2026-11-16") } as never);

  await test.transact((ex, ctx) =>
    assignZoneSupervisor(ex, ctx, {
      zoneId: zone.id,
      supervisorEmployeeId: later.id,
      fromDate: localDate("2026-11-15"),
    }),
  );
  const result = await test.transact((ex, ctx) =>
    assignZoneSupervisor(ex, ctx, {
      zoneId: zone.id,
      supervisorEmployeeId: sooner.id,
      fromDate: localDate("2026-11-01"),
    }),
  );
  expect(result.visitsRestamped).toBe(1);

  const rows = await test.db
    .selectFrom("SupervisorAssignment")
    .selectAll()
    .where("zoneId", "=", zone.id)
    .orderBy("fromDate")
    .execute();
  expect(rows.map((row) => [row.supervisorEmployeeId, row.fromDate, row.toDate])).toEqual([
    [sooner.id, "2026-11-01", "2026-11-14"],
    [later.id, "2026-11-15", null],
  ]);
  const visits = await test.db.selectFrom("Visit").select(["id", "supervisorEmployeeId"]).execute();
  const by = (id: string) => visits.find((visit) => visit.id === id)!;
  expect(by(before.id).supervisorEmployeeId).toBe(sooner.id);
  expect(by(after.id).supervisorEmployeeId).toBe(later.id);
});

it("refuses a worker as supervisor", async () => {
  const zone = await test.rows.insert("Zone", { name: "عين البيضاء" });
  const worker = await test.rows.insert("StaffMember", { kind: "WORKER" } as never);
  await expect(
    test.transact((ex, ctx) =>
      assignZoneSupervisor(ex, ctx, {
        zoneId: zone.id,
        supervisorEmployeeId: worker.id,
        fromDate: localDate("2026-10-12"),
      }),
    ),
  ).rejects.toThrow("Choose an employee as supervisor.");
});
