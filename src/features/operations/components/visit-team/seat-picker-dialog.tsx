import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { assignVisitWorkerAction, listSeatCandidatesQuery, type SeatCandidate } from "../../services/assignment";
import { VISITS_PATH } from "../../services/programme";
import { searchKey } from "../day-board/day-board-data";

import { FindingChips, LoadAgainstCapacity } from "./finding-chips";
import { OverrideFields } from "./override-fields";
import { EMPTY_OVERRIDE, needsDerogation, needsManager, overrideReady, refused, type OverrideDraft } from "./team-data";

/**
 * The seat picker: every worker who may be given a seat of the visit, each with
 * her week's load against her capacity and what the working-time rules say if
 * she takes it. A worker the rules refuse cannot be chosen; one only the manager
 * may let through asks for his reason (and, for night work by a woman, the
 * labour inspector's derogation).
 *
 * Closest academy screen: the add-absence dialog of the attendance family
 * (pages/dashboard/attendance/_components/add-absence-dialog.tsx): a dialog with
 * a person picked from a list, a few fields, Cancel and Save at its foot.
 */
export function SeatPickerDialog({
  visitId,
  open,
  onOpenChange,
}: {
  visitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("VisitTeam");
  const errorMessage = useErrorMessage();
  const roleLabel = useCodeLabel("Options.WorkerRole");
  const roleLabelFeminine = useCodeLabel("Options.WorkerRoleFeminine");
  const [search, setSearch] = React.useState("");
  const [chosen, setChosen] = React.useState<string>("");
  const [override, setOverride] = React.useState<OverrideDraft>(EMPTY_OVERRIDE);
  const [busy, setBusy] = React.useState(false);

  const candidates = useQuery({
    queryKey: [...pathKey(`${VISITS_PATH}/${visitId}`), "candidates"],
    queryFn: () => listSeatCandidatesQuery({ visitId }),
    enabled: open,
  });

  const wanted = searchKey(search);
  const shown = (candidates.data ?? []).filter(
    (candidate) =>
      !wanted || searchKey(`${candidate.firstName} ${candidate.lastName} ${candidate.number}`).includes(wanted),
  );
  const selected = candidates.data?.find((candidate) => candidate.id === chosen) ?? null;
  const manager = selected ? needsManager(selected.findings) : false;
  const derogation = selected ? needsDerogation(selected.findings) : false;

  const close = () => {
    onOpenChange(false);
    setChosen("");
    setSearch("");
    setOverride(EMPTY_OVERRIDE);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    const result = await assignVisitWorkerAction({
      visitId,
      workerId: selected.id,
      override: manager ? { reason: override.reason, derogationRef: override.derogationRef || null } : null,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    const warnings = result.data.findings.filter((finding) => finding.level === "WARNING" || finding.level === "FLAG");
    toast.success(warnings.length > 0 ? t("AddedWithWarnings", { count: warnings.length }) : t("Added"));
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-6 text-success" />
            {t("AddWorker")}
          </DialogTitle>
          <DialogDescription>{t("AddWorkerHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-12"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("SearchWorker")}
              aria-label={t("SearchWorker")}
            />
          </div>
          {candidates.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("NoCandidate")}</p>
          ) : (
            <RadioGroup
              value={chosen}
              onValueChange={(value) => {
                setChosen(value);
                setOverride(EMPTY_OVERRIDE);
              }}
              className="max-h-[45vh] gap-2 overflow-y-auto pe-1"
            >
              {shown.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  role={
                    candidate.role ? (candidate.sex === "FEMALE" ? roleLabelFeminine : roleLabel)(candidate.role) : null
                  }
                />
              ))}
            </RadioGroup>
          )}
          {selected && manager && (
            <OverrideFields idPrefix="seat" draft={override} onChange={setOverride} needsDerogation={derogation} />
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
              {t("Add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({ candidate, role }: { candidate: SeatCandidate; role: string | null }) {
  const t = useTranslations("VisitTeam");
  const blocked = candidate.sanctioned || refused(candidate.findings);
  const id = `candidate-${candidate.id}`;
  return (
    <label
      htmlFor={id}
      className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 ${blocked ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <RadioGroupItem id={id} value={candidate.id} disabled={blocked} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-bold">
            <bdi>{`${candidate.firstName} ${candidate.lastName}`}</bdi>
          </span>
          <LoadAgainstCapacity loadMin={candidate.loadMin} capacityMin={candidate.capacityMin} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <Ltr>{candidate.number}</Ltr>
          {role && <span>{role}</span>}
          <span>{candidate.sameZone ? t("SameZone") : t("OtherZone")}</span>
          {candidate.isReserve && <span>{t("Reserve")}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {candidate.sanctioned && <StatusChip tone="danger" label={t("Sanctioned")} />}
          {candidate.leaveRequested && <StatusChip tone="warning" label={t("LeaveRequested")} />}
        </div>
        <FindingChips findings={candidate.findings} />
      </div>
    </label>
  );
}
