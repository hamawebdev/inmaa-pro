import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { entryValuesOf } from "../components/visit-entry/visit-entry-data";
import type { ReturnedOrderValues, ReturnedWorkerTime } from "../validators/returned-order";
import { recordWorkerAbsence, setAbsencePayTreatment, type RecordWorkerAbsenceInput } from "./absences";
import { assignVisitWorker } from "./assignment";
import { getVisitEntry, saveReturnedOrder } from "./visit-entry";
import {
  attendanceTotals,
  dayStateOf,
  listAttendanceAbsences,
  listAttendanceOverview,
  listWorkerAttendanceHistory,
  mergeAbsenceParts,
  momentNear,
} from "./worker-attendance";

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

/** A cleaning worker who may be given visits; the last name orders the list. */
async function worker(lastName: string, over: Record<string, unknown> = {}) {
  return test.rows.insert("StaffMember", {
    firstName: "سعاد",
    lastName,
    role: "CLEANER",
    engagementStatus: "ACCEPTED",
    sex: "FEMALE",
    availableDays: JSON.stringify(WORKING_DAYS),
    ...over,
  } as never);
}

const assign = async (visitId: string, workerId: string) =>
  (await test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId, workerId }))).seatId;

type SheetLine = Partial<Record<ReturnedWorkerTime, string>> & { arrival?: boolean; departure?: boolean };

/**
 * The returned order typed in: the lines given by seat, each initialled as
 * said (both by default); with `complete`, the rest of the sheet too.
 */
async function typeOrder(visitId: string, lines: Record<string, SheetLine>, complete = false) {
  const data = await test.transact((ex, ctx) => getVisitEntry(ex, ctx, { visitId }));
  const blank = entryValuesOf(data, data.visit.visitDate);
  const values: ReturnedOrderValues = {
    ...blank,
    workers: blank.workers.map((line) => {
      const typed = lines[line.seatId];
      if (!typed) return line;
      return {
        ...line,
        attended: true,
        arrivedTime: typed.arrivedTime ?? "",
        workStartTime: typed.workStartTime ?? "",
        workEndTime: typed.workEndTime ?? "",
        leftTime: typed.leftTime ?? "",
        arrivalInitialled: typed.arrival ?? true,
        departureInitialled: typed.departure ?? true,
      };
    }),
    ...(complete
      ? {
          checklist: blank.checklist.map((line) => ({ ...line, done: true })),
          problemOnSite: false,
          completion: "FULL" as const,
          completionPercent: 100,
          needsExtraVisit: false,
          needsSupervisor: false,
          signoffStatus: "ACCEPTED" as const,
          signoffName: "ليلى حمدي",
          signoffDate: data.visit.visitDate,
          ratings: { quality: 5, punctuality: 5, behaviour: 5, materials: 5, overall: 5 },
          wouldRecommend: true,
          signedOnPaper: true,
          workerSigned: true,
        }
      : {}),
  };
  return test.transact((ex, ctx) => saveReturnedOrder(ex, ctx, { visitId, values }));
}

const record = (input: Partial<RecordWorkerAbsenceInput> & { workerId: string }) =>
  test.transact((ex, ctx) =>
    recordWorkerAbsence(ex, ctx, {
      startDate: "2026-11-02",
      endDate: "2026-11-02",
      type: "FULL_DAY",
      category: "SICK",
      reportedVia: "PHONE",
      ...input,
    }),
  );

const overview = (date: string) => test.transact((ex, ctx) => listAttendanceOverview(ex, ctx, { date }));
const rowOf = (rows: Awaited<ReturnType<typeof overview>>["rows"], workerId: string) => {
  const row = rows.find((each) => each.worker.id === workerId);
  if (!row) throw new Error(`test: ${workerId} is not on the day sheet`);
  return row;
};

