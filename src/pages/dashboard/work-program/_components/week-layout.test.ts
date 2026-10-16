import { describe, expect, it } from "vitest";

import {
  blockBox,
  capLanes,
  dropProblem,
  endTimeOf,
  gridHours,
  HOUR_HEIGHT_PX,
  layoutDay,
  maxLanesFor,
  MIN_BLOCK_PX,
  slotsOf,
} from "./week-layout";

const visit = (id: string, startTime: string, durationMin: number) => ({ id, startTime, durationMin });

describe("gridHours", () => {
  it("keeps the default day, and widens it to the week's earliest start and latest end", () => {
    expect(gridHours([])).toEqual({ start: 6, end: 22 });
    expect(gridHours([visit("a", "08:00", 240)])).toEqual({ start: 6, end: 22 });
    expect(gridHours([visit("a", "05:30", 60), visit("b", "21:00", 90)])).toEqual({ start: 5, end: 23 });
    // A night visit past midnight stops the grid at 24:00.
    expect(gridHours([visit("a", "22:00", 240)])).toEqual({ start: 6, end: 24 });
    expect(slotsOf({ start: 6, end: 8 })).toEqual([360, 390, 420, 450]);
  });
});

describe("layoutDay", () => {
  it("gives visits at the same time their own lanes, and a lone visit the whole day", () => {
    const lanes = layoutDay([
      visit("early", "07:00", 120),
      visit("long", "08:00", 240),
      visit("short", "08:00", 60),
      visit("after", "09:00", 60),
      visit("alone", "14:00", 60),
    ]);
    expect(Object.fromEntries(lanes)).toEqual({
      early: { lane: 0, lanes: 3 },
      long: { lane: 1, lanes: 3 },
      short: { lane: 2, lanes: 3 },
      // "early" ends at 09:00: its lane is free again.
      after: { lane: 0, lanes: 3 },
      alone: { lane: 0, lanes: 1 },
    });
  });
});

describe("blockBox", () => {
  it("places a block from its start for its length, cut at the grid's end", () => {
    const grid = { start: 6, end: 22 };
    expect(blockBox(visit("a", "08:30", 120), grid)).toEqual({ top: 2.5 * HOUR_HEIGHT_PX, height: 2 * HOUR_HEIGHT_PX });
    expect(blockBox(visit("a", "21:00", 240), grid)).toEqual({ top: 15 * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX });
    expect(blockBox(visit("a", "06:00", 10), grid).height).toBe(MIN_BLOCK_PX);
    expect(endTimeOf(visit("a", "22:00", 240))).toBe("02:00");
  });
});

describe("dropProblem", () => {
  const moving = {
    id: "v1",
    siteId: "site-1",
    durationMin: 120,
    team: [{ workerId: "w1", number: "1", firstName: "سميرة", lastName: "بوزيد" }],
  };
  const workers = new Map([
    [
      "w1",
      {
        seats: [
          { visitId: "v1", siteId: "site-1", date: "2026-10-13", startTime: "08:00", durationMin: 120 },
          { visitId: "v2", siteId: "site-2", date: "2026-10-14", startTime: "10:00", durationMin: 120 },
        ],
      },
    ],
  ]);
  const context = { today: "2026-10-12", workers, travelGapMin: 30 };

  it("sees a day already past and a seated worker busy then, travel time included", () => {
    expect(dropProblem(moving, { date: "2026-10-11", minute: 480 }, context)).toBe("PAST");
    expect(dropProblem(moving, { date: "2026-10-14", minute: 540 }, context)).toBe("OVERLAP");
    // Ends at 09:45: fifteen minutes before her other site, less than the travel time.
    expect(dropProblem(moving, { date: "2026-10-14", minute: 465 }, context)).toBe("OVERLAP");
    expect(dropProblem(moving, { date: "2026-10-14", minute: 420 }, context)).toBeNull();
    // Its own seat at the old time is not in the way.
    expect(dropProblem(moving, { date: "2026-10-13", minute: 540 }, context)).toBeNull();
  });
});

describe("capLanes (S-20)", () => {
  it("keeps the lanes a column can hold and lists the visits past them", () => {
    const lanes = layoutDay([
      { id: "a", startTime: "08:00", durationMin: 240 },
      { id: "b", startTime: "08:00", durationMin: 120 },
      { id: "c", startTime: "08:30", durationMin: 60 },
      { id: "d", startTime: "08:30", durationMin: 60 },
      { id: "e", startTime: "14:00", durationMin: 60 },
    ]);
    const { shown, hidden } = capLanes(lanes, 2);
    expect([...shown.keys()].sort()).toEqual(["a", "b", "e"]);
    expect(hidden.sort()).toEqual(["c", "d"]);
    expect(shown.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(shown.get("e")).toEqual({ lane: 0, lanes: 1 });
    expect(maxLanesFor(189)).toBe(2);
    expect(maxLanesFor(120)).toBe(1);
    expect(maxLanesFor(40)).toBe(1);
  });
});
