import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Repeat } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

import {
  REPLACEMENT_REASONS,
  replaceSeatAction,
  suggestReplacementsQuery,
  type ReplacementReason,
  type ReplacementSuggestions,
} from "../../services/absences";
import { VISITS_PATH } from "../../services/programme";
import { hoursAndMinutes } from "../visit-entry/visit-entry-notes";

import { FindingChips } from "./finding-chips";
import { OverrideFields } from "./override-fields";
import { EMPTY_OVERRIDE, needsDerogation, needsManager, overrideReady, refused, type OverrideDraft } from "./team-data";

/**
 * Who could take a seat (#9): the workers ranked as his notes ask (the file's
 * alternate, then the reserve and the workers of the same zone, then of
 * another zone; inside each, who knows the site, then the lightest week), each
 * with what taking the seat does to her week. Those left out are listed with
 * the reason. Choosing one gives her a seat of her own beside the one she
 * replaces; an absent worker's seat stays absent, so People counts it once.
 *
 * Closest academy screen: the add-absence dialog of the attendance family
 * (pages/dashboard/attendance/_components/add-absence-dialog.tsx).
 */
export function ReplacementDialog({
  visitId,
  seatId,
  workerName,
  absent,
  open,
  onOpenChange,
}: {
  visitId: string;
  seatId: string | null;
  workerName: string;
  /** The seat is held by an absence: the reason defaults to it. */
  absent: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("VisitTeam");
  const errorMessage = useErrorMessage();
  const reasonLabel = useCodeLabel("ReplacementReasons");
  const [chosen, setChosen] = React.useState("");
  const [reason, setReason] = React.useState<ReplacementReason>(absent ? "ABSENCE" : "SCHEDULE_CHANGE");
  const [override, setOverride] = React.useState<OverrideDraft>(EMPTY_OVERRIDE);
  const [busy, setBusy] = React.useState(false);

  const suggestions = useQuery({
    queryKey: [...pathKey(`${VISITS_PATH}/${visitId}`), "replacements", seatId ?? ""],
    queryFn: () => suggestReplacementsQuery({ seatId: seatId ?? "" }),
    enabled: open && Boolean(seatId),
  });
  const selected = suggestions.data?.ranked.find((candidate) => candidate.workerId === chosen) ?? null;
  const manager = selected ? needsManager(selected.findings) : false;
  const derogation = selected ? needsDerogation(selected.findings) : false;

  const close = () => {
    onOpenChange(false);
    setChosen("");
    setOverride(EMPTY_OVERRIDE);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !seatId) return;
    setBusy(true);
    const result = await replaceSeatAction({
      seatId,
      workerId: selected.workerId,
      reason,
      override: manager ? { reason: override.reason, derogationRef: override.derogationRef || null } : null,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Replaced"));
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-6 text-info" />
            {t("ReplaceTitle")}
          </DialogTitle>
          <DialogDescription>{t("ReplaceHint", { name: workerName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="replacement-reason">{t("ReplaceReason")}</Label>
            <NativeSelect
              id="replacement-reason"
              className="w-full"
              value={reason}
              onChange={(event) => setReason(event.target.value as ReplacementReason)}
            >
              {REPLACEMENT_REASONS.map((code) => (
                <NativeSelectOption key={code} value={code}>
                  {reasonLabel(code)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {suggestions.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : !suggestions.data || suggestions.data.ranked.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("NoReplacement")}</p>
          ) : (
            <RadioGroup
              value={chosen}
              onValueChange={(value) => {
                setChosen(value);
                setOverride(EMPTY_OVERRIDE);
              }}
              className="max-h-[40vh] gap-2 overflow-y-auto pe-1"
            >
              {suggestions.data.ranked.map((candidate) => (
                <RankedRow key={candidate.workerId} candidate={candidate} />
              ))}
            </RadioGroup>
          )}
          {suggestions.data && suggestions.data.excluded.length > 0 && (
            <Excluded excluded={suggestions.data.excluded} />
          )}
          {selected && manager && (
            <OverrideFields
              idPrefix="replacement"
              draft={override}
              onChange={setOverride}
              needsDerogation={derogation}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              variant="success"
              loading={busy}
              disabled={!selected || (manager && !overrideReady(override, derogation))}
            >
              {t("Replace")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Ranked = ReplacementSuggestions["ranked"][number];

function RankedRow({ candidate }: { candidate: Ranked }) {
  const t = useTranslations("VisitTeam");
  const tierLabel = useCodeLabel("ReplacementTiers");
  const id = `replacement-${candidate.workerId}`;
  const blocked = refused(candidate.findings);
  return (
    <label
      htmlFor={id}
      className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 ${blocked ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <RadioGroupItem id={id} value={candidate.workerId} disabled={blocked} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-bold">
            <bdi>{staffName(candidate)}</bdi>
          </span>
          <span className={candidate.overtime ? "font-semibold text-warning-ink" : "text-muted-foreground"}>
            {t("WeekHours")}{" "}
            <Ltr>
              {hoursAndMinutes(candidate.loadBeforeMin)} → {hoursAndMinutes(candidate.loadAfterMin)}
            </Ltr>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusChip tone="neutral" label={tierLabel(candidate.tier)} />
          {candidate.knowsSite && <StatusChip tone="success" label={t("KnowsSite")} />}
          {candidate.overtime && <StatusChip tone="warning" label={t("Overtime")} />}
          {candidate.onRestDay && <StatusChip tone="info" label={t("OnRestDay")} />}
          {candidate.leaveRequested && <StatusChip tone="warning" label={t("LeaveRequested")} />}
        </div>
        <FindingChips findings={candidate.findings} />
      </div>
    </label>
  );
}

function Excluded({ excluded }: { excluded: ReplacementSuggestions["excluded"] }) {
  const t = useTranslations("VisitTeam");
  const exclusionLabel = useCodeLabel("ReplacementExclusions");
  const separator = useLocale() === "ar" ? "، " : ", ";
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-2">
          <ChevronDown className="size-4" />
          {t("ExcludedCount", { count: excluded.length })}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
          {excluded.map((entry) => (
            <li key={entry.workerId} className="flex flex-wrap gap-x-2">
              <span className="font-semibold">
                <bdi>{staffName(entry)}</bdi>
              </span>
              <span className="text-muted-foreground">{entry.reasons.map(exclusionLabel).join(separator)}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
