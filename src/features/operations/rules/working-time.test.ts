import { describe, expect, it } from "vitest";

import { addDays } from "./calendar";
import {
  WORK_RULE_LEVEL,
  checkWorkerSeats,
  contractWeekIndex,
  loadMin,
  restDatesForWeek,
  seatsClash,
  shouldOfferRestRotation,
  touchesNight,
  worstLevel,
  type Seat,
  type WorkerForRules,
} from "./working-time";

const SATURDAY = "2026-10-10";
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

const woman: WorkerForRules = { sex: "FEMALE", weeklyCapacityMin: null, availableWeekdays: [0, 1, 2, 3, 4, 5] };
const man: WorkerForRules = { sex: "MALE", weeklyCapacityMin: null, availableWeekdays: ALL_WEEK };

let nextId = 0;
function seat(dayOffset: number, startTime: string, hours: number, siteId = "site-a"): Seat {
  nextId += 1;
  return { visitId: `v${nextId}`, siteId, date: addDays(SATURDAY, dayOffset), startTime, durationMin: hours * 60 };
}

/** One seat a day from Saturday, each `hours` long. */
function week(days: number, hours: number): Seat[] {
  return Array.from({ length: days }, (_, day) => seat(day, "08:00", hours));
}

function codes(worker: WorkerForRules, seats: Seat[]): string[] {
  return checkWorkerSeats(worker, seats).map((finding) => finding.code);
}

describe("the weekly hours", () => {
  it("accepts 40 hours over five days", () => {
    expect(codes(woman, week(5, 8))).toEqual([]);
  });

  it("warns between 40 and 48 hours", () => {
    const findings = checkWorkerSeats(woman, [...week(5, 8), seat(5, "08:00", 4)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "WEEK_OVERTIME",
      level: "WARNING",
      weekStart: SATURDAY,
      valueMin: 44 * 60,
    });
  });

  it("still only warns at exactly 48 hours", () => {
    expect(codes(woman, week(6, 8))).toEqual(["WEEK_OVERTIME"]);
  });

  it("needs the manager above 48 hours", () => {
    const seats = [...week(6, 8), seat(5, "16:00", 1)];
    const findings = checkWorkerSeats(woman, seats).filter((finding) => finding.code.startsWith("WEEK"));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "WEEK_OVER_48H", level: "NEEDS_MANAGER", valueMin: 49 * 60 });
  });

  it("warns a part-time worker above her own hours, within the legal week", () => {
    const partTime: WorkerForRules = { ...woman, weeklyCapacityMin: 20 * 60 };
    expect(codes(partTime, week(5, 4))).toEqual([]);
    expect(codes(partTime, week(6, 4))).toEqual(["WEEK_OVER_CAPACITY"]);
  });

  it("judges each week by itself", () => {
    // 40 hours this week and 40 the next are two clean weeks, not 80 hours.
    const twoWeeks = [...week(5, 8), ...week(5, 8).map((s) => ({ ...s, date: addDays(s.date, 7) }))];
    expect(codes(woman, twoWeeks)).toEqual([]);
  });

  it("adds up minutes", () => {
    expect(loadMin(week(3, 4))).toBe(720);
    expect(loadMin([])).toBe(0);
  });
});

describe("the working day", () => {
  it("warns above 8 hours of work in a day", () => {
    const findings = checkWorkerSeats(woman, [seat(0, "08:00", 5), seat(0, "13:30", 4)]);
    expect(findings.map((finding) => finding.code)).toEqual(["DAY_OVER_8H"]);
    expect(findings[0]).toMatchObject({ date: SATURDAY, valueMin: 540, level: "WARNING" });
  });

  it("accepts a day that spans exactly 12 hours", () => {
    expect(codes(woman, [seat(0, "07:00", 3), seat(0, "16:00", 3)])).toEqual([]);
  });

  it("needs the manager when the day spans more than 12 hours, however little is worked", () => {
    const findings = checkWorkerSeats(man, [seat(0, "06:00", 2), seat(0, "17:00", 2)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "DAY_SPAN_12H",
      level: "NEEDS_MANAGER",
      valueMin: 13 * 60,
      date: SATURDAY,
    });
  });

  it("warns on a day the worker did not tick as available", () => {
    const tuesdaysOff: WorkerForRules = { ...woman, availableWeekdays: [0, 1, 2, 4, 5] };
    const findings = checkWorkerSeats(tuesdaysOff, [seat(3, "08:00", 4)]);
    expect(findings.map((finding) => finding.code)).toEqual(["UNAVAILABLE_DAY"]);
    expect(findings[0].date).toBe("2026-10-13");
  });
});

