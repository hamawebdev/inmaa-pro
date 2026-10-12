import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerHandler, resetFeatureEvents } from "@/lib/events";
import { UNEXPECTED_ERROR } from "@/lib/service/errors";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { ensureCommune, ensureZoneForCommune, listCommunes, PLACES_PATH, remapCommune } from "./places";

/**
 * The worked example of a service test (CLAUDE.md, "A service"): a fresh
 * database from the real migrations and seeds, first run done, the manager
 * signed in, the clock standing at Monday 12 October 2026, 09:00.
 */
let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => {
  test.close();
  resetFeatureEvents();
  vi.restoreAllMocks();
});

/** The seeded communes, in the order of src/lib/geo/communes-oum-el-bouaghi.ts. */
const OUM_EL_BOUAGHI = "commune-04-01";
const AIN_BEIDA = "commune-04-02";
const AIN_MLILA = "commune-04-03";
const AIN_FAKROUN = "commune-04-04";

async function count(table: "AuditLog" | "Commune" | "Zone"): Promise<number> {
  const row = await test.db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

describe("ensureCommune", () => {
  it("finds a seeded commune however its name is typed", async () => {
    const found = await test.transact((ex, ctx) => ensureCommune(ex, ctx, { wilayaCode: "04", nameAr: "ام البواقى" }));
    expect(found).toEqual({ id: OUM_EL_BOUAGHI, created: false });
  });

  it("adds a commune the office typed, once", async () => {
    const first = await test.transact((ex, ctx) =>
      ensureCommune(ex, ctx, { wilayaCode: "25", nameAr: "  الخروب ", nameFr: "El Khroub" }),
    );
    const again = await test.transact((ex, ctx) => ensureCommune(ex, ctx, { wilayaCode: "25", nameAr: "الخروب" }));

    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, created: false });
    const row = await test.db.selectFrom("Commune").selectAll().where("id", "=", first.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      wilayaCode: "25",
      nameAr: "الخروب",
      nameFr: "El Khroub",
      isSeeded: 0,
      zoneId: null,
      createdByUserId: test.manager.userId,
    });
  });

  it("refuses an empty name and a wilaya that is not in the list", async () => {
    await expect(
      test.transact((ex, ctx) => ensureCommune(ex, ctx, { wilayaCode: "04", nameAr: " ـ " })),
    ).rejects.toThrow("The commune name cannot be empty.");
    await expect(
      test.transact((ex, ctx) => ensureCommune(ex, ctx, { wilayaCode: "70", nameAr: "مكان" })),
    ).rejects.toThrow("Choose a wilaya from the list.");
  });
});

describe("ensureZoneForCommune", () => {
  it("creates the commune's zone the first time, named after it, and returns it after", async () => {
    const first = await test.transact((ex, ctx) => ensureZoneForCommune(ex, ctx, { communeId: AIN_BEIDA }));
    const again = await test.transact((ex, ctx) => ensureZoneForCommune(ex, ctx, { communeId: AIN_BEIDA }));

    expect(first.created).toBe(true);
    expect(again).toEqual({ zoneId: first.zoneId, created: false });
    const zone = await test.db.selectFrom("Zone").selectAll().where("id", "=", first.zoneId).executeTakeFirstOrThrow();
    expect(zone).toMatchObject({ name: "عين البيضاء", branchId: "branch-main", isActive: 1 });
  });
});

describe("remapCommune", () => {
  /** Two communes, each with its own zone. */
  function twoZones() {
    return test.transact(async (ex, ctx) => ({
      from: (await ensureZoneForCommune(ex, ctx, { communeId: AIN_MLILA })).zoneId,
      to: (await ensureZoneForCommune(ex, ctx, { communeId: AIN_FAKROUN })).zoneId,
    }));
  }

  it("is refused to a role without settings.rules", async () => {
    const zones = await twoZones();
    const clerk = await test.sessionFor("RECEPTION_SALES");

    await expect(
      test.transact((ex, ctx) => remapCommune(ex, ctx, { communeId: AIN_MLILA, toZoneId: zones.to }), clerk),
    ).rejects.toThrow("You do not have permission to do this.");
  });

  it("moves the commune, writes the log, and tells the other owners in the same transaction", async () => {
    const zones = await twoZones();
    const seen: unknown[] = [];
    registerHandler("clients", "zone.remapped", async (ex, _ctx, payload) => {
      // The handler runs inside the remap's transaction: it already sees the new zone.
      const commune = await ex
        .selectFrom("Commune")
        .select("zoneId")
        .where("id", "=", payload.communeId)
        .executeTakeFirstOrThrow();
      seen.push({ ...payload, zoneSeenByHandler: commune.zoneId });
    });

    const result = await test.transact((ex, ctx) =>
      remapCommune(ex, ctx, { communeId: AIN_MLILA, toZoneId: zones.to }),
    );

    expect(result).toEqual({ changed: true });
    expect(seen).toEqual([
      { communeId: AIN_MLILA, fromZoneId: zones.from, toZoneId: zones.to, zoneSeenByHandler: zones.to },
    ]);
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "CHANGE",
      action: "UPDATE",
      reason: "STANDARD:UPDATE",
      entity: "Commune",
      entityId: AIN_MLILA,
      userId: test.manager.userId,
      userRole: "MANAGER",
      localDate: "2026-10-12",
      localTime: "09:00",
    });
    expect(JSON.parse(entry.changes ?? "null")).toEqual({ zoneId: [zones.from, zones.to] });
  });

  it("is rolled back whole when a handler fails, and the screen gets a sentence it can translate", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const zones = await twoZones();
    const logBefore = await count("AuditLog");
    registerHandler("clients", "zone.remapped", async () => {
      throw new Error("clients: the sites could not be moved");
    });

    const result = await test.run.action(remapCommune, { revalidate: [PLACES_PATH] })({
      communeId: AIN_MLILA,
      toZoneId: zones.to,
    });

    expect(result).toEqual({ success: false, error: UNEXPECTED_ERROR });
    const commune = await test.db
      .selectFrom("Commune")
      .select("zoneId")
      .where("id", "=", AIN_MLILA)
      .executeTakeFirstOrThrow();
    expect(commune.zoneId).toBe(zones.from);
    expect(await count("AuditLog")).toBe(logBefore);
    expect(test.revalidated).toEqual([]);
  });

  it("answers through the screens' wrapper and refreshes the pickers", async () => {
    const zones = await twoZones();

    const result = await test.run.action(remapCommune, { revalidate: [PLACES_PATH] })({
      communeId: AIN_MLILA,
      toZoneId: zones.to,
    });

    expect(result).toEqual({ success: true, data: { changed: true } });
    expect(test.revalidated).toEqual([PLACES_PATH]);
  });
});

describe("listCommunes", () => {
  it("finds communes by part of their name, whatever the spelling", async () => {
    const rows = await test.transact((ex, ctx) => listCommunes(ex, ctx, { wilayaCode: "04", search: "عين" }));

    expect(rows.map((row) => row.nameAr)).toEqual(expect.arrayContaining(["عين البيضاء", "عين مليلة", "عين فكرون"]));
    expect(rows.every((row) => row.nameAr.includes("عين"))).toBe(true);
  });
});
