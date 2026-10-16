import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime, minutes } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  cancelWorkerAbsence,
  decideWorkerLeave,
  listWorkerAbsences,
  monthParts,
  recordWorkerAbsence,
  replaceSeat,
  setAbsencePayTreatment,
  shareByDays,
  suggestReplacements,
  type RecordWorkerAbsenceInput,
} from "./absences";
import { assignVisitWorker } from "./assignment";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const WORKING_DAYS = ["SAT", "SUN", "MON", "TUE", "WED", "THU"];

/**
 * An organisation contract for November 2026 (Saturday, Monday, Wednesday,
 * 08:00 to 11:00, two workers), contracted so that its visits exist.
 */
async function contracted() {
  const zone = await test.rows.insert("Zone", { name: "أم البواقي" });
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
    period: "MORNING",
    arrivalTime: localTime("08:00"),
    departureTime: localTime("11:00"),
    startDate: localDate("2026-11-01"),
    endDate: localDate("2026-11-30"),
    workersCount: 2,
    visitsPerWeek: 3,
  } as never);
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
  const visits = await test.db.selectFrom("Visit").selectAll().where("fileId", "=", file.id).execute();
  const on = (date: string) => {
    const visit = visits.find((each) => each.visitDate === date);
    if (!visit) throw new Error(`test: no visit on ${date}`);
    return visit;
  };
  return { zone, site, file, on };
}

async function worker(over: Record<string, unknown> = {}) {
  return test.rows.insert("StaffMember", {
    role: "CLEANER",
    engagementStatus: "ACCEPTED",
    sex: "FEMALE",
    availableDays: JSON.stringify(WORKING_DAYS),
    ...over,
  } as never);
}

const assign = (visitId: string, workerId: string) =>
  test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId, workerId }));

/** Two workers on the visit of Monday 2 November: it is confirmed. */
async function confirmedMonday() {
  const arranged = await contracted();
  const monday = arranged.on("2026-11-02");
  const a = await worker({ zoneId: arranged.zone.id });
  const b = await worker({ zoneId: arranged.zone.id });
  const seatA = (await assign(monday.id, a.id)).seatId;
  const seatB = (await assign(monday.id, b.id)).seatId;
  return { ...arranged, monday, a, b, seatA, seatB };
}

const record = (input: Partial<RecordWorkerAbsenceInput> & { workerId: string }, session = test.manager) =>
  test.transact(
    (ex, ctx) =>
      recordWorkerAbsence(ex, ctx, {
        startDate: "2026-11-02",
        endDate: "2026-11-02",
        type: "FULL_DAY",
        category: "SICK",
        reportedVia: "PHONE",
        ...input,
      }),
    session,
  );

const seat = (id: string) =>
  test.db.selectFrom("VisitWorker").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const visitStatus = async (id: string) =>
  (await test.db.selectFrom("Visit").select("status").where("id", "=", id).executeTakeFirstOrThrow()).status;
const absences = (workerId: string) =>
  test.db.selectFrom("WorkerAbsence").selectAll().where("workerId", "=", workerId).orderBy("startDate").execute();
const logOf = (action: string) =>
  test.db.selectFrom("AuditLog").selectAll().where("action", "=", action).orderBy("chainSeq").execute();

