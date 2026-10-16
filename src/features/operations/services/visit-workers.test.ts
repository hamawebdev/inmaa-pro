import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listVisitWorkers } from "./visit-workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("lists a visit's seats with their worker, surname first, in the order given", async () => {
  const visit = await test.rows.insert("Visit", { status: "CONFIRMED" });
  const first = await test.rows.insert("StaffMember", {
    kind: "WORKER",
    firstName: "أمال",
    lastName: "بن علي",
  } as never);
  const second = await test.rows.insert("StaffMember", {
    kind: "WORKER",
    firstName: "نادية",
    lastName: "قاسمي",
  } as never);
  await test.rows.insert("VisitWorker", { visitId: visit.id, workerId: first.id, seatStatus: "ASSIGNED" });
  await test.rows.insert("VisitWorker", { visitId: visit.id, workerId: second.id, seatStatus: "REMOVED" });
  const seats = await test.transact((ex, ctx) => listVisitWorkers(ex, ctx, { visitId: visit.id }));
  expect(seats.map((seat) => [seat.name, seat.seatStatus])).toEqual([
    ["بن علي أمال", "ASSIGNED"],
    ["قاسمي نادية", "REMOVED"],
  ]);
});
