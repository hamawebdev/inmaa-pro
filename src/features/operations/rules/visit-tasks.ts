import type { TaskFrequency } from "../validators/option-codes";

import { dayOfMonth, monthOf, weekStartOf, weekdayOf, type IsoDate, type Weekday } from "./calendar";

/**
 * Which tasks of a file a given visit carries.
 *
 * A file's list holds daily, weekly, monthly and special tasks (his study's
 * «الخدمات اليومية / الأسبوعية / الشهرية / الخاصة»). The order for one visit
 * shows only the tasks due that day:
 *
 *  - **daily**: every visit. "Daily" means each time the team comes, not each
 *    calendar day.
 *  - **weekly**: the visit on the task's own weekday; when the task names no
 *    day, or the file has no visit on that day that week, the first visit of
 *    the week (Saturday to Friday).
 *  - **monthly**: the first visit on or after the task's day of the month (the
 *    1st when it names none); when the month has no visit that late, its last
 *    visit, so that the task is not lost.
 *  - **special**: the first visit on or after its date. A special task with no
 *    date waits until it is given one.
 */

export interface FileTaskRule {
  id: string;
  frequency: TaskFrequency;
  /** Weekly: the day it is done on. */
  weekday?: Weekday | null;
  /** Monthly: 1 to 31. */
  dayOfMonth?: number | null;
  /** Special: its date. */
  specialDate?: IsoDate | null;
  /** A task switched off is carried by no visit. Left out, the task is on. */
  isActive?: boolean;
}

function carries(task: FileTaskRule, visitDate: IsoDate, fileDates: readonly IsoDate[]): boolean {
  switch (task.frequency) {
    case "DAILY":
      return true;

    case "WEEKLY": {
      const week = weekStartOf(visitDate);
      const thisWeek = fileDates.filter((date) => weekStartOf(date) === week);
      const onItsDay =
        task.weekday !== null &&
        task.weekday !== undefined &&
        thisWeek.some((date) => weekdayOf(date) === task.weekday);
      return onItsDay ? weekdayOf(visitDate) === task.weekday : visitDate === thisWeek[0];
    }

    case "MONTHLY": {
      const month = monthOf(visitDate);
      const thisMonth = fileDates.filter((date) => monthOf(date) === month);
      const from = task.dayOfMonth ?? 1;
      const due = thisMonth.find((date) => dayOfMonth(date) >= from) ?? thisMonth[thisMonth.length - 1];
      return visitDate === due;
    }

    case "SPECIAL": {
      if (!task.specialDate) return false;
      const special = task.specialDate;
      return visitDate === fileDates.find((date) => date >= special);
    }
  }
}

/**
 * The ids of the tasks the visit on `visitDate` carries, in the order given.
 *
 * `fileVisitDates` are the dates of the file's visits that count: neither
 * postponed nor cancelled. The visit asked about is added if it is missing.
 */
export function tasksForVisit(
  visitDate: IsoDate,
  fileVisitDates: readonly IsoDate[],
  tasks: readonly FileTaskRule[],
): string[] {
  const dates = [...new Set([...fileVisitDates, visitDate])].sort();
  return tasks.filter((task) => task.isActive !== false && carries(task, visitDate, dates)).map((task) => task.id);
}

/** A line of a visit's checklist, as far as carrying over needs to know it. */
export interface ChecklistOutcome {
  fileTaskId: string;
  frequency: TaskFrequency;
  /** True ticked, false left unticked on the returned order, null not typed in yet. */
  done: boolean | null;
}

/**
 * The weekly and monthly tasks the next visit takes over from this one.
 *
 * A visit that did not take place hands over all of them. A visit that did
 * hands over those that came back unticked. A daily task is never carried: the
 * next visit has it anyway. An order not typed in yet carries nothing, because
 * nobody knows what was left undone.
 */
export function tasksToCarryOver(visit: { tookPlace: boolean; checklist: readonly ChecklistOutcome[] }): string[] {
  return visit.checklist
    .filter((line) => line.frequency === "WEEKLY" || line.frequency === "MONTHLY")
    .filter((line) => !visit.tookPlace || line.done === false)
    .map((line) => line.fileTaskId);
}
