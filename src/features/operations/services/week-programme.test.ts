import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime, minutes } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { assignVisitWorker, type RuleOverrideInput } from "./assignment";
import { generateFileVisits } from "./programme";
import { getWeekProgramme, moveVisit, previewVisitMove } from "./week-programme";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const WORKING_DAYS = ["SAT", "SUN", "MON", "TUE", "WED", "THU"];

/**
 * An organisation contract for November 2026 (Saturday, Monday, Wednesday,
 * 08:00 to 11:00, two workers), contracted: its visits are generated, and with
 * no standing team they all await confirmation. The clock stands on Monday
 * 12 October 2026.
 */
async function contracted(site: Record<string, unknown> = {}) {
  const zone = await test.rows.insert("Zone", { name: "أم البواقي" });
  const siteRow = await test.rows.insert("Site", {
    division: "ORGANISATION",
    zoneId: zone.id,
    commonName: "مكتب المحامي",
    ...site,
  } as never);
  const file = await test.rows.insert("File", {
    siteId: siteRow.id,
    clientId: siteRow.clientId,
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
  const visits = await test.db
    .selectFrom("Visit")
    .selectAll()
    .where("fileId", "=", file.id)
    .orderBy("visitDate")
    .execute();
  const on = (date: string) => {
    const visit = visits.find((each) => each.visitDate === date);
    if (!visit) throw new Error(`test: no visit on ${date}`);
    return visit;
  };
  return { zone, site: siteRow, file, on };
}

/** A cleaning worker, accepted, available Saturday to Thursday. */
async function worker(over: Record<string, unknown> = {}) {
  return test.rows.insert("StaffMember", {
    role: "CLEANER",
    engagementStatus: "ACCEPTED",
    sex: "FEMALE",
    availableDays: JSON.stringify(WORKING_DAYS),
    ...over,
  } as never);
}

/** A seat she already holds elsewhere: a visit of another site, given by hand. */
async function busy(workerId: string, date: string, startTime: string, durationMin: number) {
  const file = await test.rows.make("File");
  const visit = await test.rows.insert("Visit", {
    fileId: file.id,
    visitDate: localDate(date),
    plannedStartTime: localTime(startTime),
    plannedDurationMin: minutes(durationMin),
    workersNeeded: 1,
    status: "CONFIRMED",
  });
  await test.rows.insert("VisitWorker", { visitId: visit.id, workerId, role: "CLEANER", seatStatus: "ASSIGNED" });
  return visit;
}

/** A week of 46 hours from Saturday 31 October, Monday 2 November left free: 3 hours more make it 49. */
async function heavyWeek(workerId: string) {
  for (const [date, durationMin] of [
    ["2026-10-31", 600],
    ["2026-11-01", 600],
    ["2026-11-03", 600],
    ["2026-11-04", 600],
    ["2026-11-05", 360],
  ] as const) {
    await busy(workerId, date, "08:00", durationMin);
  }
}

const assign = (visitId: string, workerId: string) =>
  test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId, workerId }));

const move = (visitId: string, date: string, startTime: string, override?: RuleOverrideInput, session = test.manager) =>
  test.transact((ex, ctx) => moveVisit(ex, ctx, { visitId, date, startTime, override }), session);

const visitRow = (id: string) => test.db.selectFrom("Visit").selectAll().where("id", "=", id).executeTakeFirstOrThrow();

const logOf = (action: string) =>
  test.db.selectFrom("AuditLog").selectAll().where("action", "=", action).orderBy("chainSeq").execute();

