import type { DayPeriod, DurationUnit, ProgrammeWarning } from "../validators/option-codes";

import {
  addDays,
  clockOf,
  datesBetween,
  minutesFromTo,
  minutesOf,
  weekdayOf,
  type ClockTime,
  type IsoDate,
  type Weekday,
} from "./calendar";

/**
 * Which visits a file calls for.
 *
 * His forms give the programme as a handful of fields: «أيام التنفيذ»,
 * «تحديد الفترة» with «من / إلى», «تاريخ البداية / النهاية», «وقت الوصول /
 * المغادرة», «عدد العمال», and «عدد الزيارات» on a contract or «مدة التنفيذ»
 * on a request. These functions turn those fields into dated visits and say
 * what is wrong with them. They read nothing and write nothing: the service
 * that saves visits calls them, and so does the preview shown before saving.
 */

/** The parts of «قواعد العمل» these rules read. */
export interface ProgrammeSettings {
  /** The days the centre works. His client forms offer Saturday to Thursday. */
  workingWeekdays: readonly Weekday[];
  /** The weekly rest day. */
  restWeekday: Weekday;
  /** The hours meant by «الصباحية» and «المسائية» when a form gives no time. */
  morning: { from: ClockTime; to: ClockTime };
  evening: { from: ClockTime; to: ClockTime };
}

export const DEFAULT_PROGRAMME_SETTINGS: ProgrammeSettings = {
  workingWeekdays: [0, 1, 2, 3, 4, 5],
  restWeekday: 6,
  morning: { from: "08:00", to: "12:00" },
  evening: { from: "13:30", to: "16:00" },
};

/** The time fields of a form, as typed. Any of them may be empty. */
export interface FormTimes {
  /** «تحديد الفترة». */
  period: DayPeriod | null;
  /** «من» and «إلى»: the hours the client allows. */
  windowFrom: ClockTime | null;
  windowTo: ClockTime | null;
  /** «وقت الوصول» and «المغادرة»: when the team is expected and when it leaves. */
  arrivalTime: ClockTime | null;
  departureTime: ClockTime | null;
}

/** One line of a file's weekly programme. */
export interface WeeklySlot {
  id: string;
  weekday: Weekday;
  startTime: ClockTime;
  durationMin: number;
  workersNeeded: number;
  /** The slot applies from this date, and until that one, both included. Empty means the whole contract. */
  validFrom?: IsoDate | null;
  validTo?: IsoDate | null;
}

/** A visit the programme calls for. Nothing is stored yet. */
export interface PlannedVisit {
  /** The slot it comes from. Null for an on-demand visit, which has none. */
  slotId: string | null;
  date: IsoDate;
  startTime: ClockTime;
  durationMin: number;
  workersNeeded: number;
  /** For a job of several days: «اليوم 2 من 3». */
  jobDayNo: number | null;
  jobDayCount: number | null;
}

export interface Programme {
  visits: PlannedVisit[];
  warnings: ProgrammeWarning[];
}

function periodHours(period: DayPeriod | null, settings: ProgrammeSettings): { from: ClockTime; to: ClockTime } {
  if (period === "EVENING") return settings.evening;
  // «معا» has a single «من / إلى» pair on his forms: one visit across both periods.
  if (period === "BOTH") return { from: settings.morning.from, to: settings.evening.to };
  return settings.morning;
}

/**
 * When a visit starts and how long it lasts.
 *
 * The team's own times come first («وقت الوصول», «المغادرة»). Failing those,
 * the hours the client allows («من», «إلى»). Failing those, the hours of the
 * period ticked. `durationMin` is «مدة التنفيذ» in minutes when the form gave
 * it in hours: it sets the end when no departure time was typed.
 */
export function plannedTimes(
  times: FormTimes,
  settings: ProgrammeSettings = DEFAULT_PROGRAMME_SETTINGS,
  durationMin: number | null = null,
): { startTime: ClockTime; durationMin: number } {
  const fallback = periodHours(times.period, settings);
  const startTime = times.arrivalTime ?? times.windowFrom ?? fallback.from;
  if (times.departureTime) return { startTime, durationMin: minutesFromTo(startTime, times.departureTime) };
  if (durationMin && durationMin > 0) return { startTime, durationMin };
  return { startTime, durationMin: minutesFromTo(startTime, times.windowTo ?? fallback.to) };
}

