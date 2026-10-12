import { describe, expect, it } from "vitest";

import { correctiveTaskFor, inspectionTotal, weakCriteria, type CriterionMark } from "./inspection-score";

function marks(scores: Record<string, number | null | "n/a">, weights: Record<string, number> = {}): CriterionMark[] {
  return Object.entries(scores).map(([criterionCode, score]) => ({
    criterionCode,
    weight: weights[criterionCode] ?? 1,
    score: score === "n/a" ? null : score,
    notApplicable: score === "n/a",
  }));
}

/** The eight points of his buildings worker card. */
const BUILDING = {
  FLOORS: 9,
  STAIRS: 9,
  CORRIDORS: 10,
  LIFTS: 9,
  ENTRANCES: 9,
  WASTE: 10,
  INSTRUCTIONS: 9,
  APPEARANCE: 9,
};

describe("the inspection total", () => {
  it("is out of 100", () => {
    // 74 marks out of 80 are 92.5, which rounds up.
    expect(inspectionTotal(marks(BUILDING))).toBe(93);
    expect(inspectionTotal(marks({ A: 10, B: 10 }))).toBe(100);
    expect(inspectionTotal(marks({ A: 0, B: 0 }))).toBe(0);
    expect(inspectionTotal(marks({ A: 8, B: 8, C: 8 }))).toBe(80);
  });

  it("leaves out the points that do not apply, and rescales", () => {
    // No lift in this building: seven points, 65 marks out of 70.
    expect(inspectionTotal(marks({ ...BUILDING, LIFTS: "n/a" }))).toBe(93);
    expect(inspectionTotal(marks({ A: 7, B: "n/a" }))).toBe(70);
  });

  it("follows the weights when the manager has set some", () => {
    // Floors count double: (6 × 2 + 10) out of 30.
    expect(inspectionTotal(marks({ FLOORS: 6, GLASS: 10 }, { FLOORS: 2 }))).toBe(73);
    // A point given no weight does not count.
    expect(inspectionTotal(marks({ FLOORS: 6, GLASS: 10 }, { GLASS: 0 }))).toBe(60);
  });

  it("rounds to the nearest whole number", () => {
    expect(inspectionTotal(marks({ A: 7, B: 8, C: 8 }))).toBe(77); // 76.67
    expect(inspectionTotal(marks({ A: 7, B: 8 }))).toBe(75);
    expect(inspectionTotal(marks({ A: 7.5, B: 8 }))).toBe(78); // 77.5 rounds up
  });

  it("is not worked out while a point that applies has no mark", () => {
    expect(inspectionTotal(marks({ A: 9, B: null }))).toBeNull();
    expect(inspectionTotal(marks({ A: "n/a", B: "n/a" }))).toBeNull();
    expect(inspectionTotal([])).toBeNull();
  });

  it("keeps a mark typed outside 0 to 10 inside the scale", () => {
    expect(inspectionTotal(marks({ A: 12, B: -3 }))).toBe(50);
  });
});

describe("the weak points", () => {
  it("are those marked under 8 out of 10", () => {
    expect(weakCriteria(marks({ FLOORS: 5, GLASS: 8, DUST: 7.5, ODOURS: "n/a", EQUIPMENT: null }))).toEqual([
      "FLOORS",
      "DUST",
    ]);
  });
});

describe("the corrective task of an inspection", () => {
  const low = marks({ FLOORS: 6, GLASS: 7, BATHROOMS: 9, ENTRANCES: 8, ODOURS: 8, DUST: 6, EQUIPMENT: 9 });
  const inspection = {
    total: inspectionTotal(low) ?? 0,
    marks: low,
    inspectionDate: "2026-10-12",
    nextVisitDate: "2026-10-14",
    earlierLowInARow: 0,
  };

  it("is created under 80", () => {
    expect(inspection.total).toBe(76);
    expect(correctiveTaskFor(inspection)).toEqual({
      action: "REDO_SERVICE",
      dueDate: "2026-10-14",
      weakCriteria: ["FLOORS", "GLASS", "DUST"],
    });
  });

  it("is not created at 80 or above", () => {
    expect(correctiveTaskFor({ ...inspection, total: 80 })).toBeNull();
    expect(correctiveTaskFor({ ...inspection, total: 92 })).toBeNull();
    expect(correctiveTaskFor({ ...inspection, total: 79 })).not.toBeNull();
  });

  it("is not created for one weak point in a good inspection", () => {
    const good = marks({ FLOORS: 4, GLASS: 10, BATHROOMS: 10, ENTRANCES: 10, ODOURS: 10, DUST: 10, EQUIPMENT: 10 });
    expect(inspectionTotal(good)).toBe(91);
    expect(correctiveTaskFor({ ...inspection, marks: good, total: 91 })).toBeNull();
  });

  it("follows the threshold set in the work rules", () => {
    expect(correctiveTaskFor({ ...inspection, threshold: 70 })).toBeNull();
    expect(correctiveTaskFor({ ...inspection, total: 85, threshold: 90 })?.action).toBe("REDO_SERVICE");
  });

  it("proposes redoing, then training, then changing the worker", () => {
    expect(correctiveTaskFor({ ...inspection, earlierLowInARow: 0 })?.action).toBe("REDO_SERVICE");
    expect(correctiveTaskFor({ ...inspection, earlierLowInARow: 1 })?.action).toBe("TRAIN_WORKER");
    expect(correctiveTaskFor({ ...inspection, earlierLowInARow: 2 })?.action).toBe("CHANGE_WORKER");
    expect(correctiveTaskFor({ ...inspection, earlierLowInARow: 5 })?.action).toBe("CHANGE_WORKER");
  });

  it("is due on the next visit day or after two days, whichever comes first", () => {
    expect(correctiveTaskFor({ ...inspection, nextVisitDate: "2026-10-13" })?.dueDate).toBe("2026-10-13");
    expect(correctiveTaskFor({ ...inspection, nextVisitDate: "2026-10-19" })?.dueDate).toBe("2026-10-14");
    expect(correctiveTaskFor({ ...inspection, nextVisitDate: null })?.dueDate).toBe("2026-10-14");
    // A "next visit" that is not after the inspection is ignored.
    expect(correctiveTaskFor({ ...inspection, nextVisitDate: "2026-10-12" })?.dueDate).toBe("2026-10-14");
    expect(correctiveTaskFor({ ...inspection, nextVisitDate: null, dueDays: 5 })?.dueDate).toBe("2026-10-17");
  });
});
