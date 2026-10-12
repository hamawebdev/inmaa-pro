import { noArrivalReported } from "../../rules/arrival-flag";
import {
  addDays,
  clockOf,
  minutesNear,
  minutesOf,
  weekdaysOfCodes,
  type ClockTime,
  type IsoDate,
} from "../../rules/calendar";
import {
  DEFAULT_WORK_TIME_SETTINGS,
  WORK_RULE_LEVEL,
  checkWorkerSeats,
  type Seat,
  type WorkTimeSettings,
} from "../../rules/working-time";
import type { Sex, VisitStatus, WorkRuleCode } from "../../validators/option-codes";
import type { ReturnedOrderValues, ReturnedWorkerValues } from "../../validators/returned-order";

import type { VisitEntryData, VisitEntryWorker } from "./visit-entry-data";

/**
 * The notes the visit page shows beside its fields while the office types a
 * returned order: what the rules say about the times written, and what saving
 * will do. None of them blocks the Save; the validator does that.
 *
 * Each note names a message (`VisitEntry.Notes.<code>`) and its values, and
 * sits beside the field it concerns.
 */

export type NoteTone = "info" | "warning" | "danger";

export type EntryNoteCode =
  | "NO_ARRIVAL_REPORTED"
  | "LATE"
  | "LATE_NO_REASON"
  | "ARRIVAL_NOT_INITIALLED"
  | "DEPARTURE_NOT_INITIALLED"
  | WorkRuleCode
  | "FULL_WITH_UNTICKED"
  | "PERCENT_DISAGREES"
  | "BECOMES_DONE"
  | "BECOMES_PROBLEM"
  | "OPENS_COMPLAINT"
  | "PROPOSES_EXTRA_VISIT"
  | "LEAD_FOR_CLIENTS";

export interface EntryNote {
  code: EntryNoteCode;
  tone: NoteTone;
  values?: Record<string, string | number>;
}

/** The notes of one worker's line, by the field they sit beside. */
export interface WorkerNotes {
  /** Beside her name: the day itself (rest day, leave, not available). */
  worker: EntryNote[];
  arrivedTime: EntryNote[];
  workStartTime: EntryNote[];
  workEndTime: EntryNote[];
  leftTime: EntryNote[];
  lateReason: EntryNote[];
  initials: EntryNote[];
}

export interface EntryNotes {
  /** At the head of the page. */
  visit: EntryNote[];
  workers: WorkerNotes[];
  completion: EntryNote[];
  completionPercent: EntryNote[];
  needsExtraVisit: EntryNote[];
  signoff: EntryNote[];
  otherService: EntryNote[];
}

export interface EntryNoteSettings {
  arrivalGraceMin: number;
  workTime: WorkTimeSettings;
}

export const DEFAULT_ENTRY_NOTE_SETTINGS: EntryNoteSettings = {
  arrivalGraceMin: 15,
  workTime: DEFAULT_WORK_TIME_SETTINGS,
};