describe("recordWorkerAbsence", () => {
  it("makes her seats of the day absent and returns the visit to awaiting confirmation", async () => {
    const { monday, a, seatA, seatB, on } = await confirmedMonday();
    const wednesday = on("2026-11-04");
    await assign(wednesday.id, a.id);

    const result = await record({ workerId: a.id });
    expect(result.seatsHit).toEqual([
      { seatId: seatA, visitId: monday.id, visitNumber: monday.number, visitDate: "2026-11-02" },
    ]);
    const [row] = await absences(a.id);
    expect(result.absenceIds).toEqual([row.id]);
    expect(row).toMatchObject({
      type: "FULL_DAY",
      startTime: null,
      endTime: null,
      absenceMin: 480,
      splitGroupId: null,
      plannedAhead: 1,
      status: "RECORDED",
      reportedVia: "PHONE",
    });
    expect(await seat(seatA)).toMatchObject({ seatStatus: "ABSENT", absenceId: row.id });
    expect(await seat(seatB)).toMatchObject({ seatStatus: "ASSIGNED", absenceId: null });
    expect(await visitStatus(monday.id)).toBe("AWAITING_CONFIRMATION");

    const [collected] = (await logOf("CREATE")).filter((entry) => entry.entity === "WorkerAbsence");
    expect(collected).toMatchObject({ operation: "COLLECT", entityId: row.id, subjectKind: "WORKER", subjectId: a.id });
    expect(JSON.parse(collected.context ?? "{}").seats).toEqual([
      { seatId: seatA, visit: monday.number, date: "2026-11-02" },
    ]);
  });

  it("cuts a range that crosses a month end into one row per month, sharing the leave days", async () => {
    const { on } = await contracted();
    const lastMonday = on("2026-11-30");
    const a = await worker();
    const seatA = (await assign(lastMonday.id, a.id)).seatId;

    const result = await record({
      workerId: a.id,
      startDate: "2026-11-30",
      endDate: "2026-12-02",
      category: "LEAVE",
      leaveType: "ANNUAL",
      days: 3000,
      paid: true,
      status: "APPROVED",
    });
    const rows = await absences(a.id);
    expect(rows.map((row) => [row.startDate, row.endDate, row.absenceMin, row.days, row.status])).toEqual([
      ["2026-11-30", "2026-11-30", 480, 1000, "APPROVED"],
      ["2026-12-01", "2026-12-02", 960, 2000, "APPROVED"],
    ]);
    expect(rows[0].splitGroupId).not.toBeNull();
    expect(rows[1].splitGroupId).toBe(rows[0].splitGroupId);
    expect(rows.every((row) => row.paid === 1 && row.decidedByUserId === test.manager.userId)).toBe(true);
    expect(result.absenceIds).toEqual(rows.map((row) => row.id));
    expect(result.seatsHit.map((hit) => hit.seatId)).toEqual([seatA]);
    expect((await seat(seatA)).absenceId).toBe(rows[0].id);
  });

  it("takes half a day in the morning period unless told otherwise, and hits only the visits of those hours", async () => {
    const { monday, a, seatA } = await confirmedMonday();
    const file = await test.rows.make("File");
    const afternoon = await test.rows.insert("Visit", {
      fileId: file.id,
      visitDate: localDate("2026-11-02"),
      plannedStartTime: localTime("14:00"),
      plannedDurationMin: minutes(120),
      workersNeeded: 1,
      status: "CONFIRMED",
    });
    const later = (await assign(afternoon.id, a.id)).seatId;

    const result = await record({ workerId: a.id, type: "HALF_DAY", category: "PERSONAL" });
    const [row] = await absences(a.id);
    expect(row).toMatchObject({ startTime: "08:00", endTime: "12:00", absenceMin: 240 });
    expect(result.seatsHit.map((hit) => hit.visitId)).toEqual([monday.id]);
    expect((await seat(seatA)).seatStatus).toBe("ABSENT");
    expect((await seat(later)).seatStatus).toBe("ASSIGNED");
    expect(await visitStatus(afternoon.id)).toBe("CONFIRMED");
  });

  it("opens no seat for a leave asked for, until it is approved", async () => {
    const { monday, a, seatA } = await confirmedMonday();
    const asked = await record({
      workerId: a.id,
      category: "LEAVE",
      leaveType: "FAMILY_EVENT",
      days: 1000,
      status: "REQUESTED",
    });
    expect(asked.seatsHit).toEqual([]);
    expect((await seat(seatA)).seatStatus).toBe("ASSIGNED");
    expect(await visitStatus(monday.id)).toBe("CONFIRMED");

    const [absenceId] = asked.absenceIds;
    await expect(
      test.transact((ex, ctx) => decideWorkerLeave(ex, ctx, { absenceId, status: "APPROVED", reason: "" })),
    ).rejects.toThrow("A reason is required.");
    const decided = await test.transact((ex, ctx) =>
      decideWorkerLeave(ex, ctx, { absenceId, status: "APPROVED", reason: "Mariage de sa sœur" }),
    );
    expect(decided.seatsHit.map((hit) => hit.seatId)).toEqual([seatA]);
    expect(await seat(seatA)).toMatchObject({ seatStatus: "ABSENT", absenceId });
    expect(await visitStatus(monday.id)).toBe("AWAITING_CONFIRMATION");
    const [row] = await absences(a.id);
    expect(row).toMatchObject({ status: "APPROVED", decidedByUserId: test.manager.userId });
    const [entry] = await logOf("APPROVE");
    expect(entry).toMatchObject({ entity: "WorkerAbsence", entityId: absenceId, reason: "Mariage de sa sœur" });

    await expect(
      test.transact((ex, ctx) => decideWorkerLeave(ex, ctx, { absenceId, status: "REFUSED", reason: "non" })),
    ).rejects.toThrow("Only a leave that was asked for can be approved or refused.");
  });

  it("refuses what cannot be recorded", async () => {
    const a = await worker();
    await expect(record({ workerId: a.id, startDate: "2026-11-03", endDate: "2026-11-02" })).rejects.toThrow(
      "The absence cannot end before it starts.",
    );
    await expect(record({ workerId: a.id, type: "HOURS", startTime: "09:00" })).rejects.toThrow(
      "Give both the start and the end time of the absence.",
    );
    await expect(record({ workerId: a.id, type: "HOURS", startTime: "11:00", endTime: "09:00" })).rejects.toThrow(
      "The end time must be after the start time.",
    );
    await expect(record({ workerId: a.id, type: "HOURS", startTime: "9h", endTime: "11:00" })).rejects.toThrow(
      "Enter a time as HH:MM.",
    );
    await expect(record({ workerId: a.id, category: "LEAVE", days: 1000 })).rejects.toThrow(
      "A leave needs its type and its number of days.",
    );
    await expect(record({ workerId: a.id, startDate: "2026-11-31", endDate: "2026-11-31" })).rejects.toThrow(
      "Enter a valid date.",
    );
    await expect(record({ workerId: "nobody" })).rejects.toThrow("This worker does not exist.");
    expect(await absences(a.id)).toEqual([]);
  });

  it("lets HR book through the workers section, and nobody without the right", async () => {
    const a = await worker();
    const hr = await test.sessionFor("HR_OFFICER");
    const accountant = await test.sessionFor("ACCOUNTANT");
    const booked = await record({ workerId: a.id, type: "HOURS", startTime: "09:00", endTime: "10:30" }, hr);
    expect(booked.absenceIds).toHaveLength(1);
    expect((await absences(a.id))[0].absenceMin).toBe(90);
    await expect(record({ workerId: a.id }, accountant)).rejects.toThrow("You do not have permission to do this.");
    const listed = await test.transact(
      (ex, ctx) => listWorkerAbsences(ex, ctx, { from: "2026-11-01", to: "2026-11-30" }),
      accountant,
    );
    expect(listed).toHaveLength(1);
  });
});

