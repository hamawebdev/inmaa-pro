import { useTranslations } from "use-intl";

import { CENTRE_EMBLEM_SRC } from "@/assets/letterhead/emblem";
import { useUploadSrc } from "@/lib/use-upload-src";
import { cn } from "@/lib/utils";

type Props = {
  logoUrl?: string | null;
  name: string;
  className?: string;
  imageClassName?: string;
};

export function AdminLogoMark({ logoUrl, name, className, imageClassName }: Props) {
  const t = useTranslations("AdminLogoMark");
  // Stored as a managed-upload path; the webview needs the asset-protocol URL.
  const resolvedLogoUrl = useUploadSrc(logoUrl);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background text-muted-foreground",
        className,
      )}
    >
      {/* No logo stored: the emblem from his letterhead (src/assets/letterhead/emblem.ts), never initials. */}
      <img
        src={logoUrl ? (resolvedLogoUrl ?? undefined) : CENTRE_EMBLEM_SRC}
        alt={t("LogoAlt", { name })}
        className={cn("size-full object-contain", imageClassName)}
      />
    </div>
  );
}
