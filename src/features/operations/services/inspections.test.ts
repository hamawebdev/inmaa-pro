import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Executor, ServiceContext } from "@/lib/service/context";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import type { InspectionResultValues } from "../validators/inspection";
import {
  cancelInspection,
  countInspectionsDue,
  createInspection,
  criterionId,
  ensureInspectionCriteria,
  getInspection,
  getInspectionSheet,
  listInspections,
  markInspectionMissed,
  markMissedInspections,
  planInspections,
  plannedDateIn,
  planPeriods,
  recordInspectionPrinted,
  saveInspectionResult,
} from "./inspections";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

// The test clock stands on Monday 12 October 2026 (weekday 2, Saturday being 0).

async function employee(lastName = "بوزيد", firstName = "كمال") {
  return test.rows.insert("StaffMember", {
    kind: "EMPLOYEE",
    lastName,
    firstName,
    engagementStatus: "ACCEPTED",
  } as never);
}

async function worker(lastName: string, firstName: string) {
  return test.rows.insert("StaffMember", {
    kind: "WORKER",
    lastName,
    firstName,
    engagementStatus: "ACCEPTED",
  } as never);
}

/** A contracted file in a zone with a supervisor, its plan, and visits on the dates given (each with a team). */
async function contractFile(options: {
  division?: string;
  frequency?: "WEEKLY" | "MONTHLY" | "NONE";
  dayOfWeek?: number | null;
  startDate?: string;
  endDate?: string;
  visitDates?: readonly string[];
  team?: readonly { id: string }[];
  zoneSupervisorId?: string;
  planSupervisorId?: string | null;
  stage?: string;
}) {
  const zone = await test.rows.insert("Zone", { name: `منطقة ${Math.random()}` });
  const division = options.division ?? "BUILDING";
  const site = await test.rows.insert("Site", { division, zoneId: zone.id, commonName: "عمارة النور" } as never);
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division,
    serviceType: "CONTRACT",
    stage: options.stage ?? "CONTRACTED",
    startDate: localDate(options.startDate ?? "2026-10-01"),
    endDate: localDate(options.endDate ?? "2026-12-31"),
    // A contract that ended carries its end.
    ...(options.stage === "CONTRACT_ENDED" ? { endedDate: localDate("2026-10-01") } : {}),
  } as never);
  await test.rows.insert("FileProgramme", {
    fileId: file.id,
    inspectionFrequency: options.frequency ?? "WEEKLY",
    inspectionDayOfWeek: options.dayOfWeek === undefined ? null : options.dayOfWeek,
    inspectionStartDate: localDate(options.startDate ?? "2026-10-01"),
    inspectionSupervisorEmployeeId: options.planSupervisorId ?? null,
  } as never);
  if (options.zoneSupervisorId) {
    await test.rows.insert("SupervisorAssignment", {
      supervisorEmployeeId: options.zoneSupervisorId,
      zoneId: zone.id,
      fromDate: localDate("2026-09-01"),
    } as never);
  }
  const visits = [];
  for (const date of options.visitDates ?? []) {
    const visit = await test.rows.insert("Visit", {
      fileId: file.id,
      zoneId: zone.id,
      visitDate: localDate(date),
      plannedStartTime: localTime("08:00"),
      status: date < "2026-10-12" ? "DONE" : "CONFIRMED",
    } as never);
    for (const member of options.team ?? []) {
      await test.rows.insert("VisitWorker", { visitId: visit.id, workerId: member.id, role: "CLEANER" } as never);
    }
    visits.push(visit);
  }
  return { zone, site, file, visits };
}

const inspectionsOf = (fileId: string) =>
  test.db.selectFrom("Inspection").selectAll().where("fileId", "=", fileId).orderBy("plannedDate").execute();

/** The returned sheet with every point marked `mark` (or as `marks` says), and the team present. */
async function sheetValues(
  inspectionId: string,
  over: Partial<InspectionResultValues> & { marks?: InspectionResultValues["marks"] } = {},
  mark = "9",
): Promise<InspectionResultValues> {
  const detail = await test.transact((ex, ctx) => getInspection(ex, ctx, { inspectionId }));
  return {
    visitId: detail.inspection.visitId ?? "",
    supervisorEmployeeId: detail.inspection.supervisorEmployeeId ?? "",
    doneDate: detail.inspection.plannedDate,
    doneAtTime: "10:30",
    marks: detail.points.map((point) => ({ criterionCode: point.code, score: mark, notApplicable: false, note: "" })),
    workers: detail.workers.map((member) => ({ workerId: member.workerId, present: true, remark: "" })),
    overallLevel: "GOOD",
    correctionNeeded: null,
    recommendedAction: null,
    supervisorNotes: "",
    clientRemark: "",
    ...over,
  };
}

