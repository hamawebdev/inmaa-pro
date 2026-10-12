import type { CorrectiveAction } from "../validators/option-codes";

import { addDays, type IsoDate } from "./calendar";

/**
 * The score of a supervisor's inspection, and when it calls for a correction.
 *
 * His study: the supervisor checks a list of points and gives a «Quality
 * Score», «مثلاً: 92/100», and «إذا كانت الجودة أقل من 80» the centre redoes
 * the service, trains the worker or changes her. Scope A9 takes that scale:
 * inspections are scored out of 100.
 *
 * On the printed sheet the supervisor gives each point a mark out of 10, which
 * is easy to do standing in a stairwell. The total is worked out here.
 */

export const DEFAULT_INSPECTION_THRESHOLD = 80;
export const DEFAULT_CORRECTIVE_DUE_DAYS = 2;
/** A point marked under this, out of 10, is named in the corrective task. */
export const WEAK_MARK = 8;

export interface CriterionMark {
  criterionCode: string;
  /** How much the point counts; 1 unless the manager changed it. */
  weight: number;
  /** 0 to 10, or null when the box was left empty. */
  score: number | null;
  /** «لا ينطبق»: the site has no such thing (no lift, no bathroom). */
  notApplicable: boolean;
}

/**
 * The total out of 100: the marks, each times its weight, over the best
 * possible, counting only the points that apply.
 *
 * Null when it cannot be worked out yet: a point that applies has no mark, or
 * no point applies at all. The inspection is not closed on a guess.
 */
export function inspectionTotal(marks: readonly CriterionMark[]): number | null {
  const applying = marks.filter((mark) => !mark.notApplicable && mark.weight > 0);
  if (applying.length === 0) return null;

  let earned = 0;
  let possible = 0;
  for (const mark of applying) {
    if (mark.score === null) return null;
    earned += Math.min(10, Math.max(0, mark.score)) * mark.weight;
    possible += 10 * mark.weight;
  }
  return Math.round((earned / possible) * 100);
}

/** The points to put right: those that apply and were marked under 8 out of 10. */
export function weakCriteria(marks: readonly CriterionMark[]): string[] {
  return marks
    .filter((mark) => !mark.notApplicable && mark.score !== null && mark.score < WEAK_MARK)
    .map((mark) => mark.criterionCode);
}

export interface CorrectiveDecision {
  action: CorrectiveAction;
  dueDate: IsoDate;
  /** The weak points, for the task's description. */
  weakCriteria: string[];
}

/**
 * The corrective task an inspection creates, or null when it creates none.
 *
 * Only the total decides: under the threshold, one task. A single weak point
 * in a good inspection creates nothing.
 *
 * What the task proposes follows his three actions, in the order chosen for
 * this program: redo the service the first time; train the worker when the
 * inspection before, on the same file with the same worker, was also under the
 * threshold; change the worker when the two before were.
 *
 * It is due on the file's next visit day, or `dueDays` after the inspection,
 * whichever comes first.
 */
export function correctiveTaskFor(inspection: {
  total: number;
  marks: readonly CriterionMark[];
  inspectionDate: IsoDate;
  /** The file's next visit after the inspection, if it has one. */
  nextVisitDate: IsoDate | null;
  /** How many inspections in a row, just before this one, were under the threshold for the same file and worker. */
  earlierLowInARow: number;
  threshold?: number;
  dueDays?: number;
}): CorrectiveDecision | null {
  const threshold = inspection.threshold ?? DEFAULT_INSPECTION_THRESHOLD;
  if (inspection.total >= threshold) return null;

  const action: CorrectiveAction =
    inspection.earlierLowInARow >= 2
      ? "CHANGE_WORKER"
      : inspection.earlierLowInARow === 1
        ? "TRAIN_WORKER"
        : "REDO_SERVICE";

  const byDelay = addDays(inspection.inspectionDate, inspection.dueDays ?? DEFAULT_CORRECTIVE_DUE_DAYS);
  const next = inspection.nextVisitDate;
  const dueDate = next !== null && next > inspection.inspectionDate && next < byDelay ? next : byDelay;

  return { action, dueDate, weakCriteria: weakCriteria(inspection.marks) };
}
