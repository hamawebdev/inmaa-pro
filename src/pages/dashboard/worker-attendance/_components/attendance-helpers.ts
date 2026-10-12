import * as React from "react";

import { useLocale } from "use-intl";

import type { AbsenceStatus } from "@/features/operations/services/absences";
import type { AttendanceWorker } from "@/features/operations/services/worker-attendance";
import { intlLocaleFor } from "@/i18n/config";
import { currentSession, hasSession, sectionLevel } from "@/lib/access/session";

/** What the views of «الحضور والغياب» share that is not drawn: rights, names, dates. */

/** Recording or cancelling an absence takes the requests section or the workers' section, written. */
export function mayRecordAbsence(): boolean {
  if (!hasSession()) return true;
  const session = currentSession();
  return sectionLevel(session, "REQUESTS") === "WRITE" || sectionLevel(session, "WORKERS") === "WRITE";
}

/** An absence that still counts can be cancelled; a leave asked for is withdrawn the same way. */
export const CANCELLABLE: readonly AbsenceStatus[] = ["RECORDED", "APPROVED", "REQUESTED"];

export const workerName = (worker: Pick<AttendanceWorker, "firstName" | "lastName">) =>
  `${worker.lastName} ${worker.firstName}`;

const atMidnight = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * The direction marks `ar-DZ` writes between the parts of a date in digits:
 * made for running Arabic text, they scramble the date inside `<Ltr>`, which
 * already keeps it whole and in order.
 */
const DIRECTION_MARKS = /[‎‏؜]/g;

/**
 * Dates as the reader's language writes them, every one through
 * `intlLocaleFor`: in digits for the tables (inside `<Ltr>`), in words for the
 * headings (as the day board writes its day).
 */
export function useDates() {
  const locale = useLocale();
  return React.useMemo(() => {
    const tag = intlLocaleFor(locale);
    const digits = (options: Intl.DateTimeFormatOptions) => {
      const format = new Intl.DateTimeFormat(tag, { ...options, timeZone: "UTC" });
      return (date: string) => format.format(atMidnight(date)).replace(DIRECTION_MARKS, "");
    };
    const words = (options: Intl.DateTimeFormatOptions) => {
      const format = new Intl.DateTimeFormat(tag, { ...options, timeZone: "UTC" });
      return (date: string) => format.format(atMidnight(date));
    };
    const month = words({ month: "long", year: "numeric" });
    return {
      /** 12/10/2026 */
      short: digits({ day: "2-digit", month: "2-digit", year: "numeric" }),
      /** 12/10 */
      dayMonth: digits({ day: "2-digit", month: "2-digit" }),
      /** الاثنين */
      weekday: words({ weekday: "short" }),
      /** الاثنين، 12 أكتوبر 2026 */
      long: words({ weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      /** أكتوبر 2026 */
      month: (yearMonth: string) => month(`${yearMonth}-01`),
    };
  }, [locale]);
}
