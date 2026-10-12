import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { PrintButton } from "@/components/print";
import { recordFilePrintAction } from "@/features/clients/services/file-reads";
import { useErrorMessage } from "@/i18n/errors";

/**
 * The print kit's button, with the disclosure the law asks for written first
 * (a sheet naming a person went to paper). If it cannot be written, nothing
 * prints; Ctrl+P on the page goes through it too.
 */
export function LoggedPrintButton({ fileId, sheet }: { fileId: string; sheet: "FORM" | "RESIDENTS" }) {
  const tPrint = useTranslations("FilePrint");
  const errorMessage = useErrorMessage();
  return (
    <PrintButton
      onPrint={async () => {
        const result = await recordFilePrintAction({ fileId, sheet });
        if (!result.success) toast.error(errorMessage(result.error, tPrint("PrintFailed")));
        return result.success;
      }}
    />
  );
}
