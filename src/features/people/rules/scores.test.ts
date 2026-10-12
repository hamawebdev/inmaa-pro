import { describe, expect, it } from "vitest";

import { SAMPLE_WORKER_FORM } from "@/features/people/forms/worker-form-data";

import { evaluationResult, hiringTotal, typedTotalAgrees } from "./scores";

const TEN = {
  scoreAppearance: 8,
  scorePersonalHygiene: 9,
  scoreCommunication: 7,
  scoreDiscipline: 8,
  scoreExperience: 6,
  scoreQuickUnderstanding: 8,
  scorePhysicalFitness: 7,
  scoreWorkPressure: 7,
  scorePunctuality: 9,
  scoreTrustHonesty: 9,
};

describe("«المجموع: ……/100», the hiring score", () => {
  it("adds the ten criteria", () => {
    expect(hiringTotal(TEN)).toEqual({ total: 78, scored: 10, complete: true });
  });

  it("has no total while nothing is scored", () => {
    expect(hiringTotal({})).toEqual({ total: null, scored: 0, complete: false });
    expect(hiringTotal({ scoreAppearance: null })).toEqual({ total: null, scored: 0, complete: false });
  });

  it("says when only some criteria are scored", () => {
    expect(hiringTotal({ scoreAppearance: 10, scoreDiscipline: 0, scoreExperience: 5 })).toEqual({
      total: 15,
      scored: 3,
      complete: false,
    });
  });

  it("refuses points outside 0 to 10, or not whole", () => {
    expect(() => hiringTotal({ scoreAppearance: 11 })).toThrow(RangeError);
    expect(() => hiringTotal({ scoreAppearance: -1 })).toThrow(RangeError);
    expect(() => hiringTotal({ scoreAppearance: 7.5 })).toThrow(RangeError);
  });

  it("checks a total typed by hand against the criteria", () => {
    expect(typedTotalAgrees(78, TEN)).toBe(true);
    expect(typedTotalAgrees(80, TEN)).toBe(false);
    // A total alone, from a paper form scored that way.
    expect(typedTotalAgrees(65, {})).toBe(true);
    expect(typedTotalAgrees(101, {})).toBe(false);
    // Some criteria scored: the total is at least their sum.
    expect(typedTotalAgrees(70, { scoreAppearance: 10, scoreDiscipline: 10 })).toBe(true);
    expect(typedTotalAgrees(10, { scoreAppearance: 10, scoreDiscipline: 10 })).toBe(false);
    expect(typedTotalAgrees(null, TEN)).toBe(true);
  });

  it("agrees with the sample the filled sheet prints", () => {
    expect(hiringTotal(SAMPLE_WORKER_FORM.hiringScores).total).toBe(SAMPLE_WORKER_FORM.hiringTotal);
  });
});

describe("article 16, the periodic evaluation", () => {
  const seven = (values: number[]) => ({
    scoreDiscipline: values[0],
    scoreAttendance: values[1],
    scoreCleaningQuality: values[2],
    scoreClientRespect: values[3],
    scoreEquipmentCare: values[4],
    scoreSafety: values[5],
    scoreProgramme: values[6],
  });

  it("gives the points and the percentage on the scale passed in", () => {
    expect(evaluationResult(seven([5, 5, 5, 5, 5, 5, 5]), 5)).toEqual({ points: 35, percent: 100 });
    expect(evaluationResult(seven([4, 3, 5, 4, 4, 3, 5]), 5)).toEqual({ points: 28, percent: 80 });
    // 22 of 35 is 62.86%.
    expect(evaluationResult(seven([3, 3, 3, 3, 3, 3, 4]), 5)).toEqual({ points: 22, percent: 63 });
    expect(evaluationResult(seven([7, 7, 7, 7, 7, 7, 7]), 10)).toEqual({ points: 49, percent: 70 });
  });

  it("waits for all seven", () => {
    expect(evaluationResult({ scoreDiscipline: 5 }, 5)).toEqual({ points: null, percent: null });
  });

  it("refuses a score off the scale", () => {
    expect(() => evaluationResult(seven([0, 5, 5, 5, 5, 5, 5]), 5)).toThrow(RangeError);
    expect(() => evaluationResult(seven([6, 5, 5, 5, 5, 5, 5]), 5)).toThrow(RangeError);
  });
});