describe("moveVisit", () => {
  it("moves a visit and its team to another day and time, and keeps its programme date", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const [a, b] = [await worker(), await worker()];
    await assign(monday.id, a.id);
    await assign(monday.id, b.id);
    const updatesBefore = (await logOf("UPDATE")).length;

    const result = await move(monday.id, "2026-11-03", "14:00");
    expect(result).toMatchObject({
      visitId: monday.id,
      moved: true,
      date: "2026-11-03",
      startTime: "14:00",
      warnings: [],
      placeWarnings: [],
      overrides: 0,
      changedAfterPrint: false,
    });
    expect(await visitRow(monday.id)).toMatchObject({
      visitDate: "2026-11-03",
      plannedStartTime: "14:00",
      slotDate: "2026-11-02",
      isManuallyEdited: 1,
      planChangedAt: null,
      status: "CONFIRMED",
      updatedAt: test.clock.now().toISOString(),
    });
    const seats = await test.db.selectFrom("VisitWorker").selectAll().where("visitId", "=", monday.id).execute();
    expect(seats.map((seat) => [seat.workerId, seat.seatStatus]).sort()).toEqual(
      [
        [a.id, "ASSIGNED"],
        [b.id, "ASSIGNED"],
      ].sort(),
    );

    const updates = await logOf("UPDATE");
    expect(updates).toHaveLength(updatesBefore + 1);
    expect(updates.at(-1)).toMatchObject({ entity: "Visit", entityId: monday.id, entityLabel: monday.number });
    expect(JSON.parse(updates.at(-1)?.changes ?? "{}")).toEqual({
      visitDate: ["2026-11-02", "2026-11-03"],
      plannedStartTime: ["08:00", "14:00"],
      isManuallyEdited: [0, 1],
    });

    // Dropped where it already is: nothing is written.
    expect(await move(monday.id, "2026-11-03", "14:00")).toMatchObject({ moved: false });
    expect(await logOf("UPDATE")).toHaveLength(updatesBefore + 1);
  });

  it("refuses a move onto another visit of a seated worker, and leaves the visit where it was", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const one = await worker();
    await assign(monday.id, one.id);
    await busy(one.id, "2026-11-03", "14:30", 120);

    await expect(move(monday.id, "2026-11-03", "14:00")).rejects.toThrow(
      "This worker already has a visit at that time.",
    );
    expect(await visitRow(monday.id)).toMatchObject({
      visitDate: "2026-11-02",
      plannedStartTime: "08:00",
      isManuallyEdited: 0,
    });
  });

  it("needs the manager to pass a rule broken at the new time, and keeps his approval", async () => {
    const { on } = await contracted();
    const saturday = on("2026-11-07");
    const one = await worker();
    const seat = await assign(saturday.id, one.id);
    await heavyWeek(one.id);

    await expect(move(saturday.id, "2026-11-02", "08:00")).rejects.toThrow(
      "This seat breaks a working-time rule. Only the manager can allow it.",
    );
    await expect(move(saturday.id, "2026-11-02", "08:00", { reason: "  " })).rejects.toThrow("A reason is required.");

    const result = await move(saturday.id, "2026-11-02", "08:00", { reason: "Le client a avancé la visite" });
    expect(result).toMatchObject({ moved: true, overrides: 1, warnings: [] });
    expect(await visitRow(saturday.id)).toMatchObject({ visitDate: "2026-11-02", slotDate: "2026-11-07" });

    const overrides = await test.db.selectFrom("RuleOverride").selectAll().execute();
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      visitWorkerId: seat.seatId,
      workerId: one.id,
      ruleCode: "WEEK_OVER_48H",
      weekStart: "2026-10-31",
      valueMin: 2940,
      reason: "Le client a avancé la visite",
      derogationRef: null,
      approvedByUserId: test.manager.userId,
    });
    const [entry] = await logOf("OVERRIDE");
    expect(entry).toMatchObject({
      reason: "Le client a avancé la visite",
      entity: "VisitWorker",
      entityId: seat.seatId,
      subjectId: one.id,
    });
    const update = (await logOf("UPDATE")).at(-1);
    expect(JSON.parse(update?.context ?? "{}")).toMatchObject({ ruleOverrideIds: [overrides[0].id] });
  });

  it("does not let operations pass a rule, but lets it move a visit that breaks none", async () => {
    const { on } = await contracted();
    const saturday = on("2026-11-07");
    const one = await worker();
    await assign(saturday.id, one.id);
    await heavyWeek(one.id);
    // The operations role writes عمال النظافة but does not hold schedule.overrideRule.
    const supervisor = await test.sessionFor("OPERATIONS");

    await expect(move(saturday.id, "2026-11-02", "08:00", undefined, supervisor)).rejects.toThrow(
      "This seat breaks a working-time rule. Only the manager can allow it.",
    );
    await expect(move(saturday.id, "2026-11-02", "08:00", { reason: "urgent" }, supervisor)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    expect(await test.db.selectFrom("RuleOverride").selectAll().execute()).toEqual([]);
    expect(await visitRow(saturday.id)).toMatchObject({ visitDate: "2026-11-07", plannedStartTime: "08:00" });

    expect(await move(saturday.id, "2026-11-10", "13:00", undefined, supervisor)).toMatchObject({ moved: true });
    expect(await visitRow(saturday.id)).toMatchObject({ visitDate: "2026-11-10", plannedStartTime: "13:00" });
  });

  it("needs the inspector's derogation to move a woman's visit into the night", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const woman = await worker();
    await assign(monday.id, woman.id);

    const preview = await test.transact((ex, ctx) =>
      previewVisitMove(ex, ctx, { visitId: monday.id, date: "2026-11-02", startTime: "21:00" }),
    );
    expect(preview.checks).toHaveLength(1);
    expect(preview.checks[0]).toMatchObject({ workerId: woman.id });
    expect(preview.checks[0].findings.map((finding) => [finding.code, finding.level])).toEqual([
      ["NIGHT_WOMAN", "NEEDS_MANAGER"],
    ]);
    expect(await visitRow(monday.id)).toMatchObject({ plannedStartTime: "08:00" });

    await expect(move(monday.id, "2026-11-02", "21:00", { reason: "Fermeture tardive" })).rejects.toThrow(
      "Night work by a woman needs the reference of the labour inspector's derogation.",
    );
    await move(monday.id, "2026-11-02", "21:00", { reason: "Fermeture tardive", derogationRef: "DER-2026-14" });
    const [override] = await test.db.selectFrom("RuleOverride").selectAll().execute();
    expect(override).toMatchObject({ ruleCode: "NIGHT_WOMAN", ruleDate: "2026-11-02", derogationRef: "DER-2026-14" });
  });

  it("marks an order already printed as changed after printing", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    await assign(monday.id, (await worker()).id);
    await test.db
      .updateTable("Visit")
      .set({ orderPrintedAt: test.clock.now().toISOString(), orderPrintCount: 1 })
      .where("id", "=", monday.id)
      .execute();
    test.clock.advance({ hours: 1 });

    const result = await move(monday.id, "2026-11-02", "13:00");
    expect(result.changedAfterPrint).toBe(true);
    expect(await visitRow(monday.id)).toMatchObject({
      plannedStartTime: "13:00",
      planChangedAt: test.clock.now().toISOString(),
    });
    const week = await test.transact((ex, ctx) => getWeekProgramme(ex, ctx, { weekStart: "2026-11-02" }));
    expect(week.visits.find((visit) => visit.id === monday.id)).toMatchObject({
      printed: true,
      changedAfterPrint: true,
      isManuallyEdited: true,
    });
  });

  it("is not undone or duplicated by a later generation of the file's visits", async () => {
    const { on, file } = await contracted();
    const monday = on("2026-11-02");
    await move(monday.id, "2026-11-03", "10:00");
    const count = async () =>
      (await test.db.selectFrom("Visit").select("id").where("fileId", "=", file.id).execute()).length;
    const before = await count();

    const summary = await test.transact((ex, ctx) => generateFileVisits(ex, ctx, file.id));
    expect(summary).toMatchObject({ created: 0, missing: 0 });
    expect(await count()).toBe(before);
    expect(await visitRow(monday.id)).toMatchObject({ visitDate: "2026-11-03", plannedStartTime: "10:00" });
    const onTheOldDay = await test.db
      .selectFrom("Visit")
      .select("id")
      .where("fileId", "=", file.id)
      .where("visitDate", "=", localDate("2026-11-02"))
      .execute();
    expect(onTheOldDay).toEqual([]);
  });

  it("refuses a visit under way, a day already past, and a date or time that is not one", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    await expect(move(monday.id, "2026-10-10", "08:00")).rejects.toThrow(
      "A visit cannot be moved to a day already past.",
    );
    await expect(move(monday.id, "2026-11-31", "08:00")).rejects.toThrow("Enter a valid date.");
    await expect(move(monday.id, "2026-11-03", "24:00")).rejects.toThrow("Enter a time as HH:MM.");
    await expect(move("nope", "2026-11-03", "08:00")).rejects.toThrow("This visit does not exist.");

    await test.db.updateTable("Visit").set({ status: "IN_PROGRESS" }).where("id", "=", monday.id).execute();
    await expect(move(monday.id, "2026-11-03", "08:00")).rejects.toThrow(
      "Only a visit confirmed or awaiting confirmation can be moved.",
    );
    // Moving it today is still allowed for a visit not started (the clock stands on 12 October).
    const tuesday = on("2026-11-04");
    expect(await move(tuesday.id, "2026-10-12", "15:00")).toMatchObject({ moved: true, date: "2026-10-12" });
  });

  it("warns about the rest day, a day the worker is not available and a day the site does not allow", async () => {
    const { on } = await contracted({ allowedDays: JSON.stringify(["SAT", "MON", "WED"]) });
    const monday = on("2026-11-02");
    const one = await worker({ firstName: "سميرة", lastName: "بوزيد" });
    await assign(monday.id, one.id);

    const result = await move(monday.id, "2026-11-06", "08:00");
    expect(result.warnings.map((warning) => [warning.code, warning.level, warning.workerName]).sort()).toEqual(
      [
        ["REST_DAY_WORKED", "FLAG", "بوزيد سميرة"],
        ["UNAVAILABLE_DAY", "WARNING", "بوزيد سميرة"],
      ].sort(),
    );
    expect(result.placeWarnings).toEqual(["OUTSIDE_SITE_DAYS"]);
  });
});

