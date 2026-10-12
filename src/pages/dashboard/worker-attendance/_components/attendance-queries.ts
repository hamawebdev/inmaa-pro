import {
  WORKER_ATTENDANCE_PATH,
  listAttendanceAbsencesQuery,
  listAttendanceOverviewQuery,
  listWorkerAttendanceHistoryQuery,
} from "@/features/operations/services/worker-attendance";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The tab's three reads, keyed under its own path: refreshing
 * `pathKey(WORKER_ATTENDANCE_PATH)` refreshes every one of them. The dialog
 * asks for the same day as the records view, so TanStack Query reads it once.
 */
export const ATTENDANCE_KEY = pathKey(WORKER_ATTENDANCE_PATH);

export const dayQuery = (date: string) => ({
  queryKey: [...ATTENDANCE_KEY, "day", date],
  queryFn: () => listAttendanceOverviewQuery({ date }),
});

export const absencesQuery = (from: string, to: string) => ({
  queryKey: [...ATTENDANCE_KEY, "absences", from, to],
  queryFn: () => listAttendanceAbsencesQuery({ from, to }),
});

export const historyQuery = (workerId: string, from: string, to: string) => ({
  queryKey: [...ATTENDANCE_KEY, "history", workerId, from, to],
  queryFn: () => listWorkerAttendanceHistoryQuery({ workerId, from, to }),
});
