import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { BranchPicker } from "@/components/branch-picker";
import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { centreToday } from "@/features/money/components/centre-today";
import { PeriodFilter } from "@/features/money/components/period-filter";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { readPeriod } from "@/features/money/rules/period";
import { REPORTS_PATH } from "@/features/money/services/paths";
import { getPeriodReportQuery } from "@/features/money/services/reports";
import { useBranches } from "@/hooks/use-branches";
import { pathKey } from "@/lib/compat/revalidate";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";
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
  const t = useTranslations("Reports");
  const today = centreToday();
  const params = useSearchParams();
  const period = readPeriod(params, today);
  const router = useRouter();
  const { several } = useBranches();
  // Feature 47: the whole centre by default; a branch when the centre has several and one is chosen.
  const branchId = params.get("branch");
  const { data: report } = useQuery({
    ...AGGREGATE_QUERY_OPTIONS,
    queryKey: [...pathKey(REPORTS_PATH), period.from, period.to, branchId ?? ""],
    queryFn: () => getPeriodReportQuery({ from: localDate(period.from), to: localDate(period.to), branchId }),
  });

  function chooseBranch(next: string | null) {
    const rest = new URLSearchParams(params);
    if (next === null) rest.delete("branch");
    else rest.set("branch", next);
    router.replace(`?${rest.toString()}`);
  }

  return (
    <SectionScreen
      section="money"
      title={tNav("Reports")}
      actions={
        <Button asChild variant="info">
          <Link to={`/dashboard/reports/print?${params.toString()}`}>
            <Printer />
            {t("Print")}
          </Link>
        </Button>
      }
    >
      <div className="space-y-8 tall:space-y-10">
        <div className="flex flex-wrap items-end gap-4">
          <PeriodFilter period={period} today={today} />
          {several && (
            <div className="w-full sm:w-64">
              <BranchPicker id="report-branch" value={branchId} onChange={chooseBranch} allowAll />
            </div>
          )}
        </div>
        {report ? <ReportView report={report} branchId={branchId} /> : <ScreenSkeleton />}
      </div>
    </SectionScreen>
  );
}
