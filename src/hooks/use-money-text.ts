import { useCallback } from "react";

import { useTranslations } from "use-intl";

import { formatMoney } from "@/lib/units";

/**
 * An amount in centimes as every screen writes it: the program's one money
 * format, then the currency word of the reader's language.
 *
 *     const money = useMoneyText();
 *     money(19_565_000); // «195.650,00 دج», "195.650,00 DA"
 *
 * Display only. On a printed sheet, which is always Arabic, use
 * `formatMoneyAr` from src/lib/units. Inside Arabic text put the result in
 * `<Ltr>` where a minus sign could move.
 */
export function useMoneyText(): (amount: number) => string {
  const t = useTranslations("Common");
  const currency = t("Currency");
  return useCallback((amount: number) => `${formatMoney(amount)} ${currency}`, [currency]);
}
