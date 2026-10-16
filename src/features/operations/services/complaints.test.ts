import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit, registerHandler } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { entryValuesOf } from "../components/visit-entry/visit-entry-data";
import {
  SIGNOFF_COMPLAINT_TEXT,
  getComplaint,
  getComplaintCounter,
  listComplaintChoices,
  listComplaintCredits,
  listComplaints,
  listComplaintVisits,
  openComplaint,
  recordClientTold,
  recordFirstResponse,
  rejectComplaint,
  settleComplaint,
  type OpenComplaintInput,
  type SettleComplaintInput,
} from "./complaints";
import { getVisitEntry, saveReturnedOrder } from "./visit-entry";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  settledEvents.length = 0;
});
afterEach(() => test.close());

/** What Money would hear: `complaint.settled`, followed here by a listener of this test file only. */
const settledEvents: string[] = [];
registerHandler("money", "complaint.settled", async (_ex, _ctx, { complaintId }) => {
  settledEvents.push(complaintId);
});

/** A housing job done on Saturday 10 October, and its client. */
async function job() {
  const site = await test.rows.insert("Site", { division: "HOUSING", commonName: "منزل بن صالح" });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "HOUSING",
    serviceType: "ON_DEMAND",
    formKind: "HOUSING_REQUEST",
    stage: "CONTRACTED",
  } as never);
  const visit = await test.rows.insert("Visit", {
    fileId: file.id,
    origin: "ON_DEMAND",
    visitDate: localDate("2026-10-10"),
    plannedStartTime: localTime("08:00"),
    plannedDurationMin: 180,
    workersNeeded: 1,
    status: "DONE",
  } as never);
  return { clientId: site.clientId, file, visit };
}

const open = (input: OpenComplaintInput) => test.transact((ex, ctx) => openComplaint(ex, ctx, input));
const complaintRow = (id: string) =>
  test.db.selectFrom("Complaint").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const lastLog = () =>
  test.db.selectFrom("AuditLog").selectAll().orderBy("chainSeq", "desc").limit(1).executeTakeFirstOrThrow();

