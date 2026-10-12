import { useQuery } from "@tanstack/react-query";

import { listDayBoardQuery } from "@/features/operations/services/board";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { pathKey } from "@/lib/compat/revalidate";
import { localDate } from "@/lib/units";

/**
 * One day of Operations' board, under the same key as their visits tab, so
 * that a visit saved anywhere refreshes both.
 */
export function useDayBoardVisits(date: string) {
  return useQuery({
    queryKey: [...pathKey(VISITS_PATH), "board", date],
    queryFn: () => listDayBoardQuery({ date: localDate(date) }),
  });
}