describe("listAttendanceOverview", () => {
  it("lists every worker who may be given visits, with her seats of the day and the times typed", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const a = await worker("أحمد");
    const b = await worker("بوزيد");
    const c = await worker("تومي");
    await worker("ثابت", { engagementStatus: "LEFT" });
    const seatA = await assign(monday.id, a.id);
    const seatB = await assign(monday.id, b.id);
    await typeOrder(monday.id, {
      [seatA]: { arrivedTime: "08:20", workStartTime: "08:25", workEndTime: "11:00", leftTime: "11:05" },
      [seatB]: {
        arrivedTime: "07:55",
        workStartTime: "08:00",
        workEndTime: "11:00",
        leftTime: "11:10",
        departure: false,
      },
    });
    test.clock.set("2026-11-02T15:00:00.000Z");

    const day = await overview("2026-11-02");
    expect(day.date).toBe("2026-11-02");
    expect(day.graceMin).toBe(15);
    expect(day.periods).toEqual({ MORNING: { from: "08:00", to: "12:00" }, EVENING: { from: "13:30", to: "16:00" } });
    expect(day.rows.map((row) => row.worker.id)).toEqual([a.id, b.id, c.id]);

    const rowA = rowOf(day.rows, a.id);
    expect(rowA).toMatchObject({
      worker: { number: a.number, lastName: "أحمد", schedulable: true },
      state: "PRESENT",
      absence: null,
      leaveRequested: false,
      lastArrival: { date: "2026-11-02", time: "08:20" },
      lastDeparture: { date: "2026-11-02", time: "11:05" },
    });
    expect(rowA.seats).toEqual([
      {
        seatId: seatA,
        seatStatus: "ASSIGNED",
        absenceId: null,
        visitId: monday.id,
        visitNumber: monday.number,
        visitStatus: "IN_PROGRESS",
        visitDate: "2026-11-02",
        siteName: "مكتب المحامي",
        plannedStartTime: "08:00",
        plannedEndTime: "11:00",
        plannedDurationMin: 180,
        arrivedTime: "08:20",
        workStartTime: "08:25",
        workEndTime: "11:00",
        leftTime: "11:05",
        lateMin: 20,
        lateReason: null,
        workedMin: 155,
        presenceProof: "BOTH",
        entryState: "PARTIAL",
      },
    ]);
    expect(rowOf(day.rows, b.id).seats[0]).toMatchObject({ seatId: seatB, lateMin: 0, presenceProof: "ARRIVAL_ONLY" });
    expect(rowOf(day.rows, c.id)).toMatchObject({
      seats: [],
      state: "NO_VISIT",
      lastArrival: null,
      lastDeparture: null,
    });
  });

  it("shows the absence that covers her day, a leave asked for, and the visits not typed yet", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const a = await worker("أحمد");
    const b = await worker("بوزيد");
    const seatA = await assign(monday.id, a.id);
    await assign(monday.id, b.id);
    const { absenceIds } = await record({ workerId: a.id });
    await record({ workerId: b.id, category: "LEAVE", leaveType: "ANNUAL", days: 1000, status: "REQUESTED" });

    const ahead = await overview("2026-11-02");
    expect(rowOf(ahead.rows, a.id)).toMatchObject({
      state: "ABSENT",
      absence: { id: absenceIds[0], type: "FULL_DAY", category: "SICK", status: "RECORDED" },
      seats: [{ seatId: seatA, seatStatus: "ABSENT", absenceId: absenceIds[0], visitStatus: "AWAITING_CONFIRMATION" }],
    });
    expect(rowOf(ahead.rows, b.id)).toMatchObject({ state: "SCHEDULED", absence: null, leaveRequested: true });

    test.clock.set("2026-11-02T15:00:00.000Z");
    const after = await overview("2026-11-02");
    expect(rowOf(after.rows, b.id).state).toBe("NOT_TYPED");
    // The day before: nobody has a seat, and nothing covers it.
    const sunday = await overview("2026-11-01");
    expect(sunday.rows.map((row) => [row.state, row.absence, row.leaveRequested])).toEqual([
      ["NO_VISIT", null, false],
      ["NO_VISIT", null, false],
    ]);
  });

  it("gives the last arrival and departure typed on that date or before, and lists a worker gone since", async () => {
    const { on } = await contracted();
    const saturday = on("2026-11-07");
    const monday = on("2026-11-09");
    const a = await worker("أحمد");
    const gone = await worker("ثابت", { engagementStatus: "LEFT" });
    const seatA = await assign(saturday.id, a.id);
    await assign(monday.id, a.id);
    // She left the centre after this visit: her seat was given before she went.
    await test.rows.insert("VisitWorker", {
      visitId: monday.id,
      workerId: gone.id,
      role: "MEMBER",
      seatStatus: "ASSIGNED",
    });
    await typeOrder(saturday.id, {
      [seatA]: { arrivedTime: "07:58", workStartTime: "08:00", workEndTime: "11:00", leftTime: "11:00" },
    });

    expect(rowOf((await overview("2026-11-06")).rows, a.id)).toMatchObject({ lastArrival: null, lastDeparture: null });
    const sunday = await overview("2026-11-08");
    expect(rowOf(sunday.rows, a.id)).toMatchObject({
      state: "NO_VISIT",
      lastArrival: { date: "2026-11-07", time: "07:58" },
      lastDeparture: { date: "2026-11-07", time: "11:00" },
    });
    expect(sunday.rows.map((row) => row.worker.id)).not.toContain(gone.id);

    const mondaySheet = await overview("2026-11-09");
    expect(rowOf(mondaySheet.rows, gone.id)).toMatchObject({
      worker: { schedulable: false },
      state: "SCHEDULED",
      seats: [{ visitId: monday.id, seatStatus: "ASSIGNED" }],
    });
  });

  it("leaves out the seats of a visit that does not take place", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const a = await worker("أحمد");
    await assign(monday.id, a.id);
    await test.raw.exec(
      `UPDATE "Visit" SET "status" = 'CANCELLED', "statusReason" = 'CLIENT_REQUEST' WHERE "id" = '${monday.id}'`,
    );
    expect(rowOf((await overview("2026-11-02")).rows, a.id)).toMatchObject({ seats: [], state: "NO_VISIT" });
  });
});

