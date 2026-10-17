import { afterEach, beforeEach, expect, it } from "vitest";

import { contractedFile, da } from "@/features/money/testing/fixtures";
import { syncDues } from "@/features/money/services/dues";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getInitialVisitOffer, planInitialVisit } from "./initial-visit";
import { cancelVisit } from "./visit-status";
import { moveVisit } from "./week-programme";

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

it("tells Money when the first deep clean is planned, moved or cancelled, so that its due follows the visit (OPS-08)", async () => {
  // A contract Money can bill: 45 000,00 a month from 1 November, «تاريخ تسديد» 30 November; the quote adds a
  // first deep clean of 32 000,00.
  const file = await contractedFile(test, { arrivalTime: "08:00", departureTime: "11:00", workersCount: 2 });
  const quote = await test.rows.insert("Quote", { fileId: file.id, result: "ACCEPTED", total: da(77_000) } as never);
  await test.rows.insert("QuoteLine", { quoteId: quote.id, kind: "INITIAL_JOB", amount: da(32_000) } as never);
  await test.rows.insert("QuoteLine", { quoteId: quote.id, kind: "PERIODIC", amount: da(45_000) } as never);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  const initialDue = () =>
    test.db
      .selectFrom("PaymentDue")
      .select(["periodStart", "dueDate", "expectedAmount"])
      .where("fileId", "=", file.id)
      .where("kind", "=", "INITIAL_JOB")
      .where("cancelledAt", "is", null)
      .executeTakeFirstOrThrow();
  // Not planned yet: the contract's first day.
  expect(await initialDue()).toMatchObject({ periodStart: "2026-11-01", expectedAmount: da(32_000) });

  const { visitId } = await test.transact((ex, ctx) =>
    planInitialVisit(ex, ctx, { fileId: file.id, date: "2026-10-26" }),
  );
  expect(await initialDue()).toMatchObject({ periodStart: "2026-10-26", dueDate: "2026-11-30" });

  await test.transact((ex, ctx) => moveVisit(ex, ctx, { visitId, date: "2026-12-05", startTime: "08:00" }));
  expect(await initialDue()).toMatchObject({ periodStart: "2026-12-05", dueDate: "2026-12-05" });

  await test.transact((ex, ctx) => cancelVisit(ex, ctx, { visitId, reason: "CLIENT_REQUEST", note: "يؤجل العميل" }));
  expect(await initialDue()).toMatchObject({ periodStart: "2026-11-01", dueDate: "2026-11-30" });
});
