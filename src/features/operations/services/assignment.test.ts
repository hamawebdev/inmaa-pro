import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime, minutes } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  assignVisitWorker,
  confirmVisit,
  listSeatCandidates,
  removeVisitWorker,
  type RuleOverrideInput,
} from "./assignment";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const WORKING_DAYS = ["SAT", "SUN", "MON", "TUE", "WED", "THU"];

/**
 * An organisation contract for November 2026 (Saturday, Monday, Wednesday,
 * 08:00 to 11:00, two workers), contracted: its visits are generated, and with
 * no standing team they all await confirmation.
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

/** A week of 46 hours from Saturday 31 October: the 3 hours of Monday 2 November make it 49. */
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

const assign = (visitId: string, workerId: string, override?: RuleOverrideInput, session = test.manager) =>
  test.transact((ex, ctx) => assignVisitWorker(ex, ctx, { visitId, workerId, override }), session);

const visitRow = (id: string) => test.db.selectFrom("Visit").selectAll().where("id", "=", id).executeTakeFirstOrThrow();

const logOf = (action: string) =>
  test.db.selectFrom("AuditLog").selectAll().where("action", "=", action).orderBy("chainSeq").execute();

describe("assignVisitWorker", () => {
  it("fills the visit's seats and confirms a contract visit when the last one is taken", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const first = await worker();
    const second = await worker({ role: "TEAM_LEADER" });

    const one = await assign(monday.id, first.id);
    expect(one).toMatchObject({ status: "AWAITING_CONFIRMATION", findings: [] });
    const two = await assign(monday.id, second.id);
    expect(two.status).toBe("CONFIRMED");

    const seats = await test.db.selectFrom("VisitWorker").selectAll().where("visitId", "=", monday.id).execute();
    expect(seats.map((seat) => [seat.workerId, seat.role, seat.seatStatus]).sort()).toEqual(
      [
        [first.id, "CLEANER", "ASSIGNED"],
        [second.id, "TEAM_LEADER", "ASSIGNED"],
      ].sort(),
    );
    expect(await visitRow(monday.id)).toMatchObject({ status: "CONFIRMED", planChangedAt: null });
    const statusChanges = await logOf("STATUS_CHANGE");
    expect(statusChanges.at(-1)).toMatchObject({ entity: "Visit", entityId: monday.id });
    expect(JSON.parse(statusChanges.at(-1)?.changes ?? "{}")).toEqual({
      status: ["AWAITING_CONFIRMATION", "CONFIRMED"],
    });
  });

  it("refuses a third worker, and a worker already on the visit", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const [a, b, c] = [await worker(), await worker(), await worker()];
    await assign(monday.id, a.id);
    await expect(assign(monday.id, a.id)).rejects.toThrow("This worker is already on this visit.");
    await assign(monday.id, b.id);
    await expect(assign(monday.id, c.id)).rejects.toThrow("Every seat of this visit is already filled.");
  });

  it("refuses a seat that overlaps another of her seats", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const one = await worker();
    await busy(one.id, "2026-11-02", "10:00", 120);
    await expect(assign(monday.id, one.id)).rejects.toThrow("This worker already has a visit at that time.");
    expect(await test.db.selectFrom("VisitWorker").selectAll().where("visitId", "=", monday.id).execute()).toEqual([]);
  });

  it("needs the manager to pass a week over 48 hours, and keeps the override", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const one = await worker();
    await heavyWeek(one.id);

    await expect(assign(monday.id, one.id)).rejects.toThrow(
      "This seat breaks a working-time rule. Only the manager can allow it.",
    );
    await expect(assign(monday.id, one.id, { reason: "  " })).rejects.toThrow("A reason is required.");

    const result = await assign(monday.id, one.id, { reason: "Seule ouvrière disponible ce jour-là" });
    expect(result.findings.map((finding) => [finding.code, finding.level, finding.valueMin])).toEqual([
      ["WEEK_OVER_48H", "NEEDS_MANAGER", 2940],
    ]);

    const overrides = await test.db.selectFrom("RuleOverride").selectAll().execute();
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      visitWorkerId: result.seatId,
      workerId: one.id,
      ruleCode: "WEEK_OVER_48H",
      weekStart: "2026-10-31",
      ruleDate: null,
      valueMin: 2940,
      reason: "Seule ouvrière disponible ce jour-là",
      derogationRef: null,
      approvedByUserId: test.manager.userId,
      approvedAt: test.clock.now().toISOString(),
    });
    const [entry] = await logOf("OVERRIDE");
    expect(entry).toMatchObject({
      operation: "CHANGE",
      reason: "Seule ouvrière disponible ce jour-là",
      entity: "VisitWorker",
      entityId: result.seatId,
      subjectId: one.id,
    });
  });

  it("does not let a supervisor pass a rule", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const one = await worker();
    await heavyWeek(one.id);
    const supervisor = await test.sessionFor("SUPERVISOR");

    await expect(assign(monday.id, one.id, undefined, supervisor)).rejects.toThrow(
      "This seat breaks a working-time rule. Only the manager can allow it.",
    );
    await expect(assign(monday.id, one.id, { reason: "urgent" }, supervisor)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    expect(await test.db.selectFrom("RuleOverride").selectAll().execute()).toEqual([]);
  });

  it("lets a supervisor give a seat that breaks no rule", async () => {
    const { on } = await contracted();
    const one = await worker();
    const supervisor = await test.sessionFor("SUPERVISOR");
    const result = await assign(on("2026-11-02").id, one.id, undefined, supervisor);
    expect(result.status).toBe("AWAITING_CONFIRMATION");
  });

  it("needs the labour inspector's derogation for a woman at night, and an added visit waits for the office", async () => {
    const file = await test.rows.make("File");
    const night = await test.rows.insert("Visit", {
      fileId: file.id,
      origin: "EXTRA",
      visitDate: localDate("2026-11-03"),
      plannedStartTime: localTime("22:00"),
      plannedDurationMin: minutes(180),
      workersNeeded: 1,
      status: "AWAITING_CONFIRMATION",
    });
    const woman = await worker();

    await expect(assign(night.id, woman.id)).rejects.toThrow(
      "This seat breaks a working-time rule. Only the manager can allow it.",
    );
    await expect(assign(night.id, woman.id, { reason: "Fermeture tardive du client" })).rejects.toThrow(
      "Night work by a woman needs the reference of the labour inspector's derogation.",
    );
    const result = await assign(night.id, woman.id, {
      reason: "Fermeture tardive du client",
      derogationRef: "DER-2026-14",
    });
    expect(result.status).toBe("AWAITING_CONFIRMATION");
    const [override] = await test.db.selectFrom("RuleOverride").selectAll().execute();
    expect(override).toMatchObject({ ruleCode: "NIGHT_WOMAN", ruleDate: "2026-11-03", derogationRef: "DER-2026-14" });
  });

  it("refuses a man on a site for women only, and a worker the site's abilities rule out", async () => {
    const { on } = await contracted({ womenOnly: 1, requiredAbilityCodes: JSON.stringify(["CLIMB_STAIRS"]) });
    const monday = on("2026-11-02");
    const man = await worker({ sex: "MALE", abilities: JSON.stringify(["CLIMB_STAIRS"]) });
    const without = await worker({ abilities: JSON.stringify(["CARRY_EQUIPMENT"]) });
    await expect(assign(monday.id, man.id)).rejects.toThrow("This site takes women workers only.");
    await expect(assign(monday.id, without.id)).rejects.toThrow(
      "This worker does not have an ability this site requires.",
    );
  });

  it("refuses a visit already done and a worker who has left", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const left = await worker({ engagementStatus: "LEFT" });
    await expect(assign(monday.id, left.id)).rejects.toThrow("This worker cannot be given visits.");
    await test.db.updateTable("Visit").set({ status: "DONE" }).where("id", "=", monday.id).execute();
    await expect(assign(monday.id, (await worker()).id)).rejects.toThrow(
      "The team of this visit can no longer change.",
    );
  });
});

