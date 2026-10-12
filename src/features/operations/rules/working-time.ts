import type { Sex, WorkRuleCode, WorkRuleLevel } from "../validators/option-codes";

import {
  MINUTES_PER_DAY,
  dayNumber,
  minutesOf,
  weekStartOf,
  weekdayOf,
  type ClockTime,
  type IsoDate,
  type Weekday,
} from "./calendar";

/**
 * The working-time rules of scope section 5, checked on a worker's planned
 * seats before they are saved.
 *
 *  - 40 hours a week, with a warning up to 48 and the manager's approval above.
 *  - A working day spans at most 12 hours from its first start to its last end.
 *  - A woman scheduled between 21:00 and 05:00 is flagged: night work by women
 *    needs the labour inspector's derogation.
 *  - Every worker keeps one day without work in the week; Friday is the usual
 *    one, and working it is noted for pay.
 *
 * The week is Saturday to Friday. A seat is a worker's place on one visit.
 */

/** The parts of «قواعد العمل» these rules read, in minutes. */
export interface WorkTimeSettings {
  /** The legal week: 40 hours. */
  weeklyLegalMin: number;
  /** The legal week plus the overtime the law allows: 48 hours. */
  weeklyCapMin: number;
  /** A day's work before a warning: 8 hours. */
  dailyMin: number;
  /** The longest span of a working day: 12 hours. */
  daySpanMin: number;
  /** Night, for the rule on women: 21:00 to 05:00. */
  nightFrom: ClockTime;
  nightTo: ClockTime;
  /** The time kept free between two visits on different sites. */
  travelGapMin: number;
  /** The weekly rest day: Friday. */
  restWeekday: Weekday;
}

export const DEFAULT_WORK_TIME_SETTINGS: WorkTimeSettings = {
  weeklyLegalMin: 2400,
  weeklyCapMin: 2880,
  dailyMin: 480,
  daySpanMin: 720,
  nightFrom: "21:00",
  nightTo: "05:00",
  travelGapMin: 30,
  restWeekday: 6,
};

/** A worker's place on one visit, as planned. */
export interface Seat {
  visitId: string;
  siteId: string;
  date: IsoDate;
  startTime: ClockTime;
  durationMin: number;
}

/** What the rules need to know about the worker. Never her health answers. */
export interface WorkerForRules {
  sex: Sex;
  /** Her own weekly hours when she is part-time; empty means the legal week. */
  weeklyCapacityMin: number | null;
  /** «الأيام المتاحة» on her registration form. */
  availableWeekdays: readonly Weekday[];
  /** The days a recorded absence or approved leave covers. Left out, none. */
  absentDates?: readonly IsoDate[];
}

export interface RuleFinding {
  code: WorkRuleCode;
  level: WorkRuleLevel;
  /** The Saturday of the week, for a weekly rule. */
  weekStart?: IsoDate;
  /** The day, for a daily rule. */
  date?: IsoDate;
  /** The load or the span that broke the rule, in minutes. */
  valueMin?: number;
  /** The visits concerned. */
  visitIds: string[];
}

/** What each broken rule costs. One place, so the screens and the tests agree. */
export const WORK_RULE_LEVEL: Record<WorkRuleCode, WorkRuleLevel> = {
  OVERLAP: "REFUSED",
  WEEK_OVER_CAPACITY: "WARNING",
  WEEK_OVERTIME: "WARNING",
  WEEK_OVER_48H: "NEEDS_MANAGER",
  DAY_OVER_8H: "WARNING",
  DAY_SPAN_12H: "NEEDS_MANAGER",
  NIGHT_WOMAN: "NEEDS_MANAGER",
  UNAVAILABLE_DAY: "WARNING",
  ON_LEAVE: "NEEDS_MANAGER",
  NO_REST_DAY: "NEEDS_MANAGER",
  REST_DAY_WORKED: "FLAG",
};

/** Minutes from 1970-01-01 00:00 to the seat's start. */
function startOf(seat: Seat): number {
  return dayNumber(seat.date) * MINUTES_PER_DAY + minutesOf(seat.startTime);
}

function endOf(seat: Seat): number {
  return startOf(seat) + seat.durationMin;
}

