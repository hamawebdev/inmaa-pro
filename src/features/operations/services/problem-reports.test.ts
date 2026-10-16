import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerHandler } from "@/lib/events";
import { fixedClock } from "@/lib/clock";
import { buildContext } from "@/lib/service/context";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getComplaintCounter } from "./complaints";
import {
  closeHandedProblem,
  closeProblemReport,
  demoComplaints,
  handOverProblem,
  listProblemReports,
  logProblemReport,
  NOT_CLOSED,
  problemToComplaint,
  takeProblemInHand,
  type LogProblemReportInput,
} from "./problem-reports";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  handedOver.length = 0;
});
afterEach(() => test.close());

/** What the stock, the client files or HR would hear: `problem.handedOver`, followed by this test file only. */
const handedOver: Array<{ problemReportId: string; to: string }> = [];
registerHandler("stock", "problem.handedOver", async (_ex, _ctx, payload) => {
  handedOver.push(payload);
});

/** A building's contract file with a visit done on Saturday 10 October, a worker on it, and a worker elsewhere. */
async function building() {
  const site = await test.rows.insert("Site", {
    division: "BUILDING",
    commonName: "عمارة النور",
    address: "حي 500 مسكن",
  });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "BUILDING",
    serviceType: "CONTRACT",
    formKind: "BUILDING_CONTRACT",
    stage: "CONTRACTED",
  } as never);
  const visit = await test.rows.insert("Visit", {
    fileId: file.id,
    origin: "CONTRACT",
    visitDate: localDate("2026-10-10"),
    status: "DONE",
  });
  const worker = await test.rows.insert("StaffMember", { kind: "WORKER", firstName: "سعاد", lastName: "بوزيد" } as never);
  return { site, file, visit, worker, clientId: site.clientId };
}

/** A report ticked on the returned order, as the order writes it. */
async function fromOrder(fileId: string, visitId: string, kind: string, details: string | null = null) {
  return test.rows.insert("ProblemReport", {
    fileId,
    visitId,
    reportedVia: "ORDER",
    occurredDate: localDate("2026-10-10"),
    kind,
    details,
    status: "OPEN",
  } as never);
}

const report = (id: string) => test.db.selectFrom("ProblemReport").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const lastLog = () =>
  test.db.selectFrom("AuditLog").selectAll().orderBy("chainSeq", "desc").limit(1).executeTakeFirstOrThrow();
const logReport = (input: LogProblemReportInput) => test.transact((ex, ctx) => logProblemReport(ex, ctx, input));

describe("logProblemReport", () => {
  it("logs a problem phoned in, open, with when it happened", async () => {
    const { file, visit, worker } = await building();
    const { problemReportId } = await logReport({
      fileId: file.id,
      visitId: visit.id,
      reportedVia: "PHONE",
      reportedByWorkerId: worker.id,
      occurredDate: "2026-10-12",
      occurredTime: "08:40",
      kind: "SAFETY_HAZARD",
      details: "  سلك كهربائي مكشوف في المدخل  ",
    });
    expect(await report(problemReportId)).toMatchObject({
      fileId: file.id,
      visitId: visit.id,
      reportedVia: "PHONE",
      reportedByWorkerId: worker.id,
      occurredDate: "2026-10-12",
      occurredTime: "08:40",
      loggedAt: "2026-10-12T08:00:00.000Z",
      kind: "SAFETY_HAZARD",
      details: "سلك كهربائي مكشوف في المدخل",
      status: "OPEN",
    });
    expect(await lastLog()).toMatchObject({
      operation: "CHANGE",
      action: "CREATE",
      entity: "ProblemReport",
      entityId: problemReportId,
    });
  });

  it("refuses a day to come, a visit of another file, a worker nobody knows, a time not written HH:MM", async () => {
    const { file, visit } = await building();
    const other = await building();
    const base = { fileId: file.id, reportedVia: "PHONE", occurredDate: "2026-10-12", kind: "OTHER" } as const;
    await expect(logReport({ ...base, occurredDate: "2026-10-13" })).rejects.toThrow("The date cannot be after today.");
    await expect(logReport({ ...base, occurredDate: "13/10/2026" })).rejects.toThrow("Enter a valid date.");
    await expect(logReport({ ...base, visitId: other.visit.id })).rejects.toThrow(
      "This visit belongs to another client file.",
    );
    await expect(logReport({ ...base, reportedByWorkerId: "nobody" })).rejects.toThrow("This worker does not exist.");
    await expect(logReport({ ...base, occurredTime: "8h40" })).rejects.toThrow("Enter a time as HH:MM.");
    await expect(logReport({ ...base, fileId: "nothing" })).rejects.toThrow("This client file does not exist.");
    expect(visit.fileId).toBe(file.id);
  });
});

