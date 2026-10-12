import { Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Button } from "@/components/ui/button";
import { FORM_DEFINITIONS, formKindSlug } from "@/features/clients/forms/definitions";
import { FORM_KINDS } from "@/features/clients/validators/option-lists";
import { useCodeLabel } from "@/i18n/use-code-label";
import { FILES_PATH } from "@/navigation/file-parts";

/**
 * His five forms and the complexes copy, empty, to print and fill in by hand.
 *
 * Closest academy screen: the student overview's grid of group cards
 * (students/[id]/overview/page.tsx): one bordered card per item, a title, a
 * line of detail, one action.
 */
export default function EmptyFormsPage() {
  const t = useTranslations("FileForms");
  const tNav = useTranslations("Nav");
  const kindLabel = useCodeLabel("FileForms.Kinds");

  return (
    <DetailScreen
      section="requests"
      title={t("EmptyForms")}
      description={t("EmptyFormsDescription")}
      back={{ href: FILES_PATH, label: tNav("Files") }}
      className="max-w-5xl"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FORM_KINDS.map((kind) => {
          const definition = FORM_DEFINITIONS[kind];
          const pages = definition.sheet.filter((block) => block.t === "pageBreak").length + 1;
          return (
            <div key={kind} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{kindLabel(kind)}</h3>
                {/* His own title for the sheet, as it is printed in its box: Arabic in every language,
                    isolated so that it reads right to left and still lines up with the card. */}
                <p className="text-base text-muted-foreground">
                  <bdi dir="rtl" lang="ar">
                    {definition.rows.find((row) => row.role === "title")?.label}
                  </bdi>
                </p>
                <p className="text-sm text-muted-foreground">{t("Pages", { count: pages })}</p>
              </div>
              <Button asChild variant="info" className="mt-auto">
                <Link to={`${FILES_PATH}/empty-forms/${formKindSlug(kind)}/print`}>
                  <Printer />
                  {t("OpenToPrint")}
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </DetailScreen>
  );
}