describe("the criteria", () => {
  it("inserts the thirty seeded points once, with fixed ids, and never overwrites an edited one", async () => {
    // First run already seeds them (src/features/operations/seeds.ts): start from a database without seeds.
    test.close();
    test = await createTestDatabase({ seeds: false });
    expect(await test.db.selectFrom("InspectionCriterion").select("id").execute()).toEqual([]);
    const first = await test.transact((ex, ctx) => ensureInspectionCriteria(ex, ctx));
    expect(first.inserted).toBe(30);
    const rows = await test.db.selectFrom("InspectionCriterion").selectAll().execute();
    const count = (division: string) => rows.filter((row) => row.division === division).length;
    expect([count("HOUSING"), count("ORGANISATION"), count("BUILDING"), count("COMPLEX")]).toEqual([7, 7, 8, 8]);
    expect(rows.find((row) => row.id === criterionId("BUILDING", "STAIRS"))).toMatchObject({
      labelAr: "السلالم",
      labelFr: "Escaliers",
      sortOrder: 2,
      weight: 1,
      isActive: 1,
    });

    await test.db
      .updateTable("InspectionCriterion")
      .set({ labelAr: "الأرضيات والبلاط", weight: 2 })
      .where("id", "=", criterionId("HOUSING", "FLOORS"))
      .execute();
    const again = await test.transact((ex, ctx) => ensureInspectionCriteria(ex, ctx));
    expect(again.inserted).toBe(0);
    const edited = await test.db
      .selectFrom("InspectionCriterion")
      .selectAll()
      .where("id", "=", criterionId("HOUSING", "FLOORS"))
      .executeTakeFirstOrThrow();
    expect(edited).toMatchObject({ labelAr: "الأرضيات والبلاط", weight: 2 });
  });
});

