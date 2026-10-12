import {
  EVALUATION_CRITERIA,
  HIRING_CRITERIA,
  type EvaluationCriterion,
  type HiringCriterion,
} from "@/features/people/validators/staff-codes";

/**
 * The two scores of his worker form and regulations.
 *
 *  - «تقييم مسئول الموارد البشرية (سري)»: ten criteria and «المجموع: ……/100». His
 *    form gives no points per criterion; ten criteria and a total out of 100
 *    make ten points each (scope F11, People's default).
 *  - Article 16, «يخضع العامل للتقييم بناءً على»: seven criteria and no scale. The
 *    scale is the setting `evaluation.scaleMax` (5 by default), passed in.
 */

/** The points of one hiring criterion: a whole number from 0 to 10. */
export const HIRING_SCORE_MAX = 10;

export type HiringScores = Readonly<Partial<Record<HiringCriterion, number | null | undefined>>>;

export interface HiringTotal {
  /** The sum of the criteria scored, out of 100. Null while none is. */
  total: number | null;
  /** How many of the ten are scored. */
  scored: number;
  /** All ten scored: only then is the total the one his form asks for. */
  complete: boolean;
}

function checkPoints(value: number, max: number, min: number, what: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${what} must be a whole number from ${min} to ${max}, not ${value}`);
  }
  return value;
}

/** «المجموع: ……/100»: the sum of the ten criteria. */
export function hiringTotal(scores: HiringScores): HiringTotal {
  let total = 0;
  let scored = 0;
  for (const criterion of HIRING_CRITERIA) {
    const value = scores[criterion];
    if (value === null || value === undefined) continue;
    total += checkPoints(value, HIRING_SCORE_MAX, 0, criterion);
    scored += 1;
  }
  return { total: scored === 0 ? null : total, scored, complete: scored === HIRING_CRITERIA.length };
}

/**
 * Whether a total typed by hand agrees with the criteria. A total may be typed
 * alone, from a paper form scored that way; once a criterion is scored, the
 * typed total must be their sum.
 */
export function typedTotalAgrees(typed: number | null, scores: HiringScores): boolean {
  const { total, complete } = hiringTotal(scores);
  if (typed === null) return true;
  if (!Number.isInteger(typed) || typed < 0 || typed > HIRING_SCORE_MAX * HIRING_CRITERIA.length) return false;
  if (total === null) return true;
  return complete ? typed === total : typed >= total;
}

export type EvaluationScores = Readonly<Partial<Record<EvaluationCriterion, number | null | undefined>>>;

export interface EvaluationResult {
  /** The sum of the seven, out of `7 × scaleMax`. Null until all seven are scored. */
  points: number | null;
  /** The same as a percentage, rounded to the nearest whole number. */
  percent: number | null;
}

/** Article 16: the seven criteria, each from 1 to `scaleMax`. */
export function evaluationResult(scores: EvaluationScores, scaleMax: number): EvaluationResult {
  checkPoints(scaleMax, 100, 2, "the scale");
  let points = 0;
  for (const criterion of EVALUATION_CRITERIA) {
    const value = scores[criterion];
    if (value === null || value === undefined) return { points: null, percent: null };
    points += checkPoints(value, scaleMax, 1, criterion);
  }
  const out = EVALUATION_CRITERIA.length * scaleMax;
  return { points, percent: Math.floor((points * 100 * 2 + out) / (out * 2)) };
}