describe("removeVisitWorker", () => {
  it("opens the seat again, returns the visit to awaiting confirmation and marks a printed order as changed", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const [a, b] = [await worker(), await worker()];
    const seat = await assign(monday.id, a.id);
    await assign(monday.id, b.id);
    await test.db
      .updateTable("Visit")
      .set({ orderPrintedAt: test.clock.now().toISOString(), orderPrintCount: 1 })
      .where("id", "=", monday.id)
      .execute();
    test.clock.advance({ hours: 1 });

    await expect(
      test.transact((ex, ctx) => removeVisitWorker(ex, ctx, { seatId: seat.seatId, reason: " " })),
    ).rejects.toThrow("A reason is required.");
    const result = await test.transact((ex, ctx) =>
      removeVisitWorker(ex, ctx, { seatId: seat.seatId, reason: "Demande du client" }),
    );
    expect(result.status).toBe("AWAITING_CONFIRMATION");
    const visit = await visitRow(monday.id);
    expect(visit).toMatchObject({
      status: "AWAITING_CONFIRMATION",
      planChangedAt: test.clock.now().toISOString(),
      statusChangedAt: test.clock.now().toISOString(),
    });
    const removed = await test.db
      .selectFrom("VisitWorker")
      .selectAll()
      .where("id", "=", seat.seatId)
      .executeTakeFirstOrThrow();
    expect(removed.seatStatus).toBe("REMOVED");
    const updates = await logOf("UPDATE");
    expect(updates.at(-1)).toMatchObject({ entity: "Visit", reason: "Demande du client", subjectId: a.id });

    await expect(
      test.transact((ex, ctx) => removeVisitWorker(ex, ctx, { seatId: seat.seatId, reason: "encore" })),
    ).rejects.toThrow("Only an assigned worker can be taken off a visit.");
    // She may be given the seat again.
    expect((await assign(monday.id, a.id)).status).toBe("CONFIRMED");
  });

  it("leaves the plan unmarked when the order was never printed", async () => {
    const { on } = await contracted();
    const monday = on("2026-11-02");
    const seat = await assign(monday.id, (await worker()).id);
    await test.transact((ex, ctx) => removeVisitWorker(ex, ctx, { seatId: seat.seatId, reason: "Erreur de saisie" }));
    expect(await visitRow(monday.id)).toMatchObject({ status: "AWAITING_CONFIRMATION", planChangedAt: null });
  });
});

