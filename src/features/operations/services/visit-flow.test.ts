import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { entryValuesOf } from "../components/visit-entry/visit-entry-data";
import type { ReturnedOrderValues } from "../validators/returned-order";
import { listDayBoard } from "./board";
import { getMissionOrder, recordOrderPrinted } from "./mission-order";
import { getVisitEntry, lateMinutes, reportArrival, saveReturnedOrder, workedMinutes } from "./visit-entry";

/**
 * The path a visit takes in Operations, on one database: a contract reaches
 * «متعاقد» and its visits exist; the board shows the day; the mission order
 * prints from what is stored; the returned order is typed in and the visit is
 * signed off.
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function contractedFileWithTeam() {
  const zone = await test.rows.insert("Zone", { name: "أم البواقي" });
  const supervisor = await test.rows.insert("StaffMember", {
    kind: "EMPLOYEE",
    firstName: "سميرة",
    lastName: "حداد",
    sex: "FEMALE",
  } as never);
  await test.rows.insert("SupervisorAssignment", {
    supervisorEmployeeId: supervisor.id,
    zoneId: zone.id,
    fromDate: localDate("2026-01-01"),
  });
  const site = await test.rows.insert("Site", {
    division: "ORGANISATION",
    zoneId: zone.id,
    commonName: "مكتب المحامي بن صالح",
    address: "حي 500 مسكن",
    receiverName: "ليلى حمدي",
    receiverPhone: "0661203142",
  });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    formKind: "ORG_CONTRACT",
    stage: "CONTRACTED",
    executionDays: JSON.stringify(["SAT", "MON", "WED"]),
    period: "MORNING",
    arrivalTime: localTime("08:00"),
    departureTime: localTime("11:00"),
    startDate: localDate("2026-11-01"),
    endDate: localDate("2026-11-30"),
    workersCount: 2,
    visitsPerWeek: 3,
    teamAccess: JSON.stringify(["VIA_GUARD"]),
    hasGuard: 1,
    guardName: "عمار",
    materialsBearer: "CENTRE",
  } as never);
  for (const [sortOrder, code] of ["FLOORS", "WINDOWS"].entries()) {
    await test.rows.insert("FileService", { fileId: file.id, list: "PROVIDED", code, sortOrder });
  }
  const leader = await test.rows.insert("StaffMember", {
    firstName: "أمال",
    lastName: "بن علي",
    role: "TEAM_LEADER",
    engagementStatus: "ACCEPTED",
  } as never);
  const member = await test.rows.insert("StaffMember", {
    firstName: "نادية",
    lastName: "قاسمي",
    role: "CLEANER",
    engagementStatus: "ACCEPTED",
  } as never);
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
  const visit = await test.db
    .selectFrom("Visit")
    .selectAll()
    .where("fileId", "=", file.id)
    .where("visitDate", "=", localDate("2026-11-02"))
    .executeTakeFirstOrThrow();
  return { file, visit, leader, member, supervisor };
}

/** The sheet as it came back: both present and initialled, everything done, the client satisfied. */
async function completeValues(visitId: string): Promise<ReturnedOrderValues> {
  const data = await test.transact((ex, ctx) => getVisitEntry(ex, ctx, { visitId }));
  const values = entryValuesOf(data, "2026-11-02");
  return {
    ...values,
    workers: values.workers.map((worker, index) => ({
      ...worker,
      attended: true,
      arrivedTime: index === 0 ? "08:05" : "07:55",
      workStartTime: "08:10",
      workEndTime: "11:00",
      leftTime: "11:10",
      arrivalInitialled: true,
      departureInitialled: true,
      lateReason: index === 0 ? "زحمة" : "",
    })),
    checklist: values.checklist.map((line) => ({ ...line, done: true })),
    problemOnSite: false,
    completion: "FULL",
    completionPercent: 100,
    needsExtraVisit: false,
    needsSupervisor: false,
    signoffStatus: "ACCEPTED",
    signoffName: "ليلى حمدي",
    signoffRole: "الكاتبة",
    signoffDate: "2026-11-02",
    ratings: { quality: 5, punctuality: 4, behaviour: 5, materials: 4, overall: 5 },
    wouldRecommend: true,
    signedOnPaper: true,
    workerSigned: true,
  };
}

