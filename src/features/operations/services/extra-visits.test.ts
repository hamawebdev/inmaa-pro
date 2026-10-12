import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime, minutes } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listExtraVisitProposals, onDemandJobFinished, planExtraVisit, type PlanExtraVisitInput } from "./extra-visits";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** An organisation contract in its zone, with the zone's supervisor. */
async function contractFile() {
  const zone = await test.rows.insert("Zone", { name: "عين البيضاء" });
  const supervisor = await test.rows.insert("StaffMember", { kind: "EMPLOYEE", firstName: "سميرة" } as never);
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
  } as never);
  return { zone, supervisor, site, file };
}

/** A visit done on Saturday 10 October whose returned order says whether another visit is needed. */
async function returnedVisit(
  setting: Awaited<ReturnType<typeof contractFile>>,
  report: { needsExtraVisit: number | null; completion?: string },
) {
  const visit = await test.rows.insert("Visit", {
    fileId: setting.file.id,
    visitDate: localDate("2026-10-10"),
    plannedStartTime: localTime("08:00"),
    plannedDurationMin: minutes(180),
    workersNeeded: 2,
    zoneId: setting.zone.id,
    supervisorEmployeeId: setting.supervisor.id,
    status: "DONE",
  });
  await test.rows.insert("VisitReport", {
    visitId: visit.id,
    entryState: "COMPLETE",
    completion: report.completion ?? "PARTIAL",
    completionPercent: 70,
    incompleteReason: "انقطاع الماء",
    needsExtraVisit: report.needsExtraVisit,
  });
  return visit;
}

const plan = (input: PlanExtraVisitInput) => test.transact((ex, ctx) => planExtraVisit(ex, ctx, input));
const proposals = (fileId?: string) => test.transact((ex, ctx) => listExtraVisitProposals(ex, ctx, { fileId }));

