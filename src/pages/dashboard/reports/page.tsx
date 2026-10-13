import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { centreToday } from "@/features/money/components/centre-today";
import { PeriodFilter } from "@/features/money/components/period-filter";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { readPeriod } from "@/features/money/rules/period";
import { REPORTS_PATH } from "@/features/money/services/paths";
import { getPeriodReportQuery } from "@/features/money/services/reports";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";
import { AGGREGATE_QUERY_OPTIONS } from "@/lib/query-client";
import { localDate } from "@/lib/units";

import { ReportView } from "./_components/report-view";

/**
 * Section «المصاريف والمداخيل», tab «التقارير والمؤشرات»: the result of a
 * period per division, the indicators of the work done, the forecast of the
 * coming months and each file's account (features 22, 39 and 41).
 *
 * Closest academy screen: finance analytics (`/dashboard/finance`): the date
 * presets, the figures, then tables. The presets are the reports of the plan:
 * «اليوم» is the end of day, «آخر 7 أيام» the week, «هذا الشهر» the month.
 */
export default function ReportsPage() {
  const tNav = useTranslations("Nav");
  const today = centreToday();
  const period = readPeriod(useSearchParams(), today);
  const { data: report } = useQuery({
    ...AGGREGATE_QUERY_OPTIONS,
    queryKey: [...pathKey(REPORTS_PATH), period.from, period.to],
    queryFn: () => getPeriodReportQuery({ from: localDate(period.from), to: localDate(period.to) }),
  });

  return (
    <SectionScreen section="money" title={tNav("Reports")}>
      <div className="space-y-8 tall:space-y-10">
        <PeriodFilter period={period} today={today} />
        {report ? <ReportView report={report} /> : <ScreenSkeleton />}
      </div>
    </SectionScreen>
  );
}
