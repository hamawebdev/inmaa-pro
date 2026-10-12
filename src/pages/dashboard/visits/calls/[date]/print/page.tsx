import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { PrintButton } from "@/components/print";
import { Skeleton } from "@/components/ui/skeleton";
import { isIsoDate } from "@/features/operations/rules/calendar";
import { getCallListQuery, recordDaySheetPrintedAction } from "@/features/operations/services/day-sheets";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { CallListSheet } from "@/features/operations/sheets/call-list-sheet";
import { sampleCallList } from "@/features/operations/sheets/samples";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { localDate } from "@/lib/units";

/**
 * The client call list for the visits of one day, to print. Section «طلبات
 * الخدمة», below «الزيارات». The path carries the date of the visits;
 * `blank` prints an empty list to fill by hand.
 *
 * Closest academy screen: students/[id]/card/page.tsx (a page that shows what
 * will be printed, with the print button in its heading).
 */
export default function CallListPrintPage() {
  const { date = "" } = useParams();
  const t = useTranslations("OperationsSheets");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const blank = !isIsoDate(date);
  const list = useQuery({
    queryKey: [...pathKey(VISITS_PATH), "calls", date],
    queryFn: () => getCallListQuery({ visitsDate: localDate(date) }),
    enabled: !blank,
  });

  // The list names clients and their phones: its printing is logged first.
  const recordPrint = async () => {
    const result = await recordDaySheetPrintedAction({ sheet: "CALL_LIST", date: localDate(date) });
    if (!result.success) toast.error(errorMessage(result.error, t("MissionOrder.PrintNotRecorded")));
    return result.success;
  };

  return (
    <DetailScreen
      section="requests"
      title={t("CallList.Title")}
      description={t("CallList.Description")}
      back={{ href: VISITS_PATH, label: tNav("Visits") }}
      actions={<PrintButton onPrint={blank ? undefined : recordPrint} />}
    >
      {blank ? (
        <CallListSheet list={sampleCallList("blank")} />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : list.data ? (
        <CallListSheet list={list.data} />
      ) : (
        <Skeleton className="h-[210mm] w-[297mm] max-w-full" />
      )}
    </DetailScreen>
  );
}
