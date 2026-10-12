import { describe, expect, it } from "vitest";

import {
  addDays,
  clockOf,
  compareMoments,
  datesBetween,
  dayNumber,
  daysBetween,
  isClockTime,
  isIsoDate,
  minutesFromTo,
  minutesNear,
  minutesOf,
  monthOf,
  weekStartOf,
  weekdayOf,
  weekdaysOfCodes,
} from "./calendar";

describe("calendar dates", () => {
  it("numbers the weekdays from Saturday", () => {
    // 10 October 2026 is a Saturday.
    expect(weekdayOf("2026-10-10")).toBe(0);
    expect(weekdayOf("2026-10-12")).toBe(2);
    expect(weekdayOf("2026-10-15")).toBe(5);
    expect(weekdayOf("2026-10-16")).toBe(6);
    expect(weekdayOf("1970-01-01")).toBe(5);
  });

  it("opens the week on Saturday", () => {
    expect(weekStartOf("2026-10-10")).toBe("2026-10-10");
    expect(weekStartOf("2026-10-16")).toBe("2026-10-10");
    expect(weekStartOf("2026-10-17")).toBe("2026-10-17");
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-10", "2026-10-17")).toBe(7);
    expect(daysBetween("2026-10-17", "2026-10-10")).toBe(-7);
  });

  it("lists a range with both ends, and nothing when it runs backwards", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesBetween("2026-10-10", "2026-10-10")).toEqual(["2026-10-10"]);
    expect(datesBetween("2026-10-11", "2026-10-10")).toEqual([]);
  });

  it("refuses what is not a date", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("10/10/2026")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(() => dayNumber("2026-02-30")).toThrow(RangeError);
  });

  it("reads the month", () => {
    expect(monthOf("2026-10-10")).toBe("2026-10");
  });
});

describe("clock times", () => {
  it("converts to minutes and back", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("08:30")).toBe(510);
    expect(minutesOf("23:59")).toBe(1439);
    expect(clockOf(510)).toBe("08:30");
    expect(clockOf(1440 + 120)).toBe("02:00");
  });

  it("refuses what is not a clock time", () => {
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("8:30")).toBe(false);
    expect(isClockTime("08:60")).toBe(false);
    expect(isClockTime("08:30")).toBe(true);
  });

  it("reads an end at or before the start as the next day", () => {
    expect(minutesFromTo("08:00", "12:00")).toBe(240);
    expect(minutesFromTo("22:00", "02:00")).toBe(240);
    expect(minutesFromTo("08:00", "08:00")).toBe(1440);
  });

  it("orders two moments", () => {
    expect(compareMoments({ date: "2026-10-10", time: "09:00" }, { date: "2026-10-10", time: "09:00" })).toBe(0);
    expect(compareMoments({ date: "2026-10-10", time: "16:59" }, { date: "2026-10-11", time: "07:30" })).toBeLessThan(
      0,
    );
    expect(compareMoments({ date: "2026-10-11", time: "00:00" }, { date: "2026-10-10", time: "23:59" })).toBe(1);
  });
});

describe("times on a returned order", () => {
  it("places a time on the day nearest the planned start", () => {
    expect(minutesNear("09:15", "08:00")).toBe(555);
    expect(minutesNear("02:00", "22:00")).toBe(1560);
    expect(minutesNear("21:50", "22:00")).toBe(1310);
    expect(minutesNear("23:30", "00:30")).toBe(-30);
    // Twelve hours either side is the limit.
    expect(minutesNear("20:00", "08:00")).toBe(1200);
    expect(minutesNear("19:59", "08:00")).toBe(1199);
  });
});

describe("stored weekday codes", () => {
  it("reads a JSON list or an array, in week order", () => {
    expect(weekdaysOfCodes('["MON","SAT","FRI"]')).toEqual([0, 2, 6]);
    expect(weekdaysOfCodes(["THU", "SUN", "SUN"])).toEqual([1, 5]);
  });

  it("drops what it does not know, and reads nothing as no day", () => {
    expect(weekdaysOfCodes('["MON","XYZ"]')).toEqual([2]);
    expect(weekdaysOfCodes("not json")).toEqual([]);
    expect(weekdaysOfCodes(null)).toEqual([]);
    expect(weekdaysOfCodes('{"a":1}')).toEqual([]);
  });
});
