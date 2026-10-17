import { afterEach, beforeEach, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countCallsTomorrow } from "./alert-counts";
import { listCallsForDay, recordVisitCall } from "./calls";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** A building contract whose first visit is Tuesday 13 October: its client is called on Monday 12. */
async function contracted() {
  const site = await test.rows.insert("Site", { division: "BUILDING", commonName: "عمارة النور" });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "BUILDING",
    serviceType: "CONTRACT",
    formKind: "BUILDING_CONTRACT",
    stage: "CONTRACTED",
    executionDays: JSON.stringify(["SUN", "TUE"]),
    period: "MORNING",
    arrivalTime: localTime("08:00"),
    departureTime: localTime("12:00"),
    startDate: localDate("2026-10-13"),
    endDate: localDate("2026-11-30"),
    workersCount: 1,
  } as never);
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
  return { file, clientId: site.clientId };
}

it("records each call's result, sets «client informed» once and logs it, and empties the tile (F-16b)", async () => {
  const { clientId } = await contracted();
  const [line] = await test.transact((ex, ctx) => listCallsForDay(ex, ctx, { visitsDate: "2026-10-13" }));
  expect(line).toMatchObject({ purpose: "REMINDER", lastCall: null, clientInformedAt: null });
  expect((await test.transact((ex, ctx) => countCallsTomorrow(ex, ctx))).count).toBe(1);

  await test.transact((ex, ctx) =>
    recordVisitCall(ex, ctx, { visitId: line.visitId, purpose: "REMINDER", result: "NO_ANSWER" }),
  );
  expect((await test.transact((ex, ctx) => countCallsTomorrow(ex, ctx))).count).toBe(1);
  const informed = await test.transact((ex, ctx) =>
    recordVisitCall(ex, ctx, {
      visitId: line.visitId,
      purpose: "REMINDER",
      result: "INFORMED",
      note: "سيكون الحارس هناك",
    }),
  );
  expect(informed.clientInformedAt).toBe("2026-10-12T08:00:00.000Z");
  expect((await test.transact((ex, ctx) => countCallsTomorrow(ex, ctx))).count).toBe(0);

  const [after] = await test.transact((ex, ctx) => listCallsForDay(ex, ctx, { visitsDate: "2026-10-13" }));
  expect(after).toMatchObject({
    calls: 2,
    lastCall: { result: "INFORMED" },
    clientInformedAt: "2026-10-12T08:00:00.000Z",
  });
  const entries = await test.db
    .selectFrom("AuditLog")
    .select(["subjectKind", "subjectId", "changes"])
    .where("entity", "=", "Visit")
    .where("entityId", "=", line.visitId)
    .where("operation", "=", "CHANGE")
    .execute();
  expect(entries).toHaveLength(2);
  expect(entries.every((entry) => entry.subjectKind === "CLIENT" && entry.subjectId === clientId)).toBe(true);
  expect(JSON.parse(entries[1].changes ?? "{}")).toMatchObject({
    clientInformedAt: [null, "2026-10-12T08:00:00.000Z"],
  });

  await expect(
    test.transact(
      (ex, ctx) => recordVisitCall(ex, ctx, { visitId: line.visitId, purpose: "REMINDER", result: "INFORMED" }),
      await test.sessionFor("ACCOUNTANT"),
    ),
  ).rejects.toThrow("You do not have permission to do this.");
});