describe("planning", () => {
  it("cuts the calendar into weeks from Saturday or into months", () => {
    expect(planPeriods("WEEKLY", "2026-10-12", "2026-10-25").map((period) => period.key)).toEqual([
      "2026-10-10",
      "2026-10-17",
      "2026-10-24",
    ]);
    expect(planPeriods("MONTHLY", "2026-11-20", "2027-01-03")).toEqual([
      { key: "2026-11", start: "2026-11-01", end: "2026-11-30" },
      { key: "2026-12", start: "2026-12-01", end: "2026-12-31" },
      { key: "2027-01", start: "2027-01-01", end: "2027-01-31" },
    ]);
  });

  it("puts the inspection on the plan's weekday, on a visit when one falls on it", () => {
    const week = ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
    const working = [0, 1, 2, 3, 4, 5];
    expect(plannedDateIn(week, 2, new Set(["2026-10-21"]), working)).toBe("2026-10-19");
    expect(plannedDateIn(week, null, new Set(["2026-10-21"]), working)).toBe("2026-10-21");
    expect(plannedDateIn(week, null, new Set(), working)).toBe("2026-10-17");
    expect(plannedDateIn(["2026-10-23"], null, new Set(), working)).toBeNull();
  });

  it("keeps one planned inspection per week or month of each live file's plan, numbered in date order", async () => {
    const supervisor = await employee();
    const weekly = await contractFile({
      frequency: "WEEKLY",
      dayOfWeek: 2,
      visitDates: ["2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21", "2026-10-26", "2026-11-02"],
      zoneSupervisorId: supervisor.id,
    });
    const monthly = await contractFile({
      frequency: "MONTHLY",
      startDate: "2026-09-01",
      endDate: "2026-11-30",
      visitDates: ["2026-10-14", "2026-10-21", "2026-11-04"],
    });
    const none = await contractFile({ frequency: "NONE", visitDates: ["2026-10-13"] });
    const closed = await contractFile({ frequency: "WEEKLY", stage: "CONTRACT_ENDED", visitDates: ["2026-10-13"] });

    const result = await test.transact((ex, ctx) => planInspections(ex, ctx, { upTo: "2026-11-01" }));
    expect(result.created).toBe(6);

    const ofWeekly = await inspectionsOf(weekly.file.id);
    expect(ofWeekly.map((row) => [row.planPeriod, row.plannedDate, row.status])).toEqual([
      ["2026-10-10", "2026-10-12", "PLANNED"],
      ["2026-10-17", "2026-10-19", "PLANNED"],
      ["2026-10-24", "2026-10-26", "PLANNED"],
      // The week of 31 October is planned whole: its Monday is after the date asked.
      ["2026-10-31", "2026-11-02", "PLANNED"],
    ]);
    expect(ofWeekly.every((row) => row.supervisorEmployeeId === supervisor.id)).toBe(true);
    expect(ofWeekly[0].visitId).toBe(weekly.visits[0].id);

    const ofMonthly = await inspectionsOf(monthly.file.id);
    expect(ofMonthly.map((row) => [row.planPeriod, row.plannedDate])).toEqual([
      ["2026-10", "2026-10-14"],
      ["2026-11", "2026-11-04"],
    ]);
    expect(ofMonthly[0].supervisorEmployeeId).toBeNull();

    expect(await inspectionsOf(none.file.id)).toEqual([]);
    expect(await inspectionsOf(closed.file.id)).toEqual([]);

    // Numbers follow the dates, whichever file.
    const all = await test.db.selectFrom("Inspection").select(["number", "plannedDate"]).orderBy("numberSeq").execute();
    expect(all.map((row) => row.plannedDate)).toEqual([
      "2026-10-12",
      "2026-10-14",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-04",
    ]);
    expect(all[0].number).toBe("0001/2026");

    // Run again: nothing new, even for a week whose inspection was cancelled.
    await test.transact((ex, ctx) => cancelInspection(ex, ctx, { inspectionId: ofWeekly[1].id, reason: "عطلة" }));
    const again = await test.transact((ex, ctx) => planInspections(ex, ctx, { upTo: "2026-11-01" }));
    expect(again.created).toBe(0);
  });

  it("takes the plan's own supervisor first and stops at the contract's end", async () => {
    const zoneSupervisor = await employee("سعدي", "مراد");
    const planSupervisor = await employee("حداد", "سليم");
    const { file } = await contractFile({
      frequency: "WEEKLY",
      endDate: "2026-10-20",
      visitDates: ["2026-10-13", "2026-10-20"],
      zoneSupervisorId: zoneSupervisor.id,
      planSupervisorId: planSupervisor.id,
    });
    await test.transact((ex, ctx) => planInspections(ex, ctx, { upTo: "2026-11-30" }));
    const rows = await inspectionsOf(file.id);
    expect(rows.map((row) => row.plannedDate)).toEqual(["2026-10-13", "2026-10-20"]);
    expect(rows.every((row) => row.supervisorEmployeeId === planSupervisor.id)).toBe(true);
  });

  it("refuses to plan more than a year ahead, and is refused to a reader", async () => {
    await expect(test.transact((ex, ctx) => planInspections(ex, ctx, { upTo: "2027-12-31" }))).rejects.toThrow(
      "Inspections are planned at most a year ahead.",
    );
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => planInspections(ex, ctx, { upTo: "2026-11-01" }), accountant),
    ).rejects.toThrow();
  });
});

