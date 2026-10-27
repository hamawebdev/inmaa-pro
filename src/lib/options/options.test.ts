import { describe, expect, it } from "vitest";

import { localDate } from "@/lib/units";

import {
  CLIENT_WEEKDAY_AR,
  DIVISION_AR,
  DIVISIONS,
  isOneOf,
  optionEntries,
  SHARED_OPTION_LISTS,
  weekdayIndex,
  weekdayOf,
  workerRoleAr,
  yesNoOf,
  yesNoValue,
} from "./index";
import * as options from "./index";

describe("the shared option lists", () => {
  it("give his words for every code of every list, and nothing else", () => {
    for (const [name, codes] of Object.entries(SHARED_OPTION_LISTS)) {
      const constant = name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      const words = (options as unknown as Record<string, Record<string, string>>)[`${constant}_AR`];
      expect(words, name).toBeDefined();
      expect(Object.keys(words).sort(), name).toEqual([...codes].sort());
      expect(
        Object.values(words).every((word) => word.trim().length > 0),
        name,
      ).toBe(true);
    }
  });

  it("draw a form's tick boxes in his order", () => {
    expect(optionEntries(DIVISIONS, DIVISION_AR)).toEqual([
      { code: "HOUSING", ar: "المنازل" },
      { code: "ORGANISATION", ar: "المؤسسات" },
      { code: "BUILDING", ar: "العمارات" },
      { code: "COMPLEX", ar: "التجمعات السكنية" },
    ]);
    expect(isOneOf(DIVISIONS, "COMPLEX")).toBe(true);
    expect(isOneOf(DIVISIONS, "COMMON")).toBe(false);
    expect(isOneOf(DIVISIONS, null)).toBe(false);
  });

  it("know the weekday of a date, Saturday first", () => {
    expect(weekdayOf(localDate("2026-10-12"))).toBe("MON");
    expect(weekdayOf(localDate("2026-10-17"))).toBe("SAT");
    expect(weekdayOf(localDate("2026-10-16"))).toBe("FRI");
    expect([weekdayIndex("SAT"), weekdayIndex("FRI")]).toEqual([0, 6]);
    expect(CLIENT_WEEKDAY_AR.MON).toBe("الاثنين");
  });

  it("tick yes or no from a nullable column, and back", () => {
    expect([yesNoOf(true), yesNoOf(0), yesNoOf(null)]).toEqual(["YES", "NO", null]);
    expect([yesNoValue("YES"), yesNoValue("NO"), yesNoValue(null)]).toEqual([true, false, null]);
  });

  it("word a woman's role as his form does", () => {
    expect(workerRoleAr("CLEANER", "FEMALE")).toBe("عاملة نظافة");
    expect(workerRoleAr("TEAM_LEADER", "MALE")).toBe("قائد فريق");
    expect(workerRoleAr("CLEANER", null)).toBe("عامل نظافة");
  });
});

describe("his service lists as migration 0003 seeded them", () => {
  it("offer each division its own subset, in print order", async () => {
    const { SEED_PROVIDED_SERVICES, SEED_PROVIDED_SERVICES_OF, SEED_PROGRAMMED_SERVICES, SEED_PROGRAMMED_SERVICES_OF } =
      await import("./service-catalogue-seed");

    expect([SEED_PROVIDED_SERVICES.length, SEED_PROGRAMMED_SERVICES.length]).toEqual([35, 13]);
    expect([
      SEED_PROVIDED_SERVICES_OF.HOUSING.length,
      SEED_PROVIDED_SERVICES_OF.ORGANISATION.length,
      SEED_PROVIDED_SERVICES_OF.BUILDING.length,
    ]).toEqual([13, 20, 20]);
    expect(SEED_PROVIDED_SERVICES_OF.COMPLEX).toEqual(SEED_PROVIDED_SERVICES_OF.BUILDING);
    expect([SEED_PROGRAMMED_SERVICES_OF.HOUSING.length, SEED_PROGRAMMED_SERVICES_OF.ORGANISATION.length]).toEqual([
      12, 11,
    ]);
    const words = new Map(SEED_PROVIDED_SERVICES.map((service) => [service.code, service.ar]));
    expect(words.get(SEED_PROVIDED_SERVICES_OF.BUILDING[1])).toBe("الساحات");
    // Every service of a division is one of his, and each has its three names.
    for (const [list, of] of [
      [SEED_PROVIDED_SERVICES, SEED_PROVIDED_SERVICES_OF],
      [SEED_PROGRAMMED_SERVICES, SEED_PROGRAMMED_SERVICES_OF],
    ] as const) {
      const codes = new Set(list.map((service) => service.code));
      expect(codes.size).toBe(list.length);
      for (const division of Object.values(of)) for (const code of division) expect(codes.has(code), code).toBe(true);
      for (const service of list) expect([service.ar, service.fr, service.en].every(Boolean), service.code).toBe(true);
    }
  });
});
