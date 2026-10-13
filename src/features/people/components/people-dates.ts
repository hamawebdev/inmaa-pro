import * as React from "react";

import { useLocale } from "use-intl";

import { intlLocaleFor, type Locale } from "@/i18n/config";

/**
 * Dates as the reader's language writes them: in digits for a table (inside
 * `<Ltr>`), in words for a heading.
 */
export function usePeopleDates() {
  const locale = useLocale() as Locale;
  return React.useMemo(() => {
    const tag = intlLocaleFor(locale);
    const at = (date: string) => new Date(`${date}T00:00:00Z`);
    const digits = new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
    const month = new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" });
    return {
      /** 12/10/2026. The direction marks `ar-DZ` adds are for running text: inside `<Ltr>` they scramble the date. */
      short: (date: string) => digits.format(at(date)).replace(/[‎‏؜]/g, ""),
      /** أكتوبر 2026 */
      month: (yearMonth: string) => month.format(at(`${yearMonth}-01`)),
      /** الاثنين */
      weekday: (date: string) => weekday.format(at(date)),
    };
  }, [locale]);
}
