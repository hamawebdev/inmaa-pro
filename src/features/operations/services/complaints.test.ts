import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { entryValuesOf } from "../components/visit-entry/visit-entry-data";
import {
  SIGNOFF_COMPLAINT_TEXT,
  getComplaintCounter,
  openComplaint,
  recordFirstResponse,
  type OpenComplaintInput,
} from "./complaints";
import { getVisitEntry, saveReturnedOrder } from "./visit-entry";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

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
    status: "DONE",
  });
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
