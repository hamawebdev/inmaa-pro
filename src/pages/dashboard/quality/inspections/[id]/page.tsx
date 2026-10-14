import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarX2, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import {
  cancelInspectionAction,
  getInspectionQuery,
  INSPECTIONS_PATH,
  markInspectionMissedAction,
} from "@/features/operations/services/inspections";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { inspectionHref, inspectionSheetHref, isolate } from "../../_components/inspections/quality-format";
import { InspectionForm } from "../../_components/inspections/inspection-form";
import { useReasonDialog } from "../../_components/inspections/reason-dialog";

/**
 * One supervisor inspection (#17): where the office types the sheet the
 * supervisor brought back, in one pass, and saves it once. Section «طلبات
 * الخدمة», below «الجودة والشكاوى».
 *
 * Closest academy screen: employees/new/page.tsx with its form (stacked
 * cards, Cancel and Save at the foot); the heading keeps the print action, as
 * the visit page does. An inspection the supervisor could not make is marked
 * missed, or cancelled, each with the reason the log keeps.
 */
export default function InspectionPage() {
  const { id = "" } = useParams();
  const t = useTranslations("Inspections.Page");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const clock = useCentreClock();
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const detail = useQuery({
    queryKey: pathKey(inspectionHref(id)),
    queryFn: () => getInspectionQuery({ inspectionId: id }),
  });
  const [askReason, reasonDialog] = useReasonDialog();
  const inspection = detail.data?.inspection;
  const number = inspection ? isolate(inspection.number) : "";

  const markMissed = async () => {
    const reason = await askReason({
      title: t("MissedTitle"),
      description: t("MissedDescription", { number }),
      reasonLabel: t("Reason"),
      confirmLabel: t("MissedConfirm"),
      cancelLabel: t("Keep"),
    });
    if (reason === null) return;
    const result = await markInspectionMissedAction({ inspectionId: id, reason });
    if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
    else toast.success(t("MissedDone"));
  };

  const cancel = async () => {
    const reason = await askReason({
      title: t("CancelTitle"),
      description: t("CancelDescription", { number }),
      reasonLabel: t("Reason"),
      confirmLabel: t("CancelConfirm"),
      cancelLabel: t("Keep"),
    });
    if (reason === null) return;
    const result = await cancelInspectionAction({ inspectionId: id, reason });
    if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
    else toast.success(t("CancelledDone"));
  };

  const status = inspection?.status;
  return (
    <DetailScreen
      section="requests"
      title={inspection ? t("Title", { number }) : t("TitleLoading")}
      description={t("Description")}
      back={{ href: INSPECTIONS_PATH, label: tNav("Quality") }}
      actions={
        inspection ? (
          <>
            {mayWrite && status === "PLANNED" && (
              <Button variant="outline" onClick={() => void markMissed()}>
                <CalendarX2 />
                {t("Missed")}
              </Button>
            )}
            {mayWrite && (status === "PLANNED" || status === "MISSED") && (
              <Button variant="outline" onClick={() => void cancel()}>
                <Ban />
                {t("Cancel")}
              </Button>
            )}
            {status !== "CANCELLED" && (
              <Button asChild variant="info">
                <Link to={inspectionSheetHref(id)}>
                  <Printer />
                  {t("PrintSheet")}
                </Link>
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {detail.isError ? (
        <ErrorState onRetry={() => void detail.refetch()} />
      ) : detail.data ? (
        // A typed or a changed inspection is a new form: its first values are read once, when it mounts.
        <InspectionForm
          key={`${detail.data.inspection.id}:${detail.data.inspection.status}:${detail.data.inspection.enteredAt ?? ""}`}
          detail={detail.data}
          today={clock.today}
          readOnly={!mayWrite || status === "CANCELLED"}
        />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
      {reasonDialog}
    </DetailScreen>
  );
}