/** True when any part of the visit falls in the night hours. Ending at 21:00 sharp, or starting at 05:00 sharp, does not. */
export function touchesNight(
  startTime: ClockTime,
  durationMin: number,
  settings: Pick<WorkTimeSettings, "nightFrom" | "nightTo"> = DEFAULT_WORK_TIME_SETTINGS,
): boolean {
  const start = minutesOf(startTime);
  const end = start + durationMin;
  const nightStart = minutesOf(settings.nightFrom);
  const nightLength =
    (((minutesOf(settings.nightTo) - nightStart) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (nightLength === 0) return false;
  // The night that began the evening before, tonight's, and tomorrow's for a very long visit.
  return [-1, 0, 1].some((day) => {
    const from = day * MINUTES_PER_DAY + nightStart;
    return start < from + nightLength && end > from;
  });
}

/**
 * True when one worker cannot hold both seats: the two visits overlap, or they
 * are on different sites with less than the travel gap between them.
 */
export function seatsClash(a: Seat, b: Seat, travelGapMin: number): boolean {
  const gap = a.siteId === b.siteId ? 0 : travelGapMin;
  return startOf(a) < endOf(b) + gap && startOf(b) < endOf(a) + gap;
}

/** The planned minutes of a set of seats. */
export function loadMin(seats: readonly Seat[]): number {
  return seats.reduce((sum, seat) => sum + seat.durationMin, 0);
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

/**
 * Everything the planned seats of one worker break, week by week and day by day.
 *
 * Give it all her seats for the weeks concerned: a weekly rule can only be
 * judged on the whole week. An empty answer means the plan is clean.
 */
export function checkWorkerSeats(
  worker: WorkerForRules,
  seats: readonly Seat[],
  settings: WorkTimeSettings = DEFAULT_WORK_TIME_SETTINGS,
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const add = (code: WorkRuleCode, rest: Omit<RuleFinding, "code" | "level">) =>
    findings.push({ code, level: WORK_RULE_LEVEL[code], ...rest });
  const ordered = [...seats].sort((a, b) => startOf(a) - startOf(b));

  // Two visits at once, or too close to travel between.
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length && startOf(ordered[j]) < endOf(ordered[i]) + settings.travelGapMin; j += 1) {
      if (seatsClash(ordered[i], ordered[j], settings.travelGapMin)) {
        add("OVERLAP", { date: ordered[j].date, visitIds: [ordered[i].visitId, ordered[j].visitId] });
      }
    }
  }

  for (const [weekStart, week] of groupBy(ordered, (seat) => weekStartOf(seat.date))) {
    const load = loadMin(week);
    const visitIds = week.map((seat) => seat.visitId);
    const capacity = worker.weeklyCapacityMin ?? settings.weeklyLegalMin;
    if (load > settings.weeklyCapMin) add("WEEK_OVER_48H", { weekStart, valueMin: load, visitIds });
    else if (load > settings.weeklyLegalMin) add("WEEK_OVERTIME", { weekStart, valueMin: load, visitIds });
    else if (load > capacity) add("WEEK_OVER_CAPACITY", { weekStart, valueMin: load, visitIds });

    const daysWorked = new Set(week.map((seat) => weekdayOf(seat.date)));
    if (daysWorked.size === 7) add("NO_REST_DAY", { weekStart, visitIds });
  }

  for (const [date, day] of groupBy(ordered, (seat) => seat.date)) {
    const visitIds = day.map((seat) => seat.visitId);
    const worked = loadMin(day);
    if (worked > settings.dailyMin) add("DAY_OVER_8H", { date, valueMin: worked, visitIds });

    const span = Math.max(...day.map(endOf)) - Math.min(...day.map(startOf));
    if (span > settings.daySpanMin) add("DAY_SPAN_12H", { date, valueMin: span, visitIds });

    const weekday = weekdayOf(date);
    if (!worker.availableWeekdays.includes(weekday)) add("UNAVAILABLE_DAY", { date, visitIds });
    if (worker.absentDates?.includes(date)) add("ON_LEAVE", { date, visitIds });
    if (weekday === settings.restWeekday) add("REST_DAY_WORKED", { date, visitIds });
  }

  if (worker.sex === "FEMALE") {
    for (const seat of ordered) {
      if (touchesNight(seat.startTime, seat.durationMin, settings)) {
        add("NIGHT_WOMAN", { date: seat.date, visitIds: [seat.visitId] });
      }
    }
  }

  return findings;
}

/** The heaviest cost among the findings, or null when there is none. */
export function worstLevel(findings: readonly RuleFinding[]): WorkRuleLevel | null {
  const order: readonly WorkRuleLevel[] = ["FLAG", "WARNING", "NEEDS_MANAGER", "REFUSED"];
  return findings.reduce<WorkRuleLevel | null>(
    (worst, finding) => (worst === null || order.indexOf(finding.level) > order.indexOf(worst) ? finding.level : worst),
    null,
  );
}

// ── The rotating rest day ───────────────────────────────────────────────────

/**
 * Whether the program should offer the rest-day rotation for a file.
 *
 * With Friday free, six visits a week still leave the team its rest day, so the
 * rotation is not forced on every six-visit contract. It is offered when the
 * contract covers the rest day itself, or when it has six visits a week and one
 * of its workers is also planned on the rest day elsewhere: she would then
 * work seven days out of seven.
 */
export function shouldOfferRestRotation(file: {
  visitsPerWeek: number;
  slotWeekdays: readonly Weekday[];
  aMemberWorksTheRestDay: boolean;
  restWeekday?: Weekday;
}): boolean {
  const restWeekday = file.restWeekday ?? DEFAULT_WORK_TIME_SETTINGS.restWeekday;
  if (file.slotWeekdays.includes(restWeekday)) return true;
  return file.visitsPerWeek >= 6 && file.aMemberWorksTheRestDay;
}

/** Which week of the contract a date is in: 0 for the week the contract starts in. */
export function contractWeekIndex(contractStart: IsoDate, date: IsoDate): number {
  return Math.round((dayNumber(weekStartOf(date)) - dayNumber(weekStartOf(contractStart))) / 7);
}

/**
 * Who rests on which day of one week of a file under the rotation.
 *
 * In week *w*, member number *i* rests on the file's visit day number
 * (*w* + *i*) mod *n*, where *n* is the number of days the file is visited that
 * week. So each member's rest day moves one visit day later every week, and two
 * members never rest on the same day while the team is no larger than the week.
 *
 * `members` are the file's standing workers in their fixed order (the named
 * alternate is not one of them: she is the one who covers). The answer gives
 * each member the date she rests.
 */
export function restDatesForWeek(
  weekIndex: number,
  members: readonly string[],
  weekVisitDates: readonly IsoDate[],
): Record<string, IsoDate> {
  const days = [...new Set(weekVisitDates)].sort();
  const rest: Record<string, IsoDate> = {};
  if (days.length === 0) return rest;
  members.forEach((member, index) => {
    rest[member] = days[(((weekIndex + index) % days.length) + days.length) % days.length];
  });
  return rest;
}
