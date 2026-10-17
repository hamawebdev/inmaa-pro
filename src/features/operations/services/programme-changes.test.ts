import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { previewVisitGeneration } from "./programme";
import { previewFutureVisitsUpdate, updateFutureVisits } from "./programme-changes";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

type Row = Record<string, unknown>;

/**
 * An organisation contract for November 2026 as his form gives it (Saturday,
 * Monday, Wednesday, 08:00 to 11:00, two workers), contracted: its slots and
 * its thirteen visits exist. `before` runs once the file exists and before it
 * is contracted (a standing team).
 */
async function contracted(over: Row = {}, before?: (fileId: string) => Promise<void>) {
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
  await before?.(file.id);
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
  return { zone, site, file };
}

const visitsOf = (fileId: string) =>
  test.db
    .selectFrom("Visit")
    .selectAll()
    .where("fileId", "=", fileId)
    .orderBy("visitDate")
    .orderBy("createdAt")
    .execute();
const slotsOf = (fileId: string) =>
  test.db.selectFrom("FileSlot").selectAll().where("fileId", "=", fileId).orderBy("dayOfWeek").execute();
const programmeOf = (fileId: string) =>
  test.db.selectFrom("FileProgramme").selectAll().where("fileId", "=", fileId).executeTakeFirstOrThrow();
const setFile = (fileId: string, values: Row) =>
  test.db.updateTable("File").set(values).where("id", "=", fileId).execute();
const setVisit = async (fileId: string, date: string, values: Row) =>
  test.db
    .updateTable("Visit")
    .set(values)
    .where("fileId", "=", fileId)
    .where("visitDate", "=", localDate(date))
    .execute();
const preview = (fileId: string) => test.transact((ex, ctx) => previewFutureVisitsUpdate(ex, ctx, { fileId }));
const update = (fileId: string) => test.transact((ex, ctx) => updateFutureVisits(ex, ctx, { fileId }));

describe("file.termsChanged", () => {
  it("only marks the programme: nothing is regenerated", async () => {
    const { file } = await contracted();
    const before = await programmeOf(file.id);
    const visits = await visitsOf(file.id);
    await setFile(file.id, { arrivalTime: localTime("09:00"), departureTime: localTime("12:00") });
    test.clock.advance({ minutes: 5 });
    await test.transact((ex, ctx) => emit(ex, ctx, "file.termsChanged", { fileId: file.id }));

    expect(await programmeOf(file.id)).toEqual({ ...before, formChangedAt: "2026-10-12T08:05:00.000Z" });
    expect(await visitsOf(file.id)).toEqual(visits);
  });
});

