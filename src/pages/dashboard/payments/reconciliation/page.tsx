import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { useDateText } from "@/features/money/components/use-money-text";
import { getReconciliationDayQuery, RECONCILIATION_PATH } from "@/features/money/services/reconciliation";
import { COLLECTOR_KINDS, type CollectorKind } from "@/features/money/validators/option-codes";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";

import { ReconciliationDayView } from "./_components/reconciliation-day";

/**
 * One collector's day of «المطابقة اليومية»: his receipts, what became of
 * each, the cash handed in counted against them, and the closing.
 *
 * Closest academy screen: an employee's payouts
 * (employees/[id]/payments): a person's money of a period, a ledger, then the
 * action that settles it at the foot. `?date=`, `?kind=` and `?staff=` name
 * the day and the collector.
 */
export default function ReconciliationDayPage() {
  const t = useTranslations("Reconciliation");
  const tNav = useTranslations("Nav");
  const dates = useDateText();
  const errorMessage = useErrorMessage();
  const params = useSearchParams();
  const date = params.get("date") ?? "";
  const kindParam = params.get("kind") ?? "OFFICE";
  const collectorKind: CollectorKind = (COLLECTOR_KINDS as readonly string[]).includes(kindParam)
    ? (kindParam as CollectorKind)
    : "OFFICE";
  const collectorStaffId = params.get("staff");
  const { data: day, error } = useQuery({
    queryKey: [...pathKey(RECONCILIATION_PATH), date, collectorKind, collectorStaffId],
    queryFn: () => getReconciliationDayQuery({ date, collectorKind, collectorStaffId }),
    retry: false,
  });

  return (
    <DetailScreen
      section="money"
      title={day ? t("DayTitle", { date: dates.long(day.date) }) : t("Title")}
      description={day ? (day.collectorName ?? t("Office")) : undefined}
      back={{ href: "/dashboard/payments?view=reconciliation", label: tNav("Payments") }}
    >
      {day ? (
        <ReconciliationDayView day={day} />
      ) : error ? (
        <p className="text-lg text-muted-foreground">{errorMessage(error.message, t("CouldNotLoad"))}</p>
      ) : (
        <ScreenSkeleton />
      )}
    </DetailScreen>
  );
}
