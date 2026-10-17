import { afterEach, beforeEach, expect, it } from "vitest";

import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getInitialVisitOffer, planInitialVisit } from "./initial-visit";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function contractWithQuote(initialJob: boolean) {
  const site = await test.rows.insert("Site", { division: "ORGANISATION" });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    formKind: "ORG_CONTRACT",
    stage: "CONTRACTED",
    arrivalTime: localTime("08:00"),
    departureTime: localTime("11:00"),
    startDate: localDate("2026-10-19"),
    endDate: localDate("2026-12-31"),
    workersCount: 2,
  } as never);
  const quote = await test.rows.insert("Quote", { fileId: file.id, result: "ACCEPTED" } as never);
  await test.rows.insert("QuoteLine", { quoteId: quote.id, kind: "PERIODIC", amount: 5_000_000 } as never);
  if (initialJob)
    await test.rows.insert("QuoteLine", { quoteId: quote.id, kind: "INITIAL_JOB", amount: 2_000_000 } as never);
  return file;
}

it("plans the first deep clean once, when the accepted quote sells it (OPS-08)", async () => {
  const file = await contractWithQuote(true);
  expect(await test.transact((ex, ctx) => getInitialVisitOffer(ex, ctx, { fileId: file.id }))).toMatchObject({
    offered: true,
    visit: null,
    startTime: "08:00",
    workersNeeded: 2,
  });
  const { visitId } = await test.transact((ex, ctx) =>
    planInitialVisit(ex, ctx, { fileId: file.id, date: "2026-10-17", durationMin: 300 }),
  );
  const visit = await test.db.selectFrom("Visit").selectAll().where("id", "=", visitId).executeTakeFirstOrThrow();
  expect(visit).toMatchObject({
    origin: "INITIAL",
    visitDate: "2026-10-17",
    plannedStartTime: "08:00",
    plannedDurationMin: 300,
    workersNeeded: 2,
    status: "AWAITING_CONFIRMATION",
    fileSlotId: null,
  });
  await expect(
    test.transact((ex, ctx) => planInitialVisit(ex, ctx, { fileId: file.id, date: "2026-10-18" })),
  ).rejects.toThrow("The first deep clean is already planned.");
});

it("offers nothing when the quote holds no first deep clean (OPS-08)", async () => {
  const file = await contractWithQuote(false);
  expect((await test.transact((ex, ctx) => getInitialVisitOffer(ex, ctx, { fileId: file.id }))).offered).toBe(false);
  await expect(
    test.transact((ex, ctx) => planInitialVisit(ex, ctx, { fileId: file.id, date: "2026-10-17" })),
  ).rejects.toThrow("This contract's accepted quote holds no first deep clean.");
});
