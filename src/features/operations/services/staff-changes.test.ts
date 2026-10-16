import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

type Row = Record<string, unknown>;

const supervisor = (name: string) =>
  test.rows.insert("StaffMember", { kind: "EMPLOYEE", firstName: name, sex: "FEMALE" } as never);
const worker = (name: string, role = "CLEANER") =>
  test.rows.insert("StaffMember", { firstName: name, role, engagementStatus: "ACCEPTED", sex: "FEMALE" } as never);

/**
 * An organisation contract for November 2026 (Saturday, Monday, Wednesday,
 * 08:00 to 11:00, two workers) in the zone of أم البواقي, with its standing
 * team of two: every visit is «مؤكدة».
 */
async function contracted() {
  const zone = await test.rows.insert("Zone", { name: "أم البواقي" });
  const zoneSupervisor = await supervisor("سميرة");
  await test.rows.insert("SupervisorAssignment", {
    supervisorEmployeeId: zoneSupervisor.id,
    zoneId: zone.id,
    fromDate: localDate("2026-01-01"),
  });
  const site = await test.rows.insert("Site", {
    division: "ORGANISATION",
    zoneId: zone.id,
    commonName: "مكتب المحامي",
  });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    formKind: "ORG_CONTRACT",
    stage: "CONTRACTED",
    executionDays: JSON.stringify(["SAT", "MON", "WED"]),
    arrivalTime: localTime("08:00"),
    departureTime: localTime("11:00"),
    startDate: localDate("2026-11-01"),
    endDate: localDate("2026-11-30"),
    workersCount: 2,
  } as never);
  const leader = await worker("أمال", "TEAM_LEADER");
  const member = await worker("نادية");
  for (const [sortOrder, [workerId, role]] of [
    [leader.id, "LEADER"],
    [member.id, "MEMBER"],
  ].entries()) {
    await test.rows.insert("FileAssignment", {
      fileId: file.id,
      workerId,
      role,
      validFrom: localDate("2026-11-01"),
      sortOrder,
    });
  }
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
  return { zone, zoneSupervisor, site, file, leader, member };
}

const visitsOf = (fileId: string) =>
  test.db.selectFrom("Visit").selectAll().where("fileId", "=", fileId).orderBy("visitDate").execute();
const setVisit = (fileId: string, date: string, values: Row) =>
  test.db
    .updateTable("Visit")
    .set(values)
    .where("fileId", "=", fileId)
    .where("visitDate", "=", localDate(date))
    .execute();
const seatsOf = (workerId: string) =>
  test.db
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .select(["Visit.visitDate", "Visit.status", "VisitWorker.seatStatus", "VisitWorker.replacementReason"])
    .where("VisitWorker.workerId", "=", workerId)
    .orderBy("Visit.visitDate")
    .execute();
const logsBy = (entity: string) =>
  test.db
    .selectFrom("AuditLog")
    .selectAll()
    .where("ownerCode", "=", "OPERATIONS")
    .where("entity", "=", entity)
    .orderBy("chainSeq")
    .execute();

