import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { Skeleton } from "@/components/ui/skeleton";
import { getContractPartQuery } from "@/features/clients/services/contracts";
import { fileQueryPath, recordFilePrintAction } from "@/features/clients/services/file-reads";
import { ClausesSheet } from "@/features/clients/sheets/clauses-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { filePartHref } from "@/navigation/file-parts";

/**
 * The contract's annex on A4: its clauses. Printing it is logged with the file's other sheets.
 *
 * Closest academy screen: a card route (students/[id]/card/page.tsx).
 */
export default function ContractAnnexPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("Contract");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const errorMessage = useErrorMessage();
  const back = { href: filePartHref(id, "contract"), label: tNav("FilePartContract") };
  const part = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "contract"],
    queryFn: () => getContractPartQuery({ fileId: id }),
  });
  return (
    <DetailScreen
      section="requests"
      title={t("AnnexTitle")}
      description={part.data?.file.clientName}
      back={back}
      actions={
        part.data ? (
          <PrintButton
            onPrint={async () => {
              const result = await recordFilePrintAction({ fileId: id, sheet: "FORM" });
              if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
              return result.success;
            }}
          />
        ) : undefined
      }
    >
      {part.data ? (
        <ClausesSheet
          number={part.data.file.number}
          clientName={part.data.file.clientName}
          clauses={part.data.clauses}
        />
      ) : part.isPending ? (
        <Skeleton className="h-[60rem] w-full max-w-[210mm]" />
      ) : (
        <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
      )}
    </DetailScreen>
  );
}
