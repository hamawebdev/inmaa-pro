import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslations } from "use-intl";

type Props = {
  token: string;
  size?: number;
};

export function QrCodeDisplay({ token, size = 160 }: Props) {
  const t = useTranslations("QrCodeDisplay");
  const tCommon = useTranslations("Common");
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(token, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      // The one place in this app that is allowed a literal colour, and it must
      // stay literal: a QR symbol needs maximum luminance contrast to decode,
      // it is printed onto white card stock, and theming it would make the
      // code unreadable in dark mode for no benefit.
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(console.error);
  }, [token, size]);

  if (!dataUrl) {
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed border-muted-foreground/30 bg-muted"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-muted-foreground">{tCommon("Loading")}</span>
      </div>
    );
  }

  return <img src={dataUrl} alt={t("Alt")} width={size} height={size} className="print:block" />;
}
