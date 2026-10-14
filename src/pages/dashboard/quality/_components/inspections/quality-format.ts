import * as React from "react";

import { useLocale } from "use-intl";

import { INSPECTIONS_PATH } from "@/features/operations/services/inspections";
import { intlLocaleFor } from "@/i18n/config";

/** What the inspection and corrective-task screens share that is not drawn: addresses, dates. */

/** The page of one inspection, and of its sheet. */
export const inspectionHref = (id: string) => `${INSPECTIONS_PATH}/inspections/${id}`;
export const inspectionSheetHref = (id: string) => `${INSPECTIONS_PATH}/inspections/${id}/print`;

const atMidnight = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * The direction marks `ar-DZ` writes between the parts of a date in digits:
 * made for running Arabic text, they scramble the date inside `<Ltr>`, which
 * already keeps it whole and in order.
 */
const DIRECTION_MARKS = /[\u200e\u200f\u061c]/g;

/** Dates as the reader's language writes them, through `intlLocaleFor`: in digits for tables, in words for headings. */
export function useQualityDates() {
  const locale = useLocale();
  return React.useMemo(() => {
    const tag = intlLocaleFor(locale);
    const digits = new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
    const weekday = new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return {
      /** 12/10/2026 (inside `<Ltr>`). */
      short: (date: string) => digits.format(atMidnight(date)).replace(DIRECTION_MARKS, ""),
      /** الاثنين */
      weekday: (date: string) => weekday.format(atMidnight(date)),
      /** الاثنين، 12 أكتوبر 2026 */
      long: (date: string) => long.format(atMidnight(date)),
    };
  }, [locale]);
}

/** A date or a number kept whole inside a sentence that is not a component (a toast, a dialog's text). */
export const isolate = (text: string) => `\u2066${text}\u2069`;
