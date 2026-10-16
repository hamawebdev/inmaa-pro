import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { generateVisits, previewVisitGeneration } from "./programme";

const EVERY_DAY = JSON.stringify(["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"]);

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** An organisation contract for November 2026, as his form gives it, with two service ticks. */
async function contractFile(over: Record<string, unknown> = {}) {
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
    ...over,
  } as never);
  for (const [sortOrder, code] of ["FLOORS", "WINDOWS"].entries()) {
    await test.rows.insert("FileService", { fileId: file.id, list: "PROVIDED", code, sortOrder });
  }
  return { file, site, zone };
}

const visitsOf = (fileId: string) =>
  test.db.selectFrom("Visit").selectAll().where("fileId", "=", fileId).orderBy("visitDate").execute();

describe("file.contracted", () => {
  it("makes the slots, the programme row, the tasks and every visit between the two dates", async () => {
    const { file, zone } = await contractFile();
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));

    const slots = await test.db.selectFrom("FileSlot").selectAll().where("fileId", "=", file.id).execute();
    expect(slots.map((slot) => slot.dayOfWeek).sort()).toEqual([0, 2, 4]);
    expect(
      slots.every((slot) => slot.startTime === "08:00" && slot.durationMin === 180 && slot.workersNeeded === 2),
    ).toBe(true);

    const programme = await test.db
      .selectFrom("FileProgramme")
      .selectAll()
      .where("fileId", "=", file.id)
      .executeTakeFirstOrThrow();
    expect(programme).toMatchObject({ inspectionFrequency: "MONTHLY", inspectionStartDate: "2026-11-01" });

    const tasks = await test.db.selectFrom("FileTask").selectAll().where("fileId", "=", file.id).execute();
    expect(tasks.map((task) => [task.label, task.frequency, task.serviceCode])).toEqual([
      ["تنظيف الأرضيات", "DAILY", "FLOORS"],
      ["تنظيف النوافذ", "DAILY", "WINDOWS"],
    ]);

    const visits = await visitsOf(file.id);
    // November 2026: Saturdays 7..28 (4), Mondays 2..30 (5), Wednesdays 4..25 (4).
    expect(visits).toHaveLength(13);
    expect(visits[0]).toMatchObject({
      visitDate: "2026-11-02",
      slotDate: "2026-11-02",
      origin: "CONTRACT",
      plannedStartTime: "08:00",
      plannedDurationMin: 180,
      workersNeeded: 2,
      zoneId: zone.id,
      status: "AWAITING_CONFIRMATION",
      number: "00001/2026",
    });
    expect(new Set(visits.map((visit) => visit.number)).size).toBe(13);
  });

  it("never makes a visit twice", async () => {
    const { file } = await contractFile();
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    const again = await test.transact((ex, ctx) => generateVisits(ex, ctx, { fileId: file.id }));
    expect(again).toMatchObject({ planned: 13, created: 0 });
    expect(await visitsOf(file.id)).toHaveLength(13);
  });

  it("gives each visit the file's standing team, except a worker absent that day", async () => {
    const { file } = await contractFile();
    const leader = await test.rows.insert("StaffMember", { role: "TEAM_LEADER", engagementStatus: "ACCEPTED" });
    const member = await test.rows.insert("StaffMember", { role: "CLEANER", engagementStatus: "ACCEPTED" });
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
    await test.rows.insert("WorkerAbsence", {
      workerId: member.id,
      startDate: localDate("2026-11-09"),
      endDate: localDate("2026-11-09"),
      type: "FULL_DAY",
      absenceMin: 480,
      category: "SICK",
      status: "RECORDED",
    } as never);

    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));

    const visits = await visitsOf(file.id);
    const seats = await test.db
      .selectFrom("VisitWorker")
      .select(["visitId", "workerId", "role", "seatStatus"])
      .execute();
    const ninth = visits.find((visit) => visit.visitDate === "2026-11-09")!;
    expect(ninth.status).toBe("AWAITING_CONFIRMATION");
    expect(seats.filter((seat) => seat.visitId === ninth.id).map((seat) => seat.workerId)).toEqual([leader.id]);
    const second = visits.find((visit) => visit.visitDate === "2026-11-02")!;
    expect(second.status).toBe("CONFIRMED");
    expect(seats.filter((seat) => seat.visitId === second.id).map((seat) => seat.role)).toEqual([
      "TEAM_LEADER",
      "CLEANER",
    ]);
  });

  it("leaves the seat of a suspended or departed member open (RULINGS 11)", async () => {
    const { file } = await contractFile();
    const suspended = await test.rows.insert("StaffMember", { role: "CLEANER", engagementStatus: "ACCEPTED" });
    const departed = await test.rows.insert("StaffMember", { role: "CLEANER", engagementStatus: "LEFT" });
    for (const [sortOrder, workerId] of [suspended.id, departed.id].entries()) {
      await test.rows.insert("FileAssignment", {
        fileId: file.id,
        workerId,
        role: "MEMBER",
        validFrom: localDate("2026-11-01"),
        sortOrder,
      });
    }
    await test.rows.insert("Sanction", {
      subjectKind: "WORKER",
      staffId: suspended.id,
      state: "SUSPENDED",
      reason: "غياب متكرر",
      startDate: localDate("2026-10-01"),
      endDate: localDate("2026-11-10"),
    } as never);

    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));

    const visits = await visitsOf(file.id);
    const seated = async (date: string) => {
      const visit = visits.find((each) => each.visitDate === date)!;
      const seats = await test.db
        .selectFrom("VisitWorker")
        .select("workerId")
        .where("visitId", "=", visit.id)
        .execute();
      return { status: visit.status, workers: seats.map((seat) => seat.workerId) };
    };
    // During the suspension, nobody; after it, the suspended worker comes back; the departed one never.
    expect(await seated("2026-11-04")).toEqual({ status: "AWAITING_CONFIRMATION", workers: [] });
    expect(await seated("2026-11-16")).toEqual({ status: "AWAITING_CONFIRMATION", workers: [suspended.id] });
  });

  it("numbers a visit in its own year", async () => {
    const { file } = await contractFile({
      startDate: localDate("2026-12-26"),
      endDate: localDate("2027-01-06"),
    });
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    const visits = await visitsOf(file.id);
    expect(visits.map((visit) => [visit.visitDate, visit.number])).toEqual([
      ["2026-12-26", "00001/2026"],
      ["2026-12-28", "00002/2026"],
      ["2026-12-30", "00003/2026"],
      ["2027-01-02", "00001/2027"],
      ["2027-01-04", "00002/2027"],
      ["2027-01-06", "00003/2027"],
    ]);
  });

  it("makes no visit and does not refuse when the dates are missing", async () => {
    const { file } = await contractFile({ startDate: null, endDate: null });
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    expect(await visitsOf(file.id)).toHaveLength(0);
    const preview = await test.transact((ex, ctx) => previewVisitGeneration(ex, ctx, { fileId: file.id }));
    expect(preview.warnings).toContain("MISSING_DATES");
  });

  it("makes the days of an on-demand job, with no slot", async () => {
    const zone = await test.rows.insert("Zone", { name: "عين البيضاء" });
    const site = await test.rows.insert("Site", { division: "HOUSING", zoneId: zone.id });
    const file = await test.rows.insert("File", {
      siteId: site.id,
      clientId: site.clientId,
      division: "HOUSING",
      serviceType: "ON_DEMAND",
      formKind: "HOUSING_REQUEST",
      stage: "CONTRACTED",
      executionDays: JSON.stringify([]),
      period: "EVENING",
      startDate: localDate("2026-10-20"),
      endDate: localDate("2026-10-22"),
      workersCount: 3,
    } as never);
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    const visits = await visitsOf(file.id);
    expect(visits.map((visit) => [visit.visitDate, visit.fileSlotId, visit.origin, visit.plannedStartTime])).toEqual([
      ["2026-10-20", null, "ON_DEMAND", "13:30"],
      ["2026-10-21", null, "ON_DEMAND", "13:30"],
      ["2026-10-22", null, "ON_DEMAND", "13:30"],
    ]);
    expect(visits.every((visit) => visit.status === "AWAITING_CONFIRMATION" && visit.workersNeeded === 3)).toBe(true);
  });
});

