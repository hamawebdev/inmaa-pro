import type { VisitStatus } from "../validators/option-codes";

import { MINUTES_PER_DAY, daysBetween, minutesOf, type ClockTime, type IsoDate } from "./calendar";

/**
 * The «لم يُبلَّغ عن الوصول» flag of the day board (plan feature 27, the part
 * that survives without phones).
 *
 * Nothing tells the program that a team has arrived: the office learns it from
 * a phone call or from the returned order, and types it in. So the flag does
 * not say "the team is late". It says "the visit should have started and
 * nobody has told the office that it did", which is what makes the office pick
 * up the phone.
 *
 * It is not an alert that reaches anyone by itself. It is seen when the board
 * is open.
 */

export const DEFAULT_ARRIVAL_GRACE_MIN = 15;

export function noArrivalReported(
  visit: {
    date: IsoDate;
    plannedStartTime: ClockTime;
    status: VisitStatus;
    /** An arrival was typed in, for the visit or for any worker on it. */
    arrivalReported: boolean;
  },
  clock: { today: IsoDate; nowTime: ClockTime },
  graceMin: number = DEFAULT_ARRIVAL_GRACE_MIN,
): boolean {
  // Only a visit still waiting to start. Once it is in progress, done,
  // postponed, cancelled or marked as a problem, the office already knows.
  if (visit.status !== "CONFIRMED" && visit.status !== "AWAITING_CONFIRMATION") return false;
  if (visit.arrivalReported) return false;

  const minutesSinceStart =
    daysBetween(visit.date, clock.today) * MINUTES_PER_DAY +
    minutesOf(clock.nowTime) -
    minutesOf(visit.plannedStartTime);
  return minutesSinceStart >= graceMin;
}