/**
 * The weekly programme his form describes: one slot per ticked day of «أيام
 * التنفيذ», all at the same hours and with the same number of workers. The
 * office may then change a single day.
 */
export function slotsFromForm(
  form: FormTimes & { executionWeekdays: readonly Weekday[]; workersCount: number | null },
  settings: ProgrammeSettings = DEFAULT_PROGRAMME_SETTINGS,
): WeeklySlot[] {
  const { startTime, durationMin } = plannedTimes(form, settings);
  return [...new Set(form.executionWeekdays)]
    .sort((a, b) => a - b)
    .map((weekday) => ({
      id: `day-${weekday}`,
      weekday,
      startTime,
      durationMin,
      workersNeeded: Math.max(1, form.workersCount ?? 1),
    }));
}

function slotCovers(slot: WeeklySlot, date: IsoDate): boolean {
  return (!slot.validFrom || date >= slot.validFrom) && (!slot.validTo || date <= slot.validTo);
}

/** True when a slot starts before the allowed hours or runs past them. */
function outsideWindow(slot: WeeklySlot, from: ClockTime | null, to: ClockTime | null): boolean {
  if (!from || !to) return false;
  const start = minutesOf(slot.startTime);
  const windowStart = minutesOf(from);
  const windowLength = minutesFromTo(from, to);
  const offset = (((start - windowStart) % 1440) + 1440) % 1440;
  return offset + slot.durationMin > windowLength;
}

export interface ContractProgramme {
  /** «تاريخ البداية» and «تاريخ النهاية». */
  startDate: IsoDate;
  endDate: IsoDate;
  slots: readonly WeeklySlot[];
  /** «عدد الزيارات»: 1 to 6 a week. Only compared with the slots, never used to choose days. */
  visitsPerWeek: number | null;
  /** «من» and «إلى», to warn about a slot outside them. */
  windowFrom?: ClockTime | null;
  windowTo?: ClockTime | null;
}

/**
 * Every visit of a contract: for each date from the start to the end, one visit
 * per slot that falls on that weekday. The whole contract at once, so the
 * workload of the coming months can be seen and counted.
 *
 * The days ticked decide. «عدد الزيارات» is only checked against them, and a
 * difference is a warning, never a refusal.
 */
export function contractVisits(
  programme: ContractProgramme,
  settings: ProgrammeSettings = DEFAULT_PROGRAMME_SETTINGS,
): Programme {
  const warnings: ProgrammeWarning[] = [];
  if (programme.endDate < programme.startDate) return { visits: [], warnings: ["END_BEFORE_START"] };
  if (programme.slots.length === 0) return { visits: [], warnings: ["NO_EXECUTION_DAY"] };

  const days = new Set(programme.slots.map((slot) => slot.weekday));
  if (programme.visitsPerWeek !== null && programme.visitsPerWeek !== days.size) {
    warnings.push("VISITS_PER_WEEK_MISMATCH");
  }
  if (days.has(settings.restWeekday)) warnings.push("REST_DAY_SLOT");
  if (programme.slots.some((slot) => outsideWindow(slot, programme.windowFrom ?? null, programme.windowTo ?? null))) {
    warnings.push("OUTSIDE_ALLOWED_WINDOW");
  }

  const visits: PlannedVisit[] = [];
  for (const date of datesBetween(programme.startDate, programme.endDate)) {
    const weekday = weekdayOf(date);
    const today = programme.slots
      .filter((slot) => slot.weekday === weekday && slotCovers(slot, date))
      .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
    for (const slot of today) {
      visits.push({
        slotId: slot.id,
        date,
        startTime: slot.startTime,
        durationMin: slot.durationMin,
        workersNeeded: slot.workersNeeded,
        jobDayNo: null,
        jobDayCount: null,
      });
    }
  }
  return { visits, warnings };
}

