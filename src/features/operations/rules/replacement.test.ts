import { describe, expect, it } from "vitest";

import { addDays } from "./calendar";
import { rankReplacementCandidates, type ReplacementCandidate, type SeatToFill } from "./replacement";
import type { Seat } from "./working-time";

const SATURDAY = "2026-10-10";

/** Monday 12 October, 08:00 to 12:00, on a building in the centre zone. */
const seat: SeatToFill = {
  visitId: "visit-to-fill",
  siteId: "building-1",
  zoneId: "centre",
  date: "2026-10-12",
  startTime: "08:00",
  durationMin: 240,
  womenOnly: false,
  requiredAbilities: [],
};

function candidate(workerId: string, over: Partial<ReplacementCandidate> = {}): ReplacementCandidate {
  return {
    workerId,
    name: workerId,
    sex: "FEMALE",
    zoneId: "centre",
    isReserve: false,
    availableWeekdays: [0, 1, 2, 3, 4, 5],
    abilities: [],
    isSanctioned: false,
    isAbsent: false,
    isResting: false,
    weeklyCapacityMin: null,
    weekSeats: [],
    visitsAtSite: 0,
    ...over,
  };
}

function busy(hours: number, dayOffset = 1, startTime = "08:00", siteId = "elsewhere"): Seat {
  return {
    visitId: `busy-${dayOffset}-${startTime}`,
    siteId,
    date: addDays(SATURDAY, dayOffset),
    startTime,
    durationMin: hours * 60,
  };
}

function order(candidates: ReplacementCandidate[], alternates: string[] = [], forSeat: SeatToFill = seat): string[] {
  return rankReplacementCandidates(forSeat, alternates, candidates).ranked.map((ranked) => ranked.workerId);
}

function reasons(one: ReplacementCandidate, forSeat: SeatToFill = seat): string[] {
  return rankReplacementCandidates(forSeat, [], [one]).excluded[0]?.reasons ?? [];
}

describe("the order of replacement candidates", () => {
  it("offers the five groups in his order: alternate, reserve of the zone, zone, reserve elsewhere, the rest", () => {
    const ranking = rankReplacementCandidates(
      seat,
      ["alternate"],
      [
        candidate("far-worker", { zoneId: "east" }),
        candidate("far-reserve", { zoneId: "east", isReserve: true }),
        candidate("zone-worker"),
        candidate("zone-reserve", { isReserve: true }),
        candidate("alternate", { zoneId: "east" }),
      ],
    );
    expect(ranking.ranked.map((ranked) => [ranked.workerId, ranked.tier])).toEqual([
      ["alternate", "FILE_ALTERNATE"],
      ["zone-reserve", "RESERVE_SAME_ZONE"],
      ["zone-worker", "WORKER_SAME_ZONE"],
      ["far-reserve", "RESERVE_OTHER_ZONE"],
      ["far-worker", "WORKER_OTHER_ZONE"],
    ]);
    expect(ranking.excluded).toEqual([]);
  });

  it("puts first, inside a group, the worker who knows the site", () => {
    expect(order([candidate("new"), candidate("knows", { visitsAtSite: 4 })])).toEqual(["knows", "new"]);
  });

  it("then the lightest week", () => {
    expect(order([candidate("heavy", { weekSeats: [busy(8)] }), candidate("light", { weekSeats: [busy(2)] })])).toEqual(
      ["light", "heavy"],
    );
  });

  it("prefers knowing the site to a lighter week, and the group to both", () => {
    expect(
      order([
        candidate("light-stranger"),
        candidate("busy-regular", { visitsAtSite: 2, weekSeats: [busy(8)] }),
        candidate("reserve-stranger", { isReserve: true, weekSeats: [busy(8)] }),
      ]),
    ).toEqual(["reserve-stranger", "busy-regular", "light-stranger"]);
  });

  it("orders equal candidates by name, the same way every time", () => {
    const pair = [candidate("w2", { name: "نادية" }), candidate("w1", { name: "أمال" })];
    expect(order(pair)).toEqual(["w1", "w2"]);
    expect(order([...pair].reverse())).toEqual(["w1", "w2"]);
  });

  it("shows the week before and after, and says when the seat brings overtime", () => {
    // 38 hours already planned that week, on other days.
    const weekSeats = [busy(8, 0), busy(8, 3), busy(8, 4), busy(8, 5), busy(6, 1)];
    const [ranked] = rankReplacementCandidates(seat, [], [candidate("almost-full", { weekSeats })]).ranked;
    expect(ranked).toMatchObject({ loadBeforeMin: 38 * 60, loadAfterMin: 42 * 60, overtime: true, onRestDay: false });
  });

  it("treats a site with no zone as nobody's zone", () => {
    const [ranked] = rankReplacementCandidates(
      { ...seat, zoneId: null },
      [],
      [candidate("anyone", { zoneId: null })],
    ).ranked;
    expect(ranked.tier).toBe("WORKER_OTHER_ZONE");
  });
});

