/**
 * Calendar dates as the database stores them: the text `YYYY-MM-DD`, with no
 * time and no time zone.
 *
 * A due date or an invoice date is a day on the centre's calendar, not an
 * instant. Passing it through a JavaScript `Date` in local time moves it by a
 * day on some machines, so everything here counts days on a fixed UTC calendar
 * and never asks the machine where it is. "Today" is always an argument.
 */

/** A calendar date, `YYYY-MM-DD`. Dates in this form compare and sort as text. */
export type IsoDate = string;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: IsoDate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`not a calendar date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`not a calendar date: ${date}`);
  }
  return { year, month, day };
}

function toDayNumber(date: IsoDate): number {
  const { year, month, day } = parts(date);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function fromDayNumber(dayNumber: number): IsoDate {
  const date = new Date(dayNumber * DAY_MS);
  return build(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function build(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isIsoDate(value: string): boolean {
  try {
    parts(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** `to − from` in days: positive when `to` is later. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * The same day number `months` later, or the last day of that month when it
 * has no such day.
 *
 * Always computed from the first date, never from the previous result, so a
 * date on the 31st does not drift: 31 January, 28 February, 31 March.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return build(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** The month a date falls in, `YYYY-MM`. */
export function monthOf(date: IsoDate): string {
  parts(date);
  return date.slice(0, 7);
}

/** The first day of a month given as `YYYY-MM`. */
export function firstDayOfMonth(month: string): IsoDate {
  return `${month}-01`;
}

/** The last day of a month given as `YYYY-MM`. */
export function lastDayOfMonth(month: string): IsoDate {
  const first = parts(`${month}-01`);
  return build(first.year, first.month, daysInMonth(first.year, first.month));
}

/** The month `count` months after a month given as `YYYY-MM`. */
export function addToMonth(month: string, count: number): string {
  return addMonths(firstDayOfMonth(month), count).slice(0, 7);
}

/** True when `date` is on or between the two ends. */
export function isWithin(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to;
}

/** A date as his forms write it: `30/11/2026`. Wrap the result in `<Ltr>`. */
export function formatDate(date: IsoDate): string {
  const { year, month, day } = parts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/**
 * The day of the week, counted as the centre's week runs: 0 السبت … 6 الجمعة.
 */
export function weekdayFromSaturday(date: IsoDate): number {
  const { year, month, day } = parts(date);
  // getUTCDay: 0 Sunday … 6 Saturday.
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 1) % 7;
}

/** Minutes from one clock time (`HH:MM`) to the next; an earlier second time is on the next day. */
export function minutesBetween(from: string, to: string): number {
  const read = (time: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new RangeError(`not a clock time: ${time}`);
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const start = read(from);
  const end = read(to);
  return end >= start ? end - start : end + 24 * 60 - start;
}
