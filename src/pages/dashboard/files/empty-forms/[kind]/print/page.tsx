import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { FORM_DEFINITIONS, formKindFromSlug } from "@/features/clients/forms/definitions";
import { FileFormSheet } from "@/features/clients/sheets/file-form-sheet";
import { useCodeLabel } from "@/i18n/use-code-label";
import { FILES_PATH } from "@/navigation/file-parts";

/**
 * One of his forms, empty, on the A4 sheet. Closest academy screen: a card
 * route (students/[id]/card/page.tsx): a back action, a print button, the
 * thing that prints.
 */
export default function EmptyFormPrintPage() {
  const { kind: slug = "" } = useParams();
  const t = useTranslations("FileForms");
  const kindLabel = useCodeLabel("FileForms.Kinds");
  const kind = formKindFromSlug(slug);
  const back = { href: `${FILES_PATH}/empty-forms`, label: t("EmptyForms") };

  if (!kind) {
    return (
      <DetailScreen section="requests" title={t("EmptySheet")} back={back}>
        <p className="py-16 text-center text-base text-muted-foreground">{t("NoSuchForm")}</p>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      section="requests"
      title={t("EmptySheet")}
      description={kindLabel(kind)}
      back={back}
      actions={<PrintButton />}
    >
      <FileFormSheet definition={FORM_DEFINITIONS[kind]} />
    </DetailScreen>
  );
}