describe("openComplaint", () => {
  it("numbers the complaint, starts its counter now and gives it two office hours", async () => {
    const { clientId, file, visit } = await job();
    const { complaintId, number } = await open({
      channel: "PHONE",
      clientId,
      visitId: visit.id,
      kind: "DELAY",
      description: "  وصل الفريق متأخراً ساعة  ",
    });
    expect(number).toBe("0001/2026");
    expect(await complaintRow(complaintId)).toMatchObject({
      number: "0001/2026",
      channel: "PHONE",
      kind: "DELAY",
      clientId,
      fileId: file.id,
      visitId: visit.id,
      description: "وصل الفريق متأخراً ساعة",
      receivedAt: "2026-10-12T08:00:00.000Z",
      targetMin: 120,
      // Monday 09:00 at the centre, plus two office hours: 11:00.
      dueAt: "2026-10-12T10:00:00.000Z",
      status: "NEW",
      firstResponseAt: null,
    });
    expect(await lastLog()).toMatchObject({
      operation: "CHANGE",
      action: "CREATE",
      entity: "Complaint",
      entityId: complaintId,
      subjectKind: "CLIENT",
      subjectId: clientId,
    });
  });

  it("counts the target in office hours only", async () => {
    const { clientId } = await job();
    // Monday 16:30: half an hour left that day, the rest from 07:30 on Tuesday.
    test.clock.set("2026-10-12T15:30:00.000Z");
    const late = await open({ channel: "AT_OFFICE", clientId, kind: "QUALITY", description: "بقع على الزجاج" });
    expect((await complaintRow(late.complaintId)).dueAt).toBe("2026-10-13T08:00:00.000Z");

    // Thursday 16:00: one hour that day, Friday is not worked, the second hour on Saturday from 07:30.
    test.clock.set("2026-10-15T15:00:00.000Z");
    const weekend = await open({ channel: "PHONE", clientId, kind: "BEHAVIOUR", description: "كلام غير لائق" });
    expect(await complaintRow(weekend.complaintId)).toMatchObject({
      number: "0002/2026",
      dueAt: "2026-10-17T07:30:00.000Z",
    });
  });

  it("logs a resident who complains as personal data collected", async () => {
    const { clientId } = await job();
    const { complaintId } = await open({
      channel: "VIA_WORKER",
      clientId,
      complainantName: "ساكن الطابق الثالث",
      complainantPhone: "0661 20 31 42",
      kind: "OTHER",
      description: "ضجيج في الصباح الباكر",
    });
    expect(await complaintRow(complaintId)).toMatchObject({
      complainantName: "ساكن الطابق الثالث",
      complainantPhone: "0661 20 31 42",
    });
    expect(await lastLog()).toMatchObject({
      operation: "COLLECT",
      entity: "Complaint",
      subjectKind: "RESIDENT",
      subjectLabel: "ساكن الطابق الثالث",
    });
  });

  it("refuses a complaint without a description, of another client, or about nobody known", async () => {
    const { clientId, file } = await job();
    const other = await test.rows.insert("Client", {});
    await expect(open({ channel: "PHONE", clientId, kind: "QUALITY", description: "   " })).rejects.toThrow(
      "Write what the complaint is about.",
    );
    await expect(
      open({ channel: "PHONE", clientId: other.id, fileId: file.id, kind: "QUALITY", description: "x" }),
    ).rejects.toThrow("This file or visit belongs to another client.");
    await expect(open({ channel: "PHONE", clientId: "nobody", kind: "QUALITY", description: "x" })).rejects.toThrow(
      "This client does not exist.",
    );
    await expect(
      open({ channel: "PHONE", clientId, workerId: "nobody", kind: "QUALITY", description: "x" }),
    ).rejects.toThrow("This worker does not exist.");
  });

  it("is refused to a role that may only read the requests", async () => {
    const { clientId } = await job();
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact(
        (ex, ctx) => openComplaint(ex, ctx, { channel: "PHONE", clientId, kind: "QUALITY", description: "x" }),
        accountant,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("the response counter", () => {
  it("runs, comes close to its target, then is late", async () => {
    const { clientId } = await job();
    const { complaintId } = await open({ channel: "PHONE", clientId, kind: "QUALITY", description: "x" });
    const counter = () => test.transact((ex, ctx) => getComplaintCounter(ex, ctx, { complaintId }));

    expect(await counter()).toMatchObject({
      state: "RUNNING",
      marginMin: 120,
      due: { date: "2026-10-12", time: "11:00" },
    });
    test.clock.advance({ minutes: 100 });
    expect(await counter()).toMatchObject({ state: "CLOSE_TO_TARGET", marginMin: 20 });
    test.clock.advance({ minutes: 30 });
    expect(await counter()).toMatchObject({ state: "LATE", marginMin: -10 });
  });

  it("stops at the first answer, which is recorded once", async () => {
    const { clientId } = await job();
    const { complaintId } = await open({ channel: "PHONE", clientId, kind: "QUALITY", description: "x" });
    test.clock.advance({ minutes: 30 });
    const answered = await test.transact((ex, ctx) =>
      recordFirstResponse(ex, ctx, { complaintId, note: "  اتصلنا بالعميل ووعدناه بإعادة الخدمة " }),
    );
    expect(answered).toMatchObject({ status: "IN_PROGRESS", counter: { state: "ANSWERED_IN_TIME", marginMin: 90 } });
    expect(await complaintRow(complaintId)).toMatchObject({
      status: "IN_PROGRESS",
      firstResponseAt: "2026-10-12T08:30:00.000Z",
      firstResponseByUserId: test.manager.userId,
      responseNote: "اتصلنا بالعميل ووعدناه بإعادة الخدمة",
    });
    expect(await lastLog()).toMatchObject({ action: "STATUS_CHANGE", entity: "Complaint", entityId: complaintId });

    // Later, the counter still reads the answer, not the clock.
    test.clock.advance({ hours: 5 });
    expect(await test.transact((ex, ctx) => getComplaintCounter(ex, ctx, { complaintId }))).toMatchObject({
      state: "ANSWERED_IN_TIME",
      marginMin: 90,
    });
    await expect(test.transact((ex, ctx) => recordFirstResponse(ex, ctx, { complaintId }))).rejects.toThrow(
      "The first answer to this complaint is already recorded.",
    );
    await expect(test.transact((ex, ctx) => recordFirstResponse(ex, ctx, { complaintId: "nothing" }))).rejects.toThrow(
      "This complaint does not exist.",
    );
  });
});

describe("a client who did not accept the service", () => {
  /** The returned order of a visit, signed off as the client wrote it. */
  async function signedOff(signoffStatus: string, signoffNotes: string | null) {
    const { visit, file, clientId } = await job();
    await test.rows.insert("VisitReport", {
      visitId: visit.id,
      entryState: "COMPLETE",
      completion: "FULL",
      signoffStatus,
      signoffNotes,
    });
    await test.transact((ex, ctx) => emit(ex, ctx, "visit.signedOff", { visitId: visit.id }));
    return { visit, file, clientId };
  }

  const complaintsOf = (visitId: string) =>
    test.db.selectFrom("Complaint").selectAll().where("visitId", "=", visitId).execute();

  it("opens one complaint on the order, with the client's notes, however often it is saved", async () => {
    const { visit, file, clientId } = await signedOff("NOT_ACCEPTED", "المطبخ لم يُنظَّف");
    await test.transact((ex, ctx) => emit(ex, ctx, "visit.signedOff", { visitId: visit.id }));
    const complaints = await complaintsOf(visit.id);
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toMatchObject({
      channel: "ON_ORDER",
      kind: "QUALITY",
      clientId,
      fileId: file.id,
      visitId: visit.id,
      description: "المطبخ لم يُنظَّف",
      status: "NEW",
    });
  });

  it("writes a short Arabic description when the client wrote none", async () => {
    const { visit } = await signedOff("NOT_ACCEPTED", null);
    expect((await complaintsOf(visit.id))[0]?.description).toBe(SIGNOFF_COMPLAINT_TEXT);
  });

  it("opens nothing when the client accepted, even with notes", async () => {
    const { visit } = await signedOff("ACCEPTED_WITH_NOTES", "تأخر بسيط");
    expect(await complaintsOf(visit.id)).toHaveLength(0);
  });

  it("follows the returned order typed in on the visit's page", async () => {
    const zone = await test.rows.insert("Zone", { name: "أم البواقي" });
    const site = await test.rows.insert("Site", { division: "ORGANISATION", zoneId: zone.id });
    const file = await test.rows.insert("File", {
      siteId: site.id,
      clientId: site.clientId,
      division: "ORGANISATION",
      serviceType: "CONTRACT",
      formKind: "ORG_CONTRACT",
      stage: "CONTRACTED",
      executionDays: JSON.stringify(["MON"]),
      arrivalTime: localTime("08:00"),
      departureTime: localTime("11:00"),
      startDate: localDate("2026-11-01"),
      endDate: localDate("2026-11-30"),
      workersCount: 1,
    } as never);
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    const visit = await test.db
      .selectFrom("Visit")
      .selectAll()
      .where("fileId", "=", file.id)
      .where("visitDate", "=", localDate("2026-11-02"))
      .executeTakeFirstOrThrow();
    const data = await test.transact((ex, ctx) => getVisitEntry(ex, ctx, { visitId: visit.id }));
    const values = {
      ...entryValuesOf(data, "2026-11-02"),
      completion: "FULL" as const,
      completionPercent: 100,
      signoffStatus: "NOT_ACCEPTED" as const,
      signoffName: "ليلى حمدي",
      signoffNotes: "المكاتب لم تُنظَّف كما يجب",
    };
    const saved = await test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId: visit.id, values }));
    expect(saved).toEqual({ entryState: "COMPLETE", status: "DONE" });
    expect(await complaintsOf(visit.id)).toMatchObject([
      { channel: "ON_ORDER", kind: "QUALITY", description: "المكاتب لم تُنظَّف كما يجب", clientId: site.clientId },
    ]);
  });
});

// ── The lists, the page, the closing ─────────────────────────────────────────

/** A worker of the centre, seated on a visit. */
async function seated(visitId: string, lastName = "بوزيد") {
  const worker = await test.rows.insert("StaffMember", { kind: "WORKER", firstName: "سعاد", lastName } as never);
  await test.rows.insert("VisitWorker", { visitId, workerId: worker.id, seatStatus: "ASSIGNED" } as never);
  return worker;
}

const settle = (input: SettleComplaintInput) => test.transact((ex, ctx) => settleComplaint(ex, ctx, input));

describe("listComplaints", () => {
  it("keeps open, late, closed or every complaint, each with its counter", async () => {
    const { clientId, visit } = await job();
    // Received Monday 09:00, then 09:30, then 10:00.
    const first = await open({ channel: "PHONE", clientId, visitId: visit.id, kind: "DELAY", description: "تأخر" });
    test.clock.advance({ minutes: 30 });
    const second = await open({ channel: "AT_OFFICE", clientId, kind: "QUALITY", description: "بقع" });
    test.clock.advance({ minutes: 30 });
    const third = await open({ channel: "SUPERVISOR", clientId, kind: "OTHER", description: "ضجيج" });
    await test.transact((ex, ctx) => rejectComplaint(ex, ctx, { complaintId: third.complaintId, reason: "مكررة" }));

    // 11:15: the first is past its target (11:00), the second is close to it (11:30), the third is closed.
    test.clock.set("2026-10-12T10:15:00.000Z");
    const list = (state?: "open" | "late" | "settled" | "all") =>
      test.transact((ex, ctx) => listComplaints(ex, ctx, { state }));
    const open_ = await list("open");
    expect(open_.map((line) => line.number)).toEqual([first.number, second.number]);
    expect(open_[0]).toMatchObject({
      channel: "PHONE",
      kind: "DELAY",
      status: "NEW",
      received: { date: "2026-10-12", time: "09:00" },
      client: { id: clientId },
      visit: { id: visit.id, visitDate: "2026-10-10" },
      counter: { state: "LATE", marginMin: -15 },
    });
    expect(open_[1].counter).toMatchObject({ state: "CLOSE_TO_TARGET", marginMin: 15 });
    expect((await list("late")).map((line) => line.id)).toEqual([first.complaintId]);
    expect(await list("settled")).toMatchObject([
      { id: third.complaintId, status: "REJECTED", closed: { date: "2026-10-12", time: "10:00" } },
    ]);
    expect((await list("all")).map((line) => line.id)).toEqual([
      third.complaintId,
      second.complaintId,
      first.complaintId,
    ]);
    // The default is the open list.
    expect(await test.transact((ex, ctx) => listComplaints(ex, ctx))).toHaveLength(2);
  });

  it("keeps the complaints received in a range of days", async () => {
    const { clientId } = await job();
    test.clock.set("2026-10-10T09:00:00.000Z");
    await open({ channel: "PHONE", clientId, kind: "DELAY", description: "x" });
    test.clock.set("2026-10-12T09:00:00.000Z");
    const today = await open({ channel: "PHONE", clientId, kind: "DELAY", description: "y" });
    const range = (from: string, to: string) =>
      test.transact((ex, ctx) => listComplaints(ex, ctx, { state: "all", from, to }));
    expect((await range("2026-10-11", "2026-10-12")).map((line) => line.id)).toEqual([today.complaintId]);
    expect(await range("2026-10-01", "2026-10-31")).toHaveLength(2);
    await expect(range("2026-10-12", "2026-10-01")).rejects.toThrow("The end date must not be before the start date.");
    await expect(range("12/10/2026", "2026-10-12")).rejects.toThrow("Enter a valid date.");
  });
});

describe("getComplaint", () => {
  it("shows the facts, who received and answered it, and the visit a redo would repeat", async () => {
    const { clientId, file, visit } = await job();
    const worker = await seated(visit.id);
    const { complaintId } = await open({
      channel: "PHONE",
      clientId,
      visitId: visit.id,
      workerId: worker.id,
      complainantName: "ساكن الطابق الثالث",
      complainantPhone: "0661203142",
      kind: "BEHAVIOUR",
      description: "كلام غير لائق",
    });
    test.clock.advance({ minutes: 20 });
    await test.transact((ex, ctx) => recordFirstResponse(ex, ctx, { complaintId, note: "اعتذرنا" }));

    const detail = await test.transact((ex, ctx) => getComplaint(ex, ctx, { complaintId }));
    expect(detail).toMatchObject({
      id: complaintId,
      status: "IN_PROGRESS",
      file: { id: file.id },
      worker: { id: worker.id, lastName: "بوزيد" },
      complainantName: "ساكن الطابق الثالث",
      complainantPhone: "0661203142",
      targetMin: 120,
      firstResponse: { at: { date: "2026-10-12", time: "09:20" }, note: "اعتذرنا" },
      counter: { state: "ANSWERED_IN_TIME", marginMin: 100 },
      repeatableVisits: [{ id: visit.id, visitDate: "2026-10-10" }],
      violations: [],
      redoVisit: null,
      clientTold: null,
    });
    expect(detail.receivedBy).toBeTruthy();
    expect(detail.firstResponse?.by).toBe(detail.receivedBy);
    await expect(test.transact((ex, ctx) => getComplaint(ex, ctx, { complaintId: "nothing" }))).rejects.toThrow(
      "This complaint does not exist.",
    );
  });

  it("offers the file's visits done, latest first, when the complaint names no visit", async () => {
    const { clientId, file, visit } = await job();
    const later = await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "ON_DEMAND",
      visitDate: localDate("2026-10-11"),
      status: "DONE",
    });
    await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "ON_DEMAND",
      visitDate: localDate("2026-10-20"),
      status: "CONFIRMED",
    });
    const { complaintId } = await open({
      channel: "PHONE",
      clientId,
      fileId: file.id,
      kind: "QUALITY",
      description: "x",
    });
    const detail = await test.transact((ex, ctx) => getComplaint(ex, ctx, { complaintId }));
    expect(detail.repeatableVisits.map((each) => each.id)).toEqual([later.id, visit.id]);
  });
});

