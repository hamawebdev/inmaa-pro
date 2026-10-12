import { useCallback, useMemo } from "react";

import { useLocale, useTranslations } from "use-intl";

import { intlLocaleFor } from "@/i18n/config";

import { formatMoney, type Centimes } from "../rules/centimes";

/**
 * Amounts in centimes as the screens write them: the one money format
 * (`formatMoney`, «195.650,00»), then the currency word of the language
 * («دج», «DA»), in every language, as the academy's finance tiles do.
 * Display only: nothing computed here is stored.
 *
 *     const money = useMoneyText();
 *     money(4_567_500); // «45.675,00 دج»
 */
export function useMoneyText(): (amount: Centimes) => string {
  const t = useTranslations("Common");
  const currency = t("Currency");
  return useCallback((amount: Centimes) => `${formatMoney(amount)} ${currency}`, [currency]);
}

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
