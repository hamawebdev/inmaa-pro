import { useMemo } from "react";

import { useLocale } from "use-intl";

import { intlLocaleFor } from "@/i18n/config";
import { toLocal } from "@/lib/clock";
import { programClock } from "@/lib/service/program";

/**
 * A calendar date as the program's screens write it, in the reader's language:
 * «12 أكتوبر 2026», «12 oct. 2026», "Oct 12, 2026". Printed sheets keep his
 * «12/10/2026».
 *
 *     const dates = useDateText();
 *     dates.long("2026-10-12");             // a LocalDate
 *     dates.ofInstant(row.occurredAt);      // an instant, on the centre's calendar
 *
 * Inside Arabic text the result needs no `<Ltr>`: the month is a word.
 */
export function useDateText() {
  const code = intlLocaleFor(useLocale());
  return useMemo(() => {
    // Read at noon UTC and written in UTC: a calendar date never moves a day.
    const long = new Intl.DateTimeFormat(code, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const short = new Intl.DateTimeFormat(code, { day: "numeric", month: "short", timeZone: "UTC" });
    const month = new Intl.DateTimeFormat(code, { month: "short", year: "numeric", timeZone: "UTC" });
    const at = (date: string) => new Date(`${date}T12:00:00Z`);
    return {
      long: (date: string) => long.format(at(date)),
      short: (date: string) => short.format(at(date)),
      /** A month given as `YYYY-MM`. */
      month: (yearMonth: string) => month.format(at(`${yearMonth}-15`)),
      /** The centre's calendar date of an instant (ISO text), written as `long`. */
      ofInstant: (instant: string) => {
        const clock = programClock();
        return long.format(at(toLocal(instant, clock.utcOffsetMin).date));
      },
    };
  }, [code]);
}