describe("cancelWorkerAbsence", () => {
  it("gives her seats back and the visit is confirmed again", async () => {
    const { monday, a, seatA } = await confirmedMonday();
    const { absenceIds } = await record({ workerId: a.id });
    await expect(
      test.transact((ex, ctx) => cancelWorkerAbsence(ex, ctx, { absenceId: absenceIds[0], reason: "  " })),
    ).rejects.toThrow("A reason is required.");

    const result = await test.transact((ex, ctx) =>
      cancelWorkerAbsence(ex, ctx, { absenceId: absenceIds[0], reason: "Elle est venue finalement" }),
    );
    expect(result.seatsGivenBack.map((hit) => hit.seatId)).toEqual([seatA]);
    expect(result.seatsReplaced).toEqual([]);
    expect(await seat(seatA)).toMatchObject({ seatStatus: "ASSIGNED", absenceId: null });
    expect(await visitStatus(monday.id)).toBe("CONFIRMED");
    expect((await absences(a.id))[0].status).toBe("CANCELLED");
    const [entry] = await logOf("CANCEL");
    expect(entry).toMatchObject({ entity: "WorkerAbsence", reason: "Elle est venue finalement", subjectId: a.id });

    await expect(
      test.transact((ex, ctx) => cancelWorkerAbsence(ex, ctx, { absenceId: absenceIds[0], reason: "encore" })),
    ).rejects.toThrow("This absence is already cancelled or refused.");
  });

  it("cancels every part of a leave cut at a month end", async () => {
    const a = await worker();
    const { absenceIds } = await record({ workerId: a.id, startDate: "2026-11-29", endDate: "2026-12-01" });
    expect(absenceIds).toHaveLength(2);
    await test.transact((ex, ctx) => cancelWorkerAbsence(ex, ctx, { absenceId: absenceIds[1], reason: "Erreur" }));
    expect((await absences(a.id)).map((row) => row.status)).toEqual(["CANCELLED", "CANCELLED"]);
  });

  it("leaves a seat taken over with her replacement", async () => {
    const { monday, a, seatA } = await confirmedMonday();
    const c = await worker();
    const { absenceIds } = await record({ workerId: a.id });
    const replaced = await test.transact((ex, ctx) =>
      replaceSeat(ex, ctx, { seatId: seatA, workerId: c.id, reason: "ABSENCE" }),
    );
    const result = await test.transact((ex, ctx) =>
      cancelWorkerAbsence(ex, ctx, { absenceId: absenceIds[0], reason: "Certificat refusé" }),
    );
    expect(result.seatsGivenBack).toEqual([]);
    expect(result.seatsReplaced.map((hit) => hit.seatId)).toEqual([seatA]);
    expect((await seat(seatA)).seatStatus).toBe("REPLACED");
    expect((await seat(replaced.seatId)).seatStatus).toBe("ASSIGNED");
    expect(await visitStatus(monday.id)).toBe("CONFIRMED");
  });
});

