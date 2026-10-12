import { localDate, localTime, type LocalDate, type LocalTime } from "@/lib/units";

/**
 * The one clock.
 *
 * "Today" and "now" in this program are the centre's, not the machine's: a
 * calendar date and a clock time in the centre's own offset (setting
 * `system.utcOffsetMin`, 60: Algeria has no daylight saving). Nothing reads the
 * operating system's time zone, and no query uses SQLite's `date('now')`.
 * Every service receives the time through its `ctx`, which is built from a
 * clock; a test passes a fixed one.
 */
export interface Clock {
  /** The present instant. */
  now(): Date;
  /** Minutes east of UTC that the centre's wall clock runs at. */
  readonly utcOffsetMin: number;
}

export const DEFAULT_UTC_OFFSET_MIN = 60;

export function systemClock(utcOffsetMin = DEFAULT_UTC_OFFSET_MIN): Clock {
  return { now: () => new Date(), utcOffsetMin };
}

/** A clock that stands still until it is moved. For tests and for the harness. */
export interface FixedClock extends Clock {
  set(instant: string): void;
  advance(by: { minutes?: number; hours?: number; days?: number }): void;
}

export function fixedClock(instant: string, utcOffsetMin = DEFAULT_UTC_OFFSET_MIN): FixedClock {
  let at = new Date(instant).getTime();
  if (Number.isNaN(at)) throw new Error(`clock: "${instant}" is not an instant`);
  return {
    utcOffsetMin,
    now: () => new Date(at),
    set(next) {
      const value = new Date(next).getTime();
      if (Number.isNaN(value)) throw new Error(`clock: "${next}" is not an instant`);
      at = value;
    },
    advance({ minutes = 0, hours = 0, days = 0 }) {
      at += ((days * 24 + hours) * 60 + minutes) * 60_000;
    },
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The calendar date and clock time an instant falls on at the centre. */
export function toLocal(instant: string | Date, utcOffsetMin: number): { date: LocalDate; time: LocalTime } {
  const shifted = new Date(new Date(instant).getTime() + utcOffsetMin * 60_000);
  return {
    date: localDate(`${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`),
    time: localTime(`${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`),
  };
}

/** The instant of a calendar date and clock time at the centre, as the database stores instants. */
export function toInstant(date: LocalDate, time: LocalTime, utcOffsetMin: number): string {
  return new Date(Date.parse(`${date}T${time}:00.000Z`) - utcOffsetMin * 60_000).toISOString();
}

/** A date some days away. Calendar arithmetic, so a month end and a leap year are right. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const at = new Date(`${date}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return localDate(at.toISOString().slice(0, 10));
}

/** Whole days from one date to another: positive when `to` is later. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

export function yearOf(date: LocalDate): number {
  return Number(date.slice(0, 4));
}
