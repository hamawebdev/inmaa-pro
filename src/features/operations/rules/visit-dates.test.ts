import { describe, expect, it } from "vitest";

import { weekdayOf } from "./calendar";
import {
  contractVisits,
  endTimeOf,
  onDemandVisits,
  plannedTimes,
  slotsFromForm,
  visitKey,
  visitsToCreate,
  type FormTimes,
  type OnDemandRequest,
} from "./visit-dates";

const NO_TIMES: FormTimes = { period: null, windowFrom: null, windowTo: null, arrivalTime: null, departureTime: null };

describe("the hours of a visit", () => {
  it("takes the team's arrival and departure first", () => {
    expect(
      plannedTimes({
        ...NO_TIMES,
        windowFrom: "07:00",
        windowTo: "17:00",
        arrivalTime: "08:30",
        departureTime: "11:30",
      }),
    ).toEqual({ startTime: "08:30", durationMin: 180 });
  });

  it("falls back on the hours the client allows", () => {
    expect(plannedTimes({ ...NO_TIMES, period: "MORNING", windowFrom: "09:00", windowTo: "12:00" })).toEqual({
      startTime: "09:00",
      durationMin: 180,
    });
  });

  it("falls back on the hours of the period ticked", () => {
    expect(plannedTimes({ ...NO_TIMES, period: "MORNING" })).toEqual({ startTime: "08:00", durationMin: 240 });
    expect(plannedTimes({ ...NO_TIMES, period: "EVENING" })).toEqual({ startTime: "13:30", durationMin: 150 });
    expect(plannedTimes(NO_TIMES)).toEqual({ startTime: "08:00", durationMin: 240 });
  });

  it("makes «معا» one visit across both periods", () => {
    expect(plannedTimes({ ...NO_TIMES, period: "BOTH" })).toEqual({ startTime: "08:00", durationMin: 480 });
  });

  it("uses a length in hours when no departure time was typed", () => {
    expect(plannedTimes({ ...NO_TIMES, arrivalTime: "09:00" }, undefined, 300)).toEqual({
      startTime: "09:00",
      durationMin: 300,
    });
    // A typed departure still wins over the length.
    expect(
      plannedTimes({ ...NO_TIMES, arrivalTime: "09:00", departureTime: "10:00" }, undefined, 300).durationMin,
    ).toBe(60);
  });

  it("reads a departure before the arrival as a night job", () => {
    expect(plannedTimes({ ...NO_TIMES, arrivalTime: "22:00", departureTime: "02:00" })).toEqual({
      startTime: "22:00",
      durationMin: 240,
    });
    expect(endTimeOf({ startTime: "22:00", durationMin: 240 })).toBe("02:00");
  });
});

describe("the weekly programme of a form", () => {
  it("makes one slot per ticked day, in week order", () => {
    const slots = slotsFromForm({
      ...NO_TIMES,
      arrivalTime: "08:00",
      departureTime: "12:00",
      executionWeekdays: [4, 0, 2, 2],
      workersCount: 2,
    });
    expect(slots.map((slot) => slot.weekday)).toEqual([0, 2, 4]);
    expect(
      slots.every((slot) => slot.startTime === "08:00" && slot.durationMin === 240 && slot.workersNeeded === 2),
    ).toBe(true);
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(3);
  });

  it("needs at least one worker", () => {
    expect(slotsFromForm({ ...NO_TIMES, executionWeekdays: [0], workersCount: null })[0].workersNeeded).toBe(1);
  });
});

