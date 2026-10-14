import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { PrintButton } from "@/components/print";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getInspectionSheetQuery,
  INSPECTIONS_PATH,
  recordInspectionPrintedAction,
} from "@/features/operations/services/inspections";
import { InspectionSheet } from "@/features/operations/sheets/inspection-sheet";
import { sampleInspectionSheet } from "@/features/operations/sheets/samples";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { inspectionHref } from "../../../_components/inspections/quality-format";

/**
 * The supervisor's inspection sheet of one inspection, to print. Section
 * «طلبات الخدمة», below «الجودة والشكاوى».
 *
 * Closest academy screen: students/[id]/card/page.tsx (a page that shows what
 * will be printed, with the print button in its heading).
 *
 * The sheet is built from the stored inspection: blank boxes to take to the
 * site, or what was typed in. Sending it to the printer freezes its points (the
 * paper and the typing then agree), dates the print and logs it (the sheet
 * names the team). `blank-<division>` (`blank-building`…) prints the empty
 * sheet the supervisor fills by hand when the PC is not at hand.
 */
export default function InspectionSheetPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("OperationsSheets");
  const tInspections = useTranslations("Inspections.Print");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const blank = id.startsWith("blank-");
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const sheet = useQuery({
    queryKey: [...pathKey(inspectionHref(id)), "sheet"],
    queryFn: () => getInspectionSheetQuery({ inspectionId: id }),
    enabled: !blank,
  });

  // The sheet leaves the office: frozen, dated and logged first; nothing prints if that fails.
  const recordPrint = async () => {
    const result = await recordInspectionPrintedAction({ inspectionId: id });
    if (!result.success) toast.error(errorMessage(result.error, tInspections("NotRecorded")));
    return result.success;
  };

  return (
    <DetailScreen
      section="requests"
      title={t("InspectionSheet.Title")}
      description={t("InspectionSheet.Description")}
      back={
        blank
          ? { href: INSPECTIONS_PATH, label: tNav("Quality") }
          : { href: inspectionHref(id), label: tInspections("Back") }
      }
      actions={blank || mayWrite ? <PrintButton onPrint={blank ? undefined : recordPrint} /> : undefined}
    >
      {blank ? (
        <InspectionSheet sheet={sampleInspectionSheet(id)} />
      ) : sheet.isError ? (
        <ErrorState onRetry={() => void sheet.refetch()} />
      ) : sheet.data ? (
        <InspectionSheet sheet={sheet.data} />
      ) : (
        <Skeleton className="h-[297mm] w-[210mm] max-w-full" />
      )}
    </DetailScreen>
  );
}
