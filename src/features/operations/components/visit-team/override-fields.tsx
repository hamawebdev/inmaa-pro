import { ShieldAlert } from "lucide-react";
import { useTranslations } from "use-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { OverrideDraft } from "./team-data";

/**
 * The manager's reason, and the labour inspector's derogation for night work by
 * a woman. Shown only when the chosen worker breaks a rule the manager alone
 * may pass; the save then carries it and the log keeps it.
 */
export function OverrideFields({
  idPrefix,
  draft,
  onChange,
  needsDerogation,
}: {
  idPrefix: string;
  draft: OverrideDraft;
  onChange: (draft: OverrideDraft) => void;
  needsDerogation: boolean;
}) {
  const t = useTranslations("VisitTeam");
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
      <legend className="flex items-center gap-2 px-1 text-base font-bold text-warning-ink">
        <ShieldAlert className="size-5" />
        {t("Override.Title")}
      </legend>
      <p className="text-sm text-muted-foreground">{t("Override.Hint")}</p>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor={`${idPrefix}-override-reason`}>{t("Override.Reason")}</Label>
        <Textarea
          id={`${idPrefix}-override-reason`}
          rows={2}
          value={draft.reason}
          onChange={(event) => onChange({ ...draft, reason: event.target.value })}
        />
      </div>
      {needsDerogation && (
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${idPrefix}-override-derogation`}>{t("Override.Derogation")}</Label>
          <Input
            id={`${idPrefix}-override-derogation`}
            value={draft.derogationRef}
            onChange={(event) => onChange({ ...draft, derogationRef: event.target.value })}
          />
        </div>
      )}
    </fieldset>
  );
}
