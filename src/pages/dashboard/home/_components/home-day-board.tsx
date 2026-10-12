import { useState } from "react";

import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { DayBoard } from "@/features/operations/components/day-board/day-board";
import type { ArrivalVia } from "@/features/operations/components/day-board/day-board-data";
import { reportArrivalAction } from "@/features/operations/services/visit-entry";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useErrorMessage } from "@/i18n/errors";

import { useDayBoardVisits } from "./use-today-board";

/**
 * Operations' day board on the home screen: the default for the `board` slot,
 * wired exactly as their visits tab wires it, until Operations fills the slot
 * (src/lib/home/slots.ts).
 */
export function HomeDayBoard() {
  const t = useTranslations("Home");
  const errorMessage = useErrorMessage();
  const clock = useCentreClock();
  const [date, setDate] = useState(clock.today);
  const board = useDayBoardVisits(date);

  const reportArrival = async (visitId: string, via: ArrivalVia) => {
    const result = await reportArrivalAction({ visitId, via });
    if (result.success) toast.success(t("ArrivalLogged"));
    else toast.error(errorMessage(result.error, t("SaveFailed")));
  };

  if (board.isError) return <ErrorState onRetry={() => void board.refetch()} />;
  return (
    <DayBoard
      date={date}
      onDateChange={setDate}
      visits={board.data ?? []}
      loading={board.isPending}
      clock={clock}
      onReportArrival={reportArrival}
    />
  );
}