describe("updateFutureVisits", () => {
  /**
   * The form changes: Wednesday becomes Thursday, the team comes at 09:00
   * instead of 08:00, and the contract ends on 25 November. One Monday order
   * was printed, one Wednesday visit was moved by hand, one Saturday was
   * postponed: those three are left as they are.
   */
  async function changedContract() {
    const { file } = await contracted();
    await setVisit(file.id, "2026-11-09", { orderPrintedAt: "2026-10-12T07:00:00.000Z", orderPrintCount: 1 });
    await setVisit(file.id, "2026-11-11", { isManuallyEdited: 1 });
    await setVisit(file.id, "2026-11-14", { status: "POSTPONED", statusReason: "CLIENT_REQUEST" });
    await setFile(file.id, {
      executionDays: JSON.stringify(["SAT", "MON", "THU"]),
      arrivalTime: localTime("09:00"),
      departureTime: localTime("12:00"),
      endDate: localDate("2026-11-25"),
    });
    await test.transact((ex, ctx) => emit(ex, ctx, "file.termsChanged", { fileId: file.id }));
    return file;
  }

  const expected = {
    canUpdate: true,
    // Saturdays 7 and 21, Mondays 2, 16 and 23.
    moved: 5,
    // Thursdays 5, 12 and 19 (the 26th is after the new end).
    added: 3,
    // Saturday 28 and Monday 30 (after the new end), Wednesdays 4, 18 and 25 (no longer a day of the programme).
    cancelled: 5,
    left: { printed: 1, edited: 1, otherStatus: 1 },
    slots: { updated: 2, added: 1, deactivated: 1 },
  };

  it("previews the change without writing anything", async () => {
    const file = await changedContract();
    const visits = await visitsOf(file.id);
    const slots = await slotsOf(file.id);
    const seen = await preview(file.id);
    expect(seen).toMatchObject(expected);
    expect(seen.leftVisits.map((visit) => [visit.visitDate, visit.reason])).toEqual([
      ["2026-11-09", "PRINTED"],
      ["2026-11-11", "EDITED"],
      ["2026-11-14", "STATUS"],
    ]);
    expect(await visitsOf(file.id)).toEqual(visits);
    expect(await slotsOf(file.id)).toEqual(slots);
    expect((await programmeOf(file.id)).formChangedAt).not.toBeNull();
  });

  it("makes the slots follow the form and the untouched visits follow the slots", async () => {
    const file = await changedContract();
    const done = await update(file.id);
    expect(done).toMatchObject(expected);

    const slots = await slotsOf(file.id);
    expect(slots.map((slot) => [slot.dayOfWeek, slot.startTime, slot.durationMin, slot.isActive])).toEqual([
      [0, "09:00", 180, 1],
      [2, "09:00", 180, 1],
      [4, "08:00", 180, 0],
      [5, "09:00", 180, 1],
    ]);

    const visits = await visitsOf(file.id);
    const on = (date: string) => visits.filter((visit) => visit.visitDate === date);
    expect(visits).toHaveLength(16);
    for (const date of ["2026-11-07", "2026-11-21", "2026-11-02", "2026-11-16", "2026-11-23"]) {
      expect(on(date)[0]).toMatchObject({ status: "AWAITING_CONFIRMATION", plannedStartTime: "09:00" });
    }
    for (const date of ["2026-11-28", "2026-11-30", "2026-11-04", "2026-11-18", "2026-11-25"]) {
      expect(on(date)[0]).toMatchObject({ status: "CANCELLED", statusReason: "PROGRAMME_CHANGED" });
    }
    // Left as they were.
    expect(on("2026-11-09")[0]).toMatchObject({ status: "AWAITING_CONFIRMATION", plannedStartTime: "08:00" });
    expect(on("2026-11-11")[0]).toMatchObject({ status: "AWAITING_CONFIRMATION", plannedStartTime: "08:00" });
    expect(on("2026-11-14")[0]).toMatchObject({ status: "POSTPONED", plannedStartTime: "08:00" });
    // The new Thursdays, on the new slot.
    const thursday = slots.find((slot) => slot.dayOfWeek === 5)!;
    for (const date of ["2026-11-05", "2026-11-12", "2026-11-19"]) {
      expect(on(date)[0]).toMatchObject({
        origin: "CONTRACT",
        fileSlotId: thursday.id,
        slotDate: date,
        plannedStartTime: "09:00",
        workersNeeded: 2,
      });
    }
    expect(on("2026-11-26")).toHaveLength(0);

    expect((await programmeOf(file.id)).formChangedAt).toBeNull();
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("entity", "=", "File")
      .where("entityId", "=", file.id)
      .where("action", "=", "UPDATE")
      .executeTakeFirstOrThrow();
    const changes = JSON.parse(entry.changes ?? "{}") as Record<string, unknown>;
    expect(changes["slot.WED.isActive"]).toEqual([1, 0]);
    expect(changes["slot.SAT.startTime"]).toEqual(["08:00", "09:00"]);
    expect(Object.keys(changes).filter((key) => key.endsWith(".status"))).toHaveLength(5);

    // A second run finds nothing more to do, and still reports the three visits left.
    expect(await update(file.id)).toMatchObject({
      moved: 0,
      added: 0,
      cancelled: 0,
      left: { printed: 1, edited: 1, otherStatus: 1 },
      slots: { updated: 0, added: 0, deactivated: 0 },
    });
    expect(await visitsOf(file.id)).toHaveLength(16);
  });

  it("settles the team of a visit whose headcount changed", async () => {
    const worker = await test.rows.insert("StaffMember", { role: "CLEANER", engagementStatus: "ACCEPTED" } as never);
    const { file } = await contracted({}, async (fileId) => {
      await test.rows.insert("FileAssignment", {
        fileId,
        workerId: worker.id,
        role: "LEADER",
        validFrom: localDate("2026-11-01"),
        sortOrder: 0,
      });
    });
    expect((await visitsOf(file.id)).every((visit) => visit.status === "AWAITING_CONFIRMATION")).toBe(true);
    await setFile(file.id, { workersCount: 1 });
    expect(await update(file.id)).toMatchObject({ moved: 13, added: 0, cancelled: 0 });
    expect((await visitsOf(file.id)).every((visit) => visit.status === "CONFIRMED" && visit.workersNeeded === 1)).toBe(
      true,
    );
  });

  it("takes off a woman who cannot follow her visits into the night (LAB-3)", async () => {
    const woman = await test.rows.insert("StaffMember", {
      role: "CLEANER",
      sex: "FEMALE",
      engagementStatus: "ACCEPTED",
      availableDays: JSON.stringify(["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"]),
    } as never);
    const { file } = await contracted({ workersCount: 1 }, async (fileId) => {
      await test.rows.insert("FileAssignment", {
        fileId,
        workerId: woman.id,
        role: "LEADER",
        validFrom: localDate("2026-11-01"),
        sortOrder: 0,
      });
    });
    expect((await visitsOf(file.id)).every((visit) => visit.status === "CONFIRMED")).toBe(true);

    await setFile(file.id, { arrivalTime: localTime("21:30"), departureTime: localTime("23:30"), period: "EVENING" });
    const seen = await preview(file.id);
    expect(seen.seatsDropped).toHaveLength(13);
    expect(seen.seatsDropped[0].why).toBe("This seat breaks a working-time rule. Only the manager can allow it.");

    const done = await update(file.id);
    expect(done.seatsDropped).toHaveLength(13);
    const visits = await visitsOf(file.id);
    expect(
      visits.every((visit) => visit.plannedStartTime === "21:30" && visit.status === "AWAITING_CONFIRMATION"),
    ).toBe(true);
    const seats = await test.db
      .selectFrom("VisitWorker")
      .select("seatStatus")
      .where("workerId", "=", woman.id)
      .execute();
    expect(seats.every((seat) => seat.seatStatus === "REMOVED")).toBe(true);
  });

  it("takes off the seats over a smaller headcount, and seats the standing team on a larger one (OPS-04)", async () => {
    const members: Array<{ id: string }> = [];
    for (let index = 0; index < 3; index += 1) {
      members.push(
        await test.rows.insert("StaffMember", {
          role: index === 0 ? "TEAM_LEADER" : "CLEANER",
          sex: "MALE",
          engagementStatus: "ACCEPTED",
          availableDays: JSON.stringify(["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"]),
        } as never),
      );
    }
    const { file } = await contracted({ workersCount: 2 }, async (fileId) => {
      for (const [sortOrder, member] of members.entries()) {
        await test.rows.insert("FileAssignment", {
          fileId,
          workerId: member.id,
          role: sortOrder === 0 ? "LEADER" : "MEMBER",
          validFrom: localDate("2026-11-01"),
          sortOrder,
        });
      }
    });
    const held = async () =>
      test.db
        .selectFrom("VisitWorker")
        .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
        .select(["Visit.id", "VisitWorker.workerId"])
        .where("Visit.fileId", "=", file.id)
        .where("VisitWorker.seatStatus", "=", "ASSIGNED")
        .execute();
    expect(await held()).toHaveLength(13 * 2);

    await setFile(file.id, { workersCount: 3 });
    const grown = await update(file.id);
    expect(grown.seatsAdded).toBe(13);
    expect(await held()).toHaveLength(13 * 3);
    expect((await visitsOf(file.id)).every((visit) => visit.status === "CONFIRMED")).toBe(true);

    await setFile(file.id, { workersCount: 2 });
    expect((await preview(file.id)).seatsDropped).toHaveLength(13);
    const shrunk = await update(file.id);
    expect(shrunk.seatsDropped.every((seat) => seat.why === "The visit needs fewer workers now.")).toBe(true);
    const after = await held();
    expect(after).toHaveLength(13 * 2);
    // The leader stays on every visit.
    expect(after.filter((seat) => seat.workerId === members[0].id)).toHaveLength(13);
  });

  it("moves an on-demand job to its new days", async () => {
    const site = await test.rows.insert("Site", { division: "HOUSING" });
    const file = await test.rows.insert("File", {
      siteId: site.id,
      clientId: site.clientId,
      division: "HOUSING",
      serviceType: "ON_DEMAND",
      formKind: "HOUSING_REQUEST",
      stage: "CONTRACTED",
      executionDays: JSON.stringify([]),
      period: "MORNING",
      startDate: localDate("2026-10-20"),
      endDate: localDate("2026-10-22"),
      workersCount: 3,
    } as never);
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    // Wednesday 21 to Sunday 25 October, two workers: Friday the 23rd is not worked.
    await setFile(file.id, { startDate: localDate("2026-10-21"), endDate: localDate("2026-10-25"), workersCount: 2 });
    expect(await update(file.id)).toMatchObject({ moved: 2, added: 2, cancelled: 1 });
    const visits = await visitsOf(file.id);
    expect(visits.map((visit) => [visit.visitDate, visit.status, visit.workersNeeded])).toEqual([
      ["2026-10-20", "CANCELLED", 3],
      ["2026-10-21", "AWAITING_CONFIRMATION", 2],
      ["2026-10-22", "AWAITING_CONFIRMATION", 2],
      ["2026-10-24", "AWAITING_CONFIRMATION", 2],
      ["2026-10-25", "AWAITING_CONFIRMATION", 2],
    ]);
  });

  it("refuses a form without its dates, and a file that is not contracted", async () => {
    const { file } = await contracted();
    await setFile(file.id, { endDate: null });
    expect(await preview(file.id)).toMatchObject({
      canUpdate: false,
      moved: 0,
      added: 0,
      cancelled: 0,
      warnings: ["MISSING_DATES"],
    });
    await expect(update(file.id)).rejects.toThrow(
      "The days or dates on this file's form are missing or out of order. Correct the form first.",
    );
    expect((await visitsOf(file.id)).every((visit) => visit.status !== "CANCELLED")).toBe(true);

    await setFile(file.id, { endDate: localDate("2026-11-30"), stage: "QUOTE" });
    await expect(update(file.id)).rejects.toThrow("Visits are made for a contracted file only.");
    await expect(update("nothing")).rejects.toThrow("This client file does not exist.");
  });

  it("is refused to a role that may only read the requests", async () => {
    const { file } = await contracted();
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => updateFutureVisits(ex, ctx, { fileId: file.id }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => previewFutureVisitsUpdate(ex, ctx, { fileId: file.id }), accountant),
    ).resolves.toMatchObject({ canUpdate: true });
  });
});