describe("who is not offered", () => {
  it("leaves out a worker who is absent, sanctioned or on her rotated rest day", () => {
    expect(reasons(candidate("a", { isAbsent: true }))).toEqual(["ABSENT"]);
    expect(reasons(candidate("b", { isSanctioned: true }))).toEqual(["SANCTIONED"]);
    expect(reasons(candidate("c", { isResting: true }))).toEqual(["RESTING"]);
  });

  it("leaves out a worker who did not tick that day as available", () => {
    expect(reasons(candidate("d", { availableWeekdays: [0, 1, 3, 4, 5] }))).toEqual(["UNAVAILABLE_DAY"]);
  });

  it("leaves out a worker already on another visit at that time", () => {
    expect(reasons(candidate("e", { weekSeats: [busy(3, 2, "10:00")] }))).toEqual(["OVERLAP"]);
    // Free again half an hour before, on another site: still too close to travel.
    expect(reasons(candidate("f", { weekSeats: [busy(2, 2, "05:45")] }))).toEqual(["OVERLAP"]);
    expect(reasons(candidate("g", { weekSeats: [busy(2, 2, "05:30")] }))).toEqual([]);
  });

  it("follows the site's rules: women only, and the abilities it needs", () => {
    const strict: SeatToFill = { ...seat, womenOnly: true, requiredAbilities: ["CLIMB_STAIRS", "UPPER_FLOORS"] };
    expect(reasons(candidate("man", { sex: "MALE", abilities: ["CLIMB_STAIRS", "UPPER_FLOORS"] }), strict)).toEqual([
      "WOMEN_ONLY",
    ]);
    expect(reasons(candidate("no-stairs", { abilities: ["UPPER_FLOORS"] }), strict)).toEqual(["MISSING_ABILITY"]);
    expect(
      order([candidate("fits", { abilities: ["UPPER_FLOORS", "CLIMB_STAIRS", "CARRY_EQUIPMENT"] })], [], strict),
    ).toEqual(["fits"]);
  });

  it("leaves out a worker the seat would take past 48 hours", () => {
    const full = [busy(8, 0), busy(8, 1), busy(8, 3), busy(8, 4), busy(8, 5), busy(5, 2, "13:00")];
    expect(reasons(candidate("h", { weekSeats: full }))).toEqual(["WEEK_OVER_48H"]);
  });

  it("leaves out a worker whose day would span more than 12 hours", () => {
    expect(reasons(candidate("i", { weekSeats: [busy(2, 2, "19:00")], sex: "MALE" }))).toEqual(["DAY_SPAN_12H"]);
  });

  it("leaves a woman out of a night seat, and offers a man", () => {
    const night: SeatToFill = { ...seat, startTime: "19:00", durationMin: 180 };
    expect(reasons(candidate("woman"), night)).toEqual(["NIGHT_WOMAN"]);
    expect(order([candidate("man", { sex: "MALE" })], [], night)).toEqual(["man"]);
  });

  it("does not hold a night visit of another day against her", () => {
    // She already has an approved evening visit on Saturday; Monday morning is a plain seat.
    expect(reasons(candidate("j", { weekSeats: [busy(3, 0, "19:00")] }))).toEqual([]);
  });

  it("gives every reason at once", () => {
    expect(reasons(candidate("k", { isAbsent: true, isSanctioned: true, availableWeekdays: [] }))).toEqual([
      "SANCTIONED",
      "ABSENT",
      "UNAVAILABLE_DAY",
    ]);
  });

  it("returns the offered and the left out, each once", () => {
    const ranking = rankReplacementCandidates(seat, [], [candidate("in"), candidate("out", { isAbsent: true })]);
    expect(ranking.ranked.map((ranked) => ranked.workerId)).toEqual(["in"]);
    expect(ranking.excluded).toEqual([{ workerId: "out", reasons: ["ABSENT"] }]);
  });
});
