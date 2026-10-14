import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { SectionScreen } from "@/components/section-screen";
import { DayBoard, DayBoardCounts } from "@/features/operations/components/day-board/day-board";
import type { ArrivalVia } from "@/features/operations/components/day-board/day-board-data";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { listDayBoardQuery } from "@/features/operations/services/board";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { reportArrivalAction } from "@/features/operations/services/visit-entry";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";
import { localDate } from "@/lib/units";

import { VisitsToAct, type VisitList } from "./_components/visits-to-act";

/**
 * Section «طلبات الخدمة», tab «الزيارات»: the day board, one day of visits from
 * the database. Foundation mounts the same board on the home screen.
 *
 * Closest academy screen: the attendance overview
 * (pages/dashboard/attendance/_components/staff-attendance-overview.tsx), a
 * searchable table of people with row buttons, here a day of visits.
 */
export default function VisitsPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("DayBoard");
  const errorMessage = useErrorMessage();
  const clock = useCentreClock();
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const [date, setDate] = useState(clock.today);
  const listParam = useSearchParams().get("list");
  const list: VisitList | null = listParam === "not-returned" || listParam === "awaiting" ? listParam : null;
  const board = useQuery({
    queryKey: [...pathKey(VISITS_PATH), "board", date],
    queryFn: () => listDayBoardQuery({ date: localDate(date) }),
  });

  const reportArrival = async (visitId: string, via: ArrivalVia) => {
    const result = await reportArrivalAction({ visitId, via });
    if (result.success) toast.success(t("ArrivalLogged"));
    else toast.error(errorMessage(result.error, t("SaveFailed")));
  };

  return (
    <SectionScreen
      section="requests"
      title={tNav("Visits")}
      actions={!list && board.data ? <DayBoardCounts visits={board.data} clock={clock} /> : undefined}
    >
      {list ? (
        <VisitsToAct kind={list} />
      ) : board.isError ? (
        <ErrorState onRetry={() => void board.refetch()} />
      ) : (
        <DayBoard
          date={date}
          onDateChange={setDate}
          visits={board.data ?? []}
          loading={board.isPending}
          clock={clock}
          onReportArrival={mayWrite ? reportArrival : undefined}
          showCounts={false}
        />
      )}
    </SectionScreen>
  );
}