describe("site.changed", () => {
  it("re-stamps the site's visits still to come with its zone and that zone's supervisor of the day", async () => {
    const { site, file, zone, zoneSupervisor } = await contracted();
    const other = await test.rows.insert("Zone", { name: "عين البيضاء" });
    const untilMid = await supervisor("ليلى");
    const fromMid = await supervisor("فريدة");
    await test.rows.insert("SupervisorAssignment", {
      supervisorEmployeeId: untilMid.id,
      zoneId: other.id,
      fromDate: localDate("2026-01-01"),
      toDate: localDate("2026-11-15"),
    });
    await test.rows.insert("SupervisorAssignment", {
      supervisorEmployeeId: fromMid.id,
      zoneId: other.id,
      fromDate: localDate("2026-11-16"),
    });

    // Tuesday 10 November: Wednesday the 11th's order is printed; the 30th was cancelled by the client.
    test.clock.set("2026-11-10T08:00:00.000Z");
    await setVisit(file.id, "2026-11-11", { orderPrintedAt: "2026-11-10T07:00:00.000Z", orderPrintCount: 1 });
    await setVisit(file.id, "2026-11-30", { status: "CANCELLED", statusReason: "CLIENT_REQUEST" });
    await test.db.updateTable("Site").set({ zoneId: other.id }).where("id", "=", site.id).execute();
    await test.transact((ex, ctx) =>
      emit(ex, ctx, "site.changed", { siteId: site.id, zoneChanged: true, profileChanged: false }),
    );

    const stamps = (await visitsOf(file.id)).map((visit) => [
      visit.visitDate,
      visit.zoneId,
      visit.supervisorEmployeeId,
      visit.planChangedAt,
    ]);
    const was = [zone.id, zoneSupervisor.id, null];
    expect(stamps).toEqual([
      ["2026-11-02", ...was],
      ["2026-11-04", ...was],
      ["2026-11-07", ...was],
      ["2026-11-09", ...was],
      ["2026-11-11", zone.id, zoneSupervisor.id, "2026-11-10T08:00:00.000Z"],
      ["2026-11-14", other.id, untilMid.id, null],
      ["2026-11-16", other.id, fromMid.id, null],
      ["2026-11-18", other.id, fromMid.id, null],
      ["2026-11-21", other.id, fromMid.id, null],
      ["2026-11-23", other.id, fromMid.id, null],
      ["2026-11-25", other.id, fromMid.id, null],
      ["2026-11-28", other.id, fromMid.id, null],
      ["2026-11-30", ...was],
    ]);
    expect(await logsBy("Site")).toHaveLength(1);

    // Only the office block changed later: the printed order is out of date again; nothing else moves.
    test.clock.advance({ hours: 2 });
    await test.transact((ex, ctx) =>
      emit(ex, ctx, "site.changed", { siteId: site.id, zoneChanged: false, profileChanged: true }),
    );
    const printed = (await visitsOf(file.id)).find((visit) => visit.visitDate === "2026-11-11")!;
    expect(printed.planChangedAt).toBe("2026-11-10T10:00:00.000Z");
    expect(await logsBy("Site")).toHaveLength(2);
  });

  it("writes nothing for a site without visits to come", async () => {
    const site = await test.rows.insert("Site", {});
    await test.transact((ex, ctx) =>
      emit(ex, ctx, "site.changed", { siteId: site.id, zoneChanged: true, profileChanged: true }),
    );
    await test.transact((ex, ctx) =>
      emit(ex, ctx, "site.changed", { siteId: "nothing", zoneChanged: true, profileChanged: true }),
    );
    expect(await logsBy("Site")).toHaveLength(0);
  });
});

