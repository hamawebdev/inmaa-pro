/**
 * Calendar arithmetic on `YYYY-MM-DD` dates, for the rules in this folder.
 *
 * A date here is a day in the centre's calendar, never an instant: every
 * computation runs on UTC midnight, so no time zone and no daylight saving can
 * move a day.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(date: string): Date {
  const match = DATE.exec(date);
  const at = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!at || at.toISOString().slice(0, 10) !== date) throw new RangeError(`not a date: "${date}"`);
  return at;
}

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isDate(date: string): boolean {
  try {
    parse(date);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: string, days: number): string {
  const at = parse(date);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

/**
 * Whole months from `from` to `to`, both days included: 1 July to 30 September
 * is three months, 15 July to 13 August is none, 31 January to 28 February is
 * one (a month runs to the day before the same date of the next month, and to
 * the next month's last day when it has no such date).
 */
export function completedMonths(from: string, to: string): number {
  const start = parse(from);
  const end = parse(addDays(to, 1));
  if (end <= start) return 0;
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * The start of the year of reference that `date` falls in, for a year that
 * begins every year on `startMonthDay` (`MM-DD`, "07-01" for 1 July).
 */
export function yearStartOnOrBefore(date: string, startMonthDay: string): string {
  const thisYear = `${date.slice(0, 4)}-${startMonthDay}`;
  parse(thisYear);
  return thisYear <= date ? thisYear : `${Number(date.slice(0, 4)) - 1}-${startMonthDay}`;
}
