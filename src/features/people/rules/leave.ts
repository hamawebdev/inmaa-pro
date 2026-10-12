import { completedMonths, isDate, yearStartOnOrBefore } from "./dates";

/**
 * Annual leave earned: 2.5 days for each month worked (scope section 5).
 *
 * Days are counted in thousandths, as the database counts quantities: 2.5 days
 * is 2500. The year of reference starts on a fixed day each year (setting
 * `pay.leaveYearStart`, 1 July); leave is earned month by month inside it, up
 * to a ceiling (`pay.leaveCapDays`, 30 days). A month counts once it is
 * complete. All three figures come from settings and are passed in.
 */

export interface LeaveRules {
  /** Thousandths of a day earned per month worked: `pay.leaveDaysPerMonth` (2500). */
  perMonth: number;
  /** The most a year of reference earns: `pay.leaveCapDays` (30000). */
  cap: number;
  /** `MM-DD`, the first day of the year of reference: `pay.leaveYearStart` ("07-01"). */
  yearStart: string;
}

export interface LeaveAccrual {
  /** Where this year's counting starts: the year of reference, or the first day of work if later. */
  from: string;
  /** Whole months worked since then, those not counted taken off. */
  months: number;
  /** Thousandths of a day. */
  earned: number;
}

/**
 * Leave earned in the current year of reference, as of `asOf`.
 *
 * `monthsNotCounted` is for months the law does not count as worked (unpaid
 * leave, a long absence that is not assimilated); the office types it.
 */
export function leaveEarned(
  { startDate, asOf, monthsNotCounted = 0 }: { startDate: string; asOf: string; monthsNotCounted?: number },
  rules: LeaveRules,
): LeaveAccrual {
  if (!isDate(startDate) || !isDate(asOf)) throw new RangeError("leaveEarned takes dates written YYYY-MM-DD");
  if (!Number.isInteger(monthsNotCounted) || monthsNotCounted < 0)
    throw new RangeError("monthsNotCounted is 0 or more");
  const yearStart = yearStartOnOrBefore(asOf, rules.yearStart);
  const from = startDate > yearStart ? startDate : yearStart;
  if (from > asOf) return { from, months: 0, earned: 0 };
  const months = Math.max(0, completedMonths(from, asOf) - monthsNotCounted);
  return { from, months, earned: Math.min(rules.cap, months * rules.perMonth) };
}

/** What is left: brought forward, plus earned, less taken. In thousandths of a day; negative when overdrawn. */
export function leaveBalance({
  broughtForward,
  earned,
  taken,
}: {
  broughtForward: number;
  earned: number;
  taken: number;
}) {
  return broughtForward + earned - taken;
}
