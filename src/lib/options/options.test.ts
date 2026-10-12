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

describe("the service catalogues of his forms", () => {
  it("offer each division its own subset, in print order", async () => {
    const { PROVIDED_SERVICES_OF, PROGRAMMED_SERVICES_OF, PROVIDED_SERVICE_AR, PROGRAMMED_SERVICE_HEADING_AR } =
      await import("./index");

    expect([
      PROVIDED_SERVICES_OF.HOUSING.length,
      PROVIDED_SERVICES_OF.ORGANISATION.length,
      PROVIDED_SERVICES_OF.BUILDING.length,
    ]).toEqual([13, 20, 20]);
    expect(PROVIDED_SERVICES_OF.COMPLEX).toEqual(PROVIDED_SERVICES_OF.BUILDING);
    expect([PROGRAMMED_SERVICES_OF.HOUSING.length, PROGRAMMED_SERVICES_OF.ORGANISATION.length]).toEqual([12, 11]);
    expect(PROVIDED_SERVICE_AR[PROVIDED_SERVICES_OF.BUILDING[1]]).toBe("الساحات");
    expect(PROGRAMMED_SERVICE_HEADING_AR.HOUSING).toBe("نوع الخدمة المبرمجة");
  });
});
