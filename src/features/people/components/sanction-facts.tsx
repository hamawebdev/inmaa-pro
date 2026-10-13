import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import type { SanctionFound } from "@/features/people/services/sanctions";

import { SanctionChip } from "./sanction-chip";
import { useSubjectLabel } from "./subject-label";

/** The sanction a person matched, as the prompt shows it. */
export function SanctionFacts({ match }: { match: SanctionFound }) {
  const t = useTranslations("Sanctions");
  const subjectLabel = useSubjectLabel();
  return (
    <dl className="border-app grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border-border bg-muted/40 p-4 text-base">
      <dt className="text-muted-foreground">{subjectLabel(match.subjectKind, { number: match.displayNumber })}</dt>
      <dd className="flex flex-wrap items-center gap-2 font-bold">
        {match.displayName}
        {match.displayNumber && <Ltr className="font-normal text-muted-foreground">{match.displayNumber}</Ltr>}
        <SanctionChip kind={match.subjectKind} state={match.state} />
      </dd>
      <dt className="text-muted-foreground">{t("Facts.Since")}</dt>
      <dd>
        <Ltr>{match.startDate}</Ltr>
        {match.endDate && (
          <>
            {" "}
            {t("Facts.Until")} <Ltr>{match.endDate}</Ltr>
          </>
        )}
      </dd>
      <dt className="text-muted-foreground">{t("Facts.Reason")}</dt>
      <dd>{match.reason}</dd>
      <dt className="text-muted-foreground">{t("Facts.FoundBy")}</dt>
      <dd>{t(`Bases.${match.foundBy}`)}</dd>
    </dl>
  );
}
