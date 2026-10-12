import { Printer } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { recordFilePrintAction } from "@/features/clients/services/file-reads";
import { useErrorMessage } from "@/i18n/errors";

/**
 * The print kit's button, which first writes the disclosure the law asks for
 * (a sheet naming a person went to paper), then opens the print dialog. Drawn
 * as the kit's `PrintButton`, which has no hook for it yet.
 */
export function LoggedPrintButton({ fileId, sheet }: { fileId: string; sheet: "FORM" | "RESIDENTS" }) {
  const t = useTranslations("Print");
  const tPrint = useTranslations("FilePrint");
  const errorMessage = useErrorMessage();
  return (
    <Button
      type="button"
      variant="info"
      onClick={async () => {
        const result = await recordFilePrintAction({ fileId, sheet });
        if (!result.success) {
          toast.error(errorMessage(result.error, tPrint("PrintFailed")));
          return;
        }
        window.print();
      }}
    >
      <Printer />
      {t("Print")}
    </Button>
  );
}