/** "44:30" for 2670 minutes. */
export function hoursAndMinutes(totalMin: number): string {
  const minutes = Math.max(0, Math.round(totalMin));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Where each working-time finding sits on the worker's line, and how loudly. */
const RULE_FIELD: Record<WorkRuleCode, keyof WorkerNotes> = {
  OVERLAP: "workStartTime",
  NIGHT_WOMAN: "workStartTime",
  DAY_SPAN_12H: "workEndTime",
  DAY_OVER_8H: "workEndTime",
  WEEK_OVER_CAPACITY: "workEndTime",
  WEEK_OVERTIME: "workEndTime",
  WEEK_OVER_48H: "workEndTime",
  NO_REST_DAY: "workEndTime",
  UNAVAILABLE_DAY: "worker",
  ON_LEAVE: "worker",
  REST_DAY_WORKED: "worker",
};

/** The work happened: a rule the manager must approve is a warning here, and a clash is likely a typing error. */
function ruleTone(code: WorkRuleCode): NoteTone {
  const level = WORK_RULE_LEVEL[code];
  if (level === "REFUSED") return "danger";
  if (level === "FLAG") return "info";
  return "warning";
}

function emptyWorkerNotes(): WorkerNotes {
  return {
    worker: [],
    arrivedTime: [],
    workStartTime: [],
    workEndTime: [],
    leftTime: [],
    lateReason: [],
    initials: [],
  };
}

/**
 * The seat this worker actually held, from the times written: from the start
 * of work (or her arrival) to the end of work (or her departure). A time not
 * written yet falls back on the plan.
 */
export function workedSeat(
  data: Pick<VisitEntryData, "visit" | "site">,
  times: Pick<ReturnedWorkerValues, "arrivedTime" | "workStartTime" | "workEndTime" | "leftTime">,
): Seat {
  const planned = data.visit.plannedStartTime;
  const startText = times.workStartTime || times.arrivedTime;
  const endText = times.workEndTime || times.leftTime;
  const start = startText ? minutesNear(startText, planned) : minutesOf(planned);
  const end = endText ? minutesNear(endText, planned) : start + data.visit.plannedDurationMin;
  const durationMin = end > start ? end - start : data.visit.plannedDurationMin;
  return {
    visitId: data.visit.id,
    siteId: data.site.id,
    date: addDays(data.visit.visitDate, Math.floor(start / 1440)),
    startTime: clockOf(start),
    durationMin,
  };
}

function workerNotesOf(
  data: VisitEntryData,
  entry: VisitEntryWorker,
  values: ReturnedWorkerValues,
  settings: EntryNoteSettings,
): WorkerNotes {
  const notes = emptyWorkerNotes();
  if (!values.attended) return notes;

  if (values.arrivedTime) {
    const late = minutesNear(values.arrivedTime, data.visit.plannedStartTime) - minutesOf(data.visit.plannedStartTime);
    if (late > 0) {
      notes.arrivedTime.push({
        code: "LATE",
        tone: late > settings.arrivalGraceMin ? "warning" : "info",
        values: { minutes: late },
      });
      if (late > settings.arrivalGraceMin && values.lateReason.trim() === "") {
        notes.lateReason.push({ code: "LATE_NO_REASON", tone: "warning" });
      }
    }
    if (!values.arrivalInitialled) notes.initials.push({ code: "ARRIVAL_NOT_INITIALLED", tone: "info" });
  }
  if (values.leftTime && !values.departureInitialled) {
    notes.initials.push({ code: "DEPARTURE_NOT_INITIALLED", tone: "info" });
  }

  const seat = workedSeat(data, values);
  const findings = checkWorkerSeats(
    {
      sex: entry.worker.sex as Sex,
      weeklyCapacityMin: entry.worker.weeklyCapacityMin,
      availableWeekdays: weekdaysOfCodes(entry.worker.availableDays),
      absentDates: entry.absentDates,
    },
    [...entry.otherSeats, seat],
    settings.workTime,
  ).filter((finding) => finding.visitIds.includes(data.visit.id));

  for (const finding of findings) {
    const noteValues: Record<string, string | number> = {};
    if (finding.valueMin !== undefined) noteValues.duration = hoursAndMinutes(finding.valueMin);
    notes[RULE_FIELD[finding.code]].push({ code: finding.code, tone: ruleTone(finding.code), values: noteValues });
  }
  return notes;
}

/**
 * All the notes of the page for what is typed so far.
 *
 * `clock` is the centre's own date and time, for the "no arrival reported"
 * flag: it shows while the visit should have started and no arrival is typed.
 */
export function entryNotes(
  data: VisitEntryData,
  values: ReturnedOrderValues,
  clock: { today: IsoDate; nowTime: ClockTime },
  settings: EntryNoteSettings = DEFAULT_ENTRY_NOTE_SETTINGS,
): EntryNotes {
  const arrivalTyped = values.workers.some((worker) => worker.attended && worker.arrivedTime !== "");
  const visit: EntryNote[] = [];
  if (
    noArrivalReported(
      {
        date: data.visit.visitDate,
        plannedStartTime: data.visit.plannedStartTime,
        status: data.visit.status as VisitStatus,
        arrivalReported: data.visit.arrivalReportedAt !== null || arrivalTyped,
      },
      clock,
      settings.arrivalGraceMin,
    )
  ) {
    visit.push({ code: "NO_ARRIVAL_REPORTED", tone: "danger" });
  }

  const workers = data.workers.map((entry, index) =>
    values.workers[index] ? workerNotesOf(data, entry, values.workers[index], settings) : emptyWorkerNotes(),
  );

  const kinds = new Map(data.checklist.map((item) => [item.id, item.kind]));
  const unticked = values.checklist.filter((line) => kinds.get(line.id) !== "DEPARTURE" && !line.done).length;

  const completion: EntryNote[] = [];
  const completionPercent: EntryNote[] = [];
  if (values.completion === "FULL" && unticked > 0) {
    completion.push({ code: "FULL_WITH_UNTICKED", tone: "warning", values: { count: unticked } });
  }
  const percent = values.completionPercent;
  if (
    percent !== null &&
    ((values.completion === "FULL" && percent < 100) ||
      (values.completion === "PARTIAL" && (percent === 0 || percent === 100)) ||
      (values.completion === "NOT_DONE" && percent === 100))
  ) {
    completionPercent.push({ code: "PERCENT_DISAGREES", tone: "warning" });
  }
  if (values.completion === "FULL" || values.completion === "PARTIAL") {
    completion.push({ code: "BECOMES_DONE", tone: "info" });
  } else if (values.completion === "NOT_DONE") {
    completion.push({ code: "BECOMES_PROBLEM", tone: "info" });
  }

  return {
    visit,
    workers,
    completion,
    completionPercent,
    needsExtraVisit: values.needsExtraVisit ? [{ code: "PROPOSES_EXTRA_VISIT", tone: "info" }] : [],
    signoff: values.signoffStatus === "NOT_ACCEPTED" ? [{ code: "OPENS_COMPLAINT", tone: "info" }] : [],
    otherService: values.wantsOtherService ? [{ code: "LEAD_FOR_CLIENTS", tone: "info" }] : [],
  };
}
