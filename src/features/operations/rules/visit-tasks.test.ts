import { describe, expect, it } from "vitest";

import { tasksForVisit, tasksToCarryOver, type FileTaskRule } from "./visit-tasks";

/**
 * A building cleaned on Saturday, Monday and Wednesday through October and the
 * first days of November 2026 (10 October is a Saturday).
 */
const VISITS = [
  "2026-10-10",
  "2026-10-12",
  "2026-10-14",
  "2026-10-17",
  "2026-10-19",
  "2026-10-21",
  "2026-10-24",
  "2026-10-26",
  "2026-10-28",
  "2026-10-31",
  "2026-11-02",
  "2026-11-04",
];

const daily: FileTaskRule = { id: "sweep", frequency: "DAILY" };
const weekly: FileTaskRule = { id: "glass", frequency: "WEEKLY" };
const weeklyOnWednesday: FileTaskRule = { id: "stairs-deep", frequency: "WEEKLY", weekday: 4 };
const weeklyOnThursday: FileTaskRule = { id: "doors", frequency: "WEEKLY", weekday: 5 };
const monthly: FileTaskRule = { id: "facades", frequency: "MONTHLY" };
const monthlyFrom20: FileTaskRule = { id: "floors-deep", frequency: "MONTHLY", dayOfMonth: 20 };
const special: FileTaskRule = { id: "after-works", frequency: "SPECIAL", specialDate: "2026-10-20" };

function visitsCarrying(task: FileTaskRule): string[] {
  return VISITS.filter((date) => tasksForVisit(date, VISITS, [task]).length === 1);
}

describe("the tasks a visit carries", () => {
  it("puts a daily task on every visit", () => {
    expect(visitsCarrying(daily)).toEqual(VISITS);
  });

  it("puts a weekly task with no day on the first visit of each week", () => {
    expect(visitsCarrying(weekly)).toEqual(["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  });

  it("puts a weekly task on its own day", () => {
    expect(visitsCarrying(weeklyOnWednesday)).toEqual(["2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04"]);
  });

  it("falls back on the first visit of the week when the file is never visited on the task's day", () => {
    expect(visitsCarrying(weeklyOnThursday)).toEqual(["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  });

  it("moves a weekly task to the first visit of the week when its day was cancelled", () => {
    const withoutWednesday21 = VISITS.filter((date) => date !== "2026-10-21");
    expect(tasksForVisit("2026-10-17", withoutWednesday21, [weeklyOnWednesday])).toEqual(["stairs-deep"]);
    expect(tasksForVisit("2026-10-19", withoutWednesday21, [weeklyOnWednesday])).toEqual([]);
  });

  it("puts a monthly task on the first visit of each month", () => {
    expect(visitsCarrying(monthly)).toEqual(["2026-10-10", "2026-11-02"]);
  });

  it("puts a monthly task on the first visit on or after its day", () => {
    expect(tasksForVisit("2026-10-21", VISITS, [monthlyFrom20])).toEqual(["floors-deep"]);
    expect(tasksForVisit("2026-10-19", VISITS, [monthlyFrom20])).toEqual([]);
  });

  it("gives a monthly task to the month's last visit when none comes late enough", () => {
    // November has visits on the 2nd and the 4th only.
    expect(tasksForVisit("2026-11-04", VISITS, [monthlyFrom20])).toEqual(["floors-deep"]);
    expect(tasksForVisit("2026-11-02", VISITS, [monthlyFrom20])).toEqual([]);
  });

  it("puts a special task on the first visit on or after its date", () => {
    // 20 October is a Tuesday: the next visit is Wednesday 21.
    expect(visitsCarrying(special)).toEqual(["2026-10-21"]);
    expect(visitsCarrying({ ...special, specialDate: "2026-10-19" })).toEqual(["2026-10-19"]);
  });

  it("leaves out a special task that has no date yet, and a task switched off", () => {
    expect(visitsCarrying({ id: "undated", frequency: "SPECIAL" })).toEqual([]);
    expect(visitsCarrying({ ...daily, isActive: false })).toEqual([]);
  });

  it("returns the ids in the order of the file's list", () => {
    expect(tasksForVisit("2026-10-10", VISITS, [monthly, daily, weeklyOnWednesday, weekly, special])).toEqual([
      "facades",
      "sweep",
      "glass",
    ]);
  });

  it("works for a visit that is not in the list yet", () => {
    // An extra visit on Sunday 11 October: daily tasks only, the week already began on Saturday.
    expect(tasksForVisit("2026-10-11", VISITS, [daily, weekly, monthly])).toEqual(["sweep"]);
    // An extra visit before the first one takes the week's and the month's tasks.
    expect(tasksForVisit("2026-10-03", VISITS, [daily, weekly, monthly])).toEqual(["sweep", "glass", "facades"]);
  });

  it("gives every task of a one-day job to its only visit", () => {
    expect(tasksForVisit("2026-10-12", ["2026-10-12"], [daily, weekly, monthly])).toEqual([
      "sweep",
      "glass",
      "facades",
    ]);
  });
});

describe("carrying tasks over", () => {
  const checklist = [
    { fileTaskId: "sweep", frequency: "DAILY", done: false },
    { fileTaskId: "glass", frequency: "WEEKLY", done: false },
    { fileTaskId: "stairs-deep", frequency: "WEEKLY", done: true },
    { fileTaskId: "facades", frequency: "MONTHLY", done: null },
    { fileTaskId: "after-works", frequency: "SPECIAL", done: false },
  ] as const;

  it("carries the weekly and monthly tasks that came back unticked", () => {
    expect(tasksToCarryOver({ tookPlace: true, checklist })).toEqual(["glass"]);
  });

  it("carries every weekly and monthly task of a visit that did not take place", () => {
    expect(tasksToCarryOver({ tookPlace: false, checklist })).toEqual(["glass", "stairs-deep", "facades"]);
  });

  it("carries nothing from an order that has not been typed in", () => {
    const untyped = checklist.map((line) => ({ ...line, done: null }));
    expect(tasksToCarryOver({ tookPlace: true, checklist: untyped })).toEqual([]);
  });
});
