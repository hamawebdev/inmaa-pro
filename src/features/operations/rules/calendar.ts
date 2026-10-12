import { WEEKDAYS } from "../validators/option-codes";

/**
 * Dates and clock times as the whole schema writes them: a calendar date is
 * "YYYY-MM-DD", a clock time is "HH:MM", a duration is whole minutes.
 *
 * Nothing here reads the PC's clock or its time zone. A date is counted in
 * whole days, so "the day after" can never slip by an hour, and every rule
 * built on these helpers gives the same answer on any machine.
 *
 * The week is the centre's: it starts on Saturday. Weekdays are numbered as in
 * Operations' tables, 0 = السبت … 6 = الجمعة.
 */

/** "YYYY-MM-DD". */
export type IsoDate = string;
/** "HH:MM", 24-hour. */
export type ClockTime = string;
/** 0 = Saturday … 6 = Friday. */
export type Weekday = number;

export const SATURDAY: Weekday = 0;
export const FRIDAY: Weekday = 6;
export const MINUTES_PER_DAY = 1440;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Whole days since 1970-01-01. Throws on anything that is not a real date. */
export function dayNumber(date: IsoDate): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Not a calendar date: ${date}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    throw new RangeError(`Not a calendar date: ${date}`);
  }
  return Math.round(ms / MS_PER_DAY);
}

export function dateOfDayNumber(days: number): IsoDate {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  try {
    dayNumber(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return dateOfDayNumber(dayNumber(date) + days);
}

/** How many days `to` is after `from`; negative when it is before. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from);
}

export function weekdayOf(date: IsoDate): Weekday {
  // 1970-01-01 was a Thursday, which is weekday 5 when Saturday is 0.
  return (((dayNumber(date) + 5) % 7) + 7) % 7;
}

/** The Saturday that opens the week `date` is in. */
export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, -weekdayOf(date));
}

/** "YYYY-MM". */
export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

export function dayOfMonth(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

/** Every date from `from` to `to`, both included. Empty when `to` is before `from`. */
export function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const first = dayNumber(from);
  const last = dayNumber(to);
  const dates: IsoDate[] = [];
  for (let day = first; day <= last; day += 1) dates.push(dateOfDayNumber(day));
  return dates;
}

/** Minutes after midnight. Throws on anything that is not a clock time. */
export function minutesOf(time: ClockTime): number {
  const match = TIME_PATTERN.exec(time);
  const hours = match ? Number(match[1]) : Number.NaN;
  const minutes = match ? Number(match[2]) : Number.NaN;
  if (!match || hours > 23 || minutes > 59) throw new RangeError(`Not a clock time: ${time}`);
  return hours * 60 + minutes;
}

export function isClockTime(value: string): boolean {
  try {
    minutesOf(value);
    return true;
  } catch {
    return false;
  }
}

/** The clock time a number of minutes after midnight falls on; past midnight it wraps to the next day's clock. */
export function clockOf(minutes: number): ClockTime {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/**
 * Minutes from `start` to `end` on the clock. An end at or before the start is
 * read as the next day, which is how a night job (22:00 to 02:00) is written.
 */
export function minutesFromTo(start: ClockTime, end: ClockTime): number {
  const span = minutesOf(end) - minutesOf(start);
  return span > 0 ? span : span + MINUTES_PER_DAY;
}

/** A point in the centre's own time: a date and the clock on that date. */
export interface LocalMoment {
  date: IsoDate;
  time: ClockTime;
}

/** Negative, zero or positive as `a` is before, at or after `b`. */
export function compareMoments(a: LocalMoment, b: LocalMoment): number {
  return (
    dayNumber(a.date) * MINUTES_PER_DAY + minutesOf(a.time) - (dayNumber(b.date) * MINUTES_PER_DAY + minutesOf(b.time))
  );
}

/**
 * A clock time as minutes after midnight of the anchor's day, on whichever day
 * puts it nearest the anchor: within twelve hours before or after it.
 *
 * A returned order gives clock times only. For a visit planned at 22:00, a
 * departure written «02:00» is the next morning (1560), and an arrival written
 * «21:50» the same evening (1310). For a visit planned at 08:00 nothing moves.
 */
export function minutesNear(time: ClockTime, anchor: ClockTime): number {
  const at = minutesOf(anchor);
  let offset = minutesOf(time) - at;
  if (offset > MINUTES_PER_DAY / 2) offset -= MINUTES_PER_DAY;
  if (offset <= -MINUTES_PER_DAY / 2) offset += MINUTES_PER_DAY;
  return at + offset;
}

/** The weekday numbers of a stored list of weekday codes (`["SAT","MON"]`), in week order. Unknown codes are dropped. */
export function weekdaysOfCodes(codes: readonly string[] | string | null | undefined): Weekday[] {
  let list: unknown = codes ?? [];
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  const order: readonly string[] = WEEKDAYS;
  return [...new Set(list.map((code) => order.indexOf(String(code))).filter((day) => day >= 0))].sort((a, b) => a - b);
}
