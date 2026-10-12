import { describe, expect, it } from "vitest";

import { sampleVisitEntry } from "./samples";
import { entryValuesOf } from "./visit-entry-data";
import { entryNotes, hoursAndMinutes, workedSeat } from "./visit-entry-notes";

/** The sample visits are on Monday 12 October 2026, from 09:00 for the homes one. */
const MORNING = { today: "2026-10-12", nowTime: "10:30" };

function codes(notes: { code: string }[]): string[] {
  return notes.map((note) => note.code);
}

describe("the notes of the visit page", () => {
  it("flag an order whose arrival nobody reported, until an arrival is typed", () => {
    const data = sampleVisitEntry("sample-housing");
    const values = entryValuesOf(data, MORNING.today);
    expect(codes(entryNotes(data, values, MORNING).visit)).toEqual(["NO_ARRIVAL_REPORTED"]);
    expect(codes(entryNotes(data, values, { today: "2026-10-12", nowTime: "09:10" }).visit)).toEqual([]);

    values.workers[0].arrivedTime = "09:05";
    expect(entryNotes(data, values, MORNING).visit).toEqual([]);
  });

  it("say how late a worker arrived, and ask for the reason past the grace time", () => {
    const data = sampleVisitEntry("sample-housing");
    const values = entryValuesOf(data, MORNING.today);
    values.workers[0].arrivedTime = "09:05";
    values.workers[1].arrivedTime = "09:20";
    const [first, second] = entryNotes(data, values, MORNING).workers;
    expect(first.arrivedTime).toEqual([{ code: "LATE", tone: "info", values: { minutes: 5 } }]);
    expect(first.lateReason).toEqual([]);
    expect(second.arrivedTime).toEqual([{ code: "LATE", tone: "warning", values: { minutes: 20 } }]);
    expect(codes(second.lateReason)).toEqual(["LATE_NO_REASON"]);

    values.workers[1].lateReason = "تأخر الحافلة";
    expect(entryNotes(data, values, MORNING).workers[1].lateReason).toEqual([]);
  });

  it("note a time the site contact did not initial", () => {
    const data = sampleVisitEntry("sample-housing");
    const values = entryValuesOf(data, MORNING.today);
    values.workers[0] = { ...values.workers[0], arrivedTime: "09:00", leftTime: "14:00" };
    expect(codes(entryNotes(data, values, MORNING).workers[0].initials)).toEqual([
      "ARRIVAL_NOT_INITIALLED",
      "DEPARTURE_NOT_INITIALLED",
    ]);
    values.workers[0] = { ...values.workers[0], arrivalInitialled: true, departureInitialled: true };
    expect(entryNotes(data, values, MORNING).workers[0].initials).toEqual([]);
  });

  it("put the working-time rules beside the times they concern", () => {
    const data = sampleVisitEntry("returned-housing");
    const notes = entryNotes(data, entryValuesOf(data, MORNING.today), MORNING);
    // The team leader worked 36 hours elsewhere that week; 4 h 25 here takes her past 40.
    expect(notes.workers[0].workEndTime).toEqual([
      { code: "WEEK_OVERTIME", tone: "warning", values: { duration: "40:25" } },
    ]);
    // Her colleague's form does not offer Monday.
    expect(notes.workers[1].worker).toEqual([{ code: "UNAVAILABLE_DAY", tone: "warning", values: {} }]);
  });

  it("say nothing about a worker who did not come", () => {
    const data = sampleVisitEntry("returned-housing");
    const values = entryValuesOf(data, MORNING.today);
    values.workers[1] = { ...values.workers[1], attended: false };
    expect(entryNotes(data, values, MORNING).workers[1]).toEqual({
      worker: [],
      arrivedTime: [],
      workStartTime: [],
      workEndTime: [],
      leftTime: [],
      lateReason: [],
      initials: [],
    });
  });

  it("warn when the work is marked complete with tasks left unticked", () => {
    const data = sampleVisitEntry("returned-housing");
    const values = { ...entryValuesOf(data, MORNING.today), completion: "FULL" as const, completionPercent: 100 };
    const unticked = values.checklist.filter(
      (line) => !line.done && data.checklist.find((item) => item.id === line.id)?.kind !== "DEPARTURE",
    ).length;
    expect(unticked).toBeGreaterThan(0);
    expect(entryNotes(data, values, MORNING).completion).toEqual([
      { code: "FULL_WITH_UNTICKED", tone: "warning", values: { count: unticked } },
      { code: "BECOMES_DONE", tone: "info" },
    ]);
  });

  it("warn when the percentage disagrees with the state of the work", () => {
    const data = sampleVisitEntry("returned-housing");
    const base = entryValuesOf(data, MORNING.today);
    expect(
      codes(entryNotes(data, { ...base, completion: "FULL", completionPercent: 90 }, MORNING).completionPercent),
    ).toEqual(["PERCENT_DISAGREES"]);
    expect(
      entryNotes(data, { ...base, completion: "PARTIAL", completionPercent: 90 }, MORNING).completionPercent,
    ).toEqual([]);
    expect(
      codes(entryNotes(data, { ...base, completion: "NOT_DONE", completionPercent: 100 }, MORNING).completionPercent),
    ).toEqual(["PERCENT_DISAGREES"]);
  });

  it("say what saving will do", () => {
    const data = sampleVisitEntry("returned-housing");
    const base = entryValuesOf(data, MORNING.today);
    expect(codes(entryNotes(data, { ...base, completion: "NOT_DONE" }, MORNING).completion)).toEqual([
      "BECOMES_PROBLEM",
    ]);
    const notes = entryNotes(
      data,
      { ...base, signoffStatus: "NOT_ACCEPTED", needsExtraVisit: true, wantsOtherService: true },
      MORNING,
    );
    expect(codes(notes.signoff)).toEqual(["OPENS_COMPLAINT"]);
    expect(codes(notes.needsExtraVisit)).toEqual(["PROPOSES_EXTRA_VISIT"]);
    expect(codes(notes.otherService)).toEqual(["LEAD_FOR_CLIENTS"]);
  });
});

describe("the seat a worker held", () => {
  const data = sampleVisitEntry("sample-housing");

  it("runs from the start of work to its end, falling back on arrival and departure", () => {
    const times = { arrivedTime: "09:05", workStartTime: "09:15", workEndTime: "13:40", leftTime: "13:50" };
    expect(workedSeat(data, times)).toMatchObject({ date: "2026-10-12", startTime: "09:15", durationMin: 265 });
    expect(workedSeat(data, { ...times, workStartTime: "", workEndTime: "" })).toMatchObject({
      startTime: "09:05",
      durationMin: 285,
    });
  });

  it("falls back on the plan for what is not written", () => {
    const blank = { arrivedTime: "", workStartTime: "", workEndTime: "", leftTime: "" };
    expect(workedSeat(data, blank)).toMatchObject({ startTime: "09:00", durationMin: 300 });
  });

  it("writes hours and minutes", () => {
    expect(hoursAndMinutes(2425)).toBe("40:25");
    expect(hoursAndMinutes(60)).toBe("1:00");
  });
});
