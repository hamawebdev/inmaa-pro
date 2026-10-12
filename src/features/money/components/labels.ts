import { useCallback } from "react";

import { useTranslations } from "use-intl";

import { useCodeLabel } from "@/i18n/use-code-label";

/**
 * The labels of the lines money is counted on: his four divisions, from the
 * shared list (`Options.Division`, Foundation's), and «عام», the line of the
 * expenses that belong to none of them, which is Money's own.
 */
export function useDivisionLabel(): (code: string | null | undefined) => string {
  const division = useCodeLabel("Options.Division");
  const t = useTranslations("MoneyCodes.Divisions");
  return useCallback((code) => (code === "COMMON" ? t("COMMON") : division(code)), [division, t]);
}

/** «طريقة السداد» / «طريقة الدفع»: one list for every owner, Foundation's. */
export function usePaymentMethodLabel(): (code: string | null | undefined) => string {
  return useCodeLabel("Options.PaymentMethod");
}