describe("the day board", () => {
  it("lists the day's visits with their team, zone and service", async () => {
    const { visit } = await contractedFileWithTeam();
    const rows = await test.transact((ex, ctx) => listDayBoard(ex, ctx, { date: localDate("2026-11-02") }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      visit: { id: visit.id, status: "CONFIRMED", plannedStartTime: "08:00", arrivalReportedAt: null },
      site: { commonName: "مكتب المحامي بن صالح" },
      zone: { name: "أم البواقي" },
      team: [
        { firstName: "أمال", lastName: "بن علي" },
        { firstName: "نادية", lastName: "قاسمي" },
      ],
      arrivalTyped: false,
      services: [
        { list: "PROVIDED", code: "FLOORS", customLabel: null },
        { list: "PROVIDED", code: "WINDOWS", customLabel: null },
      ],
    });
  });
});

describe("the mission order", () => {
  it("prints from what is stored, with no amount, and printing freezes the lines and is logged", async () => {
    const { visit } = await contractedFileWithTeam();
    const order = await test.transact((ex, ctx) => getMissionOrder(ex, ctx, { visitId: visit.id }));
    expect(order).toMatchObject({
      division: "ORGANISATION",
      number: visit.number,
      visitDate: "2026-11-02",
      startTime: "08:00",
      endTime: "11:00",
      site: { label: "مكتب المحامي بن صالح", address: "حي 500 مسكن" },
      contact: { name: "ليلى حمدي", phone: "0661 20 31 42" },
      access: { ways: ["VIA_GUARD"], guardName: "عمار" },
      supervisor: { name: "حداد سميرة" },
      materialsBy: "CENTRE",
      returned: null,
    });
    expect(order.team.map((worker) => [worker.name, worker.role])).toEqual([
      ["بن علي أمال", "TEAM_LEADER"],
      ["قاسمي نادية", "CLEANER"],
    ]);
    expect(order.taskGroups).toEqual([
      {
        place: null,
        tasks: [
          { label: "تنظيف الأرضيات", frequency: "DAILY", carried: false, done: null },
          { label: "تنظيف النوافذ", frequency: "DAILY", carried: false, done: null },
        ],
      },
    ]);
    expect(JSON.stringify(order)).not.toMatch(/amount|price/i);

    const printed = await test.transact((ex, ctx) => recordOrderPrinted(ex, ctx, { visitId: visit.id }));
    expect(printed.printCount).toBe(1);
    const after = await test.db.selectFrom("Visit").selectAll().where("id", "=", visit.id).executeTakeFirstOrThrow();
    expect(after.checklistFrozenAt).not.toBeNull();
    expect(after.orderPrintedAt).not.toBeNull();
    const items = await test.db.selectFrom("VisitChecklistItem").selectAll().where("visitId", "=", visit.id).execute();
    expect(items.map((item) => item.kind)).toEqual(["TASK", "TASK", ...Array.from({ length: 8 }, () => "DEPARTURE")]);
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "DISCLOSE", entity: "Visit", entityId: visit.id });

    // A second print keeps the frozen lines.
    await test.transact((ex, ctx) => recordOrderPrinted(ex, ctx, { visitId: visit.id }));
    expect(
      await test.db.selectFrom("VisitChecklistItem").selectAll().where("visitId", "=", visit.id).execute(),
    ).toHaveLength(10);
  });
});