describe("staff.unavailable", () => {
  it("takes back the seats of a worker who left, ends her teams and her supervisor, and logs each erased assignment (LOG-X1)", async () => {
    const { file, leader, member } = await contracted();
    await setVisit(file.id, "2026-11-16", { orderPrintedAt: "2026-10-12T07:00:00.000Z", orderPrintCount: 1 });
    // A file team she was to join in December, her team of the week, her own supervisor.
    const later = await test.rows.make("File");
    const notStarted = await test.rows.insert("FileAssignment", {
      fileId: later.id,
      workerId: member.id,
      role: "MEMBER",
      validFrom: localDate("2026-12-01"),
      sortOrder: 0,
    });
    const team = await test.rows.insert("Team", {});
    const membership = await test.rows.insert("TeamMember", {
      teamId: team.id,
      workerId: member.id,
      fromDate: localDate("2026-10-01"),
    });
    const ownSupervisor = await supervisor("سعاد");
    const supervision = await test.rows.insert("SupervisorAssignment", {
      supervisorEmployeeId: ownSupervisor.id,
      workerId: member.id,
      fromDate: localDate("2026-10-01"),
    });
    const before = (await logsBy("StaffMember")).length;

    await test.transact((ex, ctx) =>
      emit(ex, ctx, "staff.unavailable", {
        workerId: member.id,
        fromDate: localDate("2026-11-16"),
        toDate: null,
        cause: "LEFT",
        reason: "استقالة مكتوبة بتاريخ 2026-10-11",
      }),
    );

    const seats = await seatsOf(member.id);
    expect(seats.filter((seat) => seat.visitDate < "2026-11-16")).toEqual(
      ["2026-11-02", "2026-11-04", "2026-11-07", "2026-11-09", "2026-11-11", "2026-11-14"].map((visitDate) => ({
        visitDate,
        status: "CONFIRMED",
        seatStatus: "ASSIGNED",
        replacementReason: null,
      })),
    );
    expect(seats.filter((seat) => seat.visitDate >= "2026-11-16")).toEqual(
      ["2026-11-16", "2026-11-18", "2026-11-21", "2026-11-23", "2026-11-25", "2026-11-28", "2026-11-30"].map(
        (visitDate) => ({
          visitDate,
          status: "AWAITING_CONFIRMATION",
          seatStatus: "REMOVED",
          replacementReason: "WORKER_LEFT",
        }),
      ),
    );
    expect((await seatsOf(leader.id)).every((seat) => seat.seatStatus === "ASSIGNED")).toBe(true);
    const visits = await visitsOf(file.id);
    expect(visits.find((visit) => visit.visitDate === "2026-11-16")?.planChangedAt).toBe("2026-10-12T08:00:00.000Z");
    expect(visits.find((visit) => visit.visitDate === "2026-11-18")?.planChangedAt).toBeNull();

    const assignments = await test.db
      .selectFrom("FileAssignment")
      .select(["id", "fileId", "validTo", "deletedAt"])
      .where("workerId", "=", member.id)
      .execute();
    expect(assignments.find((row) => row.fileId === file.id)).toMatchObject({ validTo: "2026-11-15", deletedAt: null });
    expect(assignments.find((row) => row.id === notStarted.id)).toMatchObject({
      validTo: null,
      deletedAt: "2026-10-12T08:00:00.000Z",
    });
    const erased = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("operation", "=", "ERASE")
      .where("entity", "=", "FileAssignment")
      .execute();
    expect(erased).toEqual([
      expect.objectContaining({
        action: "SOFT_DELETE",
        entityId: notStarted.id,
        subjectKind: "WORKER",
        subjectId: member.id,
        reason: "استقالة مكتوبة بتاريخ 2026-10-11",
      }),
    ]);
    expect(
      (
        await test.db
          .selectFrom("TeamMember")
          .select("toDate")
          .where("id", "=", membership.id)
          .executeTakeFirstOrThrow()
      ).toDate,
    ).toBe("2026-11-15");
    expect(
      (
        await test.db
          .selectFrom("SupervisorAssignment")
          .select("toDate")
          .where("id", "=", supervision.id)
          .executeTakeFirstOrThrow()
      ).toDate,
    ).toBe("2026-11-15");

    // One entry of the handler's own, about her; each visit's return to «بانتظار التأكيد» is logged with it.
    const entries = await logsBy("StaffMember");
    expect(entries).toHaveLength(before + 1);
    expect(entries[entries.length - 1]).toMatchObject({
      operation: "CHANGE",
      entityId: member.id,
      subjectKind: "WORKER",
      subjectId: member.id,
    });
  });

  it("takes back only the seats inside a sanction's dates, and lifting it writes nothing", async () => {
    const { file, member } = await contracted();
    await test.transact((ex, ctx) =>
      emit(ex, ctx, "staff.unavailable", {
        workerId: member.id,
        fromDate: localDate("2026-11-09"),
        toDate: localDate("2026-11-14"),
        cause: "SANCTION_SET",
        reason: "استقالة مكتوبة بتاريخ 2026-10-11",
      }),
    );
    const removed = (await seatsOf(member.id)).filter((seat) => seat.seatStatus === "REMOVED");
    expect(removed.map((seat) => [seat.visitDate, seat.replacementReason])).toEqual([
      ["2026-11-09", "SANCTION"],
      ["2026-11-11", "SANCTION"],
      ["2026-11-14", "SANCTION"],
    ]);
    const statuses = (await visitsOf(file.id)).map((visit) => [visit.visitDate, visit.status]);
    expect(statuses.filter(([, status]) => status === "AWAITING_CONFIRMATION").map(([date]) => date)).toEqual([
      "2026-11-09",
      "2026-11-11",
      "2026-11-14",
    ]);
    const assignment = await test.db
      .selectFrom("FileAssignment")
      .select(["validTo", "deletedAt"])
      .where("workerId", "=", member.id)
      .executeTakeFirstOrThrow();
    expect(assignment).toEqual({ validTo: null, deletedAt: null });

    const seats = await seatsOf(member.id);
    const logged = (await test.db.selectFrom("AuditLog").select("id").execute()).length;
    await test.transact((ex, ctx) =>
      emit(ex, ctx, "staff.unavailable", {
        workerId: member.id,
        fromDate: localDate("2026-10-12"),
        toDate: null,
        cause: "SANCTION_LIFTED",
        reason: "استقالة مكتوبة بتاريخ 2026-10-11",
      }),
    );
    expect(await seatsOf(member.id)).toEqual(seats);
    expect((await test.db.selectFrom("AuditLog").select("id").execute()).length).toBe(logged);
  });
});