describe("extra visits", () => {
  it("lists the orders that asked for one until an extra visit is planned from them", async () => {
    const office = await contractFile();
    const asked = await returnedVisit(office, { needsExtraVisit: 1 });
    await returnedVisit(office, { needsExtraVisit: 0, completion: "FULL" });
    await returnedVisit(office, { needsExtraVisit: null, completion: "FULL" });
    const elsewhere = await contractFile();
    const askedElsewhere = await returnedVisit(elsewhere, { needsExtraVisit: 1 });

    expect((await proposals()).map((proposal) => proposal.visitId).sort()).toEqual(
      [asked.id, askedElsewhere.id].sort(),
    );
    const [proposal] = await proposals(office.file.id);
    expect(proposal).toMatchObject({
      visitId: asked.id,
      visitDate: "2026-10-10",
      fileId: office.file.id,
      division: "ORGANISATION",
      siteName: "مكتب المحامي",
      completion: "PARTIAL",
      completionPercent: 70,
      incompleteReason: "انقطاع الماء",
    });

    const { visitId, number } = await plan({ sourceVisitId: asked.id, date: "2026-10-14" });
    expect(number).toBe("00001/2026");
    expect(
      await test.db.selectFrom("Visit").selectAll().where("id", "=", visitId).executeTakeFirstOrThrow(),
    ).toMatchObject({
      origin: "EXTRA",
      sourceVisitId: asked.id,
      fileId: office.file.id,
      fileSlotId: null,
      slotDate: null,
      visitDate: "2026-10-14",
      plannedStartTime: "08:00",
      plannedDurationMin: 180,
      workersNeeded: 2,
      zoneId: office.zone.id,
      supervisorEmployeeId: office.supervisor.id,
      status: "AWAITING_CONFIRMATION",
      isManuallyEdited: 0,
    });
    expect(await test.db.selectFrom("VisitWorker").selectAll().where("visitId", "=", visitId).execute()).toHaveLength(
      0,
    );
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "CHANGE", action: "CREATE", entity: "Visit", entityId: visitId });

    expect(await proposals(office.file.id)).toEqual([]);
    await expect(plan({ sourceVisitId: asked.id, date: "2026-10-15" })).rejects.toThrow(
      "An extra visit is already planned for this visit.",
    );
  });

  it("takes the hours and headcount given, and its number in the year of its date", async () => {
    const office = await contractFile();
    const asked = await returnedVisit(office, { needsExtraVisit: 1 });
    const { visitId, number } = await plan({
      sourceVisitId: asked.id,
      date: "2027-01-05",
      startTime: "13:30",
      durationMin: 90,
      workersNeeded: 1,
    });
    expect(number).toBe("00001/2027");
    expect(
      await test.db.selectFrom("Visit").selectAll().where("id", "=", visitId).executeTakeFirstOrThrow(),
    ).toMatchObject({
      visitDate: "2027-01-05",
      plannedStartTime: "13:30",
      plannedDurationMin: 90,
      workersNeeded: 1,
    });
  });

  it("refuses a day already past, a wrong time or count, and an unknown visit", async () => {
    const office = await contractFile();
    const asked = await returnedVisit(office, { needsExtraVisit: 1 });
    await expect(plan({ sourceVisitId: asked.id, date: "2026-10-11" })).rejects.toThrow(
      "An extra visit is planned for today or later.",
    );
    await expect(plan({ sourceVisitId: asked.id, date: "2026-02-30" })).rejects.toThrow("Enter a valid date.");
    await expect(plan({ sourceVisitId: asked.id, date: "2026-10-14", startTime: "25:00" })).rejects.toThrow(
      "Enter a time as HH:MM.",
    );
    await expect(plan({ sourceVisitId: asked.id, date: "2026-10-14", workersNeeded: 0 })).rejects.toThrow(
      "A number must be a whole number of at least 1.",
    );
    await expect(plan({ sourceVisitId: "nothing", date: "2026-10-14" })).rejects.toThrow("This visit does not exist.");
    // Today itself is allowed.
    await expect(plan({ sourceVisitId: asked.id, date: "2026-10-12" })).resolves.toMatchObject({
      number: "00001/2026",
    });
  });
});