describe("previewVisitGeneration", () => {
  it("writes nothing and says what does not match the form", async () => {
    const { file } = await contractFile({ visitsPerWeek: 2 });
    const preview = await test.transact((ex, ctx) => previewVisitGeneration(ex, ctx, { fileId: file.id }));
    expect(preview).toMatchObject({ planned: 13, created: 0, firstDate: "2026-11-02", lastDate: "2026-11-30" });
    expect(preview.perWeekday).toEqual([4, 0, 5, 0, 4, 0, 0]);
    expect(preview.warnings).toContain("VISITS_PER_WEEK_MISMATCH");
    expect(await visitsOf(file.id)).toHaveLength(0);
    expect(await test.db.selectFrom("FileSlot").selectAll().where("fileId", "=", file.id).execute()).toHaveLength(0);
  });

  it("refuses a file that is not contracted", async () => {
    const { file } = await contractFile({ stage: "QUOTE" });
    await expect(test.transact((ex, ctx) => generateVisits(ex, ctx, { fileId: file.id }))).rejects.toThrow(
      "Visits are made for a contracted file only.",
    );
  });
});

describe("file.ended", () => {
  it("cancels what was still to come and stops the inspections", async () => {
    const { file } = await contractFile();
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    await test.transact((ex, ctx) =>
      emit(ex, ctx, "file.ended", { fileId: file.id, endKind: "EARLY", endedDate: localDate("2026-11-15") }),
    );
    const visits = await visitsOf(file.id);
    expect(visits.filter((visit) => visit.status === "CANCELLED").map((visit) => visit.visitDate)).toEqual([
      "2026-11-16",
      "2026-11-18",
      "2026-11-21",
      "2026-11-23",
      "2026-11-25",
      "2026-11-28",
      "2026-11-30",
    ]);
    expect(
      visits.filter((visit) => visit.status === "CANCELLED").every((v) => v.statusReason === "CONTRACT_ENDED"),
    ).toBe(true);
    const programme = await test.db
      .selectFrom("FileProgramme")
      .select("inspectionIsActive")
      .where("fileId", "=", file.id)
      .executeTakeFirstOrThrow();
    expect(programme.inspectionIsActive).toBe(0);
  });
});