describe("replacement", () => {
  it("ranks the file's named alternate first, then the zone's reserve, the zone, and the others", async () => {
    const { file, zone, monday, a, b, seatA } = await confirmedMonday();
    const alternate = await worker({ lastName: "ي" });
    const reserve = await worker({ zoneId: zone.id, isReserve: 1, lastName: "ب" });
    const local = await worker({ zoneId: zone.id, lastName: "أ" });
    const far = await worker({ lastName: "ت" });
    const suspended = await worker({ zoneId: zone.id });
    await test.rows.insert("FileAssignment", {
      fileId: file.id,
      workerId: alternate.id,
      role: "ALTERNATE",
      validFrom: localDate("2026-11-01"),
      sortOrder: 0,
    });
    await test.rows.insert("Sanction", {
      subjectKind: "WORKER",
      staffId: suspended.id,
      state: "SUSPENDED",
      startDate: localDate("2026-10-01"),
    });
    await record({ workerId: a.id });

    const suggestions = await test.transact((ex, ctx) => suggestReplacements(ex, ctx, { seatId: seatA }));
    expect(suggestions).toMatchObject({ seatId: seatA, visitId: monday.id, visitDate: "2026-11-02" });
    expect(suggestions.ranked.map((ranked) => [ranked.workerId, ranked.tier])).toEqual([
      [alternate.id, "FILE_ALTERNATE"],
      [reserve.id, "RESERVE_SAME_ZONE"],
      [local.id, "WORKER_SAME_ZONE"],
      [far.id, "WORKER_OTHER_ZONE"],
    ]);
    expect(suggestions.ranked[0]).toMatchObject({ number: alternate.number, loadBeforeMin: 0, loadAfterMin: 180 });
    expect(suggestions.excluded).toEqual([
      expect.objectContaining({ workerId: suspended.id, reasons: ["SANCTIONED"], number: suspended.number }),
    ]);
    const offered = [...suggestions.ranked, ...suggestions.excluded].map((each) => each.workerId);
    expect(offered).not.toContain(a.id);
    expect(offered).not.toContain(b.id);
  });

  it("puts the replacement on the seat, keeps the absent seat for People and confirms the visit again", async () => {
    const { monday, a, seatA } = await confirmedMonday();
    const c = await worker();
    const { absenceIds } = await record({ workerId: a.id });
    expect(await visitStatus(monday.id)).toBe("AWAITING_CONFIRMATION");

    await expect(
      test.transact((ex, ctx) => replaceSeat(ex, ctx, { seatId: seatA, workerId: a.id, reason: "ABSENCE" })),
    ).rejects.toThrow("This worker is already on this visit.");
    const result = await test.transact((ex, ctx) =>
      replaceSeat(ex, ctx, { seatId: seatA, workerId: c.id, reason: "ABSENCE" }),
    );
    expect(result.status).toBe("CONFIRMED");
    expect(await seat(result.seatId)).toMatchObject({
      visitId: monday.id,
      workerId: c.id,
      seatStatus: "ASSIGNED",
      replacesVisitWorkerId: seatA,
      replacementReason: "ABSENCE",
      absenceId: absenceIds[0],
      replacedAt: test.clock.now().toISOString(),
      replacedByUserId: test.manager.userId,
    });
    expect(await seat(seatA)).toMatchObject({ seatStatus: "ABSENT", absenceId: absenceIds[0] });
    expect(await visitStatus(monday.id)).toBe("CONFIRMED");
  });

  it("marks a seat still held as replaced", async () => {
    const { monday, seatB } = await confirmedMonday();
    const c = await worker();
    const result = await test.transact((ex, ctx) =>
      replaceSeat(ex, ctx, { seatId: seatB, workerId: c.id, reason: "CLIENT_REQUEST" }),
    );
    expect(result.status).toBe("CONFIRMED");
    expect((await seat(seatB)).seatStatus).toBe("REPLACED");
    expect(await seat(result.seatId)).toMatchObject({ replacesVisitWorkerId: seatB, absenceId: null });
    expect(await visitStatus(monday.id)).toBe("CONFIRMED");
    await expect(
      test.transact((ex, ctx) => replaceSeat(ex, ctx, { seatId: seatB, workerId: c.id, reason: "ABSENCE" })),
    ).rejects.toThrow("Only a seat held or left by an absence can be replaced.");
  });
});

