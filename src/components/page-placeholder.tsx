import { Construction } from "lucide-react";
import { useTranslations } from "use-intl";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** The owners of the program's feature folders, as named in CLAUDE.md. */
export type FeatureOwner = "core" | "people" | "clients" | "operations" | "money";

/**
 * What a route shows until its screen is built.
 *
 * Every tab and every part of a file has a page from the first day, so the
 * navigation is whole and each owner only ever edits files in its own folders.
 * Building a screen means replacing this element, nothing else.
 */
export function PagePlaceholder({ owner }: { owner: FeatureOwner }) {
  const t = useTranslations("Placeholder");

  return (
    <Empty className="border-app border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>{t("Title")}</EmptyTitle>
        <EmptyDescription>{t("Description", { owner: t(`Owners.${owner}`) })}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
