import { useCallback, useMemo } from "react";

import { useLocale, useTranslations } from "use-intl";

import type { FileAreaLine, FileTaskLine } from "@/features/operations/services/file-tasks";
import { intlLocaleFor } from "@/i18n/config";
import { useCodeLabel } from "@/i18n/use-code-label";
import { WEEKDAYS } from "@/lib/options";

/** Keeps a typed name whole inside a text of either direction, where an element cannot go (an option of a list). */
export const isolate = (text: string) => `⁨${text}⁩`;

/** «المدخل 01 / الطابق 02»: a place with the place it sits under. */
export function placeName(area: Pick<FileAreaLine, "label" | "parentLabel">): string {
  return area.parentLabel ? `${isolate(area.parentLabel)} / ${isolate(area.label)}` : area.label;
}

/** The value a place takes in a list of choices; the whole site has one of its own, as a choice cannot be empty. */
export const WHOLE_SITE = "__site";
export const placeValue = (areaId: string | null) => areaId ?? WHOLE_SITE;
export const placeOfValue = (value: string) => (value === WHOLE_SITE ? null : value);

/** When a task is done, in words: its weekday, its day of the month or its date. Nothing for a daily task. */
export function useTaskTiming() {
  const t = useTranslations("FileTasks");
  const weekdayLabel = useCodeLabel("Options.Weekday");
  const locale = useLocale();
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocaleFor(locale), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    [locale],
  );
  return useCallback(
    (task: Pick<FileTaskLine, "frequency" | "dayOfWeek" | "dayOfMonth" | "specialDate">): string | null => {
      switch (task.frequency) {
        case "DAILY":
          return null;
        case "WEEKLY":
          return task.dayOfWeek === null || WEEKDAYS[task.dayOfWeek] === undefined
            ? t("WeeklyFirst")
            : t("WeeklyDay", { day: weekdayLabel(WEEKDAYS[task.dayOfWeek]) });
        case "MONTHLY":
          return task.dayOfMonth === null ? t("MonthlyFirst") : t("MonthlyFrom", { day: task.dayOfMonth });
        case "SPECIAL":
          return task.specialDate === null
            ? t("SpecialNoDate")
            : t("SpecialOn", { date: format.format(new Date(`${task.specialDate}T00:00:00Z`)) });
      }
    },
    [format, t, weekdayLabel],
  );
}
