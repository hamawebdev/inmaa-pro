import { useCallback } from "react";

import { useLocale, useTranslations } from "use-intl";

import { intlLocaleFor } from "@/i18n/config";

/**
 * Formats an amount the way the rest of the app does: the number grouped for
 * the active locale, then the translated currency word.
 *
 * Deliberately not `Intl.NumberFormat({ style: "currency" })`. ICU renders DZD
 * as "DZD 1,500" in English and "د.ج." in Arabic — neither matches the "DA" the
 * academy actually prints on its receipts, and the two disagree with each other.
 * The symbol is a translated string so every locale shows the same thing the
 * paper does.
 */
export function useFormatCurrency() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const localeCode = intlLocaleFor(locale);

  return useCallback((amount: number) => `${amount.toLocaleString(localeCode)} ${t("Currency")}`, [localeCode, t]);
}