export interface OnDemandRequest extends FormTimes {
  /** «تاريخ البداية»; «تاريخ النهاية» may be empty. */
  startDate: IsoDate;
  endDate: IsoDate | null;
  /** «أيام التنفيذ». Empty means every working day. */
  executionWeekdays: readonly Weekday[];
  /** «مدة التنفيذ» and the unit the office chose for it. */
  durationValue: number | null;
  durationUnit: DurationUnit | null;
  /** «عدد العمال». */
  workersCount: number | null;
}

/**
 * The visits of an on-demand job.
 *
 *  - Only a start date: one visit that day, whatever day it is.
 *  - A start and an end: one visit on each day of the range that is ticked in
 *    «أيام التنفيذ», or on each working day when none is ticked.
 *  - No end date but a length in days: that many days, counted from the start
 *    over the same days.
 *
 * A length in hours sets how long each visit lasts when no departure time was
 * typed. A length in days that disagrees with the range is a warning.
 */
export function onDemandVisits(
  request: OnDemandRequest,
  settings: ProgrammeSettings = DEFAULT_PROGRAMME_SETTINGS,
): Programme {
  const warnings: ProgrammeWarning[] = [];
  if (request.endDate !== null && request.endDate < request.startDate) {
    return { visits: [], warnings: ["END_BEFORE_START"] };
  }

  const days = request.durationUnit === "DAYS" ? request.durationValue : null;
  const hours = request.durationUnit === "HOURS" ? request.durationValue : null;
  const { startTime, durationMin } = plannedTimes(request, settings, hours ? Math.round(hours * 60) : null);
  const eligible = new Set(request.executionWeekdays.length > 0 ? request.executionWeekdays : settings.workingWeekdays);

  let dates: IsoDate[];
  if (request.endDate !== null && request.endDate > request.startDate) {
    dates = datesBetween(request.startDate, request.endDate).filter((date) => eligible.has(weekdayOf(date)));
    if (dates.length === 0) return { visits: [], warnings: ["NO_WORKING_DAY_IN_RANGE"] };
    if (days !== null && days !== dates.length) warnings.push("DURATION_DAYS_MISMATCH");
  } else if (request.endDate === null && days !== null && days > 1 && eligible.size > 0) {
    dates = [];
    for (let date = request.startDate; dates.length < days; date = addDays(date, 1)) {
      if (eligible.has(weekdayOf(date))) dates.push(date);
    }
  } else {
    // One date, typed on purpose: it stands even on a day the centre is closed.
    dates = [request.startDate];
    if (days !== null && days > 1) warnings.push("DURATION_DAYS_MISMATCH");
  }

  if (dates.some((date) => weekdayOf(date) === settings.restWeekday)) warnings.push("REST_DAY_SLOT");
  if (
    request.windowFrom &&
    request.windowTo &&
    outsideWindow(
      { id: "", weekday: 0, startTime, durationMin, workersNeeded: 1 },
      request.windowFrom,
      request.windowTo,
    )
  ) {
    warnings.push("OUTSIDE_ALLOWED_WINDOW");
  }

  const several = dates.length > 1;
  return {
    visits: dates.map((date, index) => ({
      slotId: null,
      date,
      startTime,
      durationMin,
      workersNeeded: Math.max(1, request.workersCount ?? 1),
      jobDayNo: several ? index + 1 : null,
      jobDayCount: several ? dates.length : null,
    })),
    warnings,
  };
}

/** What makes a planned visit the same visit on a second run: its slot and its date. */
export function visitKey(visit: { slotId: string | null; date: IsoDate }): string {
  return `${visit.slotId ?? ""}|${visit.date}`;
}

/**
 * The planned visits that do not exist yet. Running the generation again after
 * a renewal, or after the office added a day, must never make a visit twice.
 */
export function visitsToCreate(planned: readonly PlannedVisit[], existingKeys: ReadonlySet<string>): PlannedVisit[] {
  return planned.filter((visit) => !existingKeys.has(visitKey(visit)));
}

/** When the visit ends on the clock, for the order and the calendar. */
export function endTimeOf(visit: { startTime: ClockTime; durationMin: number }): ClockTime {
  return clockOf(minutesOf(visit.startTime) + visit.durationMin);
}
