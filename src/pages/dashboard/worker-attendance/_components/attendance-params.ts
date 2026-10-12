import { addDays, isIsoDate } from "@/features/operations/rules/calendar";
import { WORKER_ATTENDANCE_PATH } from "@/features/operations/services/worker-attendance";

/**
 * What the tab shows, kept in the address as every other tab keeps its own:
 * which view (`view`), which day of the records (`day`), which month of the
 * absences or of a worker's history (`month`), and whose history (`worker`).
 * A reload, Back and the row links then all land where the office was.
 */

export const ATTENDANCE_VIEWS = ["records", "absences"] as const;
export type AttendanceView = (typeof ATTENDANCE_VIEWS)[number];

export interface AttendanceParams {
  view: AttendanceView;
  /** "YYYY-MM-DD", or null for today. */
  day: string | null;
  /** "YYYY-MM", or null for the month of the day. */
  month: string | null;
  /** A worker whose history is open. */
  worker: string | null;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function readAttendanceParams(search: URLSearchParams): AttendanceParams {
  const view = search.get("view");
  const day = search.get("day");
  const month = search.get("month");
  return {
    view: view === "absences" ? "absences" : "records",
    day: day && isIsoDate(day) ? day : null,
    month: month && MONTH.test(month) ? month : null,
    worker: search.get("worker") || null,
  };
}

/** The address of the tab with these parameters; the records view and empty values are left out. */
export function attendanceHref(params: Partial<AttendanceParams>): string {
  const search = new URLSearchParams();
  if (params.view && params.view !== "records") search.set("view", params.view);
  if (params.day) search.set("day", params.day);
  if (params.month) search.set("month", params.month);
  if (params.worker) search.set("worker", params.worker);
  const query = search.toString();
  return query ? `${WORKER_ATTENDANCE_PATH}?${query}` : WORKER_ATTENDANCE_PATH;
}

/** "YYYY-MM" of a date. */
export const monthOfDate = (date: string) => date.slice(0, 7);

/** The first and last day of a month. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(`${shiftMonth(month, 1)}-01`, -1) };
}

/** The month `delta` months after this one. */
export function shiftMonth(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