describe("listProblemReports", () => {
  it("lists the reports not closed first, latest first, with their site and visit", async () => {
    const { file, visit, site } = await building();
    const shortage = await fromOrder(file.id, visit.id, "MATERIAL_SHORTAGE", "نقص في المنظفات");
    const { problemReportId: phoned } = await logReport({
      fileId: file.id,
      reportedVia: "SUPERVISOR",
      occurredDate: "2026-10-11",
      kind: "OBSTACLE",
    });
    const closed = await fromOrder(file.id, visit.id, "PRIOR_DAMAGE");
    await test.transact((ex, ctx) => closeProblemReport(ex, ctx, { problemReportId: closed.id, actionTaken: "صُوّر" }));

    const all = await test.transact((ex, ctx) => listProblemReports(ex, ctx));
    expect(all.map((line) => line.id)).toEqual([phoned, shortage.id, closed.id]);
    expect(all[1]).toMatchObject({
      kind: "MATERIAL_SHORTAGE",
      details: "نقص في المنظفات",
      status: "OPEN",
      reportedVia: "ORDER",
      occurredDate: "2026-10-10",
      file: { id: file.id, division: "BUILDING" },
      site: { name: "عمارة النور", address: site.address },
      visit: { id: visit.id },
      handedTo: null,
      complaint: null,
    });
    expect(all[2]).toMatchObject({ status: "CLOSED", actionTaken: "صُوّر", closed: { date: "2026-10-12" } });

    const notClosed = await test.transact((ex, ctx) => listProblemReports(ex, ctx, { status: NOT_CLOSED }));
    expect(notClosed.map((line) => line.id)).toEqual([phoned, shortage.id]);
    const shortages = await test.transact((ex, ctx) => listProblemReports(ex, ctx, { kind: "MATERIAL_SHORTAGE" }));
    expect(shortages.map((line) => line.id)).toEqual([shortage.id]);
  });
});