describe("one inspection", () => {
  async function inspectedVisit(division = "BUILDING") {
    const supervisor = await employee();
    const samira = await worker("بن علي", "سميرة");
    const nadia = await worker("زروقي", "نادية");
    const setup = await contractFile({
      division,
      frequency: "NONE",
      visitDates: ["2026-10-10", "2026-10-15"],
      team: [samira, nadia],
      zoneSupervisorId: supervisor.id,
    });
    await test.transact((ex, ctx) => ensureInspectionCriteria(ex, ctx));
    const made = await test.transact((ex, ctx) =>
      createInspection(ex, ctx, { fileId: setup.file.id, visitId: setup.visits[0].id }),
    );
    return { ...setup, supervisor, samira, nadia, inspectionId: made.id, number: made.number };
  }

  it("is added by hand on a visit, on its day, with the zone's supervisor", async () => {
    const { inspectionId, number, supervisor, visits } = await inspectedVisit();
    const row = await test.db
      .selectFrom("Inspection")
      .selectAll()
      .where("id", "=", inspectionId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      number,
      status: "PLANNED",
      planPeriod: null,
      plannedDate: "2026-10-10",
      visitId: visits[0].id,
      supervisorEmployeeId: supervisor.id,
    });
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "CHANGE",
      action: "CREATE",
      entity: "Inspection",
      entityId: inspectionId,
    });
  });

  it("is refused on a file that is not contracted, or on another file's visit", async () => {
    const { visits } = await inspectedVisit();
    const other = await contractFile({ frequency: "NONE", stage: "QUOTE" });
    await expect(test.transact((ex, ctx) => createInspection(ex, ctx, { fileId: other.file.id }))).rejects.toThrow(
      "Inspections are made for a contracted file only.",
    );
    const third = await contractFile({ frequency: "NONE" });
    await expect(
      test.transact((ex, ctx) => createInspection(ex, ctx, { fileId: third.file.id, visitId: visits[0].id })),
    ).rejects.toThrow("This visit is not one of this file's visits.");
  });

  it("prints its sheet from what is stored, freezes its points and logs the team it names", async () => {
    const { inspectionId, number, visits, samira, nadia } = await inspectedVisit();
    const sheet = await test.transact((ex, ctx) => getInspectionSheet(ex, ctx, { inspectionId }));
    expect(sheet).toMatchObject({
      division: "BUILDING",
      number,
      plannedDate: "2026-10-10",
      supervisorName: "بوزيد كمال",
      orderNumber: visits[0].number,
      threshold: 80,
      result: null,
    });
    expect(sheet.site.label).toBe("عمارة النور");
    expect(sheet.team.map((member) => member.name)).toEqual(["بن علي سميرة", "زروقي نادية"]);
    expect(sheet.criteria.map((criterion) => criterion.label)).toEqual([
      "الأرضيات",
      "السلالم",
      "الممرات",
      "المصاعد",
      "المداخل",
      "جمع النفايات",
      "الالتزام بالتعليمات",
      "المظهر المهني",
    ]);

    await test.transact((ex, ctx) => recordInspectionPrinted(ex, ctx, { inspectionId }));
    const row = await test.db
      .selectFrom("Inspection")
      .selectAll()
      .where("id", "=", inspectionId)
      .executeTakeFirstOrThrow();
    expect(row.sheetPrintedAt).toBe("2026-10-12T08:00:00.000Z");
    const lines = await test.db
      .selectFrom("InspectionScore")
      .selectAll()
      .where("inspectionId", "=", inspectionId)
      .execute();
    expect(lines).toHaveLength(8);
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "DISCLOSE",
      action: "PRINT",
      entity: "Inspection",
      entityId: inspectionId,
    });
    expect(JSON.parse(entry.context ?? "{}").workers).toEqual([samira.id, nadia.id]);

    // A point renamed after the print: the inspection keeps the words on its paper.
    await test.db
      .updateTable("InspectionCriterion")
      .set({ labelAr: "الدرج" })
      .where("id", "=", criterionId("BUILDING", "STAIRS"))
      .execute();
    const after = await test.transact((ex, ctx) => getInspectionSheet(ex, ctx, { inspectionId }));
    expect(after.criteria[1].label).toBe("السلالم");
  });

  it("typed in above the threshold, is done with its score and leaves no task", async () => {
    const { inspectionId, samira, nadia } = await inspectedVisit();
    const values = await sheetValues(inspectionId, {}, "9");
    values.marks[3] = { ...values.marks[3], score: "", notApplicable: true };
    values.workers[1] = { ...values.workers[1], remark: "ملتزمة بالتعليمات" };
    const saved = await test.transact((ex, ctx) => saveInspectionResult(ex, ctx, { inspectionId, values }));
    expect(saved).toEqual({ total: 90, threshold: 80, belowThreshold: false, correctiveTask: null });

    const row = await test.db
      .selectFrom("Inspection")
      .selectAll()
      .where("id", "=", inspectionId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      status: "DONE",
      doneDate: "2026-10-10",
      doneAtTime: "10:30",
      scoreTotal: 90,
      thresholdUsed: 80,
      belowThreshold: 0,
      overallLevel: "GOOD",
      enteredAt: "2026-10-12T08:00:00.000Z",
    });
    const notes = await test.db
      .selectFrom("InspectionWorkerNote")
      .selectAll()
      .where("inspectionId", "=", inspectionId)
      .orderBy("createdAt")
      .execute();
    expect(notes.map((note) => [note.workerId, note.present, note.remark])).toEqual([
      [samira.id, 1, null],
      [nadia.id, 1, "ملتزمة بالتعليمات"],
    ]);
    const lift = await test.db
      .selectFrom("InspectionScore")
      .selectAll()
      .where("inspectionId", "=", inspectionId)
      .where("criterionCode", "=", "LIFTS")
      .executeTakeFirstOrThrow();
    expect(lift).toMatchObject({ score: null, notApplicable: 1 });
    expect(await test.db.selectFrom("CorrectiveTask").selectAll().execute()).toEqual([]);

    const sheet = await test.transact((ex, ctx) => getInspectionSheet(ex, ctx, { inspectionId }));
    expect(sheet.result).toMatchObject({ doneDate: "2026-10-10", doneTime: "10:30", total: 90, level: "GOOD" });
    expect(sheet.team[1]).toEqual({ name: "زروقي نادية", present: true, remark: "ملتزمة بالتعليمات" });
  });

  it("under the threshold, leaves one corrective task for its supervisor, due by the next visit at the latest", async () => {
    const { inspectionId, supervisor, file, visits } = await inspectedVisit();
    const values = await sheetValues(inspectionId, {}, "7");
    values.marks[0] = { ...values.marks[0], score: "6" };
    values.supervisorNotes = "يعاد تنظيف السلالم";
    const saved = await test.transact((ex, ctx) => saveInspectionResult(ex, ctx, { inspectionId, values }));
    expect(saved.total).toBe(69);
    expect(saved.belowThreshold).toBe(true);
    expect(saved.correctiveTask?.created).toBe(true);

    const task = await test.db.selectFrom("CorrectiveTask").selectAll().executeTakeFirstOrThrow();
    expect(task).toMatchObject({
      source: "INSPECTION",
      inspectionId,
      fileId: file.id,
      visitId: visits[0].id,
      action: "REDO_SERVICE",
      // The file's next visit is on the 15th; two days from today is the 14th, which comes first.
      dueDate: "2026-10-14",
      assignedToEmployeeId: supervisor.id,
      workerId: null,
      status: "OPEN",
    });
    expect(task.description).toContain("درجة الجودة 69 من 100.");
    expect(task.description).toContain("الأرضيات (6 من 10)");
    expect(task.description).toContain("ملاحظات المشرف: يعاد تنظيف السلالم");

    // Typed again: the figures are corrected, the task made stays the only one.
    const corrected = { ...values, marks: values.marks.map((mark) => ({ ...mark, score: "7" })) };
    const again = await test.transact((ex, ctx) => saveInspectionResult(ex, ctx, { inspectionId, values: corrected }));
    expect(again.total).toBe(70);
    expect(again.correctiveTask).toEqual({ id: task.id, created: false });
    expect(await test.db.selectFrom("CorrectiveTask").selectAll().execute()).toHaveLength(1);

    const entries = await test.db
      .selectFrom("AuditLog")
      .select(["action", "entity", "context"])
      .where("entity", "=", "Inspection")
      .orderBy("chainSeq")
      .execute();
    expect(entries.map((entry) => entry.action)).toEqual(["CREATE", "STATUS_CHANGE", "UPDATE"]);
    expect(JSON.parse(entries[1].context ?? "{}").correctiveTaskId).toBe(task.id);
  });

  it("follows the supervisor's own tick and his action, whatever the score", async () => {
    const { inspectionId, samira } = await inspectedVisit();
    const values = await sheetValues(inspectionId, {
      correctionNeeded: true,
      recommendedAction: "TRAIN_WORKER",
    });
    values.workers[1] = { ...values.workers[1], present: false };
    const saved = await test.transact((ex, ctx) => saveInspectionResult(ex, ctx, { inspectionId, values }));
    expect(saved.belowThreshold).toBe(false);
    const task = await test.db.selectFrom("CorrectiveTask").selectAll().executeTakeFirstOrThrow();
    // The only worker present is the one the training is about.
    expect(task).toMatchObject({ action: "TRAIN_WORKER", workerId: samira.id, dueDate: "2026-10-14" });
    const row = await test.db
      .selectFrom("Inspection")
      .selectAll()
      .where("id", "=", inspectionId)
      .executeTakeFirstOrThrow();
    expect(row.correctionNeeded).toBe(1);
  });

  it("proposes training, then a change, when the same worker was under the threshold before", async () => {
    const supervisor = await employee();
    const samira = await worker("بن علي", "سميرة");
    const { file, visits } = await contractFile({
      frequency: "NONE",
      visitDates: ["2026-09-28", "2026-10-03", "2026-10-08"],
      team: [samira],
      zoneSupervisorId: supervisor.id,
    });
    const actions: string[] = [];
    for (const visit of visits) {
      const made = await test.transact((ex, ctx) => createInspection(ex, ctx, { fileId: file.id, visitId: visit.id }));
      const values = await sheetValues(made.id, {}, "5");
      await test.transact((ex, ctx) => saveInspectionResult(ex, ctx, { inspectionId: made.id, values }));
      const task = await test.db
        .selectFrom("CorrectiveTask")
        .selectAll()
        .where("inspectionId", "=", made.id)
        .executeTakeFirstOrThrow();
      actions.push(`${task.action}:${task.workerId === samira.id ? "samira" : "-"}`);
    }
    expect(actions).toEqual(["REDO_SERVICE:-", "TRAIN_WORKER:samira", "CHANGE_WORKER:samira"]);
  });

  it("refuses a sheet with a point left without a mark, a missing supervisor, a date to come or a stranger", async () => {
    const { inspectionId } = await inspectedVisit();
    const values = await sheetValues(inspectionId);
    const save = (over: Partial<InspectionResultValues>) =>
      test.transact((ex, ctx) => saveInspectionResult(ex, ctx, { inspectionId, values: { ...values, ...over } }));

    await expect(
      save({ marks: values.marks.map((mark, index) => (index === 2 ? { ...mark, score: "" } : mark)) }),
    ).rejects.toThrow("Give every point a mark from 0 to 10, or tick does not apply.");
    await expect(save({ supervisorEmployeeId: "" })).rejects.toThrow("Name the supervisor who inspected.");
    await expect(save({ doneDate: "2026-10-13" })).rejects.toThrow("The inspection date cannot be after today.");
    await expect(save({ marks: values.marks.map((mark) => ({ ...mark, score: "11" })) })).rejects.toThrow(
      "This inspection sheet cannot be saved as it is typed.",
    );
    const stranger = await worker("غريب", "عامل");
    await expect(
      save({ workers: [...values.workers, { workerId: stranger.id, present: true, remark: "" }] }),
    ).rejects.toThrow("This worker is not on the visit.");
    const row = await test.db
      .selectFrom("Inspection")
      .selectAll()
      .where("id", "=", inspectionId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("PLANNED");
  });

  it("names another visit inspected, and takes that visit's team", async () => {
    const { inspectionId, visits, samira } = await inspectedVisit();
    const values = await sheetValues(inspectionId, { visitId: visits[1].id });
    await expect(
      test.transact((ex, ctx) =>
        saveInspectionResult(ex, ctx, { inspectionId, values: { ...values, doneDate: "2026-10-12" } }),
      ),
    ).resolves.toMatchObject({ total: 90 });
    const detail = await test.transact((ex, ctx) => getInspection(ex, ctx, { inspectionId }));
    expect(detail.inspection.visitId).toBe(visits[1].id);
    expect(detail.workers[0].workerId).toBe(samira.id);
    expect(detail.visits.map((visit) => visit.id)).toEqual([visits[0].id, visits[1].id]);
  });

  it("is marked missed or cancelled with a reason, and a done one is not cancelled", async () => {
    const { inspectionId, file } = await inspectedVisit();
    await expect(
      test.transact((ex, ctx) => markInspectionMissed(ex, ctx, { inspectionId, reason: "  " })),
    ).rejects.toThrow("A reason is required.");
    await test.transact((ex, ctx) => markInspectionMissed(ex, ctx, { inspectionId, reason: "المشرف في عطلة مرضية" }));
    const missed = await test.db
      .selectFrom("Inspection")
      .selectAll()
      .where("id", "=", inspectionId)
      .executeTakeFirstOrThrow();
    expect(missed.status).toBe("MISSED");
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ action: "STATUS_CHANGE", reason: "المشرف في عطلة مرضية" });

    await test.transact((ex, ctx) => cancelInspection(ex, ctx, { inspectionId, reason: "العميل رفض الزيارة" }));
    const cancelled = await test.db
      .selectFrom("Inspection")
      .selectAll()
      .where("id", "=", inspectionId)
      .executeTakeFirstOrThrow();
    expect(cancelled.status).toBe("CANCELLED");
    await expect(test.transact((ex, ctx) => recordInspectionPrinted(ex, ctx, { inspectionId }))).rejects.toThrow(
      "This inspection is cancelled.",
    );

    const done = await test.transact((ex, ctx) =>
      createInspection(ex, ctx, { fileId: file.id, plannedDate: "2026-10-11" }),
    );
    await test.transact(async (ex: Executor, ctx: ServiceContext) => {
      const values = await sheetValuesIn(ex, ctx, done.id);
      await saveInspectionResult(ex, ctx, { inspectionId: done.id, values });
    });
    await expect(
      test.transact((ex, ctx) => cancelInspection(ex, ctx, { inspectionId: done.id, reason: "خطأ" })),
    ).rejects.toThrow("A done inspection cannot be cancelled.");
  });
});

