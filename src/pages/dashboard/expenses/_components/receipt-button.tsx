import { FileText, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { directionFor } from "@/i18n/config";
import { useUploadSrc } from "@/lib/use-upload-src";
import { isPdfUrl } from "@/lib/uploads";
import { saveUploadCopy } from "@/server/uploads";

/**
 * An expense's receipt, beside the row's action: a picture opens beside the
 * row, as in the academy's expenses table; a PDF is not opened, a copy is
 * saved instead, because nothing in this program leaves its window. An expense
 * with no receipt shows nothing.
 */
export function ReceiptButton({ url }: { url: string | null }) {
  if (!url) return null;
  return isPdfUrl(url) ? <PdfReceipt url={url} /> : <ImageReceipt url={url} />;
}

function ImageReceipt({ url }: { url: string }) {
  const t = useTranslations("Expenses");
  const rtl = directionFor(useLocale()) === "rtl";
  const src = useUploadSrc(url);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ImageIcon />
          {t("ViewReceipt")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" side={rtl ? "left" : "right"}>
        {src ? (
          <img src={src} alt={t("ReceiptImage")} className="max-h-[70vh] w-[min(500px,90vw)] rounded object-contain" />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PdfReceipt({ url }: { url: string }) {
  const t = useTranslations("MediaUpload");
  async function saveCopy() {
    const result = await saveUploadCopy(url, t("SaveCopy"));
    if (result.success) toast.success(t("CopySaved", { path: result.path }));
    else if (!result.cancelled) toast.error(t("CopyFailed"));
  }
  return (
    <Button variant="outline" size="sm" onClick={saveCopy}>
      <FileText />
      {t("SaveCopy")}
    </Button>
  );
}
