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
import { useTranslations } from "use-intl";

import { StatCard } from "@/components/stat-card";
import { boardCounts, boardRows } from "@/features/operations/components/day-board/day-board-data";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useCodeLabel } from "@/i18n/use-code-label";

import { useDayBoardVisits } from "./use-today-board";

/**
 * Today's visits by status: the default for the home screen's `today` slot,
 * drawn from Operations' own board data until Operations fills the slot
 * (src/lib/home/slots.ts).
 *
 * Nearest academy screen: the overview's "general statistics" row. Every tile
 * leads to the day board in «طلبات الخدمة», and wears that section's hue.
 */
const STATUSES: ReadonlyArray<{ status: string; icon: LucideIcon }> = [
  { status: "CONFIRMED", icon: CalendarCheck },
  { status: "AWAITING_CONFIRMATION", icon: Hourglass },
  { status: "IN_PROGRESS", icon: Timer },
  { status: "DONE", icon: CircleCheckBig },
  { status: "PROBLEM", icon: TriangleAlert },
  { status: "CANCELLED", icon: CircleX },
];

export function TodayTiles() {
  const t = useTranslations("Home");
  const statusLabel = useCodeLabel("VisitStatuses");
  const clock = useCentreClock();
  const board = useDayBoardVisits(clock.today);
  const counts = boardCounts(boardRows(board.data ?? [], clock));
  const of = (status: string) => counts.byStatus.find((entry) => entry.status === status)?.count ?? 0;
  const value = (count: number) => (board.isPending ? "…" : count);

  return (
    <div className="grid min-w-0 grid-cols-2 gap-5 md:grid-cols-4 tall:gap-6">
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