describe("settleComplaint", () => {
  it("redoes the service: plans the redo visit from the visit complained about, and stops the counter", async () => {
    const { clientId, visit } = await job();
    const { complaintId, number } = await open({
      channel: "PHONE",
      clientId,
      visitId: visit.id,
      kind: "QUALITY",
      description: "المطبخ لم يُنظَّف",
    });
    test.clock.advance({ minutes: 45 });
    const settled = await settle({
      complaintId,
      centreAtFault: "YES",
      settlement: "REDO_SERVICE",
      redo: { date: "2026-10-14", startTime: "09:00" },
      resolutionNote: "  إعادة تنظيف المطبخ  ",
    });
    expect(settled).toMatchObject({ status: "SETTLED", redoVisit: { number: expect.any(String) }, violation: null });

    const redo = await test.db
      .selectFrom("Visit")
      .selectAll()
      .where("id", "=", settled.redoVisit?.visitId ?? "")
      .executeTakeFirstOrThrow();
    // Origin EXTRA stands in for REDO (planExtraVisit), pointing back at the visit complained about.
    expect(redo).toMatchObject({
      origin: "EXTRA",
      sourceVisitId: visit.id,
      visitDate: "2026-10-14",
      plannedStartTime: "09:00",
      status: "AWAITING_CONFIRMATION",
    });
    expect(await complaintRow(complaintId)).toMatchObject({
      status: "SETTLED",
      centreAtFault: "YES",
      settlement: "REDO_SERVICE",
      settlementAmount: null,
      redoVisitId: redo.id,
      resolutionNote: "إعادة تنظيف المطبخ",
      settledAt: "2026-10-12T08:45:00.000Z",
      settledByUserId: test.manager.userId,
      // Never answered before: the settlement is the answer.
      firstResponseAt: "2026-10-12T08:45:00.000Z",
    });
    expect(await lastLog()).toMatchObject({
      operation: "CHANGE",
      action: "STATUS_CHANGE",
      entity: "Complaint",
      entityId: complaintId,
      entityLabel: number,
    });
    expect(settledEvents).toEqual([]);

    const detail = await test.transact((ex, ctx) => getComplaint(ex, ctx, { complaintId }));
    expect(detail).toMatchObject({
      counter: { state: "ANSWERED_IN_TIME", marginMin: 75 },
      redoVisit: { id: redo.id, visitDate: "2026-10-14", status: "AWAITING_CONFIRMATION" },
      closed: { date: "2026-10-12", time: "09:45" },
    });
    await expect(settle({ complaintId, centreAtFault: "YES", settlement: "NONE" })).rejects.toThrow(
      "This complaint is closed.",
    );
  });

  it("needs a visit to repeat and a day to come for a redo", async () => {
    const { clientId, visit } = await job();
    const other = await test.rows.insert("Client", {});
    const loose = await open({ channel: "PHONE", clientId: other.id, kind: "QUALITY", description: "x" });
    await expect(
      settle({
        complaintId: loose.complaintId,
        centreAtFault: "YES",
        settlement: "REDO_SERVICE",
        redo: { date: "2026-10-14" },
      }),
    ).rejects.toThrow("A redo visit needs a visit of this client file to repeat.");
    await expect(
      settle({
        complaintId: loose.complaintId,
        centreAtFault: "YES",
        settlement: "REDO_SERVICE",
        redo: { date: "2026-10-14", sourceVisitId: visit.id },
      }),
    ).rejects.toThrow("This visit belongs to another client file.");

    const { complaintId } = await open({
      channel: "PHONE",
      clientId,
      visitId: visit.id,
      kind: "QUALITY",
      description: "x",
    });
    await expect(
      settle({ complaintId, centreAtFault: "YES", settlement: "REDO_SERVICE", redo: { date: "2026-10-01" } }),
    ).rejects.toThrow("An extra visit is planned for today or later.");
    await expect(settle({ complaintId, centreAtFault: "YES", settlement: "REDO_SERVICE" })).rejects.toThrow(
      "Enter a valid date.",
    );
    // Nothing was kept of the refused attempts.
    expect((await complaintRow(complaintId)).status).toBe("NEW");
  });

  it("settles with an agreed discount for Money's next invoice, the manager's decision", async () => {
    const { clientId, file, visit } = await job();
    const { complaintId, number } = await open({
      channel: "PHONE",
      clientId,
      visitId: visit.id,
      kind: "DELAY",
      description: "تأخر ساعة",
    });
    const discount = { complaintId, centreAtFault: "YES", settlement: "DISCOUNT", amount: 150_000 } as const;

    const operations = await test.sessionFor("OPERATIONS");
    await expect(test.transact((ex, ctx) => settleComplaint(ex, ctx, discount), operations)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    await expect(settle({ ...discount, amount: 0 })).rejects.toThrow("Enter an amount above zero.");
    await expect(settle({ ...discount, amount: 12.5 })).rejects.toThrow("Enter an amount above zero.");

    await settle(discount);
    expect(await complaintRow(complaintId)).toMatchObject({
      status: "SETTLED",
      settlement: "DISCOUNT",
      settlementAmount: 150_000,
      redoVisitId: null,
    });
    expect(settledEvents).toEqual([complaintId]);
    expect(await test.transact((ex, ctx) => listComplaintCredits(ex, ctx, { fileId: file.id }))).toEqual([
      { complaintId, number, settledDate: "2026-10-12", amount: 150_000, kind: "DELAY" },
    ]);
  });

  it("gives no discount on a complaint that names no client file", async () => {
    const { clientId } = await job();
    const { complaintId } = await open({ channel: "PHONE", clientId, kind: "DELAY", description: "x" });
    await expect(
      settle({ complaintId, centreAtFault: "YES", settlement: "DISCOUNT", amount: 100_000 }),
    ).rejects.toThrow("A discount needs the client file the complaint is about.");
  });

  it("writes out a settlement of another kind, and closes one with none", async () => {
    const { clientId } = await job();
    const first = await open({ channel: "PHONE", clientId, kind: "OTHER", description: "x" });
    await expect(
      settle({ complaintId: first.complaintId, centreAtFault: "UNDECIDED", settlement: "OTHER", resolutionNote: "  " }),
    ).rejects.toThrow("Write how the complaint was settled.");
    await settle({
      complaintId: first.complaintId,
      centreAtFault: "UNDECIDED",
      settlement: "OTHER",
      resolutionNote: "هدية تنظيف مجانية للمدخل",
    });
    const second = await open({ channel: "PHONE", clientId, kind: "OTHER", description: "y" });
    await settle({ complaintId: second.complaintId, centreAtFault: "NO", settlement: "NONE" });
    expect(await complaintRow(first.complaintId)).toMatchObject({
      status: "SETTLED",
      centreAtFault: "UNDECIDED",
      settlement: "OTHER",
      resolutionNote: "هدية تنظيف مجانية للمدخل",
    });
    expect(await complaintRow(second.complaintId)).toMatchObject({
      status: "SETTLED",
      centreAtFault: "NO",
      settlement: "NONE",
      resolutionNote: null,
    });
  });

  it("hands the worker it names to HR as a violation to decide on", async () => {
    const { clientId, visit } = await job();
    const worker = await seated(visit.id);
    const { complaintId, number } = await open({
      channel: "PHONE",
      clientId,
      visitId: visit.id,
      workerId: worker.id,
      kind: "BEHAVIOUR",
      description: "كلام غير لائق مع العميل",
    });
    const settled = await settle({ complaintId, centreAtFault: "YES", settlement: "NONE", referWorker: true });
    expect(settled.violation).toMatchObject({ number: expect.any(String) });
    const violation = await test.db
      .selectFrom("Violation")
      .selectAll()
      .where("complaintId", "=", complaintId)
      .executeTakeFirstOrThrow();
    expect(violation).toMatchObject({
      staffId: worker.id,
      status: "OPEN",
      sourceKind: "COMPLAINT",
      // The day of the visit complained about.
      date: "2026-10-10",
      description: `${number}: كلام غير لائق مع العميل`,
    });
    const detail = await test.transact((ex, ctx) => getComplaint(ex, ctx, { complaintId }));
    expect(detail.violations).toEqual([{ id: violation.id, number: violation.number, status: "OPEN" }]);

    const nobody = await open({ channel: "PHONE", clientId, kind: "BEHAVIOUR", description: "x" });
    await expect(
      settle({ complaintId: nobody.complaintId, centreAtFault: "YES", settlement: "NONE", referWorker: true }),
    ).rejects.toThrow("This complaint names no worker.");
  });

  it("is refused to a role that may only read the requests", async () => {
    const { clientId } = await job();
    const { complaintId } = await open({ channel: "PHONE", clientId, kind: "DELAY", description: "x" });
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact(
        (ex, ctx) => settleComplaint(ex, ctx, { complaintId, centreAtFault: "NO", settlement: "NONE" }),
        accountant,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => rejectComplaint(ex, ctx, { complaintId, reason: "x" }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    // Reading is allowed.
    expect(await test.transact((ex, ctx) => listComplaints(ex, ctx), accountant)).toHaveLength(1);
  });
});

describe("rejectComplaint and recordClientTold", () => {
  it("rejects with the reason typed, then records once that the client was told", async () => {
    const { clientId } = await job();
    const { complaintId } = await open({ channel: "AT_OFFICE", clientId, kind: "QUALITY", description: "x" });
    await expect(test.transact((ex, ctx) => recordClientTold(ex, ctx, { complaintId }))).rejects.toThrow(
      "Settle or reject the complaint first.",
    );
    await expect(test.transact((ex, ctx) => rejectComplaint(ex, ctx, { complaintId, reason: "   " }))).rejects.toThrow(
      "Write why the complaint is rejected.",
    );

    test.clock.advance({ minutes: 10 });
    await test.transact((ex, ctx) =>
      rejectComplaint(ex, ctx, { complaintId, reason: " الخدمة المذكورة لم تكن من عقده " }),
    );
    expect(await complaintRow(complaintId)).toMatchObject({
      status: "REJECTED",
      resolutionNote: "الخدمة المذكورة لم تكن من عقده",
      settledAt: "2026-10-12T08:10:00.000Z",
      firstResponseAt: "2026-10-12T08:10:00.000Z",
      settlement: null,
    });
    expect(await lastLog()).toMatchObject({
      operation: "CHANGE",
      action: "REFUSE",
      reason: "الخدمة المذكورة لم تكن من عقده",
      entityId: complaintId,
    });
    await expect(
      test.transact((ex, ctx) => rejectComplaint(ex, ctx, { complaintId, reason: "مرة أخرى" })),
    ).rejects.toThrow("This complaint is closed.");

    test.clock.advance({ minutes: 5 });
    expect(await test.transact((ex, ctx) => recordClientTold(ex, ctx, { complaintId }))).toEqual({
      clientTold: { date: "2026-10-12", time: "09:15" },
    });
    expect((await complaintRow(complaintId)).clientToldAt).toBe("2026-10-12T08:15:00.000Z");
    expect(await lastLog()).toMatchObject({ action: "UPDATE", entity: "Complaint", entityId: complaintId });
    await expect(test.transact((ex, ctx) => recordClientTold(ex, ctx, { complaintId }))).rejects.toThrow(
      "The client has already been told.",
    );
  });
});

describe("what the new-complaint dialog offers", () => {
  it("lists the clients with their files, and a file's visits up to today with their teams", async () => {
    const { clientId, file, visit } = await job();
    const worker = await seated(visit.id, "حمدي");
    await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "ON_DEMAND",
      visitDate: localDate("2026-10-20"),
      status: "CONFIRMED",
    });
    const choices = await test.transact((ex, ctx) => listComplaintChoices(ex, ctx));
    expect(choices.find((client) => client.id === clientId)).toMatchObject({
      files: [{ id: file.id, division: "HOUSING", current: true }],
    });
    expect(await test.transact((ex, ctx) => listComplaintVisits(ex, ctx, { fileId: file.id }))).toMatchObject([
      { id: visit.id, visitDate: "2026-10-10", workers: [{ id: worker.id, lastName: "حمدي" }] },
    ]);
  });
});
