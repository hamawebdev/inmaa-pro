import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSetting, getSettings } from "@/lib/settings";
import type { LocalDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { SETTING_GROUPS, SETTING_FIELDS, schemaOf } from "../validators/settings-form";
import { readCostSettings, readSettingValues, saveSettingValues } from "./settings-form";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

describe("the settings forms", () => {
  it("cover every setting a person sets, and accept every default", async () => {
    const { SETTING_KEYS, SETTING_DEFAULTS } = await import("@/lib/settings");
    const people = SETTING_KEYS.filter(
      (key) =>
        !key.startsWith("system.") &&
        // Pictures and the backup folder have their own cards.
        !["centre.nameAr", "centre.logoUrl", "letterhead.headerUrl", "letterhead.footerUrl"].includes(key) &&
        !key.startsWith("backup.") &&
        !key.startsWith("security."),
    );
    expect(people.filter((key) => !SETTING_FIELDS.has(key))).toEqual([]);
    for (const group of SETTING_GROUPS) {
      for (const { key, field } of group.fields) {
        expect(schemaOf(field).safeParse(SETTING_DEFAULTS[key]).success, key).toBe(true);
      }
    }
  });

  it("save only what changed, one log entry per key", async () => {
    const before = await test.db.selectFrom("AuditLog").select("id").execute();
    const { changed } = await test.transact((ex, ctx) =>
      saveSettingValues(ex, ctx, {
        values: { "work.arrivalGraceMin": 20, "work.travelGapMin": 30, "centre.rc": "04/00-1234567B21" },
      }),
    );
    expect(changed.sort()).toEqual(["centre.rc", "work.arrivalGraceMin"]);
    expect(await getSetting(test.db, "work.arrivalGraceMin")).toBe(20);
    const entries = await test.db
      .selectFrom("AuditLog")
      .select(["action", "entityLabel", "changes"])
      .orderBy("chainSeq", "desc")
      .limit(3)
      .execute();
    expect((await test.db.selectFrom("AuditLog").select("id").execute()).length - before.length).toBe(2);
    expect(entries.map((entry) => entry.action)).toContain("SETTINGS_CHANGE");
  });

  it("refuse a value its form does not accept, and the rules that join two settings", async () => {
    await expect(
      test.transact((ex, ctx) => saveSettingValues(ex, ctx, { values: { "inspection.threshold": 140 } })),
    ).rejects.toThrow("One of the values is not allowed here.");
    await expect(
      test.transact((ex, ctx) =>
        saveSettingValues(ex, ctx, { values: { "work.period.morning": { from: "12:00", to: "08:00" } } }),
      ),
    ).rejects.toThrow("The end must come after the start.");
    // The night runs past midnight.
    await test.transact((ex, ctx) =>
      saveSettingValues(ex, ctx, { values: { "work.night": { from: "22:00", to: "06:00" } } }),
    );
    await expect(
      test.transact((ex, ctx) => saveSettingValues(ex, ctx, { values: { "work.restDay": "SAT" } })),
    ).rejects.toThrow("The rest day cannot be a working day.");
    await expect(
      test.transact((ex, ctx) => saveSettingValues(ex, ctx, { values: { "invoice.missedVisitRule": "FIXED_AMOUNT" } })),
    ).rejects.toThrow("Type the amount billed for a missed visit.");
    await test.transact((ex, ctx) =>
      saveSettingValues(ex, ctx, {
        values: { "invoice.missedVisitRule": "FIXED_AMOUNT", "invoice.missedVisitAmount": 150000 },
      }),
    );
    await expect(
      test.transact((ex, ctx) =>
        saveSettingValues(ex, ctx, {
          values: {
            "stamp.bands": [
              { upTo: 3000000, per100: 100 },
              { upTo: 1000000, per100: 150 },
              { upTo: null, per100: 200 },
            ],
          },
        }),
      ),
    ).rejects.toThrow("Each band must go higher than the one before");
    expect(await getSettings(test.db, ["work.night", "invoice.missedVisitAmount"])).toEqual({
      "work.night": { from: "22:00", to: "06:00" },
      "invoice.missedVisitAmount": 150000,
    });
  });

  it("keep the work rules for whoever holds settings.rules, and Settings for its section", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(test.transact((ex, ctx) => readSettingValues(ex, ctx, { tab: "rules" }), accountant)).rejects.toThrow(
      "You do not have permission to do this.",
    );

    // A role given Settings but not the rules capability changes the centre, not the rules.
    const admin = await test.sessionFor("ADMINISTRATION");
    const withSettings = { ...admin, sections: { ...admin.sections, SETTINGS: "WRITE" as const } };
    await test.transact((ex, ctx) => saveSettingValues(ex, ctx, { values: { "centre.nif": "123" } }), withSettings);
    await expect(
      test.transact((ex, ctx) => saveSettingValues(ex, ctx, { values: { "work.weekMin": 2280 } }), withSettings),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("the centre's costs (audit LOG-7)", () => {
  it("are read and changed with cost.read only, each read logged, and never written in the log's changes (LOG-7)", async () => {
    await test.transact((ex, ctx) =>
      saveSettingValues(ex, ctx, { values: { "costing.hourlyLabourCost": 98765, "costing.marginPercent": 3300 } }),
    );
    const changes = await test.db
      .selectFrom("AuditLog")
      .select("changes")
      .where("action", "=", "SETTINGS_CHANGE")
      .where("entityId", "in", ["costing.hourlyLabourCost", "costing.marginPercent"])
      .execute();
    expect(changes.map((row) => JSON.parse(row.changes ?? "null"))).toEqual([
      { "costing.hourlyLabourCost": ["§", "§"] },
      { "costing.marginPercent": ["§", "§"] },
    ]);

    // Not in the tab's read; in their own, logged.
    const rules = await test.transact((ex, ctx) => readSettingValues(ex, ctx, { tab: "rules" }));
    expect(rules).not.toHaveProperty("costing.hourlyLabourCost");
    expect(rules).toHaveProperty("costing.hoursOverrunPercent");
    expect(await test.transact((ex, ctx) => readCostSettings(ex, ctx))).toMatchObject({
      "costing.hourlyLabourCost": 98765,
      "costing.marginPercent": 3300,
    });
    const consult = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(consult).toMatchObject({ operation: "CONSULT", action: "VIEW_RESTRICTED", entity: "Setting" });

    // A role given Settings and the rules, but not cost, neither reads nor changes them.
    const admin = await test.sessionFor("ADMINISTRATION");
    const rulesOnly = {
      ...admin,
      sections: { ...admin.sections, SETTINGS: "WRITE" as const },
      capabilities: new Set([...admin.capabilities, "settings.rules"]),
    };
    await expect(test.transact((ex, ctx) => readCostSettings(ex, ctx), rulesOnly)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    await expect(
      test.transact((ex, ctx) => saveSettingValues(ex, ctx, { values: { "costing.marginPercent": 1 } }), rulesOnly),
    ).rejects.toThrow("You do not have permission to do this.");
    await test.transact(
      (ex, ctx) => saveSettingValues(ex, ctx, { values: { "costing.hoursOverrunPercent": 1500 } }),
      rulesOnly,
    );
  });
});

describe("the legal series (audit INV-5)", () => {
  const setSeries = (series: string) =>
    test.transact((ex, ctx) => saveSettingValues(ex, ctx, { values: { "numbering.legalSeries": series } }));

  it("is a short code, and frozen for the year once an invoice or a receipt is numbered in it (INV-5)", async () => {
    await expect(setSeries("B/2")).rejects.toThrow("The series is a short code");
    await setSeries("B");
    await test.run.transact((ex, ctx) =>
      test.rows.insert("Invoice", { issueDate: "2026-10-12" as LocalDate }, { ex, ctx }),
    );
    await expect(setSeries("C")).rejects.toThrow(
      "The series cannot change during a year in which an invoice or a receipt has been numbered.",
    );
    expect(await getSetting(test.db, "numbering.legalSeries")).toBe("B");

    // From 1 January it may change again.
    test.clock.set("2027-01-01T08:00:00.000Z");
    await setSeries("");
    expect(await getSetting(test.db, "numbering.legalSeries")).toBe("");
  });
});