describe("a recorded absence", () => {
  it("needs the manager to plan a seat on a day of absence or leave", () => {
    const onLeave: WorkerForRules = { ...woman, absentDates: ["2026-10-12", "2026-10-13"] };
    const monday = seat(2, "08:00", 4);
    const findings = checkWorkerSeats(onLeave, [seat(0, "08:00", 4), monday]);
    expect(findings).toEqual([
      { code: "ON_LEAVE", level: "NEEDS_MANAGER", date: "2026-10-12", visitIds: [monday.visitId] },
    ]);
  });
});

describe("two visits for one worker", () => {
  it("refuses two visits that overlap", () => {
    const first = seat(0, "08:00", 4);
    const second = seat(0, "11:00", 2);
    const findings = checkWorkerSeats(woman, [second, first]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "OVERLAP", level: "REFUSED", visitIds: [first.visitId, second.visitId] });
  });

  it("keeps the travel gap between two different sites", () => {
    expect(seatsClash(seat(0, "08:00", 4, "a"), seat(0, "12:15", 2, "b"), 30)).toBe(true);
    expect(seatsClash(seat(0, "08:00", 4, "a"), seat(0, "12:30", 2, "b"), 30)).toBe(false);
    expect(codes(woman, [seat(0, "08:00", 3, "a"), seat(0, "11:10", 2, "b")])).toEqual(["OVERLAP"]);
  });

  it("needs no gap between two visits on the same site", () => {
    expect(seatsClash(seat(0, "08:00", 4, "a"), seat(0, "12:00", 2, "a"), 30)).toBe(false);
    expect(codes(woman, [seat(0, "08:00", 4, "a"), seat(0, "12:00", 2, "a")])).toEqual([]);
  });

  it("sees a night visit running into the next morning's", () => {
    expect(codes(man, [seat(0, "22:00", 8), seat(1, "05:00", 2)])).toContain("OVERLAP");
  });
});

describe("night work", () => {
  it("knows what touches the hours between 21:00 and 05:00", () => {
    expect(touchesNight("17:00", 240)).toBe(false); // ends at 21:00 sharp
    expect(touchesNight("17:00", 241)).toBe(true);
    expect(touchesNight("05:00", 180)).toBe(false); // starts at 05:00 sharp
    expect(touchesNight("04:30", 180)).toBe(true);
    expect(touchesNight("22:00", 240)).toBe(true);
    expect(touchesNight("00:00", 60)).toBe(true);
    expect(touchesNight("08:00", 240)).toBe(false);
  });

  it("follows the hours set in the work rules", () => {
    expect(touchesNight("19:30", 60, { nightFrom: "20:00", nightTo: "06:00" })).toBe(true);
    expect(touchesNight("19:30", 30, { nightFrom: "20:00", nightTo: "06:00" })).toBe(false);
  });

  it("flags a woman scheduled at night, for the manager", () => {
    const evening = seat(0, "18:00", 4);
    const findings = checkWorkerSeats(woman, [seat(0, "08:00", 4), evening]);
    const night = findings.filter((finding) => finding.code === "NIGHT_WOMAN");
    expect(night).toEqual([
      { code: "NIGHT_WOMAN", level: "NEEDS_MANAGER", date: SATURDAY, visitIds: [evening.visitId] },
    ]);
  });

  it("does not flag a man on the same visit", () => {
    expect(codes(man, [seat(0, "18:00", 4)])).toEqual([]);
  });
});

describe("the weekly rest", () => {
  it("notes work on Friday, for pay", () => {
    const findings = checkWorkerSeats(man, [seat(6, "08:00", 4)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "REST_DAY_WORKED", level: "FLAG", date: "2026-10-16" });
  });

  it("needs the manager when no day of the week is left free", () => {
    const sevenDays = week(7, 4);
    const found = codes(man, sevenDays);
    expect(found).toContain("NO_REST_DAY");
    expect(found).toContain("REST_DAY_WORKED");
  });

  it("accepts six days out of seven", () => {
    expect(codes(woman, week(6, 4))).toEqual([]);
  });
});

