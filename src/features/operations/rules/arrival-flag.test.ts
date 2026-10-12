import { describe, expect, it } from "vitest";

import { VISIT_STATUSES } from "../validators/option-codes";

import { noArrivalReported } from "./arrival-flag";

const visit = {
  date: "2026-10-12",
  plannedStartTime: "08:00",
  status: "CONFIRMED",
  arrivalReported: false,
} as const;

function at(nowTime: string, today = "2026-10-12") {
  return { today, nowTime };
}

describe("the «لم يُبلَّغ عن الوصول» flag", () => {
  it("stays down until the planned start plus the grace time", () => {
    expect(noArrivalReported(visit, at("07:30"))).toBe(false);
    expect(noArrivalReported(visit, at("08:00"))).toBe(false);
    expect(noArrivalReported(visit, at("08:14"))).toBe(false);
  });

  it("goes up from the fifteenth minute", () => {
    expect(noArrivalReported(visit, at("08:15"))).toBe(true);
    expect(noArrivalReported(visit, at("11:00"))).toBe(true);
  });

  it("follows the grace time set in the work rules", () => {
    expect(noArrivalReported(visit, at("08:15"), 30)).toBe(false);
    expect(noArrivalReported(visit, at("08:30"), 30)).toBe(true);
    expect(noArrivalReported(visit, at("08:00"), 0)).toBe(true);
  });

  it("comes down as soon as an arrival is typed in", () => {
    expect(noArrivalReported({ ...visit, arrivalReported: true }, at("09:00"))).toBe(false);
  });

  it("shows on a visit still waiting for confirmation too", () => {
    expect(noArrivalReported({ ...visit, status: "AWAITING_CONFIRMATION" }, at("09:00"))).toBe(true);
  });

  it("never shows on a visit the office has already dealt with", () => {
    const dealtWith = VISIT_STATUSES.filter((status) => status !== "CONFIRMED" && status !== "AWAITING_CONFIRMATION");
    expect(dealtWith).toHaveLength(5);
    for (const status of dealtWith) {
      expect(noArrivalReported({ ...visit, status }, at("12:00"))).toBe(false);
    }
  });

  it("never shows on a visit of a coming day", () => {
    expect(noArrivalReported(visit, at("23:59", "2026-10-11"))).toBe(false);
  });

  it("shows on a visit of a past day that nobody reported", () => {
    expect(noArrivalReported(visit, at("00:00", "2026-10-13"))).toBe(true);
    expect(noArrivalReported(visit, at("07:00", "2026-10-13"))).toBe(true);
  });

  it("waits for the grace time on a visit that starts just before midnight", () => {
    const late = { ...visit, plannedStartTime: "23:50" } as const;
    expect(noArrivalReported(late, at("23:59"))).toBe(false);
    expect(noArrivalReported(late, at("00:04", "2026-10-13"))).toBe(false);
    expect(noArrivalReported(late, at("00:05", "2026-10-13"))).toBe(true);
  });
});
