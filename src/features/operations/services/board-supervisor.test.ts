import { afterEach, beforeEach, expect, it } from "vitest";

import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getOwnSupervision, listDayBoard } from "./board";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("shows one supervisor's visits of the day, and opens on the signed-in supervisor's own (F-36b)", async () => {
  const zone = await test.rows.insert("Zone", { name: "عين البيضاء" });
  const mine = await test.rows.insert("StaffMember", {
    kind: "EMPLOYEE",
    firstName: "مراد",
    lastName: "حداد",
  } as never);
  const other = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" } as never);
  await test.rows.insert("SupervisorAssignment", {
    supervisorEmployeeId: mine.id,
    zoneId: zone.id,
    fromDate: localDate("2026-10-01"),
  });
  const day = localDate("2026-10-12");
  const his = await test.rows.insert("Visit", { visitDate: day, supervisorEmployeeId: mine.id } as never);
  await test.rows.insert("Visit", { visitDate: day, supervisorEmployeeId: other.id } as never);

  expect(await test.transact((ex, ctx) => listDayBoard(ex, ctx, { date: day }))).toHaveLength(2);
  const filtered = await test.transact((ex, ctx) => listDayBoard(ex, ctx, { date: day, supervisorId: mine.id }));
  expect(filtered.map((row) => row.visit.id)).toEqual([his.id]);
  expect(filtered[0].supervisor).toEqual({ id: mine.id, name: "حداد مراد" });

  const supervisor = { ...(await test.sessionFor("SUPERVISOR")), staffMemberId: mine.id };
  expect(await test.transact((ex, ctx) => getOwnSupervision(ex, ctx, { date: day }), supervisor)).toEqual({
    supervisorId: mine.id,
  });
  expect(await test.transact((ex, ctx) => getOwnSupervision(ex, ctx, { date: day }))).toEqual({ supervisorId: null });
});