describe("what a finding costs", () => {
  it("names the heaviest", () => {
    expect(worstLevel([])).toBeNull();
    expect(worstLevel(checkWorkerSeats(woman, [...week(5, 8), seat(5, "08:00", 4)]))).toBe("WARNING");
    expect(worstLevel(checkWorkerSeats(woman, [seat(0, "18:00", 4), seat(0, "08:00", 9)]))).toBe("NEEDS_MANAGER");
    expect(worstLevel(checkWorkerSeats(woman, [seat(0, "08:00", 4), seat(0, "09:00", 4)]))).toBe("REFUSED");
  });

  it("has a cost for every rule", () => {
    expect(Object.values(WORK_RULE_LEVEL).every(Boolean)).toBe(true);
  });
});

describe("the rotating rest day", () => {
  it("is offered when the contract covers the rest day", () => {
    expect(shouldOfferRestRotation({ visitsPerWeek: 3, slotWeekdays: [0, 2, 6], aMemberWorksTheRestDay: false })).toBe(
      true,
    );
  });

  it("is offered on six visits a week when a member also works the rest day", () => {
    const sixDays = [0, 1, 2, 3, 4, 5];
    expect(shouldOfferRestRotation({ visitsPerWeek: 6, slotWeekdays: sixDays, aMemberWorksTheRestDay: true })).toBe(
      true,
    );
    expect(shouldOfferRestRotation({ visitsPerWeek: 6, slotWeekdays: sixDays, aMemberWorksTheRestDay: false })).toBe(
      false,
    );
  });

  it("is not offered on a lighter contract", () => {
    expect(shouldOfferRestRotation({ visitsPerWeek: 3, slotWeekdays: [0, 2, 4], aMemberWorksTheRestDay: true })).toBe(
      false,
    );
  });

  it("counts the weeks of a contract from the week it starts in", () => {
    // The contract starts on Monday 12 October.
    expect(contractWeekIndex("2026-10-12", "2026-10-10")).toBe(0);
    expect(contractWeekIndex("2026-10-12", "2026-10-16")).toBe(0);
    expect(contractWeekIndex("2026-10-12", "2026-10-17")).toBe(1);
    expect(contractWeekIndex("2026-10-12", "2026-11-07")).toBe(4);
  });

  const sixVisits = Array.from({ length: 6 }, (_, day) => addDays(SATURDAY, day));

  it("moves each member's rest day one visit day later every week", () => {
    expect(restDatesForWeek(0, ["amel"], sixVisits)).toEqual({ amel: "2026-10-10" });
    expect(restDatesForWeek(1, ["amel"], sixVisits)).toEqual({ amel: "2026-10-11" });
    expect(restDatesForWeek(5, ["amel"], sixVisits)).toEqual({ amel: "2026-10-15" });
    // The seventh week comes back to the first day.
    expect(restDatesForWeek(6, ["amel"], sixVisits)).toEqual({ amel: "2026-10-10" });
  });

  it("never rests two members on the same day", () => {
    for (let weekIndex = 0; weekIndex < 12; weekIndex += 1) {
      const rest = restDatesForWeek(weekIndex, ["amel", "nadia", "karim"], sixVisits);
      expect(new Set(Object.values(rest)).size).toBe(3);
    }
  });

  it("gives every member each day once over the cycle", () => {
    const seen = new Set<string>();
    for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
      seen.add(restDatesForWeek(weekIndex, ["amel", "nadia"], sixVisits).nadia.slice(8));
    }
    expect(seen.size).toBe(6);
  });

  it("uses the days actually visited that week", () => {
    // A week in which the file is visited on three days only.
    const three = ["2026-10-14", "2026-10-10", "2026-10-12", "2026-10-12"];
    expect(restDatesForWeek(1, ["amel", "nadia"], three)).toEqual({ amel: "2026-10-12", nadia: "2026-10-14" });
    expect(restDatesForWeek(0, ["amel"], [])).toEqual({});
  });
});
