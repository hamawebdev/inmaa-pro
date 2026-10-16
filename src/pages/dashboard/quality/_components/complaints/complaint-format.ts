import { useTranslations } from "use-intl";

import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

import { QUALITY_PATH } from "../quality-views";

/** What the quality screens share that is not a component: the query key, isolated text, names, durations. */

/** Under the tab's key: the actions revalidate `/dashboard/quality`, which refreshes every list and page below it. */
export const qualityKey = (...parts: string[]) => [...pathKey(QUALITY_PATH), ...parts];

/** A date or a number kept whole inside a sentence that is not a component (a toast, a title). */
export const isolate = (text: string) => `⁦${text}⁩`;

export const workerName = (worker: { firstName: string; lastName: string }) => staffName(worker);

/** Office minutes, as hours and minutes. */
export function useDuration() {
  const t = useTranslations("Complaints");
  return (minutes: number) => {
    const whole = Math.abs(Math.round(minutes));
    const hours = Math.floor(whole / 60);
    const rest = whole % 60;
    if (hours === 0) return t("Minutes", { minutes: rest });
    return rest === 0 ? t("Hours", { hours }) : t("HoursMinutes", { hours, minutes: rest });
  };
}
