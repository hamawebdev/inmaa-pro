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