describe("listWorkerAttendanceHistory", () => {
  it("lists her seats of the range with the four times, the minutes, the order and the visit, and her absences", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const wednesday = on("2026-11-04");
    const saturday = on("2026-11-07");
    const a = await worker("أحمد");
    const b = await worker("بوزيد");
    const seatMonday = await assign(monday.id, a.id);
    const seatPartner = await assign(monday.id, b.id);
    const seatWednesday = await assign(wednesday.id, a.id);
    const seatSaturday = await assign(saturday.id, a.id);
    await typeOrder(
      monday.id,
      {
        [seatMonday]: { arrivedTime: "08:20", workStartTime: "08:25", workEndTime: "11:00", leftTime: "11:05" },
        [seatPartner]: { arrivedTime: "08:00", workStartTime: "08:00", workEndTime: "11:00", leftTime: "11:00" },
      },
      true,
    );
    const { absenceIds } = await record({ workerId: a.id, startDate: "2026-11-04", endDate: "2026-11-04" });

    const history = await test.transact((ex, ctx) =>
      listWorkerAttendanceHistory(ex, ctx, { workerId: a.id, from: "2026-11-01", to: "2026-11-30" }),
    );
    expect(history.worker).toMatchObject({ id: a.id, number: a.number, lastName: "أحمد" });
    expect(history).toMatchObject({ from: "2026-11-01", to: "2026-11-30", graceMin: 15 });
    expect(history.seats.map((seat) => [seat.seatId, seat.visitNumber, seat.visitStatus, seat.seatStatus])).toEqual([
      [seatMonday, monday.number, "DONE", "ASSIGNED"],
      [seatWednesday, wednesday.number, "AWAITING_CONFIRMATION", "ABSENT"],
      [seatSaturday, saturday.number, "AWAITING_CONFIRMATION", "ASSIGNED"],
    ]);
    expect(history.seats[0]).toMatchObject({
      arrivedTime: "08:20",
      workStartTime: "08:25",
      workEndTime: "11:00",
      leftTime: "11:05",
      lateMin: 20,
      workedMin: 155,
      entryState: "COMPLETE",
    });
    expect(history.absences).toHaveLength(1);
    expect(history.absences[0]).toMatchObject({
      id: absenceIds[0],
      absenceIds,
      worker: { id: a.id },
      startDate: "2026-11-04",
      endDate: "2026-11-04",
      category: "SICK",
      status: "RECORDED",
      paid: "NO",
      justified: "NO",
    });
    expect(history.totals).toEqual({
      expected: 3,
      present: 1,
      absent: 1,
      workedMin: 155,
      lateCount: 1,
      lateMin: 20,
    });

    const other = await test.transact((ex, ctx) =>
      listWorkerAttendanceHistory(ex, ctx, { workerId: a.id, from: "2026-12-01", to: "2026-12-31" }),
    );
    expect(other).toMatchObject({ seats: [], absences: [], totals: { expected: 0, workedMin: 0 } });
  });

  it("refuses an unknown worker, a reversed range, and a reader of neither section", async () => {
    const a = await worker("أحمد");
    await expect(
      test.transact((ex, ctx) =>
        listWorkerAttendanceHistory(ex, ctx, { workerId: "nobody", from: "2026-11-01", to: "2026-11-30" }),
      ),
    ).rejects.toThrow("This worker does not exist.");
    await expect(
      test.transact((ex, ctx) =>
        listWorkerAttendanceHistory(ex, ctx, { workerId: a.id, from: "2026-11-30", to: "2026-11-01" }),
      ),
    ).rejects.toThrow("The start of the period is after its end.");
    await expect(overview("2026-11-31")).rejects.toThrow("Enter a valid date.");

    const hr = await test.sessionFor("HR_OFFICER");
    const reception = await test.sessionFor("RECEPTION_SALES");
    const day = await test.transact((ex, ctx) => listAttendanceOverview(ex, ctx, { date: "2026-11-02" }), hr);
    expect(day.rows.map((row) => row.worker.id)).toEqual([a.id]);
    await test.transact((ex, ctx) => listAttendanceOverview(ex, ctx, { date: "2026-11-02" }), reception);
    const nobody = { ...reception, sections: {} };
    await expect(
      test.transact((ex, ctx) => listAttendanceOverview(ex, ctx, { date: "2026-11-02" }), nobody),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => listAttendanceAbsences(ex, ctx, { from: "2026-11-01", to: "2026-11-30" }), nobody),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("listAttendanceAbsences", () => {
  it("lists each absence whole, its month parts put back together, with whose it is", async () => {
    const a = await worker("أحمد");
    const b = await worker("بوزيد");
    const leave = await record({
      workerId: a.id,
      startDate: "2026-11-29",
      endDate: "2026-12-02",
      category: "LEAVE",
      leaveType: "ANNUAL",
      days: 4000,
      status: "APPROVED",
    });
    expect(leave.absenceIds).toHaveLength(2);
    await test.transact((ex, ctx) =>
      setAbsencePayTreatment(ex, ctx, { absenceId: leave.absenceIds[0], paid: true, justified: true }),
    );
    const sick = await record({ workerId: b.id, startDate: "2026-12-07", endDate: "2026-12-07" });

    const december = await test.transact((ex, ctx) =>
      listAttendanceAbsences(ex, ctx, { from: "2026-12-01", to: "2026-12-31" }),
    );
    expect(december.map((line) => [line.id, line.worker?.id, line.startDate, line.endDate])).toEqual([
      [leave.absenceIds[0], a.id, "2026-11-29", "2026-12-02"],
      [sick.absenceIds[0], b.id, "2026-12-07", "2026-12-07"],
    ]);
    expect(december[0]).toMatchObject({
      absenceIds: leave.absenceIds,
      absenceMin: 4 * 480,
      days: 4000,
      category: "LEAVE",
      leaveType: "ANNUAL",
      status: "APPROVED",
      paid: "PARTLY",
      justified: "PARTLY",
    });

    const november = await test.transact((ex, ctx) =>
      listAttendanceAbsences(ex, ctx, { from: "2026-11-01", to: "2026-11-30", workerId: a.id }),
    );
    expect(november.map((line) => [line.id, line.endDate])).toEqual([[leave.absenceIds[0], "2026-12-02"]]);
    const hers = await test.transact((ex, ctx) =>
      listAttendanceAbsences(ex, ctx, { from: "2026-12-01", to: "2026-12-31", workerId: b.id }),
    );
    expect(hers.map((line) => line.id)).toEqual([sick.absenceIds[0]]);
  });
});

describe("the rules of the day sheet", () => {
  it("reads a typed time on the day nearest the visit", () => {
    expect(momentNear("2026-11-02", "08:05", 480)).toEqual({ date: "2026-11-02", time: "08:05" });
    // A night visit 22:00 to 02:00: the departure is the next morning.
    expect(momentNear("2026-11-02", "02:10", 22 * 60 + 240)).toEqual({ date: "2026-11-03", time: "02:10" });
    // An arrival just before a visit planned at midnight is the evening before.
    expect(momentNear("2026-11-02", "23:50", 0)).toEqual({ date: "2026-11-01", time: "23:50" });
  });

  it("says her day in one word", () => {
    const at = { date: "2026-11-02", today: "2026-11-02" };
    const seat = (seatStatus: string, arrivedTime: string | null = null) => ({ seatStatus, arrivedTime });
    expect(dayStateOf({ ...at, seats: [seat("ASSIGNED", "08:00")], absenceInForce: true })).toBe("PRESENT");
    expect(dayStateOf({ ...at, seats: [seat("ASSIGNED")], absenceInForce: false })).toBe("NOT_TYPED");
    expect(dayStateOf({ ...at, today: "2026-11-01", seats: [seat("ASSIGNED")], absenceInForce: false })).toBe(
      "SCHEDULED",
    );
    expect(dayStateOf({ ...at, seats: [seat("ABSENT")], absenceInForce: true })).toBe("ABSENT");
    expect(dayStateOf({ ...at, seats: [], absenceInForce: true })).toBe("ABSENT");
    expect(dayStateOf({ ...at, seats: [seat("RESTING")], absenceInForce: false })).toBe("RESTING");
    expect(dayStateOf({ ...at, seats: [seat("REPLACED")], absenceInForce: false })).toBe("NO_VISIT");
  });

  it("adds up a history, leaving out the visits that did not take place", () => {
    const seat = (over: Partial<Parameters<typeof attendanceTotals>[0][number]>) => ({
      seatStatus: "ASSIGNED",
      visitStatus: "DONE",
      arrivedTime: "08:00",
      lateMin: 0,
      workedMin: 180,
      ...over,
    });
    expect(
      attendanceTotals(
        [
          seat({ lateMin: 16, workedMin: 160 }),
          seat({ lateMin: 15 }),
          seat({ seatStatus: "ABSENT", arrivedTime: null, lateMin: null, workedMin: null }),
          seat({ visitStatus: "CANCELLED" }),
          seat({ seatStatus: "REPLACED" }),
          seat({ visitStatus: "CONFIRMED", arrivedTime: null, lateMin: null, workedMin: null }),
        ],
        15,
      ),
    ).toEqual({ expected: 4, present: 2, absent: 1, workedMin: 340, lateCount: 1, lateMin: 31 });
  });

  it("puts the parts of an absence back together", () => {
    const part = (id: string, startDate: string, endDate: string, over: Record<string, unknown> = {}) =>
      ({
        id,
        workerId: "w",
        startDate,
        endDate,
        type: "FULL_DAY",
        startTime: null,
        endTime: null,
        absenceMin: 480,
        category: "LEAVE",
        leaveType: "ANNUAL",
        days: 1000,
        splitGroupId: "g",
        paid: true,
        justified: false,
        plannedAhead: true,
        reportedVia: null,
        reason: null,
        details: null,
        status: "APPROVED",
        decidedAt: null,
        ...over,
      }) as Parameters<typeof mergeAbsenceParts>[0][number];
    const merged = mergeAbsenceParts([
      part("b", "2026-12-01", "2026-12-01"),
      part("alone", "2026-11-15", "2026-11-15", { splitGroupId: null, days: null }),
      part("a", "2026-11-30", "2026-11-30"),
    ]);
    expect(merged.map((line) => [line.id, line.absenceIds, line.startDate, line.endDate, line.days])).toEqual([
      ["alone", ["alone"], "2026-11-15", "2026-11-15", null],
      ["a", ["a", "b"], "2026-11-30", "2026-12-01", 2000],
    ]);
    expect(merged[1]).toMatchObject({ absenceMin: 960, paid: "YES", justified: "NO" });
  });
});
