import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { cancelVisit, postponeVisit, reopenVisit } from "./visit-status";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** A contract with a standing team of one, its visits made. */
async function arrange() {
  const site = await test.rows.insert("Site", { division: "ORGANISATION" });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    formKind: "ORG_CONTRACT",
    stage: "CONTRACTED",
    executionDays: JSON.stringify(["MON", "WED"]),
    period: "MORNING",
    arrivalTime: localTime("08:00"),
    departureTime: localTime("11:00"),
    startDate: localDate("2026-10-12"),
    endDate: localDate("2026-11-30"),
    workersCount: 1,
  } as never);
  const worker = await test.rows.insert("StaffMember", {
    role: "CLEANER",
    engagementStatus: "ACCEPTED",
    availableDays: JSON.stringify(["SAT", "SUN", "MON", "TUE", "WED", "THU"]),
  } as never);
  await test.rows.insert("FileAssignment", {
    fileId: file.id,
    workerId: worker.id,
    role: "LEADER",
    validFrom: localDate("2026-10-01"),
    sortOrder: 1,
  });
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
  const visit = await test.db
    .selectFrom("Visit")
    .selectAll()
    .where("fileId", "=", file.id)
    .where("visitDate", "=", localDate("2026-10-14"))
    .executeTakeFirstOrThrow();
  return { file, worker, visit };
}

describe("postponeVisit", () => {
  it("postpones a visit and makes its make-up visit with the same team", async () => {
    const { visit, worker } = await arrange();
    const result = await test.transact((ex, ctx) =>
      postponeVisit(ex, ctx, {
        visitId: visit.id,
        reason: "CLIENT_REQUEST",
        note: "العميل مسافر",
        newDate: localDate("2026-10-17"),
      }),
    );
    expect(result.seated).toBe(1);
    const source = await test.db.selectFrom("Visit").selectAll().where("id", "=", visit.id).executeTakeFirstOrThrow();
    expect(source).toMatchObject({ status: "POSTPONED", statusReason: "CLIENT_REQUEST", statusNote: "العميل مسافر" });
    expect(source.rescheduledToVisitId).toBe(result.makeupVisitId);
    const makeup = await test.db
      .selectFrom("Visit")
      .selectAll()
      .where("id", "=", result.makeupVisitId as string)
      .executeTakeFirstOrThrow();
    expect(makeup).toMatchObject({
      origin: "MAKEUP",
      sourceVisitId: visit.id,
      visitDate: "2026-10-17",
      status: "AWAITING_CONFIRMATION", // the new date is confirmed with the client
    });
    const seats = await test.db.selectFrom("VisitWorker").select("workerId").where("visitId", "=", makeup.id).execute();
    expect(seats).toEqual([{ workerId: worker.id }]);
  });

  it("keeps the team when the visit moves to a later hour the same day (OPS-06)", async () => {
    const { visit, worker } = await arrange();
    const result = await test.transact((ex, ctx) =>
      postponeVisit(ex, ctx, {
        visitId: visit.id,
        reason: "CLIENT_REQUEST",
        note: "العميل يطلب التاسعة",
        newDate: localDate("2026-10-14"),
        newStartTime: localTime("09:00"),
      }),
    );
    expect(result.seated).toBe(1);
    const seats = await test.db
      .selectFrom("VisitWorker")
      .select(["workerId", "seatStatus"])
      .where("visitId", "=", result.makeupVisitId as string)
      .execute();
    expect(seats).toEqual([{ workerId: worker.id, seatStatus: "ASSIGNED" }]);
  });

  it("asks why, and refuses a visit already done", async () => {
    const { visit } = await arrange();
    await expect(
      test.transact((ex, ctx) => postponeVisit(ex, ctx, { visitId: visit.id, reason: "OTHER", note: " " })),
    ).rejects.toThrow("Write why.");
    await test.raw.exec(`UPDATE "Visit" SET "status" = 'DONE' WHERE "id" = '${visit.id}'`);
    await expect(
      test.transact((ex, ctx) => cancelVisit(ex, ctx, { visitId: visit.id, reason: "OTHER", note: "خطأ" })),
    ).rejects.toThrow("Only a visit still to happen can be postponed or cancelled.");
  });
});

describe("cancelVisit and reopenVisit", () => {
  it("cancels with the reason, logs it, and the manager opens it again", async () => {
    const { visit } = await arrange();
    await test.transact((ex, ctx) =>
      cancelVisit(ex, ctx, { visitId: visit.id, reason: "ACCESS_BLOCKED", note: "الباب مغلق" }),
    );
    const cancelled = await test.db
      .selectFrom("Visit")
      .selectAll()
      .where("id", "=", visit.id)
      .executeTakeFirstOrThrow();
    expect(cancelled).toMatchObject({ status: "CANCELLED", statusReason: "ACCESS_BLOCKED" });
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("entity", "=", "Visit")
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ action: "CANCEL", reason: "الباب مغلق" });

    const supervisor = await test.sessionFor("SUPERVISOR");
    await expect(
      test.transact((ex, ctx) => reopenVisit(ex, ctx, { visitId: visit.id, reason: "خطأ" }), supervisor),
    ).rejects.toThrow("You do not have permission to do this.");
    const reopened = await test.transact((ex, ctx) =>
      reopenVisit(ex, ctx, { visitId: visit.id, reason: "خطأ في الإلغاء" }),
    );
    expect(reopened.status).toBe("CONFIRMED");
  });
});
