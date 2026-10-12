import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { PrintButton } from "@/components/print";
import { Skeleton } from "@/components/ui/skeleton";
import { isIsoDate } from "@/features/operations/rules/calendar";
import { getSupervisorDaySheetQuery, recordDaySheetPrintedAction } from "@/features/operations/services/day-sheets";
import { sampleDaySheet } from "@/features/operations/sheets/samples";
import { SupervisorDaySheet } from "@/features/operations/sheets/supervisor-day-sheet";
import { pathKey } from "@/lib/compat/revalidate";
import { localDate } from "@/lib/units";

/**
 * One supervisor's day sheet, to print. Section «الموظفون», below «المشرفون والمناطق».
 * The path carries the supervisor and the date; `blank` in the supervisor's
 * place prints an empty sheet to fill by hand.
 *
 * Closest academy screen: students/[id]/card/page.tsx (a page that shows what
 * will be printed, with the print button in its heading).
 */
export default function SupervisorDaySheetPrintPage() {
  const { id = "", date = "" } = useParams();
  const t = useTranslations("OperationsSheets");
  const tNav = useTranslations("Nav");
  const blank = id === "blank" || !isIsoDate(date);
  const sheet = useQuery({
    queryKey: [...pathKey("/dashboard/supervisors"), id, "day", date],
    queryFn: () => getSupervisorDaySheetQuery({ supervisorId: id, date: localDate(date) }),
    enabled: !blank,
  });

  // The sheet names the team and their phones: its printing is logged.
  useEffect(() => {
    if (blank) return;
    const recordPrint = () =>
      void recordDaySheetPrintedAction({ sheet: "SUPERVISOR_DAY", date: localDate(date), supervisorId: id });
    window.addEventListener("beforeprint", recordPrint);
    return () => window.removeEventListener("beforeprint", recordPrint);
  }, [blank, date, id]);

  return (
    <DetailScreen
      section="employees"
      title={t("DaySheet.Title")}
      description={t("DaySheet.Description")}
      back={{ href: "/dashboard/supervisors", label: tNav("Supervisors") }}
      actions={<PrintButton />}
    >
      {blank ? (
        <SupervisorDaySheet sheet={sampleDaySheet("blank")} />
      ) : sheet.isError ? (
        <ErrorState onRetry={() => void sheet.refetch()} />
      ) : sheet.data ? (
        <SupervisorDaySheet sheet={sheet.data} />
      ) : (
        <Skeleton className="h-[297mm] w-[210mm] max-w-full" />
      )}
    </DetailScreen>
  );
}