describe("listSeatCandidates", () => {
  it("offers the workers the site allows, those the rules let through first, then the zone, then the lightest week", async () => {
    const { on, zone } = await contracted({
      womenOnly: 1,
      requiredAbilityCodes: JSON.stringify(["CLIMB_STAIRS"]),
    });
    const monday = on("2026-11-02");
    const able = JSON.stringify(["CLIMB_STAIRS", "CARRY_EQUIPMENT"]);
    const light = await worker({ zoneId: zone.id, abilities: able, lastName: "أ" });
    const loaded = await worker({ zoneId: zone.id, abilities: able, lastName: "ب" });
    const elsewhere = await worker({ abilities: able, lastName: "ت", isReserve: 1 });
    const absent = await worker({ zoneId: zone.id, abilities: able, lastName: "ث" });
    const onVisit = await worker({ zoneId: zone.id, abilities: able });
    const man = await worker({ zoneId: zone.id, abilities: able, sex: "MALE" });
    const unable = await worker({ zoneId: zone.id, abilities: JSON.stringify(["CARRY_EQUIPMENT"]) });
    await busy(loaded.id, "2026-11-03", "08:00", 600);
    await test.rows.insert("WorkerAbsence", {
      workerId: absent.id,
      startDate: localDate("2026-11-02"),
      endDate: localDate("2026-11-02"),
      type: "FULL_DAY",
      absenceMin: minutes(480),
      category: "SICK",
      status: "RECORDED",
    });
    await assign(monday.id, onVisit.id);

    const candidates = await test.transact((ex, ctx) => listSeatCandidates(ex, ctx, { visitId: monday.id }));
    expect(candidates.map((candidate) => candidate.id)).toEqual([light.id, loaded.id, elsewhere.id, absent.id]);
    for (const left of [onVisit.id, man.id, unable.id]) {
      expect(candidates.some((candidate) => candidate.id === left)).toBe(false);
    }
    expect(candidates[0]).toMatchObject({ sameZone: true, loadMin: 0, capacityMin: 2400, worstLevel: null });
    expect(candidates[1]).toMatchObject({ sameZone: true, loadMin: 600 });
    expect(candidates[2]).toMatchObject({ sameZone: false, isReserve: true });
    expect(candidates[3]).toMatchObject({ sameZone: true, worstLevel: "NEEDS_MANAGER" });
    expect(candidates[3].findings.map((finding) => finding.code)).toEqual(["ON_LEAVE"]);
  });
});

describe("confirmVisit", () => {
  it("leaves a filled on-demand visit for the office to confirm, and confirms it when every seat is held", async () => {
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
      endDate: localDate("2026-10-21"),
      workersCount: 1,
    } as never);
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    const [first, second] = await test.db
      .selectFrom("Visit")
      .selectAll()
      .where("fileId", "=", file.id)
      .orderBy("visitDate")
      .execute();

    expect((await assign(first.id, (await worker()).id)).status).toBe("AWAITING_CONFIRMATION");
    await expect(test.transact((ex, ctx) => confirmVisit(ex, ctx, { visitId: second.id }))).rejects.toThrow(
      "A visit is confirmed only when every seat is filled.",
    );
    expect(await test.transact((ex, ctx) => confirmVisit(ex, ctx, { visitId: first.id }))).toEqual({
      status: "CONFIRMED",
    });
    expect((await visitRow(first.id)).status).toBe("CONFIRMED");
    await expect(test.transact((ex, ctx) => confirmVisit(ex, ctx, { visitId: first.id }))).rejects.toThrow(
      "Only a visit awaiting confirmation can be confirmed.",
    );
  });
});