/** The same as `sheetValues`, inside a transaction already open. */
async function sheetValuesIn(ex: Executor, ctx: ServiceContext, inspectionId: string): Promise<InspectionResultValues> {
  const detail = await getInspection(ex, ctx, { inspectionId });
  const fallback = await ex
    .selectFrom("StaffMember")
    .select("id")
    .where("kind", "=", "EMPLOYEE")
    .executeTakeFirstOrThrow();
  return {
    visitId: detail.inspection.visitId ?? "",
    supervisorEmployeeId: detail.inspection.supervisorEmployeeId ?? fallback.id,
    doneDate: detail.inspection.plannedDate,
    doneAtTime: "",
    marks: detail.points.map((point) => ({ criterionCode: point.code, score: "9", notApplicable: false, note: "" })),
    workers: [],
    overallLevel: null,
    correctionNeeded: null,
    recommendedAction: null,
    supervisorNotes: "",
    clientRemark: "",
  };
}

describe("lists and the day-start job", () => {
  it("lists what is due, counts it for the alert, and marks missed what is a week late", async () => {
    const supervisor = await employee();
    const { file } = await contractFile({ frequency: "NONE", zoneSupervisorId: supervisor.id });
    const add = (plannedDate: string) =>
      test.transact((ex, ctx) => createInspection(ex, ctx, { fileId: file.id, plannedDate }));
    const longAgo = await add("2026-10-05");
    const lastWeek = await add("2026-10-06");
    const today = await add("2026-10-12");
    const tomorrow = await add("2026-10-13");

    const due = await test.transact((ex, ctx) => listInspections(ex, ctx, { due: true }));
    expect(due.map((line) => line.id)).toEqual([longAgo.id, lastWeek.id, today.id]);
    expect(due.map((line) => line.late)).toEqual([true, true, false]);
    expect(due[0]).toMatchObject({ site: "عمارة النور", status: "PLANNED", supervisor: { id: supervisor.id } });
    expect(await test.transact((ex, ctx) => countInspectionsDue(ex, ctx))).toBe(3);

    const result = await test.transact((ex, ctx) => markMissedInspections(ex, ctx, { today: "2026-10-12" }));
    expect(result.missed).toBe(1);
    const again = await test.transact((ex, ctx) => markMissedInspections(ex, ctx, { today: "2026-10-12" }));
    expect(again.missed).toBe(0);

    const missed = await test.transact((ex, ctx) => listInspections(ex, ctx, { status: "MISSED" }));
    expect(missed.map((line) => line.id)).toEqual([longAgo.id]);
    const planned = await test.transact((ex, ctx) =>
      listInspections(ex, ctx, { status: "PLANNED", latestFirst: true }),
    );
    expect(planned.map((line) => line.id)).toEqual([tomorrow.id, today.id, lastWeek.id]);
    const inOctober = await test.transact((ex, ctx) =>
      listInspections(ex, ctx, { from: "2026-10-06", to: "2026-10-12" }),
    );
    expect(inOctober.map((line) => line.id)).toEqual([lastWeek.id, today.id]);
  });
});
