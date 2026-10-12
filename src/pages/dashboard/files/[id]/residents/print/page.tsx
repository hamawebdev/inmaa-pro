import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { FORM_DEFINITIONS } from "@/features/clients/forms/definitions";
import { fileQueryPath, openFileSheetAction } from "@/features/clients/services/file-reads";
import { ResidentsSheet } from "@/features/clients/sheets/file-form-sheet";
import { pathKey } from "@/lib/compat/revalidate";
import { filePartHref } from "@/navigation/file-parts";

import { LoggedPrintButton } from "../../../_components/logged-print-button";
import { ltr } from "../../../_components/ltr-text";
import { useFileOpened } from "../../../_components/use-file-opened";

/**
 * «قائمة القاطنين بالعمارة» alone on the A4 sheet, for a building or a complex
 * whose list has changed since its contract was printed: the residents still
 * there today. Reading it and printing it are logged.
 *
 * Closest academy screen: a card route (students/[id]/card/page.tsx).
 */
export default function FileResidentsPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("FilePrint");
  const tForms = useTranslations("FileForms");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  useFileOpened(id);
  const sheet = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "sheet"],
    queryFn: async () => {
      const result = await openFileSheetAction({ fileId: id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const back = { href: filePartHref(id, "residents"), label: tNav("FilePartResidents") };
  const data = sheet.data;

  if (!data || data.residents === null) {
    const message = !data
      ? sheet.isPending
        ? null
        : tHub("NotFound")
      : data.residentsRestricted
        ? t("ResidentsRestricted")
        : tForms("NoResidentsSheet");
    return (
      <DetailScreen section="requests" title={tForms("ResidentsSheet")} back={back}>
        {message === null ? (
          <Skeleton className="h-[60rem] w-full max-w-[210mm]" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{message}</p>
        )}
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      section="requests"
      title={t("ResidentsTitle", { number: ltr(data.number) })}
      back={back}
      actions={<LoggedPrintButton fileId={data.id} sheet="RESIDENTS" />}
    >
      <ResidentsSheet definition={FORM_DEFINITIONS[data.kind]} residents={data.residents} />
    </DetailScreen>
  );
}
