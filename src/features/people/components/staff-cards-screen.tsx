import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { recordCardPrintAction, staffCardsForPrintQuery } from "@/features/people/services/cards";
import { IdCardsSheet } from "@/features/people/sheets/id-cards";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { isInlineImageSrc, resolveUploadSrc } from "@/server/uploads";

/** The photos of several people as addresses an `<img>` can show, resolved here so that the sheet stays pure. */
function useUploadSrcs(urls: Readonly<Record<string, string | null>>): Record<string, string | null> {
  const [resolved, setResolved] = React.useState<Record<string, string | null>>({});
  const key = JSON.stringify(urls);
  React.useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(JSON.parse(key) as Record<string, string | null>);
    void Promise.all(
      entries.map(
        async ([id, url]) => [id, url ? (isInlineImageSrc(url) ? url : await resolveUploadSrc(url)) : null] as const,
      ),
    ).then((pairs) => {
      if (!cancelled) setResolved(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return resolved;
}

/**
 * The ID cards of one person or of a batch, as they will print: the sheet of
 * the print kit, with the print button in the heading. Printing writes one
 * line per person in the log first; a print that could not be recorded does
 * not happen.
 *
 * Closest academy screen: the ID card page (employees/[id]/card), its card
 * drawn on the print kit's A4 sheet instead of the live screen.
 */
export function StaffCardsScreen({
  ids,
  section,
  back,
}: {
  ids: readonly string[];
  section: "workers" | "employees";
  back: { href: string; label: string };
}) {
  const t = useTranslations("Cards");
  const errorMessage = useErrorMessage();
  const { data, error } = useQuery({
    queryKey: [...pathKey(`/dashboard/${section}`), "cards", ...ids],
    queryFn: () => staffCardsForPrintQuery({ ids }),
    enabled: ids.length > 0,
  });
  const photos = useUploadSrcs(Object.fromEntries((data?.cards ?? []).map((card) => [card.id, card.photoUrl])));

  return (
    <DetailScreen
      section={section}
      title={data && data.cards.length === 1 ? `${t("Title")} · ${data.cards[0].name}` : t("Title")}
      back={back}
      actions={
        data && (
          <PrintButton
            onPrint={async () => {
              const result = await recordCardPrintAction({ ids });
              if (!result.success) toast.error(errorMessage(result.error, t("Failed")));
              return result.success;
            }}
          />
        )
      }
    >
      {error ? (
        <p className="text-base text-destructive">{errorMessage(error.message, t("Failed"))}</p>
      ) : !data ? (
        <p className="text-base text-muted-foreground">{t(ids.length === 0 ? "NoneChosen" : "Loading")}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-base text-muted-foreground">{t("Hint", { count: data.cards.length })}</p>
          <IdCardsSheet data={data} photos={photos} />
        </div>
      )}
    </DetailScreen>
  );
}