describe("the returned order", () => {
  it("types the sheet in one pass and signs the visit off", async () => {
    const { visit, leader } = await contractedFileWithTeam();
    const values = await completeValues(visit.id);
    const result = await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    expect(result).toEqual({ entryState: "COMPLETE", status: "DONE" });

    const after = await test.db.selectFrom("Visit").selectAll().where("id", "=", visit.id).executeTakeFirstOrThrow();
    expect(after).toMatchObject({ status: "DONE", billable: 1 });
    const seat = await test.db
      .selectFrom("VisitWorker")
      .selectAll()
      .where("visitId", "=", visit.id)
      .where("workerId", "=", leader.id)
      .executeTakeFirstOrThrow();
    expect(seat).toMatchObject({
      arrivedTime: "08:05",
      leftTime: "11:10",
      presenceProof: "BOTH",
      lateMin: 5,
      lateReason: "زحمة",
      workedMin: 170,
      attendanceSource: "ORDER",
    });
    const report = await test.db
      .selectFrom("VisitReport")
      .selectAll()
      .where("visitId", "=", visit.id)
      .executeTakeFirstOrThrow();
    expect(report).toMatchObject({
      entryState: "COMPLETE",
      presenceProof: "BOTH",
      completion: "FULL",
      signoffStatus: "ACCEPTED",
      ratingQuality: 5,
      wouldRecommend: 1,
    });
    const ticks = await test.db
      .selectFrom("VisitChecklistItem")
      .select("done")
      .where("visitId", "=", visit.id)
      .execute();
    expect(ticks.every((tick) => tick.done === 1)).toBe(true);

    // The order prints again with what came back.
    const reprint = await test.transact((ex, ctx) => getMissionOrder(ex, ctx, { visitId: visit.id }));
    expect(reprint.returned?.signoff.status).toBe("ACCEPTED");
    expect(reprint.returned?.departureChecks).toEqual(Array.from({ length: 8 }, () => true));
  });

  it("keeps a partial entry and makes the visit «جارية» once an arrival is typed", async () => {
    const { visit } = await contractedFileWithTeam();
    const data = await test.transact((ex, ctx) => getVisitEntry(ex, ctx, { visitId: visit.id }));
    const values = entryValuesOf(data, "2026-11-02");
    values.workers[0].arrivedTime = "08:00";
    const result = await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    expect(result).toEqual({ entryState: "PARTIAL", status: "IN_PROGRESS" });
  });

  it("asks why when a time already typed is changed", async () => {
    const { visit } = await contractedFileWithTeam();
    const values = await completeValues(visit.id);
    await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    values.workers[0].leftTime = "11:30";
    await expect(test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }))).rejects.toThrow(
      "Say why a time already typed is changed.",
    );
    await test.transact((ex, ctx) =>
      saveReturnedOrder(ex, ctx, { visitId: visit.id, values, correctionReason: "خطأ في النقل من الورقة" }),
    );
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("entity", "=", "Visit")
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry.reason).toBe("خطأ في النقل من الورقة");
  });

  it("records a worker who did not come as absent, and gives the seat back if it was a mistake (LOG-14)", async () => {
    const { visit, member } = await contractedFileWithTeam();
    const values = await completeValues(visit.id);
    const absentIndex = 1;
    values.workers[absentIndex] = {
      ...values.workers[absentIndex],
      attended: false,
      arrivedTime: "",
      workStartTime: "",
      workEndTime: "",
      leftTime: "",
      arrivalInitialled: false,
      departureInitialled: false,
    };
    await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    const seat = await test.db
      .selectFrom("VisitWorker")
      .selectAll()
      .where("visitId", "=", visit.id)
      .where("workerId", "=", member.id)
      .executeTakeFirstOrThrow();
    expect(seat.seatStatus).toBe("ABSENT");
    const absence = await test.db
      .selectFrom("WorkerAbsence")
      .selectAll()
      .where("id", "=", seat.absenceId as string)
      .executeTakeFirstOrThrow();
    expect(absence).toMatchObject({ type: "HOURS", startTime: "08:00", endTime: "11:00", reportedVia: "NO_SHOW" });

    const corrected = await completeValues(visit.id);
    await test.transact((ex, ctx) =>
      saveReturnedOrder(ex, ctx, { visitId: visit.id, values: corrected, correctionReason: "حضرت" }),
    );
    const back = await test.db
      .selectFrom("VisitWorker")
      .selectAll()
      .where("id", "=", seat.id)
      .executeTakeFirstOrThrow();
    expect(back.seatStatus).toBe("ASSIGNED");
    const cancelled = await test.db
      .selectFrom("WorkerAbsence")
      .select("status")
      .where("id", "=", absence.id)
      .executeTakeFirstOrThrow();
    expect(cancelled.status).toBe("CANCELLED");
    // Undoing the no-show is logged on the absence, with the worker and the reason (audit LOG-14).
    const cancel = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("action", "=", "CANCEL")
      .where("entityId", "=", absence.id)
      .executeTakeFirstOrThrow();
    expect(cancel).toMatchObject({ reason: "حضرت", subjectKind: "WORKER", subjectId: member.id });
  });

  it("takes a returned order with a worker absent for a month already paid: its seats are paid late (PEO-03)", async () => {
    const { visit, member } = await contractedFileWithTeam();
    const person = await test.db
      .selectFrom("StaffMember")
      .select(["kind", "branchId"])
      .where("id", "=", member.id)
      .executeTakeFirstOrThrow();
    await test.rows.insert("PayRun", {
      staffKind: person.kind,
      branchId: person.branchId,
      periodType: "MONTHLY",
      periodStart: localDate("2026-11-01"),
      periodEnd: localDate("2026-11-30"),
      status: "CLOSED",
    } as never);
    const values = await completeValues(visit.id);
    values.workers[1] = {
      ...values.workers[1],
      attended: false,
      arrivedTime: "",
      workStartTime: "",
      workEndTime: "",
      leftTime: "",
      arrivalInitialled: false,
      departureInitialled: false,
    };
    await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    const seat = await test.db
      .selectFrom("VisitWorker")
      .select("seatStatus")
      .where("visitId", "=", visit.id)
      .where("workerId", "=", member.id)
      .executeTakeFirstOrThrow();
    expect(seat.seatStatus).toBe("ABSENT");
  });

  it("asks the right and the reason to tick absent a worker whose times are typed (LOG-Y1)", async () => {
    const { visit, member } = await contractedFileWithTeam();
    const values = await completeValues(visit.id);
    await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    const absent = structuredClone(values);
    absent.workers[1] = {
      ...absent.workers[1],
      attended: false,
      arrivedTime: "",
      workStartTime: "",
      workEndTime: "",
      leftTime: "",
      arrivalInitialled: false,
      departureInitialled: false,
    };
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact(
        (ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values: absent, correctionReason: "غابت" }),
        reception,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values: absent })),
    ).rejects.toThrow("Say why a time already typed is changed.");
    await test.transact((ex, ctx) =>
      saveReturnedOrder(ex, ctx, { visitId: visit.id, values: absent, correctionReason: "غابت فعلاً" }),
    );
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["changes", "reason"])
      .where("entity", "=", "Visit")
      .where("entityId", "=", visit.id)
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    const number = (
      await test.db.selectFrom("StaffMember").select("number").where("id", "=", member.id).executeTakeFirstOrThrow()
    ).number;
    expect(entry.reason).toBe("غابت فعلاً");
    expect(JSON.parse(entry.changes ?? "{}")).toMatchObject({
      [`${number}.seatStatus`]: ["ASSIGNED", "ABSENT"],
      [`${number}.arrivedTime`]: [values.workers[1].arrivedTime, null],
    });
  });

  it("makes the visit «مشكلة» when the work was not done, and files the problems ticked; a tick taken off is soft-deleted (LOG-14)", async () => {
    const { visit } = await contractedFileWithTeam();
    const values: ReturnedOrderValues = {
      ...(await completeValues(visit.id)),
      completion: "NOT_DONE",
      completionPercent: 0,
      incompleteReason: "الباب مغلق",
      problemOnSite: true,
      problemKinds: ["AREA_UNAVAILABLE", "OBSTACLE"],
      problemDetails: "لم يُفتح المكتب",
    };
    const result = await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    expect(result.status).toBe("PROBLEM");
    const after = await test.db.selectFrom("Visit").selectAll().where("id", "=", visit.id).executeTakeFirstOrThrow();
    expect(after).toMatchObject({ statusReason: "OTHER", statusNote: "الباب مغلق", billable: 0 });
    const problems = await test.db
      .selectFrom("ProblemReport")
      .select(["kind", "details", "status"])
      .where("visitId", "=", visit.id)
      .orderBy("kind")
      .execute();
    expect(problems).toEqual([
      { kind: "AREA_UNAVAILABLE", details: "لم يُفتح المكتب", status: "OPEN" },
      { kind: "OBSTACLE", details: "لم يُفتح المكتب", status: "OPEN" },
    ]);

    // One tick taken back: it needs the reason typed; its report is closed with it, never deleted (audit LOG-14).
    const retyped = { ...values, problemKinds: ["OBSTACLE" as const] };
    await expect(
      test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values: retyped })),
    ).rejects.toThrow("Say why a problem ticked on this order is taken off.");
    await test.transact((ex, ctx) =>
      saveReturnedOrder(ex, ctx, { visitId: visit.id, values: retyped, correctionReason: "علامة خاطئة" }),
    );
    const left = await test.db
      .selectFrom("ProblemReport")
      .select(["kind", "status", "deletedAt", "deletedByUserId"])
      .where("visitId", "=", visit.id)
      .orderBy("kind")
      .execute();
    expect(left).toEqual([
      {
        kind: "AREA_UNAVAILABLE",
        status: "OPEN",
        deletedAt: expect.any(String),
        deletedByUserId: test.manager.userId,
      },
      { kind: "OBSTACLE", status: "OPEN", deletedAt: null, deletedByUserId: null },
    ]);
    const erased = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("operation", "=", "ERASE")
      .where("entity", "=", "ProblemReport")
      .executeTakeFirstOrThrow();
    expect(erased).toMatchObject({ action: "SOFT_DELETE", reason: "علامة خاطئة" });
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["changes", "reason"])
      .where("entity", "=", "Visit")
      .where("entityId", "=", visit.id)
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(entry.reason).toBe("علامة خاطئة");
    expect(JSON.parse(entry.changes ?? "{}")).toMatchObject({ "problems.AREA_UNAVAILABLE": [true, false] });
  });

  it("refuses a cancelled visit", async () => {
    const { visit } = await contractedFileWithTeam();
    const values = await completeValues(visit.id);
    await test.raw.exec(
      `UPDATE "Visit" SET "status" = 'CANCELLED', "statusReason" = 'OTHER' WHERE "id" = '${visit.id}'`,
    );
    await expect(test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }))).rejects.toThrow(
      "A cancelled or postponed visit takes no returned order.",
    );
  });
});

