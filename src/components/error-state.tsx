import { RotateCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * What a failed query looks like.
 *
 * Built on `Empty` rather than as its own thing, because "nothing loaded" and
 * "nothing exists" are the same shape of message and should not be two visual
 * languages — only the plate colour and the presence of a retry separate them.
 *
 * Always offers the retry. Every query in this app runs against a local SQLite
 * file over Tauri IPC, so a failure here is almost always transient (a migration
 * mid-flight, a backup restore holding the connection) and pressing the button
 * genuinely fixes it.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("Common");

  return (
    <Empty className={cn("border-destructive/30", className)}>
      <EmptyHeader>
        <EmptyMedia variant="destructive">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>{title ?? t("SomethingWentWrong")}</EmptyTitle>
        <EmptyDescription>{description ?? t("CouldNotLoad")}</EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            <RotateCw />
            {t("Retry")}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
