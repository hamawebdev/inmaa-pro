import { FlaskConical } from "lucide-react";
import { useTranslations } from "use-intl";

/**
 * Said above a printed sheet while it still shows a sample object: the sheet
 * is real, the people and places on it are not. Shown on the screen only; the
 * copy that goes to paper is the sheet alone.
 *
 * It goes away with the samples, when the services that read the database exist.
 */
export function SampleNotice() {
  const t = useTranslations("OperationsSheets");
  return (
    <p className="border-app mb-4 flex w-fit max-w-full items-center gap-2 rounded-lg border-border bg-muted px-4 py-2 text-base text-muted-foreground">
      <FlaskConical aria-hidden className="size-5 shrink-0" />
      {t("SampleNotice")}
    </p>
  );
}
