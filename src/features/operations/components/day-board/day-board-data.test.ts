import { describe, expect, it } from "vitest";

import { boardCounts, boardRows, rowMatches, searchKey } from "./day-board-data";
import { sampleDayBoard } from "./samples";

const TODAY = "2026-10-12";

function at(nowTime: string, today = TODAY) {
  return { today, nowTime };
}

describe("the day board", () => {
  const visits = sampleDayBoard(TODAY, TODAY);

  it("lists the day's visits earliest first", () => {
    const rows = boardRows([...visits].reverse(), at("10:30"));
    expect(rows.map((row) => row.visit.visit.plannedStartTime)).toEqual([
      "08:00",
      "08:30",
      "09:00",
      "09:30",
      "10:00",
      "13:30",
      "14:00",
      "16:30",
    ]);
    expect(rows[0].endTime).toBe("12:00");
  });

  it("flags the visits that should have started with no arrival reported", () => {
    const flagged = (nowTime: string) =>
      boardRows(visits, at(nowTime))
        .filter((row) => row.noArrival)
        .map((row) => row.visit.visit.number);
    // At 08:40 the 08:30 visit is still within its fifteen minutes.
    expect(flagged("08:40")).toEqual([]);
    expect(flagged("08:45")).toEqual(["000127/2026"]);
    expect(flagged("10:30")).toEqual(["000127/2026", "000128/2026"]);
    // The afternoon visit joins them at 13:45; the postponed and cancelled ones never do.
    expect(flagged("16:00")).toEqual(["000127/2026", "000128/2026", "000126/2026"]);
  });

  it("flags nothing on a coming day, and every unreported visit of a past day", () => {
    expect(boardRows(sampleDayBoard("2026-10-13", TODAY), at("10:30")).some((row) => row.noArrival)).toBe(false);
    const past = boardRows(sampleDayBoard("2026-10-11", TODAY), at("10:30"));
    expect(past.filter((row) => row.noArrival)).toEqual([]);
  });

  it("counts the seats still to fill", () => {
    const villa = boardRows(visits, at("10:30")).find((row) => row.visit.visit.number === "000128/2026");
    expect(villa?.openSeats).toBe(1);
  });

  it("counts the visits in each status, in the order of the seven", () => {
    const counts = boardCounts(boardRows(visits, at("10:30")));
    expect(counts.byStatus).toEqual([
      { status: "CONFIRMED", count: 2 },
      { status: "AWAITING_CONFIRMATION", count: 1 },
      { status: "IN_PROGRESS", count: 1 },
      { status: "DONE", count: 1 },
      { status: "POSTPONED", count: 1 },
      { status: "PROBLEM", count: 1 },
      { status: "CANCELLED", count: 1 },
    ]);
    expect(counts.noArrival).toBe(2);
    expect(counts.total).toBe(8);
  });

  it("leaves a status out of the counts when no visit has it", () => {
    const counts = boardCounts(boardRows(sampleDayBoard("2026-10-13", TODAY), at("10:30")));
    expect(counts.byStatus.map((entry) => entry.status)).toEqual(["CONFIRMED", "AWAITING_CONFIRMATION"]);
  });
});

describe("searching the board", () => {
  const rows = boardRows(sampleDayBoard(TODAY, TODAY), at("10:30"));
  const found = (query: string) => rows.filter((row) => rowMatches(row, query)).map((row) => row.visit.visit.number);

  it("finds by site, worker, zone, order number and service", () => {
    expect(found("الياسمين")).toEqual(["000126/2026"]);
    expect(found("حورية")).toEqual(["000128/2026"]);
    expect(found("عين مليلة")).toEqual(["000129/2026"]);
    expect(found("000125")).toEqual(["000125/2026"]);
    expect(found("عميق")).toEqual(["000128/2026"]);
  });

  it("needs every word, in any order", () => {
    expect(found("قاسمي تأمينات")).toEqual(["000125/2026"]);
    expect(found("")).toHaveLength(8);
  });

  it("reads alif with or without hamza, ta marbuta and alif maqsura alike", () => {
    expect(searchKey("أمال")).toBe(searchKey("امال"));
    expect(searchKey("صيدلية")).toBe(searchKey("صيدليه"));
    expect(searchKey("مستشفى")).toBe(searchKey("مستشفي"));
    expect(found("امال")).toEqual(found("أمال"));
    expect(found("امال").length).toBeGreaterThan(0);
  });
});
