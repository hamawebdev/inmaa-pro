import { describe, expect, it } from "vitest";

import {
  addOfficeMinutes,
  complaintCounter,
  complaintDueAt,
  officeMinutesBetween,
  type OfficeHours,
} from "./complaint-counter";

/** Monday 12 October 2026. Thursday is the 15th, Friday the 16th, Saturday the 17th. */
function monday(time: string) {
  return { date: "2026-10-12", time };
}

describe("the target time of a complaint", () => {
  it("is two office hours after it came in", () => {
    expect(complaintDueAt(monday("09:00"))).toEqual(monday("11:00"));
    expect(complaintDueAt(monday("15:00"))).toEqual(monday("17:00"));
  });

  it("carries what is left to the next morning", () => {
    // Half an hour before closing: ninety minutes remain from 07:30.
    expect(complaintDueAt(monday("16:30"))).toEqual({ date: "2026-10-13", time: "09:00" });
  });

  it("starts at opening for a complaint that came in while the office was shut", () => {
    expect(complaintDueAt(monday("06:00"))).toEqual(monday("09:30"));
    expect(complaintDueAt(monday("19:00"))).toEqual({ date: "2026-10-13", time: "09:30" });
    expect(complaintDueAt(monday("17:00"))).toEqual({ date: "2026-10-13", time: "09:30" });
  });

  it("skips Friday", () => {
    expect(complaintDueAt({ date: "2026-10-15", time: "16:00" })).toEqual({ date: "2026-10-17", time: "08:30" });
    expect(complaintDueAt({ date: "2026-10-16", time: "10:00" })).toEqual({ date: "2026-10-17", time: "09:30" });
  });

  it("skips a day the office is shut", () => {
    const office: OfficeHours = {
      openTime: "07:30",
      closeTime: "17:00",
      workingWeekdays: [0, 1, 2, 3, 4, 5],
      closedDates: ["2026-10-13"],
    };
    expect(complaintDueAt(monday("16:30"), 120, office)).toEqual({ date: "2026-10-14", time: "09:00" });
  });

  it("follows the target and the hours set in the work rules", () => {
    const office: OfficeHours = { openTime: "08:00", closeTime: "16:00", workingWeekdays: [0, 1, 2, 3, 4] };
    expect(complaintDueAt(monday("15:00"), 240, office)).toEqual({ date: "2026-10-13", time: "11:00" });
    // A target longer than a whole day of office hours.
    expect(addOfficeMinutes(monday("08:00"), 600, office)).toEqual({ date: "2026-10-13", time: "10:00" });
  });

  it("refuses office hours that leave no time", () => {
    expect(() =>
      complaintDueAt(monday("09:00"), 120, { openTime: "09:00", closeTime: "09:00", workingWeekdays: [0] }),
    ).toThrow(RangeError);
    expect(() =>
      complaintDueAt(monday("09:00"), 120, { openTime: "08:00", closeTime: "17:00", workingWeekdays: [] }),
    ).toThrow(RangeError);
  });
});

describe("office minutes between two moments", () => {
  it("counts only while the office is open", () => {
    expect(officeMinutesBetween(monday("09:00"), monday("11:00"))).toBe(120);
    expect(officeMinutesBetween(monday("16:30"), { date: "2026-10-13", time: "09:00" })).toBe(120);
    expect(officeMinutesBetween(monday("05:00"), monday("08:00"))).toBe(30);
    expect(officeMinutesBetween(monday("18:00"), monday("23:00"))).toBe(0);
    // Thursday 16:00 to Saturday 08:30, over a Friday.
    expect(officeMinutesBetween({ date: "2026-10-15", time: "16:00" }, { date: "2026-10-17", time: "08:30" })).toBe(
      120,
    );
  });

  it("is zero backwards", () => {
    expect(officeMinutesBetween(monday("11:00"), monday("09:00"))).toBe(0);
    expect(officeMinutesBetween(monday("11:00"), monday("11:00"))).toBe(0);
  });

  it("agrees with adding", () => {
    for (const minutes of [1, 29, 30, 120, 570, 571, 1200]) {
      const from = monday("16:30");
      expect(officeMinutesBetween(from, addOfficeMinutes(from, minutes))).toBe(minutes);
    }
  });
});

describe("the counter", () => {
  const complaint = { received: monday("09:00"), firstResponse: null };

  it("runs while there is time", () => {
    expect(complaintCounter({ ...complaint, now: monday("09:20") })).toEqual({
      state: "RUNNING",
      due: monday("11:00"),
      marginMin: 100,
    });
  });

  it("warns under thirty minutes", () => {
    expect(complaintCounter({ ...complaint, now: monday("10:30") })).toMatchObject({ state: "RUNNING", marginMin: 30 });
    expect(complaintCounter({ ...complaint, now: monday("10:31") })).toMatchObject({
      state: "CLOSE_TO_TARGET",
      marginMin: 29,
    });
    expect(complaintCounter({ ...complaint, now: monday("11:00") })).toMatchObject({
      state: "CLOSE_TO_TARGET",
      marginMin: 0,
    });
  });

  it("turns late after the target, by office minutes", () => {
    expect(complaintCounter({ ...complaint, now: monday("11:01") })).toMatchObject({ state: "LATE", marginMin: -1 });
    // Still unanswered the next morning at 08:00: six hours of Monday and half an hour of Tuesday.
    expect(complaintCounter({ ...complaint, now: { date: "2026-10-13", time: "08:00" } })).toMatchObject({
      state: "LATE",
      marginMin: -390,
    });
  });

  it("does not run at night", () => {
    const evening = { received: monday("16:30"), firstResponse: null };
    expect(complaintCounter({ ...evening, now: monday("23:00") })).toMatchObject({ state: "RUNNING", marginMin: 90 });
    expect(complaintCounter({ ...evening, now: { date: "2026-10-13", time: "07:00" } })).toMatchObject({
      state: "RUNNING",
      marginMin: 90,
    });
  });

  it("stops at the first answer", () => {
    expect(complaintCounter({ ...complaint, firstResponse: monday("10:15"), now: monday("16:00") })).toEqual({
      state: "ANSWERED_IN_TIME",
      due: monday("11:00"),
      marginMin: 45,
    });
    expect(complaintCounter({ ...complaint, firstResponse: monday("11:00"), now: monday("16:00") })).toMatchObject({
      state: "ANSWERED_IN_TIME",
      marginMin: 0,
    });
    expect(complaintCounter({ ...complaint, firstResponse: monday("12:30"), now: monday("16:00") })).toMatchObject({
      state: "ANSWERED_LATE",
      marginMin: -90,
    });
  });

  it("follows the target and the warning time it is given", () => {
    expect(complaintCounter({ ...complaint, now: monday("10:00"), targetMin: 60 })).toMatchObject({
      state: "CLOSE_TO_TARGET",
      due: monday("10:00"),
    });
    expect(complaintCounter({ ...complaint, now: monday("10:00"), warnMin: 90 })).toMatchObject({
      state: "CLOSE_TO_TARGET",
      marginMin: 60,
    });
  });
});
