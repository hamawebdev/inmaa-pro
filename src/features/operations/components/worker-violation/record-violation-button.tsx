import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { INSPECTIONS_PATH } from "../../services/inspections";
import {
  listViolationCandidatesQuery,
  recordWorkerViolationAction,
  type ViolationCandidate,
  type ViolationRecordKind,
} from "../../services/worker-violations";

/**
 * «تسجيل مخالفة»: shown to a writer when the record finds a worker at fault
 * who is not handed to HR yet; opens the dialog that hands her over (People's
 * `createViolationFromSource`). Nothing is drawn otherwise.
 *
 *     <RecordViolationButton kind="INSPECTION" sourceId={inspection.id} />
 */
export function RecordViolationButton({
  kind,
  sourceId,
  size,
  iconOnly = false,
}: {
  kind: ViolationRecordKind;
  sourceId: string;
  size?: "sm";
  iconOnly?: boolean;
}) {
  const t = useTranslations("WorkerViolation");
  const writes = useSectionLevel("REQUESTS") === "WRITE";
  const [open, setOpen] = React.useState(false);
  const candidates = useQuery({
    queryKey: [...pathKey(INSPECTIONS_PATH), "violation-candidates", kind, sourceId],
    queryFn: () => listViolationCandidatesQuery({ kind, sourceId }),
    enabled: writes,
  });
  const waiting = (candidates.data ?? []).filter((each) => each.violation === null);
  if (!writes || waiting.length === 0) return null;

  return (
    <>
      <Button variant="outline" size={size} title={t("Button")} onClick={() => setOpen(true)}>
        <Gavel />
        <span className={iconOnly ? "sr-only 2xl:not-sr-only" : undefined}>{t("Button")}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <RecordViolationForm kind={kind} sourceId={sourceId} candidates={waiting} onClose={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecordViolationForm({
  kind,
  sourceId,
  candidates,
  onClose,
}: {
  kind: ViolationRecordKind;
  sourceId: string;
  candidates: ViolationCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("WorkerViolation");
  const errorMessage = useErrorMessage();
  const [workerId, setWorkerId] = React.useState(candidates[0]?.workerId ?? "");
  const chosen = candidates.find((each) => each.workerId === workerId);
  const [description, setDescription] = React.useState(chosen?.description ?? "");
  const [serious, setSerious] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const choose = (next: string) => {
    setWorkerId(next);
    setDescription(candidates.find((each) => each.workerId === next)?.description ?? "");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    const result = await recordWorkerViolationAction({ kind, sourceId, workerId, description, serious });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Saved", { number: `⁦${result.data.number}⁩` }));
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{t("Title")}</DialogTitle>
        <DialogDescription>{t(`Description.${kind}`)}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="violation-worker">{t("Worker")}</Label>
        <NativeSelect
          id="violation-worker"
          className="w-full"
          value={workerId}
          onChange={(event) => choose(event.target.value)}
        >
          {candidates.map((each) => (
            <NativeSelectOption key={each.workerId} value={each.workerId}>
              {each.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="violation-description">{t("What")}</Label>
        <Textarea
          id="violation-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="violation-serious" checked={serious} onCheckedChange={(next) => setSerious(next === true)} />
        <Label htmlFor="violation-serious" className="grid gap-1 font-normal">
          <span className="font-medium">{t("Serious")}</span>
          <span className="text-sm text-muted-foreground">{t("SeriousHint")}</span>
        </Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("Back")}
        </Button>
        <Button type="submit" variant="success" loading={busy} disabled={!chosen || description.trim() === ""}>
          {t("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
