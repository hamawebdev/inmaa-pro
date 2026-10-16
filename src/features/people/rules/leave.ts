import { addDays, completedMonths, isDate, yearStartOnOrBefore } from "./dates";

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

export interface LeaveAccount {
  /** The reference year being earned now: from when, and what it has earned so far. Taken in the next leave year. */
  earningFrom: string;
  earning: number;
  /** Earned in the reference years already ended since the count began. */
  earnedBefore: number;
  /** What can be taken now: brought in, plus the years ended, less the annual leave taken. Negative when overdrawn. */
  toTake: number;
}

/**
 * A person's annual leave under Law 90-11 (the coordinator's ruling, LAB-6):
 * what a reference year (1 July to 30 June) earns is taken in the leave year
 * that follows, and it is never lost at 1 July. The count begins the day after
 * `openingDate` when the office brought a balance in from paper
 * (`openingDays`, already earned), else on the first day of work.
 *
 * `taken` is the annual leave taken since the count began: only annual leave
 * debits it (LAB-7). In thousandths of a day.
 */
export function leaveAccount(
  input: {
    startDate: string;
    openingDate?: string | null;
    openingDays?: number | null;
    asOf: string;
    taken: number;
  },
  rules: LeaveRules,
): LeaveAccount {
  const from = input.openingDate ? addDays(input.openingDate, 1) : input.startDate;
  if (!isDate(from) || !isDate(input.asOf)) throw new RangeError("leaveAccount takes dates written YYYY-MM-DD");
  const current = yearStartOnOrBefore(input.asOf, rules.yearStart);
  const nextYear = (year: string) => `${Number(year.slice(0, 4)) + 1}${year.slice(4)}`;
  let earnedBefore = 0;
  for (let year = yearStartOnOrBefore(from, rules.yearStart); year < current; year = nextYear(year)) {
    const begin = from > year ? from : year;
    const end = addDays(nextYear(year), -1);
    if (begin <= end) earnedBefore += Math.min(rules.cap, completedMonths(begin, end) * rules.perMonth);
  }
  const begin = from > current ? from : current;
  const earning = begin > input.asOf ? 0 : Math.min(rules.cap, completedMonths(begin, input.asOf) * rules.perMonth);
  return {
    earningFrom: begin,
    earning,
    earnedBefore,
    toTake: (input.openingDays ?? 0) + earnedBefore - input.taken,
  };
}

/** Where a person's count of annual leave begins: the day after a balance brought in, else the first day of work. */
export const leaveCountFrom = (startDate: string, openingDate?: string | null) =>
  openingDate ? addDays(openingDate, 1) : startDate;
