import { useState } from "react";

import { PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
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
import { addDays } from "@/features/operations/rules/calendar";
import { localDate } from "@/lib/units";

import { CallsView } from "./_components/calls-view";

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
  const params = useSearchParams();
  const listParam = params.get("list");
  const list: VisitList | null = listParam === "not-returned" || listParam === "awaiting" ? listParam : null;
  const calls = listParam === "calls";
  const callsDate = params.get("date") ?? addDays(clock.today, 1);
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
      actions={!list && !calls && board.data ? <DayBoardCounts visits={board.data} clock={clock} /> : undefined}
    >
      {calls ? (
        <CallsView date={callsDate} />
      ) : list ? (
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
          controls={
            // Tomorrow's calls to the clients (#16), with their results; the list prints from there.
            <Button variant="outline" size="sm" asChild className="ms-auto">
              <Link to={`${VISITS_PATH}?list=calls&date=${addDays(clock.today, 1)}`}>
                <PhoneCall />
                {t("CallList")}
              </Link>
            </Button>
          }
        />
      )}
    </SectionScreen>
  );
}
