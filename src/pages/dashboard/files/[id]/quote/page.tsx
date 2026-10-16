import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { fileQueryPath } from "@/features/clients/services/file-reads";
import { getFileQuotesQuery } from "@/features/clients/services/quotes";
import { useMoneyText } from "@/hooks/use-money-text";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { fileHubHref, filePartHref } from "@/navigation/file-parts";

import { ltr } from "../../_components/ltr-text";
import { useFileOpened } from "../../_components/use-file-opened";

import { QuoteForm } from "./_components/quote-form";
import { QuotePanel } from "./_components/quote-panel";
import { QUOTE_STATUS_TONE, quoteLabel } from "./_components/quote-tone";

/**
 * «عرض السعر» of a file (plan features 5 and 29): the quote being prepared or
 * the one issued, with what can be done to it now, and its earlier versions.
 *
 * Closest academy screen: a student's payments page (students/[id]/payments/page.tsx):
 * a detail screen with a card for what is current and a list of what came before.
 */
export default function FileQuotePage() {
  const { id = "" } = useParams();
  const t = useTranslations("Quotes");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const statusLabel = useCodeLabel("FileOptions.QuoteStatus");
  const money = useMoneyText();
  useFileOpened(id);
  const back = { href: fileHubHref(id), label: tNav("FileHub") };

  const quotes = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "quotes"],
    queryFn: () => getFileQuotesQuery({ fileId: id }),
  });

  if (!quotes.data) {
    return (
      <DetailScreen section="requests" title={tNav("FilePartQuote")} back={back}>
        {quotes.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }

  const { file, suggested, canStart, contract } = quotes.data;
  // The newest version that was not given up is the file's quote; the others are its history.
  const current = quotes.data.quotes.find((quote) => quote.status !== "CANCELLED") ?? null;
  const working = current && current.steps.includes("EDIT") ? current : null;
  const issued = quotes.data.quotes.find((quote) => quote.status === "ISSUED" && quote.id !== current?.id) ?? null;
  const earlier = quotes.data.quotes.filter((quote) => quote.id !== current?.id && quote.id !== issued?.id);
  const onContract = file.serviceType === "CONTRACT";

  return (
    <DetailScreen
      section="requests"
      title={`${tNav("FilePartQuote")} · ${tHub("Title", { number: ltr(file.number) })}`}
      description={file.clientName}
      back={back}
    >
      <div className="space-y-6">
        {file.closed && (
          <Alert className="text-start">
            <AlertDescription className="text-base">{t("FileClosed")}</AlertDescription>
          </Alert>
        )}

        {current ? (
          <QuotePanel key={`${current.id}:${current.status}`} fileId={id} quote={current} contract={contract}>
            {working && (
              <QuoteForm
                key={quotes.dataUpdatedAt}
                fileId={id}
                quoteId={working.id}
                initial={working.terms}
                contract={onContract}
              />
            )}
          </QuotePanel>
        ) : canStart ? (
          <>
            <Alert className="text-start">
              <AlertDescription className="text-base">{t("NewHint")}</AlertDescription>
            </Alert>
            <QuoteForm fileId={id} quoteId={null} initial={suggested} contract={onContract} />
          </>
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{t("None")}</p>
        )}

        {/* The quote the client still holds while its new version is being prepared. */}
        {issued && <QuotePanel key={issued.id} fileId={id} quote={issued} contract={contract} />}

        {earlier.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Earlier")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {earlier.map((quote) => (
                  <li key={quote.id} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 py-3">
                    <Ltr className="font-medium tabular-nums">{quoteLabel(quote)}</Ltr>
                    <StatusChip tone={QUOTE_STATUS_TONE[quote.status]} label={statusLabel(quote.status)} />
                    <ScreenDate className="text-muted-foreground" date={quote.terms.date} />
                    <Ltr className="tabular-nums">{money(quote.total)}</Ltr>
                    {quote.status === "SUPERSEDED" && (
                      <Link
                        className="ms-auto font-medium text-primary underline-offset-4 hover:underline"
                        to={`${filePartHref(id, "quote")}/${encodeURIComponent(quote.id)}/print`}
                      >
                        {t("Print")}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </DetailScreen>
  );
}
