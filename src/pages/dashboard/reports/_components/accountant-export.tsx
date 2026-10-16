import * as React from "react";

import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { SectionHeading } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDateText } from "@/features/money/components/use-money-text";
import { ACCOUNTANT_FILES, buildAccountantExportAction, type AccountantFile } from "@/features/money/services/exports";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { saveTextFile } from "@/server/exports";

/**
 * «ملفات المحاسب» (feature 48): the four files of the period on screen, each
 * saved where the accountant says, as the log screen saves its own export
 * (`saveTextFile`). For who holds `export.run`; anybody else sees nothing.
 */
export function AccountantExport({ from, to }: { from: string; to: string }) {
  const t = useTranslations("AccountantExport");
  const exports = useCan("export.run");
  const dates = useDateText();
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = React.useState<AccountantFile | null>(null);
  if (!exports) return null;

  async function save(kind: AccountantFile) {
    setBusy(kind);
    try {
      const outcome = await saveTextFile({
        title: t(`Files.${kind}`),
        defaultName: `inmaa-${kind.toLowerCase()}-${from}-${to}.csv`,
        filterName: t("FileKind"),
        extension: "csv",
        produce: async () => {
          const result = await buildAccountantExportAction({ kind, from, to });
          if (!result.success) {
            toast.error(errorMessage(result.error, t("Failed")));
            return null;
          }
          return result.data.text;
        },
      });
      if (outcome.saved) toast.success(t("Saved", { path: outcome.path }));
      else if (!outcome.cancelled) {
        console.error("money: export failed", outcome.error);
        toast.error(t("Failed"));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 tall:space-y-5">
      <SectionHeading>{t("Title")}</SectionHeading>
      <Card>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t("Description", { from: dates.long(from), to: dates.long(to) })}</p>
          <div className="flex flex-wrap gap-3">
            {ACCOUNTANT_FILES.map((kind) => (
              <Button key={kind} variant="export" disabled={busy !== null} onClick={() => void save(kind)}>
                <FileDown />
                {t(`Files.${kind}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
