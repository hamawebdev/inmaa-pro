import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { keptServicesOf, resolveDefinition } from "@/features/clients/forms/catalogue";
import { FORM_DEFINITIONS } from "@/features/clients/forms/definitions";
import { fileQueryPath, openFileSheetAction } from "@/features/clients/services/file-reads";
import { FileFormSheet } from "@/features/clients/sheets/file-form-sheet";
import { useServiceCatalogue } from "@/hooks/use-service-catalogue";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { filePartHref } from "@/navigation/file-parts";

import { LoggedPrintButton } from "../../../_components/logged-print-button";
import { ltr } from "../../../_components/ltr-text";
import { useFileOpened } from "../../../_components/use-file-opened";

/**
 * A file's form on the A4 sheet, in the layout of his Word file, drawn from the
 * stored file: what was signed once it is «متعاقد». A building's page 3 lists
 * the residents still there today. Printing is logged as a disclosure. Its two
 * service blocks list what the division offers today (Settings › الخدمات), and
 * keep, at its place, a service the file ticks that has been removed since.
 *
 * Closest academy screen: a card route (students/[id]/card/page.tsx): a back
 * action, a print button, the thing that prints.
 */
export default function FileFormPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("FilePrint");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const kindLabel = useCodeLabel("FileForms.Kinds");
  useFileOpened(id);
  const sheet = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "sheet"],
    queryFn: async () => {
      const result = await openFileSheetAction({ fileId: id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const back = { href: filePartHref(id, "form"), label: tNav("FilePartForm") };
  const { catalogue } = useServiceCatalogue();
  const data = sheet.data;
  const definition = React.useMemo(
    () =>
      data && catalogue ? resolveDefinition(FORM_DEFINITIONS[data.kind], catalogue, keptServicesOf(data.values)) : null,
    [data, catalogue],
  );

  if (!data || !definition) {
    return (
      <DetailScreen section="requests" title={tNav("FilePartForm")} back={back}>
        {sheet.isPending || (data && !definition) ? (
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
      title={t("FormTitle", { number: ltr(data.number) })}
      description={kindLabel(data.kind)}
      back={back}
      actions={<LoggedPrintButton fileId={data.id} sheet="FORM" />}
    >
      <div className="space-y-5">
        {data.residentsRestricted && (
          <Alert className="text-start">
            <AlertDescription className="text-base">{t("ResidentsRestricted")}</AlertDescription>
          </Alert>
        )}
        <FileFormSheet definition={definition} values={{ ...data.values, residents: data.residents ?? [] }} />
      </div>
    </DetailScreen>
  );
}
