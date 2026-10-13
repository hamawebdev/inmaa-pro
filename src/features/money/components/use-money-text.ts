import { useMemo } from "react";

import { useLocale } from "use-intl";

import { intlLocaleFor } from "@/i18n/config";

/** Amounts as every screen writes them: «195.650,00 دج». Foundation's, in src/hooks. */
export { useMoneyText } from "@/hooks/use-money-text";

/** A calendar date as the screens write it: «20 نوفمبر 2026», «20 nov. 2026». */
export function useDateText() {
  const locale = useLocale();
  const code = intlLocaleFor(locale);
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
    };
  }, [code]);
}
