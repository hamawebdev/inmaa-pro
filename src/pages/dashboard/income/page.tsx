import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { centreToday } from "@/features/money/components/centre-today";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { readPeriod } from "@/features/money/rules/period";
import { INCOME_PATH } from "@/features/money/services/paths";
import { getIncomeDataQuery } from "@/features/money/services/reports";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";
import { AGGREGATE_QUERY_OPTIONS } from "@/lib/query-client";
import { localDate } from "@/lib/units";

import { IncomeView } from "./_components/income-view";

/**
 * Section «المصاريف», tab «المداخيل حسب القسم».
 *
 * Closest academy screen: finance analytics (`/dashboard/finance`): the period
 * in the address, its figures read once for that period.
 */
export default function IncomePage() {
  const tNav = useTranslations("Nav");
  const today = centreToday();
  const period = readPeriod(useSearchParams(), today);
  const { data } = useQuery({
    ...AGGREGATE_QUERY_OPTIONS,
    queryKey: [...pathKey(INCOME_PATH), period.from, period.to],
    queryFn: () => getIncomeDataQuery({ from: localDate(period.from), to: localDate(period.to) }),
  });

  return (
    <SectionScreen section="money" title={tNav("Income")}>
      {data ? <IncomeView {...data} today={today} /> : <ScreenSkeleton />}
    </SectionScreen>
  );
}
