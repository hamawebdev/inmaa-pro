import { useTranslations } from "use-intl";

import { useUploadSrc } from "@/lib/use-upload-src";
import { cn } from "@/lib/utils";

type Props = {
  logoUrl?: string | null;
  name: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

export function AdminLogoMark({ logoUrl, name, className, imageClassName, fallbackClassName }: Props) {
  const t = useTranslations("AdminLogoMark");
  // Stored as a managed-upload path; the webview needs the asset-protocol URL.
  const resolvedLogoUrl = useUploadSrc(logoUrl);
  const fallback = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background text-muted-foreground",
        className,
      )}
    >
      {logoUrl ? (
        <img
          src={resolvedLogoUrl ?? undefined}
          alt={t("LogoAlt", { name })}
          className={cn("size-full object-contain", imageClassName)}
        />
      ) : (
        <span className={cn("text-xs font-semibold tracking-tight", fallbackClassName)}>{fallback || "AM"}</span>
      )}
    </div>
  );
}
