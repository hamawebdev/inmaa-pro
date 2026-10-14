import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  CalendarCheck,
  CalendarDays,
  CircleCheckBig,
  CircleX,
  Hourglass,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { StatCard } from "@/components/stat-card";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { localDate } from "@/lib/units";

import { DayBoard } from "../day-board/day-board";
import { boardCounts, boardRows, type ArrivalVia } from "../day-board/day-board-data";
import { listDayBoardQuery } from "../../services/board";
import { VISITS_PATH } from "../../services/programme";
import { reportArrivalAction } from "../../services/visit-entry";

/**
 * What the home screen shows about the day (src/lib/home/slots.ts): today's
 * visits counted by status, three tiles to a row as the academy's overview
 * lays its statistics, and the day board itself. Every tile opens the board.
 */

const STATUSES: ReadonlyArray<{ status: string; icon: LucideIcon }> = [
  { status: "CONFIRMED", icon: CalendarCheck },
  { status: "AWAITING_CONFIRMATION", icon: Hourglass },
  { status: "IN_PROGRESS", icon: Timer },
  { status: "DONE", icon: CircleCheckBig },
  { status: "PROBLEM", icon: TriangleAlert },
  { status: "CANCELLED", icon: CircleX },
];

function useDay(date: string) {
  return useQuery({
    queryKey: [...pathKey(VISITS_PATH), "board", date],
    queryFn: () => listDayBoardQuery({ date: localDate(date) }),
  });
}

export function TodayTiles() {
  const t = useTranslations("OperationsHome");
  const statusLabel = useCodeLabel("VisitStatuses");
  const clock = useCentreClock();
  const board = useDay(clock.today);
  const counts = boardCounts(boardRows(board.data ?? [], clock));
  const of = (status: string) => counts.byStatus.find((entry) => entry.status === status)?.count ?? 0;
  const value = (count: number) => (board.isPending ? "…" : count);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 tall:gap-6">
      <StatCard
        label={t("TodayVisits")}
        value={value(counts.total)}
        hint={t("TodayVisitsHint")}
        icon={CalendarDays}
        tone="requests"
        href={VISITS_PATH}
      />
      {STATUSES.map(({ status, icon }) => (
        <StatCard
          key={status}
          label={statusLabel(status)}
          value={value(of(status))}
          icon={icon}
          tone="requests"
          href={VISITS_PATH}
        />
      ))}
      <StatCard
        label={t("NoArrival")}
        value={value(counts.noArrival)}
        hint={t("NoArrivalHint")}
        icon={BellRing}
        tone="requests"
        href={VISITS_PATH}
      />
    </div>
  );
}

export function HomeDayBoard() {
  const t = useTranslations("DayBoard");
  const errorMessage = useErrorMessage();
  const clock = useCentreClock();
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const [date, setDate] = useState(clock.today);
  const board = useDay(date);
  const reportArrival = async (visitId: string, via: ArrivalVia) => {
    const result = await reportArrivalAction({ visitId, via });
    if (result.success) toast.success(t("ArrivalLogged"));
    else toast.error(errorMessage(result.error, t("SaveFailed")));
  };
  return (
    <DayBoard
      date={date}
      onDateChange={setDate}
      visits={board.data ?? []}
      loading={board.isPending}
      clock={clock}
      onReportArrival={mayWrite ? reportArrival : undefined}
    />
  );
}
