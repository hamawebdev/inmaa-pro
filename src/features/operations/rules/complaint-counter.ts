import type { ComplaintCounterState } from "../validators/option-codes";

import {
  addDays,
  clockOf,
  compareMoments,
  daysBetween,
  minutesOf,
  weekdayOf,
  type ClockTime,
  type IsoDate,
  type LocalMoment,
  type Weekday,
} from "./calendar";

/**
 * The response counter of a complaint (plan feature 18).
 *
 * His study: «وقت الاستجابة المستهدف: مثلاً خلال ساعتين في أوقات العمل». So the
 * two hours are counted only while the office is open. A complaint that comes
 * in half an hour before closing has ninety minutes left the next working
 * morning; one that comes in on Friday starts counting on Saturday.
 *
 * Everything here is in the centre's own time, as a date and a clock. The
 * service turns stored instants into that with Foundation's clock.
 */

export const DEFAULT_COMPLAINT_TARGET_MIN = 120;
/** Under this many office minutes left, the counter shows as close to its target. */
export const DEFAULT_COMPLAINT_WARN_MIN = 30;

export interface OfficeHours {
  openTime: ClockTime;
  closeTime: ClockTime;
  /** 0 = Saturday … 6 = Friday. */
  workingWeekdays: readonly Weekday[];
  /** Days the office is shut although the weekday is a working one. */
  closedDates?: readonly IsoDate[];
}

/** From his daily routine in the study: the day opens at 07:30 and is closed at 17:00, Saturday to Thursday. */
export const DEFAULT_OFFICE_HOURS: OfficeHours = {
  openTime: "07:30",
  closeTime: "17:00",
  workingWeekdays: [0, 1, 2, 3, 4, 5],
};

/** A year without one open day means the settings are wrong, not that the complaint can wait. */
const SEARCH_LIMIT_DAYS = 370;

function isOpenDay(date: IsoDate, office: OfficeHours): boolean {
  return office.workingWeekdays.includes(weekdayOf(date)) && !(office.closedDates ?? []).includes(date);
}

function assertUsable(office: OfficeHours): void {
  if (minutesOf(office.closeTime) <= minutesOf(office.openTime) || office.workingWeekdays.length === 0) {
    throw new RangeError("The office hours leave no time to count.");
  }
}

/** The moment `minutes` office minutes after `from`. */
export function addOfficeMinutes(
  from: LocalMoment,
  minutes: number,
  office: OfficeHours = DEFAULT_OFFICE_HOURS,
): LocalMoment {
  assertUsable(office);
  const open = minutesOf(office.openTime);
  const close = minutesOf(office.closeTime);

  let date = from.date;
  let clock = minutesOf(from.time);
  let left = Math.max(0, Math.round(minutes));

  for (let searched = 0; searched < SEARCH_LIMIT_DAYS; searched += 1) {
    if (isOpenDay(date, office) && clock < close) {
      const start = Math.max(clock, open);
      const room = close - start;
      if (left <= room) return { date, time: clockOf(start + left) };
      left -= room;
    }
    date = addDays(date, 1);
    clock = open;
  }
  throw new RangeError("The office hours leave no time to count.");
}

/** The office minutes from `from` to `to`; 0 when `to` is not after `from`. */
export function officeMinutesBetween(
  from: LocalMoment,
  to: LocalMoment,
  office: OfficeHours = DEFAULT_OFFICE_HOURS,
): number {
  assertUsable(office);
  if (compareMoments(to, from) <= 0) return 0;
  const open = minutesOf(office.openTime);
  const close = minutesOf(office.closeTime);

  let total = 0;
  const days = daysBetween(from.date, to.date);
  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDays(from.date, offset);
    if (!isOpenDay(date, office)) continue;
    const start = Math.max(open, offset === 0 ? minutesOf(from.time) : open);
    const end = Math.min(close, offset === days ? minutesOf(to.time) : close);
    if (end > start) total += end - start;
  }
  return total;
}

/** When the office must have answered by. */
export function complaintDueAt(
  received: LocalMoment,
  targetMin: number = DEFAULT_COMPLAINT_TARGET_MIN,
  office: OfficeHours = DEFAULT_OFFICE_HOURS,
): LocalMoment {
  return addOfficeMinutes(received, targetMin, office);
}

export interface ComplaintCounter {
  state: ComplaintCounterState;
  due: LocalMoment;
  /**
   * Office minutes between now (or the answer) and the target. Positive while
   * there is time left or when the answer came early; negative by how late.
   */
  marginMin: number;
}

/**
 * Where a complaint stands against its target.
 *
 * The counter stops at the first answer to the client. Until then it runs:
 * plainly, then as close to its target when less than `warnMin` office minutes
 * are left, then late.
 */
export function complaintCounter(complaint: {
  received: LocalMoment;
  /** When the office first answered the client, or null while it has not. */
  firstResponse: LocalMoment | null;
  now: LocalMoment;
  targetMin?: number;
  warnMin?: number;
  office?: OfficeHours;
}): ComplaintCounter {
  const office = complaint.office ?? DEFAULT_OFFICE_HOURS;
  const due = complaintDueAt(complaint.received, complaint.targetMin ?? DEFAULT_COMPLAINT_TARGET_MIN, office);
  const at = complaint.firstResponse ?? complaint.now;
  const late = compareMoments(at, due) > 0;
  const marginMin = late ? -officeMinutesBetween(due, at, office) : officeMinutesBetween(at, due, office);

  if (complaint.firstResponse) return { state: late ? "ANSWERED_LATE" : "ANSWERED_IN_TIME", due, marginMin };
  if (late) return { state: "LATE", due, marginMin };
  const warnMin = complaint.warnMin ?? DEFAULT_COMPLAINT_WARN_MIN;
  return { state: marginMin < warnMin ? "CLOSE_TO_TARGET" : "RUNNING", due, marginMin };
}
