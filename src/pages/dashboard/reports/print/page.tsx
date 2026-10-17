import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { centreToday } from "@/features/money/components/centre-today";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { readPeriod } from "@/features/money/rules/period";
import { getPeriodAnalyticsAction } from "@/features/money/services/analytics";
import { REPORTS_PATH } from "@/features/money/services/paths";
import { getPeriodReportQuery, recordReportPrintedAction } from "@/features/money/services/reports";
import { PeriodReportSheet } from "@/features/money/sheets/period-report-sheet";
import { useBranches } from "@/hooks/use-branches";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";
import { localDate } from "@/lib/units";

/**
 * «تقرير الفترة» on paper, for the period chosen on the reports screen (the same `?preset=`, `?from=`,
 * `?to=`). Closest academy screen: none prints a report; the page follows the print sample
 * (settings/print-sample), below the screen it prints. The sheet names workers and clients: its print
 * is recorded first, as a disclosure.
 */
export default function ReportPrintPage() {
  const t = useTranslations("Reports");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const today = centreToday();
  const params = useSearchParams();
  const period = readPeriod(params, today);
  const branchId = params.get("branch");
  const { branches } = useBranches();
  const branchName = branchId ? (branches.find((branch) => branch.id === branchId)?.name ?? null) : null;
  const { data: report } = useQuery({
    queryKey: [...pathKey(REPORTS_PATH), period.from, period.to, branchId ?? ""],
    queryFn: () => getPeriodReportQuery({ from: localDate(period.from), to: localDate(period.to), branchId }),
  });
  const { data: analytics } = useQuery({
    queryKey: [...pathKey(REPORTS_PATH), "analytics", period.from, period.to, branchId ?? ""],
    queryFn: async () => {
      const result = await getPeriodAnalyticsAction({ from: period.from, to: period.to, branchId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  async function record() {
    const result = await recordReportPrintedAction({ from: period.from, to: period.to });
    if (!result.success) toast.error(errorMessage(result.error, t("PrintNotRecorded")));
    return result.success;
  }

  return (
    <DetailScreen
      section="money"
      title={t("PrintTitle")}
      back={{ href: `${REPORTS_PATH}?${params.toString()}`, label: tNav("Reports") }}
      actions={report && analytics ? <PrintButton onPrint={record} /> : undefined}
    >
      {report && analytics ? (
        <PeriodReportSheet data={{ report, analytics, printedOn: today, branchName }} />
      ) : (
        <ScreenSkeleton />
      )}
    </DetailScreen>
  );
}