describe("getWeekProgramme", () => {
  it("gives the Saturday-to-Friday week, its visits with their teams, and each worker's load", async () => {
    const { on, zone, file } = await contracted();
    const monday = on("2026-11-02");
    const wednesday = on("2026-11-04");
    const a = await worker({ zoneId: zone.id, firstName: "سميرة", lastName: "بوزيد" });
    const b = await worker({ zoneId: zone.id, firstName: "فاطمة", lastName: "مرابط" });
    const elsewhere = await test.rows.insert("Zone", { name: "عين البيضاء" });
    const c = await worker({ zoneId: elsewhere.id });
    const idle = await worker({ zoneId: elsewhere.id });
    await assign(monday.id, a.id);
    await assign(monday.id, b.id);
    await assign(wednesday.id, a.id);

    // A visit of another zone, given by hand; and two cancelled visits.
    const farSite = await test.rows.insert("Site", { zoneId: elsewhere.id, commonName: null, address: "حي النصر" });
    const farFile = await test.rows.insert("File", { siteId: farSite.id, clientId: farSite.clientId });
    const far = await test.rows.insert("Visit", {
      fileId: farFile.id,
      zoneId: elsewhere.id,
      visitDate: localDate("2026-11-03"),
      plannedStartTime: localTime("09:00"),
      plannedDurationMin: minutes(240),
      workersNeeded: 1,
    });
    await test.rows.insert("VisitWorker", { visitId: far.id, workerId: c.id, role: "CLEANER" });
    const dropped = await test.rows.insert("Visit", {
      fileId: file.id,
      visitDate: localDate("2026-11-05"),
      status: "CANCELLED",
      statusReason: "PROGRAMME_CHANGED",
    });
    const cancelled = await test.rows.insert("Visit", {
      fileId: file.id,
      visitDate: localDate("2026-11-05"),
      plannedStartTime: localTime("10:00"),
      plannedDurationMin: minutes(120),
      status: "CANCELLED",
      statusReason: "CLIENT_REQUEST",
    });
    // Monday's order came back: Samira worked 2 h 30.
    await test.db
      .updateTable("VisitWorker")
      .set({ workedMin: minutes(150) })
      .where("visitId", "=", monday.id)
      .where("workerId", "=", a.id)
      .execute();

    const week = await test.transact((ex, ctx) => getWeekProgramme(ex, ctx, { weekStart: "2026-11-03" }));
    expect(week).toMatchObject({ weekStart: "2026-10-31", weekEnd: "2026-11-06", zoneId: null });
    expect(week.dates).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
    expect(week.zones.map((each) => each.name).sort()).toEqual(["أم البواقي", "عين البيضاء"].sort());
    expect(week.rules).toEqual({ weeklyLegalMin: 2400, weeklyCapMin: 2880, travelGapMin: 30 });

    const ids = week.visits.map((visit) => visit.id);
    expect(ids).toEqual([monday.id, far.id, wednesday.id, cancelled.id]);
    expect(ids).not.toContain(dropped.id);
    expect(week.visits[0]).toMatchObject({
      number: monday.number,
      fileId: file.id,
      division: "ORGANISATION",
      siteLabel: "مكتب المحامي",
      zoneId: zone.id,
      date: "2026-11-02",
      startTime: "08:00",
      durationMin: 180,
      status: "CONFIRMED",
      workersNeeded: 2,
      printed: false,
      changedAfterPrint: false,
      isManuallyEdited: false,
      movable: true,
    });
    expect(week.visits[0].team.map((member) => member.workerId)).toEqual([a.id, b.id]);
    expect(week.visits[0].team[0]).toMatchObject({ firstName: "سميرة", lastName: "بوزيد", number: a.number });
    expect(week.visits[1]).toMatchObject({ siteLabel: "حي النصر", zoneId: elsewhere.id });
    expect(week.visits[3]).toMatchObject({ status: "CANCELLED", movable: false });

    const load = Object.fromEntries(week.workers.map((each) => [each.id, each.loadMin]));
    expect(load).toEqual({ [a.id]: 150 + 180, [b.id]: 180, [c.id]: 240, [idle.id]: 0 });
    expect(week.workers.find((each) => each.id === a.id)).toMatchObject({
      capacityMin: 2400,
      findings: [],
      worstLevel: null,
      sanctioned: false,
    });
    expect(week.workers.find((each) => each.id === a.id)?.seats.map((seat) => seat.visitId)).toEqual([
      monday.id,
      wednesday.id,
    ]);

    // One zone: its visits, and the workers of the zone or seated on them.
    const zoneWeek = await test.transact((ex, ctx) =>
      getWeekProgramme(ex, ctx, { weekStart: "2026-11-03", zoneId: zone.id }),
    );
    expect(zoneWeek.visits.map((visit) => visit.id)).toEqual([monday.id, wednesday.id, cancelled.id]);
    expect(zoneWeek.workers.map((each) => each.id).sort()).toEqual([a.id, b.id].sort());
    expect(zoneWeek.workers.find((each) => each.id === a.id)?.loadMin).toBe(330);
  });

  it("puts the workers the rules flag first, with their findings", async () => {
    const { on, zone } = await contracted();
    const saturday = on("2026-11-07");
    const light = await worker({ zoneId: zone.id });
    const heavy = await worker({ zoneId: zone.id });
    await assign(saturday.id, light.id);
    await heavyWeek(heavy.id);
    await busy(heavy.id, "2026-11-02", "08:00", 180);

    const week = await test.transact((ex, ctx) => getWeekProgramme(ex, ctx, { weekStart: "2026-10-31" }));
    expect(week.workers[0]).toMatchObject({ id: heavy.id, loadMin: 2940, worstLevel: "NEEDS_MANAGER" });
    expect(week.workers[0].findings.map((finding) => [finding.code, finding.level, finding.valueMin])).toEqual([
      ["WEEK_OVER_48H", "NEEDS_MANAGER", 2940],
      ["DAY_OVER_8H", "WARNING", 600],
      ["DAY_OVER_8H", "WARNING", 600],
      ["DAY_OVER_8H", "WARNING", 600],
      ["DAY_OVER_8H", "WARNING", 600],
    ]);
    // Saturday 7 November is in the next week: the light worker has nothing this week.
    expect(week.workers.find((each) => each.id === light.id)).toMatchObject({ loadMin: 0, findings: [] });
  });

  it("refuses a date that is not one, and lets a reader of the requests read but not move", async () => {
    await expect(test.transact((ex, ctx) => getWeekProgramme(ex, ctx, { weekStart: "2026-13-01" }))).rejects.toThrow(
      "Enter a valid date.",
    );
    const { on } = await contracted();
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => getWeekProgramme(ex, ctx, { weekStart: "2026-11-02" }), accountant),
    ).resolves.toMatchObject({ weekStart: "2026-10-31" });
    await expect(move(on("2026-11-02").id, "2026-11-03", "08:00", undefined, accountant)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });

  it("follows the workers section, the programme's own (ACC-X1)", async () => {
    const { on } = await contracted();
    // A supervisor writes the requests but only reads عمال النظافة; HR writes it.
    await expect(
      move(on("2026-11-02").id, "2026-11-03", "08:00", undefined, await test.sessionFor("SUPERVISOR")),
    ).rejects.toThrow("You do not have permission to do this.");
    expect(
      await move(on("2026-11-02").id, "2026-11-03", "08:00", undefined, await test.sessionFor("HR_OFFICER")),
    ).toMatchObject({ moved: true });
  });
});
