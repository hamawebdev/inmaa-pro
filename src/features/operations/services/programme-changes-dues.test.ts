import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { updateFutureVisits } from "./programme-changes";

// Money's own tests cover what syncDues does; here only that the update calls it, with the file.
const syncDues = vi.hoisted(() =>
  vi.fn(async (_ex: unknown, _ctx: unknown, _input: { fileId: string }) => ({ created: 0, updated: 0, cancelled: 0 })),
);
vi.mock("@/features/money/services/dues", () => ({ syncDues }));

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  syncDues.mockClear();
});
afterEach(() => test.close());

it("brings Money's dues in line at the end of the update, in its transaction", async () => {
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
    departureTime: localTime("10:00"),
    startDate: localDate("2026-10-12"),
    endDate: localDate("2026-11-30"),
    workersCount: 1,
  } as never);
  await test.transact((ex, ctx) => updateFutureVisits(ex, ctx, { fileId: file.id }));
  expect(syncDues).toHaveBeenCalledTimes(1);
  expect(syncDues.mock.calls[0]?.[2]).toEqual({ fileId: file.id });
});