describe("the pay treatment and the list", () => {
  it("saves only what changed, logs it, and lists the absences of a range whatever their status", async () => {
    const a = await worker();
    const b = await worker();
    const { absenceIds } = await record({ workerId: a.id });
    const cancelled = await record({ workerId: b.id, startDate: "2026-11-10", endDate: "2026-11-10" });
    await test.transact((ex, ctx) =>
      cancelWorkerAbsence(ex, ctx, { absenceId: cancelled.absenceIds[0], reason: "Saisie en double" }),
    );
    await record({ workerId: a.id, startDate: "2026-12-07", endDate: "2026-12-07" });

    const first = await test.transact((ex, ctx) =>
      setAbsencePayTreatment(ex, ctx, { absenceId: absenceIds[0], paid: true, justified: true }),
    );
    expect(first).toEqual({ absenceId: absenceIds[0], changed: true });
    const again = await test.transact((ex, ctx) =>
      setAbsencePayTreatment(ex, ctx, { absenceId: absenceIds[0], paid: true, justified: true }),
    );
    expect(again.changed).toBe(false);
    const updates = (await logOf("UPDATE")).filter((entry) => entry.entity === "WorkerAbsence");
    expect(updates).toHaveLength(1);
    expect(JSON.parse(updates[0].changes ?? "{}")).toEqual({ paid: [0, 1], justified: [0, 1] });

    const november = await test.transact((ex, ctx) =>
      listWorkerAbsences(ex, ctx, { from: "2026-11-01", to: "2026-11-30" }),
    );
    expect(november.map((row) => [row.workerId, row.startDate, row.status, row.paid])).toEqual([
      [a.id, "2026-11-02", "RECORDED", true],
      [b.id, "2026-11-10", "CANCELLED", false],
    ]);
    const hers = await test.transact((ex, ctx) =>
      listWorkerAbsences(ex, ctx, { workerId: a.id, from: "2026-11-01", to: "2026-12-31" }),
    );
    expect(hers.map((row) => row.startDate)).toEqual(["2026-11-02", "2026-12-07"]);
  });
});

