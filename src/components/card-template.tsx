import { useLocale, useTranslations } from "use-intl";

import { AdminLogoMark } from "@/components/admin-logo-mark";
import { Ltr } from "@/components/ltr";
import { intlLocaleFor } from "@/i18n/config";
import { useUploadSrc } from "@/lib/use-upload-src";

type CardField = {
  label: string;
  value: string;
  /** True for a phone, a date, a number or a code: it is shown left to right. See `Ltr`. */
  ltr?: boolean;
};

type Props = {
  roleLabel: string;
  branding?: {
    academyName: string;
    adminName?: string | null;
    logoUrl: string | null;
  };
  photoUrl?: string | null;
  name: string;
  subtitle?: string;
  fields: CardField[];
  badges?: React.ReactNode;
};

/**
 * The printable ID card, for workers and employees. The academy's card carried
 * a QR for badge scanning; this program has no scanning, so the card has none.
 */
export function CardTemplate({ roleLabel, branding, photoUrl, name, subtitle, fields, badges }: Props) {
  // Printed cards embed the stored photo, which lives on disk.
  const resolvedPhotoUrl = useUploadSrc(photoUrl);
  const t = useTranslations("CardTemplate");
  const locale = useLocale();
  const localeCode = intlLocaleFor(locale);
  const issuedAt = new Intl.DateTimeFormat(localeCode, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const academyName = branding?.academyName ?? t("CentreName");

  return (
    <div className="mx-auto max-w-md">
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm print:border-2 print:border-black print:shadow-none">
        {/* Header band */}
        <div className="bg-primary px-6 py-4 text-primary-foreground print:bg-black print:text-white">
          <div className="flex items-center gap-3 text-start">
            <AdminLogoMark
              logoUrl={branding?.logoUrl}
              name={academyName}
              className="size-12 border-white/30 bg-white text-primary print:border-white print:text-black"
              imageClassName="p-1.5"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs opacity-80">{academyName}</p>
              <h2 className="text-lg font-bold tracking-wide">{roleLabel}</h2>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6">
          {/* Photo + Name */}
          <div className="flex items-start gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted text-xs text-muted-foreground print:border-black">
              {resolvedPhotoUrl ? (
                <img src={resolvedPhotoUrl} alt={name} className="size-20 rounded-lg object-cover" />
              ) : (
                t("Photo")
              )}
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="text-xl leading-tight font-bold">{name}</h3>
              {subtitle && <p className="text-sm text-muted-foreground print:text-black">{subtitle}</p>}
            </div>
          </div>

          {/* Details grid */}
          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-sm">
              {fields.map((field) => (
                <div key={field.label} className="contents">
                  <span className="text-muted-foreground print:text-gray-600">{field.label}</span>
                  <span className="font-medium">{field.ltr ? <Ltr>{field.value}</Ltr> : field.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Badges */}
          {badges && <div className="border-t pt-4">{badges}</div>}
        </div>

        {/* Footer */}
        <div className="border-t bg-muted/50 px-6 py-2 text-center text-xs text-muted-foreground print:bg-gray-100">
          {t("Issued", { date: issuedAt })}
        </div>
      </div>
    </div>
  );
}