describe("the visits of a contract", () => {
  // His study's example: a building cleaned on Saturday, Monday and Wednesday, 08:00 to 12:00.
  const slots = slotsFromForm({
    ...NO_TIMES,
    arrivalTime: "08:00",
    departureTime: "12:00",
    executionWeekdays: [0, 2, 4],
    workersCount: 1,
  });

  it("gives one visit per execution day between the two dates, both included", () => {
    // Saturday 10 October to Saturday 24 October 2026.
    const { visits, warnings } = contractVisits({
      startDate: "2026-10-10",
      endDate: "2026-10-24",
      slots,
      visitsPerWeek: 3,
    });
    expect(warnings).toEqual([]);
    expect(visits.map((visit) => visit.date)).toEqual([
      "2026-10-10",
      "2026-10-12",
      "2026-10-14",
      "2026-10-17",
      "2026-10-19",
      "2026-10-21",
      "2026-10-24",
    ]);
    expect(visits[0]).toEqual({
      slotId: "day-0",
      date: "2026-10-10",
      startTime: "08:00",
      durationMin: 240,
      workersNeeded: 1,
      jobDayNo: null,
      jobDayCount: null,
    });
  });

  it("starts and ends in mid-week without inventing a visit", () => {
    // Tuesday 13 to Sunday 18 October: only Wednesday and Saturday fall inside.
    const { visits } = contractVisits({ startDate: "2026-10-13", endDate: "2026-10-18", slots, visitsPerWeek: 3 });
    expect(visits.map((visit) => visit.date)).toEqual(["2026-10-14", "2026-10-17"]);
  });

  it("counts a year of six visits a week and never lands on a Friday", () => {
    const sixDays = slotsFromForm({ ...NO_TIMES, executionWeekdays: [0, 1, 2, 3, 4, 5], workersCount: 1 });
    const { visits, warnings } = contractVisits({
      startDate: "2026-10-10",
      endDate: "2027-10-09",
      slots: sixDays,
      visitsPerWeek: 6,
    });
    expect(warnings).toEqual([]);
    // 365 days are 52 weeks and one day; that day is a Saturday.
    expect(visits).toHaveLength(52 * 6 + 1);
    expect(visits.some((visit) => weekdayOf(visit.date) === 6)).toBe(false);
  });

  it("warns when the days ticked disagree with «عدد الزيارات», and still follows the days", () => {
    const { visits, warnings } = contractVisits({
      startDate: "2026-10-10",
      endDate: "2026-10-16",
      slots,
      visitsPerWeek: 2,
    });
    expect(warnings).toEqual(["VISITS_PER_WEEK_MISMATCH"]);
    expect(visits).toHaveLength(3);
  });

  it("does not compare when «عدد الزيارات» was left empty", () => {
    expect(
      contractVisits({ startDate: "2026-10-10", endDate: "2026-10-16", slots, visitsPerWeek: null }).warnings,
    ).toEqual([]);
  });

  it("refuses dates that run backwards and a programme with no day", () => {
    expect(contractVisits({ startDate: "2026-10-10", endDate: "2026-10-09", slots, visitsPerWeek: 3 })).toEqual({
      visits: [],
      warnings: ["END_BEFORE_START"],
    });
    expect(contractVisits({ startDate: "2026-10-10", endDate: "2026-11-10", slots: [], visitsPerWeek: 3 })).toEqual({
      visits: [],
      warnings: ["NO_EXECUTION_DAY"],
    });
  });

  it("allows a Friday slot put there by hand, and says so", () => {
    const withFriday = [...slots, { id: "friday", weekday: 6, startTime: "09:00", durationMin: 120, workersNeeded: 1 }];
    const { visits, warnings } = contractVisits({
      startDate: "2026-10-10",
      endDate: "2026-10-16",
      slots: withFriday,
      visitsPerWeek: 4,
    });
    expect(warnings).toEqual(["REST_DAY_SLOT"]);
    expect(visits.map((visit) => visit.date)).toContain("2026-10-16");
  });

  it("warns about a slot outside the hours the client allows", () => {
    const { warnings } = contractVisits({
      startDate: "2026-10-10",
      endDate: "2026-10-16",
      slots,
      visitsPerWeek: 3,
      windowFrom: "09:00",
      windowTo: "17:00",
    });
    expect(warnings).toEqual(["OUTSIDE_ALLOWED_WINDOW"]);
    expect(
      contractVisits({
        startDate: "2026-10-10",
        endDate: "2026-10-16",
        slots,
        visitsPerWeek: 3,
        windowFrom: "08:00",
        windowTo: "12:00",
      }).warnings,
    ).toEqual([]);
  });

  it("gives two visits on a day that has two slots, earliest first", () => {
    const twoADay = [
      { id: "evening", weekday: 0, startTime: "14:00", durationMin: 120, workersNeeded: 1 },
      { id: "morning", weekday: 0, startTime: "08:00", durationMin: 120, workersNeeded: 2 },
    ];
    const { visits } = contractVisits({
      startDate: "2026-10-10",
      endDate: "2026-10-10",
      slots: twoADay,
      visitsPerWeek: 1,
    });
    expect(visits.map((visit) => visit.slotId)).toEqual(["morning", "evening"]);
  });

  it("follows a slot only while it is valid", () => {
    const changing = [
      { id: "old", weekday: 0, startTime: "08:00", durationMin: 240, workersNeeded: 1, validTo: "2026-10-16" },
      { id: "new", weekday: 1, startTime: "09:00", durationMin: 180, workersNeeded: 1, validFrom: "2026-10-17" },
    ];
    const { visits } = contractVisits({
      startDate: "2026-10-10",
      endDate: "2026-10-23",
      slots: changing,
      visitsPerWeek: 1,
    });
    expect(visits.map((visit) => [visit.slotId, visit.date])).toEqual([
      ["old", "2026-10-10"],
      ["new", "2026-10-18"],
    ]);
  });
});