describe("dealing with a report", () => {
  it("takes a report in hand for the employee signed in", async () => {
    const { file, visit } = await building();
    const problem = await fromOrder(file.id, visit.id, "OBSTACLE");
    const employee = await test.rows.insert("StaffMember", {
      kind: "EMPLOYEE",
      firstName: "كريم",
      lastName: "حمدي",
    } as never);
    const operations = await test.sessionFor("OPERATIONS", { staffMemberId: employee.id });
    await test.transact((ex, ctx) => takeProblemInHand(ex, ctx, { problemReportId: problem.id }), operations);
    expect(await report(problem.id)).toMatchObject({ status: "IN_PROGRESS", assignedToEmployeeId: employee.id });
    expect(await lastLog()).toMatchObject({ action: "STATUS_CHANGE", entity: "ProblemReport", entityId: problem.id });
    const [line] = await test.transact((ex, ctx) => listProblemReports(ex, ctx));
    expect(line.assignedTo).toMatchObject({ id: employee.id, lastName: "حمدي" });

    await expect(
      test.transact((ex, ctx) => takeProblemInHand(ex, ctx, { problemReportId: problem.id })),
    ).rejects.toThrow("This report is already being dealt with.");
    await expect(
      test.transact((ex, ctx) => takeProblemInHand(ex, ctx, { problemReportId: "nothing" })),
    ).rejects.toThrow("This report does not exist.");
  });

  it("hands a report over once, and the owner it went to closes it", async () => {
    const { file, visit } = await building();
    const problem = await fromOrder(file.id, visit.id, "EQUIPMENT_SHORTAGE");
    await expect(
      test.transact((ex, ctx) => closeHandedProblem(ex, ctx, problem.id, { actionTaken: "x" })),
    ).rejects.toThrow("This report was not handed over.");

    await test.transact((ex, ctx) => handOverProblem(ex, ctx, { problemReportId: problem.id, to: "STOCK" }));
    expect(await report(problem.id)).toMatchObject({ status: "IN_PROGRESS", handedTo: "STOCK" });
    expect(handedOver).toEqual([{ problemReportId: problem.id, to: "STOCK" }]);
    await expect(
      test.transact((ex, ctx) => handOverProblem(ex, ctx, { problemReportId: problem.id, to: "PEOPLE" })),
    ).rejects.toThrow("This report is already handed over.");
    const stock = await test.transact((ex, ctx) => listProblemReports(ex, ctx, { handedTo: "STOCK" }));
    expect(stock.map((line) => line.id)).toEqual([problem.id]);

    // The stock's own service closes it (its section, not the requests', is checked there).
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => closeHandedProblem(ex, ctx, problem.id, { actionTaken: " " }), accountant),
    ).rejects.toThrow("Write what was done.");
    expect(
      await test.transact(
        (ex, ctx) => closeHandedProblem(ex, ctx, problem.id, { actionTaken: "سُلّمت مكنسة جديدة" }),
        accountant,
      ),
    ).toEqual({ closed: true });
    expect(await report(problem.id)).toMatchObject({ status: "CLOSED", actionTaken: "سُلّمت مكنسة جديدة" });
    expect(await test.transact((ex, ctx) => closeHandedProblem(ex, ctx, problem.id, { actionTaken: "x" }))).toEqual({
      closed: false,
    });
  });

  it("closes a report with what was done, once", async () => {
    const { file, visit } = await building();
    const problem = await fromOrder(file.id, visit.id, "AREA_UNAVAILABLE");
    await expect(
      test.transact((ex, ctx) => closeProblemReport(ex, ctx, { problemReportId: problem.id, actionTaken: "" })),
    ).rejects.toThrow("Write what was done.");
    test.clock.advance({ minutes: 15 });
    await test.transact((ex, ctx) =>
      closeProblemReport(ex, ctx, { problemReportId: problem.id, actionTaken: " اتفقنا مع الحارس على المفتاح " }),
    );
    expect(await report(problem.id)).toMatchObject({
      status: "CLOSED",
      actionTaken: "اتفقنا مع الحارس على المفتاح",
      closedAt: "2026-10-12T08:15:00.000Z",
      closedByUserId: test.manager.userId,
    });
    await expect(
      test.transact((ex, ctx) => closeProblemReport(ex, ctx, { problemReportId: problem.id, actionTaken: "x" })),
    ).rejects.toThrow("This report is closed.");
    await expect(
      test.transact((ex, ctx) => handOverProblem(ex, ctx, { problemReportId: problem.id, to: "CLIENTS" })),
    ).rejects.toThrow("This report is closed.");
  });

  it("is refused to a role that may only read the requests", async () => {
    const { file, visit } = await building();
    const problem = await fromOrder(file.id, visit.id, "OBSTACLE");
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => takeProblemInHand(ex, ctx, { problemReportId: problem.id }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => handOverProblem(ex, ctx, { problemReportId: problem.id, to: "STOCK" }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    expect(await test.transact((ex, ctx) => listProblemReports(ex, ctx), accountant)).toHaveLength(1);
  });
});