describe("the working-time rules at generation (audit LAB-2)", () => {
  it("leaves a woman's seat on a night slot open, and a man already elsewhere at that hour, and lists them (LAB-2)", async () => {
    const { file } = await contractFile({
      period: "EVENING",
      arrivalTime: localTime("21:30"),
      departureTime: localTime("23:30"),
      workersCount: 2,
    });
    const woman = await test.rows.insert("StaffMember", {
      role: "CLEANER",
      sex: "FEMALE",
      engagementStatus: "ACCEPTED",
      availableDays: EVERY_DAY,
    } as never);
    const man = await test.rows.insert("StaffMember", {
      role: "CLEANER",
      sex: "MALE",
      engagementStatus: "ACCEPTED",
      availableDays: EVERY_DAY,
    } as never);
    for (const [sortOrder, workerId] of [woman.id, man.id].entries()) {
      await test.rows.insert("FileAssignment", {
        fileId: file.id,
        workerId,
        role: "MEMBER",
        validFrom: localDate("2026-11-01"),
        sortOrder,
      });
    }
    // He already works elsewhere on Monday 2 November from 21:00.
    const elsewhere = await test.rows.insert("Visit", {
      visitDate: localDate("2026-11-02"),
      plannedStartTime: localTime("21:00"),
      plannedDurationMin: 120,
      status: "CONFIRMED",
    } as never);
    await test.rows.insert("VisitWorker", { visitId: elsewhere.id, workerId: man.id, seatStatus: "ASSIGNED" });

    const preview = await test.transact((ex, ctx) => previewVisitGeneration(ex, ctx, { fileId: file.id }));
    expect(preview.seatsHeld.filter((held) => held.workerId === woman.id)).toHaveLength(13);
    expect(preview.seatsHeld.find((held) => held.workerId === woman.id)?.codes).toContain("NIGHT_WOMAN");
    expect(preview.seatsHeld.filter((held) => held.workerId === man.id).map((held) => held.date)).toEqual([
      "2026-11-02",
    ]);

    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    const visits = await visitsOf(file.id);
    const seats = await test.db
      .selectFrom("VisitWorker")
      .select(["visitId", "workerId", "seatStatus"])
      .where(
        "visitId",
        "in",
        visits.map((visit) => visit.id),
      )
      .execute();
    expect(seats.some((seat) => seat.workerId === woman.id)).toBe(false);
    const monday = visits.find((visit) => visit.visitDate === "2026-11-02")!;
    expect(seats.filter((seat) => seat.visitId === monday.id)).toEqual([]);
    expect(visits.every((visit) => visit.status === "AWAITING_CONFIRMATION")).toBe(true);
    expect(seats.filter((seat) => seat.workerId === man.id)).toHaveLength(12);
  });
});