describe("the visits of an on-demand job", () => {
  const request: OnDemandRequest = {
    ...NO_TIMES,
    startDate: "2026-10-12",
    endDate: null,
    executionWeekdays: [],
    durationValue: null,
    durationUnit: null,
    workersCount: 2,
  };

  it("gives one visit on the start date when nothing else is said", () => {
    const { visits, warnings } = onDemandVisits({ ...request, arrivalTime: "09:00", departureTime: "14:00" });
    expect(warnings).toEqual([]);
    expect(visits).toEqual([
      {
        slotId: null,
        date: "2026-10-12",
        startTime: "09:00",
        durationMin: 300,
        workersNeeded: 2,
        jobDayNo: null,
        jobDayCount: null,
      },
    ]);
  });

  it("keeps a single date typed on a Friday, with a warning", () => {
    const { visits, warnings } = onDemandVisits({ ...request, startDate: "2026-10-16" });
    expect(visits.map((visit) => visit.date)).toEqual(["2026-10-16"]);
    expect(warnings).toEqual(["REST_DAY_SLOT"]);
  });

  it("spreads a job over the working days between two dates, and numbers the days", () => {
    // Thursday 15 to Sunday 18 October: Friday is skipped.
    const { visits, warnings } = onDemandVisits({ ...request, startDate: "2026-10-15", endDate: "2026-10-18" });
    expect(warnings).toEqual([]);
    expect(visits.map((visit) => [visit.date, visit.jobDayNo, visit.jobDayCount])).toEqual([
      ["2026-10-15", 1, 3],
      ["2026-10-17", 2, 3],
      ["2026-10-18", 3, 3],
    ]);
  });

  it("keeps only the ticked days of the range", () => {
    const { visits } = onDemandVisits({
      ...request,
      startDate: "2026-10-10",
      endDate: "2026-10-15",
      executionWeekdays: [0, 3],
    });
    expect(visits.map((visit) => visit.date)).toEqual(["2026-10-10", "2026-10-13"]);
  });

  it("counts a length in days from the start when there is no end date", () => {
    // Three days from Thursday 15: Thursday, Saturday, Sunday.
    const { visits, warnings } = onDemandVisits({
      ...request,
      startDate: "2026-10-15",
      durationValue: 3,
      durationUnit: "DAYS",
    });
    expect(warnings).toEqual([]);
    expect(visits.map((visit) => visit.date)).toEqual(["2026-10-15", "2026-10-17", "2026-10-18"]);
  });

  it("warns when the length in days disagrees with the dates", () => {
    expect(
      onDemandVisits({
        ...request,
        startDate: "2026-10-12",
        endDate: "2026-10-14",
        durationValue: 2,
        durationUnit: "DAYS",
      }).warnings,
    ).toEqual(["DURATION_DAYS_MISMATCH"]);
    expect(
      onDemandVisits({
        ...request,
        startDate: "2026-10-12",
        endDate: "2026-10-12",
        durationValue: 2,
        durationUnit: "DAYS",
      }),
    ).toMatchObject({ warnings: ["DURATION_DAYS_MISMATCH"], visits: [{ date: "2026-10-12" }] });
  });

  it("uses a length in hours for each visit", () => {
    const { visits } = onDemandVisits({ ...request, arrivalTime: "08:00", durationValue: 5, durationUnit: "HOURS" });
    expect(visits[0]).toMatchObject({ startTime: "08:00", durationMin: 300 });
  });

  it("says when no day of the range can be worked", () => {
    expect(
      onDemandVisits({ ...request, startDate: "2026-10-12", endDate: "2026-10-14", executionWeekdays: [5] }),
    ).toEqual({ visits: [], warnings: ["NO_WORKING_DAY_IN_RANGE"] });
  });

  it("refuses dates that run backwards", () => {
    expect(onDemandVisits({ ...request, endDate: "2026-10-11" })).toEqual({
      visits: [],
      warnings: ["END_BEFORE_START"],
    });
  });
});

describe("generating again", () => {
  it("creates only what does not exist yet", () => {
    const slots = slotsFromForm({ ...NO_TIMES, executionWeekdays: [0, 2], workersCount: 1 });
    const { visits } = contractVisits({ startDate: "2026-10-10", endDate: "2026-10-16", slots, visitsPerWeek: 2 });
    const existing = new Set([visitKey(visits[0])]);
    expect(visitsToCreate(visits, existing).map((visit) => visit.date)).toEqual(["2026-10-12"]);
    expect(visitsToCreate(visits, new Set(visits.map(visitKey)))).toEqual([]);
  });

  it("tells two slots of the same day apart", () => {
    expect(visitKey({ slotId: "morning", date: "2026-10-10" })).not.toBe(
      visitKey({ slotId: "evening", date: "2026-10-10" }),
    );
  });
});