describe("the arrival phoned in", () => {
  it("makes the visit «جارية» and clears the flag", async () => {
    const { visit } = await contractedFileWithTeam();
    await test.transact((ex, ctx) => reportArrival(ex, ctx, { visitId: visit.id, via: "PHONE_SUPERVISOR" }));
    const after = await test.db.selectFrom("Visit").selectAll().where("id", "=", visit.id).executeTakeFirstOrThrow();
    expect(after).toMatchObject({ status: "IN_PROGRESS", arrivalReportedVia: "PHONE_SUPERVISOR" });
    expect(after.arrivalReportedAt).not.toBeNull();
  });
});

describe("minutes from the times on the sheet", () => {
  it("reads an arrival on the day nearest the planned start", () => {
    expect(lateMinutes("08:05", "08:00")).toBe(5);
    expect(lateMinutes("07:50", "08:00")).toBe(0);
    expect(lateMinutes("00:15", "23:00")).toBe(75);
    expect(lateMinutes(null, "08:00")).toBeNull();
  });

  it("counts work from start to end, else from arrival to departure, else nothing (LAB-9)", () => {
    expect(
      workedMinutes({ arrivedTime: "08:00", workStartTime: "08:10", workEndTime: "11:00", leftTime: "11:10" }),
    ).toBe(170);
    expect(workedMinutes({ arrivedTime: "22:00", workStartTime: null, workEndTime: null, leftTime: "02:00" })).toBe(
      240,
    );
    expect(workedMinutes({ arrivedTime: "08:00", workStartTime: null, workEndTime: null, leftTime: null })).toBeNull();
    // An end equal to its start is no time worked, not a whole day (audit LAB-9).
    expect(workedMinutes({ arrivedTime: "08:00", workStartTime: null, workEndTime: null, leftTime: "08:00" })).toBe(0);
    expect(
      workedMinutes({ arrivedTime: "08:00", workStartTime: "09:00", workEndTime: "09:00", leftTime: "11:00" }),
    ).toBe(0);
  });
});
