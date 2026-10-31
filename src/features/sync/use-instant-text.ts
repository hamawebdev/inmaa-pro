import { useCallback } from "react";

import { useDateText } from "@/hooks/use-date-text";
import { toLocal } from "@/lib/clock";
import { programClock } from "@/lib/service/program";

/**
 * A stored instant as the sync screens say it: the centre's calendar date in
 * words («31 أكتوبر 2026») and its clock time («09:40», to be put in `<Ltr>`).
 */
export function useInstantText(): (instant: string) => { date: string; time: string } {
  const dates = useDateText();
  return useCallback(
    (instant: string) => ({
      date: dates.ofInstant(instant),
      time: toLocal(instant, programClock().utcOffsetMin).time,
    }),
    [dates],
  );
}