describe("the rotating rest day (audit LAB-4)", () => {
  it("gives each member of a six-visit contract one rest seat a week, on a different day in turn (LAB-4)", async () => {
    const { file } = await contractFile({
      executionDays: JSON.stringify(["SAT", "SUN", "MON", "TUE", "WED", "THU"]),
      visitsPerWeek: 6,
      workersCount: 2,
      startDate: localDate("2026-11-07"),
      endDate: localDate("2026-11-20"),
    });
    const members = [];
    for (let sortOrder = 0; sortOrder < 2; sortOrder += 1) {
      const member = await test.rows.insert("StaffMember", {
        role: "CLEANER",
        sex: "MALE",
        engagementStatus: "ACCEPTED",
        availableDays: EVERY_DAY,
      } as never);
      await test.rows.insert("FileAssignment", {
        fileId: file.id,
        workerId: member.id,
        role: "MEMBER",
        validFrom: localDate("2026-11-01"),
        sortOrder,
      });
      members.push(member);
    }
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));

    const programme = await test.db
      .selectFrom("FileProgramme")
      .select("rotateRestDay")
      .where("fileId", "=", file.id)
      .executeTakeFirstOrThrow();
    expect(programme.rotateRestDay).toBe(1);
    const visits = await visitsOf(file.id);
    const resting = await test.db
      .selectFrom("VisitWorker")
      .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
      .select(["VisitWorker.workerId", "Visit.visitDate", "Visit.status"])
      .where("Visit.fileId", "=", file.id)
      .where("VisitWorker.seatStatus", "=", "RESTING")
      .orderBy("Visit.visitDate")
      .execute();
    // Two weeks (7-13 and 14-20 November), two members: four rest seats, never two on one day.
    expect(resting).toHaveLength(4);
    for (const member of members) {
      const days = resting.filter((seat) => seat.workerId === member.id).map((seat) => seat.visitDate);
      expect(days).toHaveLength(2);
      expect(days[0]).not.toBe(days[1]);
    }
    expect(new Set(resting.map((seat) => seat.visitDate)).size).toBe(4);
    expect(resting.every((seat) => seat.status === "AWAITING_CONFIRMATION")).toBe(true);
    expect(visits.filter((visit) => visit.status === "CONFIRMED")).toHaveLength(visits.length - 4);
  });
});