describe("month parts and shares", () => {
  it("cuts at every month end and shares whole thousandths that add up", () => {
    expect(monthParts("2026-12-30", "2027-02-01")).toEqual([
      { startDate: "2026-12-30", endDate: "2026-12-31", dayCount: 2 },
      { startDate: "2027-01-01", endDate: "2027-01-31", dayCount: 31 },
      { startDate: "2027-02-01", endDate: "2027-02-01", dayCount: 1 },
    ]);
    const shares = shareByDays(10000, [{ dayCount: 2 }, { dayCount: 31 }, { dayCount: 1 }]);
    expect(shares).toEqual([588, 9118, 294]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(10000);
  });
});

describe("HR's acts on a leave (audit ACC-2, LAB-12)", () => {
  const leave = (workerId: string, over: Partial<RecordWorkerAbsenceInput> = {}) => ({
    workerId,
    category: "LEAVE" as const,
    leaveType: "ANNUAL" as const,
    days: 1000,
    ...over,
  });

  it("leaves deciding, cancelling and paying a leave to staff.write, and recording an absence to the office (ACC-2)", async () => {
    const { a } = await confirmedMonday();
    const supervisor = await test.sessionFor("SUPERVISOR");
    const hr = await test.sessionFor("HR_OFFICER");

    // An ordinary absence: the office records and cancels it.
    const sick = await record({ workerId: a.id }, supervisor);
    await test.transact(
      (ex, ctx) => cancelWorkerAbsence(ex, ctx, { absenceId: sick.absenceIds[0], reason: "Elle est venue" }),
      supervisor,
    );

    const refused = "You do not have permission to do this.";
    await expect(record(leave(a.id, { status: "APPROVED" }), supervisor)).rejects.toThrow(refused);
    await expect(record({ workerId: a.id, paid: true }, supervisor)).rejects.toThrow(refused);
    const asked = await record(leave(a.id, { status: "REQUESTED" }), supervisor);
    const [absenceId] = asked.absenceIds;
    await expect(
      test.transact(
        (ex, ctx) => decideWorkerLeave(ex, ctx, { absenceId, status: "APPROVED", reason: "accord" }),
        supervisor,
      ),
    ).rejects.toThrow(refused);
    await expect(
      test.transact((ex, ctx) => cancelWorkerAbsence(ex, ctx, { absenceId, reason: "annulé" }), supervisor),
    ).rejects.toThrow(refused);
    await expect(
      test.transact(
        (ex, ctx) => setAbsencePayTreatment(ex, ctx, { absenceId, paid: true, justified: true }),
        supervisor,
      ),
    ).rejects.toThrow(refused);

    await test.transact(
      (ex, ctx) => decideWorkerLeave(ex, ctx, { absenceId, status: "APPROVED", reason: "accord" }),
      hr,
    );
    await test.transact((ex, ctx) => setAbsencePayTreatment(ex, ctx, { absenceId, paid: true, justified: true }), hr);
    await test.transact((ex, ctx) => cancelWorkerAbsence(ex, ctx, { absenceId, reason: "annulé" }), hr);
    expect((await absences(a.id)).map((row) => row.status)).toEqual(["CANCELLED", "CANCELLED"]);
  });

  it("refuses a leave of type sickness: a sickness is category SICK (LAB-12)", async () => {
    const a = await worker();
    const sentence = "Record a sickness under the category Sick, not as a type of leave.";
    await expect(record(leave(a.id, { leaveType: "SICK" }))).rejects.toThrow(sentence);
    const { absenceIds } = await record(leave(a.id));
    await expect(
      test.transact((ex, ctx) =>
        setAbsencePayTreatment(ex, ctx, { absenceId: absenceIds[0], paid: true, justified: true, leaveType: "SICK" }),
      ),
    ).rejects.toThrow(sentence);
  });
});

describe("cancelling an absence under the working-time rules (audit LAB-10)", () => {
  it("leaves a seat open when taking it back would put her on two visits at once (LAB-10)", async () => {
    const { monday, a, seatA } = await confirmedMonday();
    const { absenceIds } = await record({ workerId: a.id });
    // While she was absent, she was put on another visit at the same hour.
    const other = await test.rows.insert("Visit", {
      visitDate: localDate("2026-11-02"),
      plannedStartTime: localTime("08:30"),
      plannedDurationMin: minutes(120),
      status: "CONFIRMED",
    } as never);
    await test.rows.insert("VisitWorker", { visitId: other.id, workerId: a.id, seatStatus: "ASSIGNED" });

    const result = await test.transact((ex, ctx) =>
      cancelWorkerAbsence(ex, ctx, { absenceId: absenceIds[0], reason: "Elle est venue finalement" }),
    );
    expect(result.seatsGivenBack).toEqual([]);
    expect(result.seatsLeftOpen).toEqual([
      expect.objectContaining({ seatId: seatA, why: "This worker already has a visit at that time." }),
    ]);
    expect(await seat(seatA)).toMatchObject({ seatStatus: "REMOVED", absenceId: null });
    expect(await visitStatus(monday.id)).toBe("AWAITING_CONFIRMATION");
  });
});