describe("problemToComplaint", () => {
  it("turns a resident's complaint into a complaint of the file's client, and closes the report", async () => {
    const { file, visit, clientId } = await building();
    const problem = await fromOrder(file.id, visit.id, "RESIDENT_COMPLAINT", "ساكن يشتكي من الماء على الدرج");
    const { complaintId, number } = await test.transact((ex, ctx) =>
      problemToComplaint(ex, ctx, {
        problemReportId: problem.id,
        kind: "QUALITY",
        complainantName: "ساكن الطابق الثاني",
      }),
    );
    const complaint = await test.db
      .selectFrom("Complaint")
      .selectAll()
      .where("id", "=", complaintId)
      .executeTakeFirstOrThrow();
    expect(complaint).toMatchObject({
      number,
      channel: "VIA_WORKER",
      clientId,
      fileId: file.id,
      visitId: visit.id,
      kind: "QUALITY",
      description: "ساكن يشتكي من الماء على الدرج",
      complainantName: "ساكن الطابق الثاني",
      status: "NEW",
    });
    expect(await report(problem.id)).toMatchObject({ status: "CLOSED", complaintId, actionTaken: null });
    const [line] = await test.transact((ex, ctx) => listProblemReports(ex, ctx));
    expect(line.complaint).toEqual({ id: complaintId, number });

    await expect(
      test.transact((ex, ctx) => problemToComplaint(ex, ctx, { problemReportId: problem.id, kind: "QUALITY" })),
    ).rejects.toThrow("This report is already a complaint.");
    const shortage = await fromOrder(file.id, visit.id, "MATERIAL_SHORTAGE");
    await expect(
      test.transact((ex, ctx) => problemToComplaint(ex, ctx, { problemReportId: shortage.id, kind: "QUALITY" })),
    ).rejects.toThrow("Only a resident's complaint becomes a complaint.");
  });
});

describe("demoComplaints", () => {
  it("leaves an open complaint inside its target, a settled one and a report handed over, once", async () => {
    // The folder's demo data (demo.ts) calls demoComplaints once; a second call adds nothing.
    const demo = await createTestDatabase({ demo: ["core", "people", "clients", "operations"] });
    try {
      const tools = {
        at: (instant: string) => buildContext(demo.manager, fixedClock(instant, demo.clock.utcOffsetMin)),
        sessionOf: async () => demo.manager,
        names: demo.demo,
      };
      const named = demo.demo.operations ?? {};
      const names = {
        complaintOpen: named.complaintOpen ?? "",
        complaintSettled: named.complaintSettled ?? "",
        problemHandedOver: named.problemHandedOver ?? "",
      };
      expect(Object.values(names).every((id) => id.length > 0)).toBe(true);
      const complaints = await demo.db
        .selectFrom("Complaint")
        .select(["id", "status", "settlement", "clientToldAt", "firstResponseAt"])
        .execute();
      expect(complaints.find((each) => each.id === names.complaintOpen)).toMatchObject({
        status: "NEW",
        firstResponseAt: null,
      });
      expect(complaints.find((each) => each.id === names.complaintSettled)).toMatchObject({
        status: "SETTLED",
        settlement: "DISCOUNT",
        clientToldAt: expect.any(String),
      });
      const counter = await demo.transact((ex, ctx) =>
        getComplaintCounter(ex, ctx, { complaintId: names.complaintOpen }),
      );
      expect(counter.state).toBe("RUNNING");
      expect(
        await demo.db.selectFrom("ProblemReport").selectAll().where("id", "=", names.problemHandedOver).executeTakeFirst(),
      ).toMatchObject({ handedTo: "STOCK", status: "IN_PROGRESS", kind: "MATERIAL_SHORTAGE" });

      expect(await demo.transact((ex, ctx) => demoComplaints(ex, ctx, tools))).toEqual({});
      expect(await demo.db.selectFrom("Complaint").select("id").execute()).toHaveLength(complaints.length);
    } finally {
      demo.close();
    }
  }, 120_000);
});

// The time of a phoned report is optional; a report on the order has none.
it("keeps the time of a report empty when nobody knows it", async () => {
  const { file } = await building();
  const { problemReportId } = await logReport({
    fileId: file.id,
    reportedVia: "SUPERVISOR",
    occurredDate: "2026-10-12",
    occurredTime: " ",
    kind: "OTHER",
  });
  expect((await report(problemReportId)).occurredTime).toBeNull();
});
