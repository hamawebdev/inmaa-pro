import { useMemo } from "react";

import { useLocale } from "use-intl";

import { intlLocaleFor } from "@/i18n/config";

/**
 * A calendar date as the program's screens write it, in the reader's
 * language: «12 أكتوبر 2026», «12 oct. 2026» (as the visits and invoices
 * screens do). Printed sheets keep his «12/10/2026».
 */
export function useDateText() {
  const code = intlLocaleFor(useLocale());
  return useMemo(() => {
    // Read at noon UTC and written in UTC: a calendar date never moves a day.
    const long = new Intl.DateTimeFormat(code, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return { long: (date: string) => long.format(new Date(`${date}T12:00:00Z`)) };
  }, [code]);
}