describe("file.renewed", () => {
  it("gives the renewing file the old set-up, its own form deciding its slots (INT-5, OPS-05)", async () => {
    const leader = await test.rows.insert("StaffMember", {
      role: "TEAM_LEADER",
      engagementStatus: "ACCEPTED",
    } as never);
    const member = await test.rows.insert("StaffMember", { role: "CLEANER", engagementStatus: "ACCEPTED" } as never);
    const alternate = await test.rows.insert("StaffMember", { role: "CLEANER", engagementStatus: "ACCEPTED" } as never);
    const { site, file: old } = await contracted({}, async (fileId) => {
      await test.rows.insert("FileService", { fileId, list: "PROVIDED", code: "FLOORS", sortOrder: 0 });
      await test.rows.insert("FileAssignment", {
        fileId,
        workerId: leader.id,
        role: "LEADER",
        validFrom: localDate("2026-11-01"),
        sortOrder: 0,
      });
      // She left the team half-way through the contract.
      await test.rows.insert("FileAssignment", {
        fileId,
        workerId: member.id,
        role: "MEMBER",
        validFrom: localDate("2026-11-01"),
        validTo: localDate("2026-11-15"),
        sortOrder: 1,
      });
    });

    // What the office did with the programme during the contract.
    const oldSlots = await slotsOf(old.id);
    const monday = oldSlots.find((slot) => slot.dayOfWeek === 2)!;
    await test.db
      .updateTable("FileSlot")
      .set({ startTime: localTime("09:30") })
      .where("id", "=", monday.id)
      .execute();
    await test.rows.insert("FileSlot", {
      fileId: old.id,
      dayOfWeek: 5,
      startTime: localTime("14:00"),
      durationMin: 60 as never,
      workersNeeded: 1,
      validTo: localDate("2026-11-15"),
    });
    await test.rows.insert("FileAssignment", {
      fileId: old.id,
      fileSlotId: monday.id,
      workerId: alternate.id,
      role: "ALTERNATE",
      validFrom: localDate("2026-11-01"),
      sortOrder: 2,
    });
    const entrance = await test.rows.insert("FileArea", {
      fileId: old.id,
      kind: "ENTRANCE",
      label: "المدخل 01",
      sortOrder: 1,
    });
    const floor = await test.rows.insert("FileArea", {
      fileId: old.id,
      kind: "FLOOR",
      parentAreaId: entrance.id,
      label: "الطابق 01",
      sortOrder: 2,
    });
    await test.rows.insert("FileTask", {
      fileId: old.id,
      areaId: floor.id,
      frequency: "WEEKLY",
      label: "غسل الدرج",
      dayOfWeek: 2,
      sortOrder: 5,
    });
    await test.rows.insert("FileTask", {
      fileId: old.id,
      frequency: "SPECIAL",
      label: "تنظيف الواجهة",
      specialDate: localDate("2026-11-10"),
      sortOrder: 6,
    });
    await test.db
      .updateTable("FileProgramme")
      .set({
        rotateRestDay: 1,
        inspectionFrequency: "WEEKLY",
        inspectionDayOfWeek: 2,
        formChangedAt: "2026-10-12T07:00:00.000Z",
        inspectionIsActive: 0,
      })
      .where("fileId", "=", old.id)
      .execute();

    // The successor, as renewFile makes it: another sheet, other days on its form.
    const renewal = await test.rows.insert("File", {
      siteId: site.id,
      clientId: site.clientId,
      division: "ORGANISATION",
      serviceType: "CONTRACT",
      formKind: "ORG_CONTRACT",
      stage: "QUOTE",
      renewalOfFileId: old.id,
      executionDays: JSON.stringify(["SUN", "TUE"]),
      arrivalTime: localTime("10:00"),
      departureTime: localTime("12:00"),
      startDate: localDate("2026-12-01"),
      endDate: localDate("2026-12-31"),
      workersCount: 2,
    } as never);
    await test.rows.insert("FileService", { fileId: renewal.id, list: "PROVIDED", code: "FLOORS", sortOrder: 0 });

    await test.transact((ex, ctx) => emit(ex, ctx, "file.renewed", { fromFileId: old.id, toFileId: renewal.id }));

    const areas = await test.db
      .selectFrom("FileArea")
      .selectAll()
      .where("fileId", "=", renewal.id)
      .orderBy("sortOrder")
      .execute();
    expect(areas.map((area) => [area.label, area.kind])).toEqual([
      ["المدخل 01", "ENTRANCE"],
      ["الطابق 01", "FLOOR"],
    ]);
    expect(areas[1].parentAreaId).toBe(areas[0].id);

    const tasks = await test.db
      .selectFrom("FileTask")
      .selectAll()
      .where("fileId", "=", renewal.id)
      .orderBy("sortOrder")
      .execute();
    expect(tasks.map((task) => [task.label, task.frequency, task.serviceCode, task.areaId])).toEqual([
      ["تنظيف الأرضيات", "DAILY", "FLOORS", null],
      ["غسل الدرج", "WEEKLY", null, areas[1].id],
    ]);

    const slots = await slotsOf(renewal.id);
    expect(slots.map((slot) => [slot.dayOfWeek, slot.startTime, slot.validFrom, slot.validTo, slot.isActive])).toEqual([
      [0, "08:00", null, null, 1],
      [2, "09:30", null, null, 1],
      [4, "08:00", null, null, 1],
    ]);

    const team = await test.db
      .selectFrom("FileAssignment")
      .selectAll()
      .where("fileId", "=", renewal.id)
      .orderBy("sortOrder")
      .execute();
    expect(team.map((seat) => [seat.workerId, seat.role, seat.validFrom, seat.validTo, seat.fileSlotId])).toEqual([
      [leader.id, "LEADER", "2026-12-01", null, null],
      [alternate.id, "ALTERNATE", "2026-12-01", null, slots[1].id],
    ]);

    expect(await programmeOf(renewal.id)).toMatchObject({
      rotateRestDay: 1,
      inspectionFrequency: "WEEKLY",
      inspectionDayOfWeek: 2,
      inspectionStartDate: "2026-12-01",
      inspectionIsActive: 1,
      formChangedAt: null,
    });

    // A second renewal event copies nothing twice.
    await test.transact((ex, ctx) => emit(ex, ctx, "file.renewed", { fromFileId: old.id, toFileId: renewal.id }));
    for (const table of ["FileArea", "FileTask", "FileSlot", "FileAssignment", "FileProgramme"] as const) {
      const rows = await test.db.selectFrom(table).select("id").where("fileId", "=", renewal.id).execute();
      expect([table, rows.length]).toEqual([
        table,
        { FileArea: 2, FileTask: 2, FileSlot: 3, FileAssignment: 2, FileProgramme: 1 }[table],
      ]);
    }

    // Signed: its own form says Sunday and Tuesday, 10:00 to 12:00, the copied slots Sat/Mon/Wed: the form wins, the
    // copy is set aside and the office is told (INT-5, OPS-05).
    await setFile(renewal.id, { stage: "CONTRACTED" });
    expect(
      (await test.transact((ex, ctx) => previewVisitGeneration(ex, ctx, { fileId: renewal.id }))).warnings,
    ).toContain("RENEWAL_SLOTS_FROM_FORM");
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: renewal.id }));
    const visits = await visitsOf(renewal.id);
    // December 2026: Sundays 6..27 (4), Tuesdays 1..29 (5).
    expect(visits).toHaveLength(9);
    expect(visits.every((visit) => visit.plannedStartTime === "10:00")).toBe(true);
    const fresh = await slotsOf(renewal.id);
    expect(fresh.filter((slot) => slot.isActive === 1).map((slot) => slot.dayOfWeek)).toEqual([1, 3]);
    expect(slots.every((slot) => fresh.find((each) => each.id === slot.id)?.isActive === 0)).toBe(true);
    const told = await test.db
      .selectFrom("AuditLog")
      .select("context")
      .where("entity", "=", "File")
      .where("entityId", "=", renewal.id)
      .execute();
    expect(told.some((entry) => (entry.context ?? "").includes("RENEWAL_SLOTS_FROM_FORM"))).toBe(true);
    const seats = await test.db
      .selectFrom("VisitWorker")
      .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
      .select(["VisitWorker.workerId"])
      .where("Visit.fileId", "=", renewal.id)
      .execute();
    expect(seats).toHaveLength(9);
    expect(seats.every((seat) => seat.workerId === leader.id)).toBe(true);
    // The service tick was already a task: it is not seeded a second time.
    expect(await test.db.selectFrom("FileTask").select("id").where("fileId", "=", renewal.id).execute()).toHaveLength(
      2,
    );
  });
});
