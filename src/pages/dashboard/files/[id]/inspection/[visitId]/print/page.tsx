import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { Skeleton } from "@/components/ui/skeleton";
import { fileQueryPath } from "@/features/clients/services/file-reads";
import { getInspectionSheetQuery, recordInspectionPrintAction } from "@/features/clients/services/first-visits";
import { InspectionSheet } from "@/features/clients/sheets/inspection-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { filePartHref } from "@/navigation/file-parts";

/**
 * The inspection sheet on A4: printed for the supervisor before the visit,
 * kept with what he wrote once it is typed in. Printing it is logged.
 *
 * Closest academy screen: a card route (students/[id]/card/page.tsx).
 */
export default function InspectionPrintPage() {
  const { id = "", visitId = "" } = useParams();
  const t = useTranslations("FirstVisits");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const errorMessage = useErrorMessage();
  const back = { href: filePartHref(id, "inspection"), label: tNav("FilePartInspection") };
  const sheet = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "inspection-sheet", visitId],
    queryFn: () => getInspectionSheetQuery({ firstVisitId: visitId }),
  });

  return (
    <DetailScreen
      section="requests"
      title={t("SheetTitle")}
      description={sheet.data?.clientName}
      back={back}
      actions={
        sheet.data ? (
          <PrintButton
            onPrint={async () => {
              const result = await recordInspectionPrintAction({ firstVisitId: visitId });
              if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
              return result.success;
            }}
          />
        ) : undefined
      }
    >
      {sheet.data ? (
        <InspectionSheet data={sheet.data} />
      ) : sheet.isPending ? (
        <Skeleton className="h-[60rem] w-full max-w-[210mm]" />
      ) : (
        <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
      )}
    </DetailScreen>
  );
}
