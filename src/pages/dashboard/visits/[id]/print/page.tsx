import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { PrintButton } from "@/components/print";
import { Skeleton } from "@/components/ui/skeleton";
import { getMissionOrderQuery, recordOrderPrintedAction } from "@/features/operations/services/mission-order";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { MissionOrderSheet } from "@/features/operations/sheets/mission-order-sheet";
import { sampleMissionOrder } from "@/features/operations/sheets/samples";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The mission order of one visit, to print. Section «طلبات الخدمة», below «الزيارات».
 *
 * Closest academy screen: students/[id]/card/page.tsx, a page below a record
 * that shows what will be printed, with the print button in its heading. Here
 * the content is an A4 sheet on the print kit instead of a card.
 *
 * The order is built from what is stored. Sending it to the printer freezes its
 * tick lines, counts the print and logs it (the order names the team).
 * `blank-<division>` (`blank-building`…) prints the empty order the office
 * fills by hand when the PC is not at hand.
 */
export default function VisitOrderPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("OperationsSheets");
  const errorMessage = useErrorMessage();
  const blank = id.startsWith("blank-");
  const order = useQuery({
    queryKey: [...pathKey(`${VISITS_PATH}/${id}`), "order"],
    queryFn: () => getMissionOrderQuery({ visitId: id }),
    enabled: !blank,
  });

  // The print dialog opening is the order leaving the office.
  useEffect(() => {
    if (blank) return;
    const recordPrint = () => {
      void recordOrderPrintedAction({ visitId: id }).then((result) => {
        if (!result.success) toast.error(errorMessage(result.error, t("MissionOrder.PrintNotRecorded")));
      });
    };
    window.addEventListener("beforeprint", recordPrint);
    return () => window.removeEventListener("beforeprint", recordPrint);
  }, [blank, id, errorMessage, t]);

  return (
    <DetailScreen
      section="requests"
      title={t("MissionOrder.Title")}
      description={t("MissionOrder.Description")}
      back={{ href: blank ? VISITS_PATH : `${VISITS_PATH}/${id}`, label: t("MissionOrder.Back") }}
      actions={<PrintButton />}
    >
      {blank ? (
        <MissionOrderSheet order={sampleMissionOrder(id)} />
      ) : order.isError ? (
        <ErrorState onRetry={() => void order.refetch()} />
      ) : order.data ? (
        <MissionOrderSheet order={order.data} />
      ) : (
        <Skeleton className="h-[297mm] w-[210mm] max-w-full" />
      )}
    </DetailScreen>
  );
}
