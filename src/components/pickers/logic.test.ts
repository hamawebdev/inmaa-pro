import { describe, expect, it } from "vitest";

import {
  dateFromIso,
  formatTypedDate,
  isoFromDate,
  isRealDate,
  latinDigits,
  limitOf,
  monthOf,
  orderedRange,
  parseTypedDate,
  parseTypedTime,
  yearPage,
} from "./logic";

describe("a typed date", () => {
  it("reads day first, with any separator, a two-digit year in this century", () => {
    expect(parseTypedDate("12/10/2026")).toBe("2026-10-12");
    expect(parseTypedDate("12.10.26")).toBe("2026-10-12");
    expect(parseTypedDate("12-10-2026")).toBe("2026-10-12");
    expect(parseTypedDate(" 1/2/2026 ")).toBe("2026-02-01");
    expect(parseTypedDate("12102026")).toBe("2026-10-12");
    expect(parseTypedDate("121026")).toBe("2026-10-12");
    expect(parseTypedDate("05/03/1984")).toBe("1984-03-05");
  });

  it("reads the digits an Arabic keyboard types", () => {
    expect(latinDigits("١٢/١٠/٢٠٢٦")).toBe("12/10/2026");
    expect(parseTypedDate("١٢/١٠/٢٠٢٦")).toBe("2026-10-12");
  });

  it("refuses a day that does not exist, and anything else", () => {
    expect(parseTypedDate("31/02/2026")).toBeNull();
    expect(parseTypedDate("29/02/2025")).toBeNull();
    expect(parseTypedDate("29/02/2024")).toBe("2024-02-29");
    expect(parseTypedDate("12/13/2026")).toBeNull();
    expect(parseTypedDate("12/10")).toBeNull();
    expect(parseTypedDate("12/10/202")).toBeNull();
    expect(parseTypedDate("1210")).toBeNull();
    expect(parseTypedDate("")).toBeNull();
    expect(parseTypedDate("abc")).toBeNull();
  });

  it("is written back as he writes it", () => {
    expect(formatTypedDate("2026-10-12")).toBe("12/10/2026");
    expect(formatTypedDate("")).toBe("");
  });
});

describe("a typed time", () => {
  it("reads hours and minutes in the usual ways", () => {
    expect(parseTypedTime("7:05")).toBe("07:05");
    expect(parseTypedTime("07:05")).toBe("07:05");
    expect(parseTypedTime("7.05")).toBe("07:05");
    expect(parseTypedTime("7h05")).toBe("07:05");
    expect(parseTypedTime("705")).toBe("07:05");
    expect(parseTypedTime("1730")).toBe("17:30");
    expect(parseTypedTime("8")).toBe("08:00");
    expect(parseTypedTime("٠٨:٣٠")).toBe("08:30");
  });

  it("refuses what is not a clock time", () => {
    expect(parseTypedTime("24:00")).toBeNull();
    expect(parseTypedTime("12:60")).toBeNull();
    expect(parseTypedTime("12:5")).toBeNull();
    expect(parseTypedTime("")).toBeNull();
    expect(parseTypedTime("noon")).toBeNull();
  });
});

describe("dates against the calendar", () => {
  it("checks limits, either of which may be absent", () => {
    expect(limitOf("2026-10-12", "2026-10-13")).toBe("before");
    expect(limitOf("2026-10-12", undefined, "2026-10-11")).toBe("after");
    expect(limitOf("2026-10-12", "", "")).toBeNull();
    expect(limitOf("2026-10-12", "2026-10-12", "2026-10-12")).toBeNull();
  });

  it("turns a stored date into the calendar's Date and back without moving a day", () => {
    expect(isoFromDate(dateFromIso("2026-03-29")!)).toBe("2026-03-29");
    expect(isoFromDate(dateFromIso("2026-10-25")!)).toBe("2026-10-25");
    expect(dateFromIso("2026-02-30")).toBeUndefined();
    expect(isoFromDate(monthOf("2026-10-12")!)).toBe("2026-10-01");
    expect(isRealDate("2026-10-12")).toBe(true);
  });

  it("pages years by twelve and puts a range in order", () => {
    expect(yearPage(2026)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
    expect(orderedRange("2026-10-18", "2026-10-12")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(orderedRange("2026-10-12", "")).toEqual({ from: "2026-10-12", to: "2026-10-12" });
  });
});
