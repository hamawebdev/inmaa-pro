import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { Skeleton } from "@/components/ui/skeleton";
import { fileQueryPath } from "@/features/clients/services/file-reads";
import { getQuoteSheetQuery, recordQuotePrintAction } from "@/features/clients/services/quotes";
import { QuoteSheet } from "@/features/clients/sheets/quote-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { filePartHref } from "@/navigation/file-parts";

import { ltr } from "../../../../_components/ltr-text";

/**
 * A quote on the A4 sheet. Printing it is logged as a disclosure: it names the client.
 *
 * Closest academy screen: a card route (students/[id]/card/page.tsx): a back
 * action, a print button, the thing that prints.
 */
export default function QuotePrintPage() {
  const { id = "", quoteId = "" } = useParams();
  const t = useTranslations("Quotes");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const errorMessage = useErrorMessage();
  const back = { href: filePartHref(id, "quote"), label: tNav("FilePartQuote") };

  const sheet = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "quote-sheet", quoteId],
    queryFn: () => getQuoteSheetQuery({ quoteId }),
  });

  if (!sheet.data) {
    return (
      <DetailScreen section="requests" title={tNav("FilePartQuote")} back={back}>
        {sheet.isPending ? (
          <Skeleton className="h-[60rem] w-full max-w-[210mm]" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      section="requests"
      title={t("PrintTitle", { number: ltr(sheet.data.quote.number) })}
      description={sheet.data.client.name}
      back={back}
      actions={
        <PrintButton
          onPrint={async () => {
            const result = await recordQuotePrintAction({ quoteId });
            if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
            return result.success;
          }}
        />
      }
    >
      <QuoteSheet data={sheet.data} />
    </DetailScreen>
  );
}