describe("onDemandJobFinished", () => {
  /** A housing job of two days, 20 and 21 October, contracted. */
  async function twoDayJob() {
    const site = await test.rows.insert("Site", { division: "HOUSING" });
    const file = await test.rows.insert("File", {
      siteId: site.id,
      clientId: site.clientId,
      division: "HOUSING",
      serviceType: "ON_DEMAND",
      formKind: "HOUSING_REQUEST",
      stage: "CONTRACTED",
    } as never);
    const day = (date: string, status: string) =>
      test.rows.insert("Visit", { fileId: file.id, origin: "ON_DEMAND", visitDate: localDate(date), status });
    return { file, site, first: await day("2026-10-20", "DONE"), second: await day("2026-10-21", "CONFIRMED") };
  }

  const finished = (fileId: string) => test.transact((ex) => onDemandJobFinished(ex, fileId));
  const setVisit = (id: string, values: Record<string, unknown>) =>
    test.db.updateTable("Visit").set(values).where("id", "=", id).execute();

  it("waits for every day of the job", async () => {
    const { file, second } = await twoDayJob();
    expect(await finished(file.id)).toBe(false);
    await setVisit(second.id, { status: "DONE" });
    expect(await finished(file.id)).toBe(true);
  });

  it("waits for an open complaint, an open redo, an extra visit and a postponed day without its new date", async () => {
    const { file, second, site } = await twoDayJob();
    await setVisit(second.id, { status: "DONE" });

    const complaint = await test.rows.insert("Complaint", { clientId: site.clientId, fileId: file.id, status: "NEW" });
    expect(await finished(file.id)).toBe(false);
    await test.db.updateTable("Complaint").set({ status: "IN_PROGRESS" }).where("id", "=", complaint.id).execute();
    expect(await finished(file.id)).toBe(false);
    await test.db.updateTable("Complaint").set({ status: "SETTLED" }).where("id", "=", complaint.id).execute();
    expect(await finished(file.id)).toBe(true);

    const redo = await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "REDO",
      sourceVisitId: second.id,
      status: "PROBLEM",
      statusReason: "OTHER",
    });
    expect(await finished(file.id)).toBe(false);
    await setVisit(redo.id, { status: "DONE", statusReason: null });
    expect(await finished(file.id)).toBe(true);

    const extra = await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "EXTRA",
      sourceVisitId: second.id,
      status: "AWAITING_CONFIRMATION",
    });
    expect(await finished(file.id)).toBe(false);
    await setVisit(extra.id, { status: "CANCELLED", statusReason: "CLIENT_REQUEST" });
    expect(await finished(file.id)).toBe(true);

    const postponed = await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "ON_DEMAND",
      visitDate: localDate("2026-10-22"),
      status: "POSTPONED",
      statusReason: "CLIENT_REQUEST",
    });
    expect(await finished(file.id)).toBe(false);
    const makeup = await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "MAKEUP",
      sourceVisitId: postponed.id,
      visitDate: localDate("2026-10-24"),
      status: "DONE",
    });
    await setVisit(postponed.id, { rescheduledToVisitId: makeup.id });
    expect(await finished(file.id)).toBe(true);
  });

  it("is never true for a contract, nor for a job already closed", async () => {
    const { file, second } = await twoDayJob();
    await setVisit(second.id, { status: "DONE" });
    await test.db.updateTable("File").set({ serviceType: "CONTRACT" }).where("id", "=", file.id).execute();
    expect(await finished(file.id)).toBe(false);
    await test.db
      .updateTable("File")
      .set({ serviceType: "ON_DEMAND", closedAt: "2026-10-21T16:00:00.000Z" })
      .where("id", "=", file.id)
      .execute();
    expect(await finished(file.id)).toBe(false);
  });

  it("closes the job through Clients' closeFile when the last day is signed off", async () => {
    const { file, second } = await twoDayJob();
    await setVisit(second.id, { status: "DONE" });
    await test.rows.insert("VisitReport", {
      visitId: second.id,
      entryState: "COMPLETE",
      completion: "FULL",
      signoffStatus: "ACCEPTED",
    });
    await test.transact((ex, ctx) => emit(ex, ctx, "visit.signedOff", { visitId: second.id }));
    const after = await test.db
      .selectFrom("File")
      .select(["stage", "endKind", "endedDate", "closeReason"])
      .where("id", "=", file.id)
      .executeTakeFirstOrThrow();
    expect(after).toMatchObject({ stage: "CONTRACT_ENDED", endKind: "JOB_DONE", closeReason: "JOB_DONE" });
    expect(after.endedDate).toBe(second.visitDate);
    const closed = await test.db
      .selectFrom("File")
      .select("closedAt")
      .where("id", "=", file.id)
      .executeTakeFirstOrThrow();
    expect(closed.closedAt).not.toBeNull();
  });

  it("keeps the job open while an extra visit asked for on the order is not planned", async () => {
    const { file, second } = await twoDayJob();
    await setVisit(second.id, { status: "DONE" });
    await test.rows.insert("VisitReport", {
      visitId: second.id,
      entryState: "COMPLETE",
      completion: "FULL",
      signoffStatus: "ACCEPTED",
      needsExtraVisit: 1,
    });
    await test.transact((ex, ctx) => emit(ex, ctx, "visit.signedOff", { visitId: second.id }));
    const after = await test.db
      .selectFrom("File")
      .select(["stage", "closedAt"])
      .where("id", "=", file.id)
      .executeTakeFirstOrThrow();
    expect(after).toEqual({ stage: "CONTRACTED", closedAt: null });
  });
});
