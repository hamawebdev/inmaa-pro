import * as React from "react";

import { Handshake, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceToggle } from "@/features/operations/components/choice-toggle";
import {
  COMPLAINT_FAULTS,
  COMPLAINT_SETTLEMENTS,
  recordFirstResponseAction,
  settleComplaintAction,
  type ComplaintDetail,
  type ComplaintFault,
  type ComplaintSettlement,
} from "@/features/operations/services/complaints";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { dinarsToMoney } from "@/lib/units";

import { useDates } from "../../../worker-attendance/_components/attendance-helpers";
import { isolate, workerName } from "./complaint-format";

// ── The first answer ────────────────────────────────────────────────────────

/** «تسجيل أول رد»: the office answered the client; the counter stops. What was said is kept, if typed. */
export function FirstResponseDialog({
  complaint,
  open,
  onOpenChange,
}: {
  complaint: Pick<ComplaintDetail, "id" | "number">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <FirstResponseForm complaint={complaint} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FirstResponseForm({
  complaint,
  onClose,
}: {
  complaint: Pick<ComplaintDetail, "id" | "number">;
  onClose: () => void;
}) {
  const t = useTranslations("Complaints");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const answer = await recordFirstResponseAction({ complaintId: complaint.id, note });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("Answer.Failed")));
      return;
    }
    toast.success(t("Answer.Saved"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquareReply className="size-6 text-info" />
          {t("Answer.Title")}
        </DialogTitle>
        <DialogDescription>{t("Answer.Description", { number: isolate(complaint.number) })}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5" noValidate>
        <Field>
          <FieldLabel htmlFor="complaint-answer">{t("Answer.Note")}</FieldLabel>
          <Textarea
            id="complaint-answer"
            rows={3}
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            {t("Answer.Save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ── The settlement ──────────────────────────────────────────────────────────

/**
 * «تسوية الشكوى»: whether the centre was at fault («إذا كانت المشكلة بسبب
 * المؤسسة»), and his policy («سياسة التعويض»): the service done again, on a
 * day chosen now, or a discount agreed with the client (the manager's), or
 * none, or another way written out. A worker the complaint names may be handed
 * to HR as a violation.
 *
 * Closest academy component: attendance/_components/add-absence-dialog.tsx.
 */
export function SettleDialog({
  complaint,
  today,
  open,
  onOpenChange,
}: {
  complaint: ComplaintDetail;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <SettleForm complaint={complaint} today={today} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type Problem = "fault" | "settlement" | "date" | "amount" | "note";

function SettleForm({ complaint, today, onClose }: { complaint: ComplaintDetail; today: string; onClose: () => void }) {
  const t = useTranslations("Complaints");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const dates = useDates();
  const faultLabel = useCodeLabel("Complaints.Faults");
  const settlementLabel = useCodeLabel("Complaints.Settlements");
  const mayDiscount = useCan("complaint.settleDiscount");

  // A discount is the manager's and goes on the file's invoice; a redo repeats a visit of the file.
  const offered = COMPLAINT_SETTLEMENTS.filter(
    (code) =>
      (code !== "DISCOUNT" || (mayDiscount && complaint.file !== null)) &&
      (code !== "REDO_SERVICE" || complaint.repeatableVisits.length > 0),
  );

  const [fault, setFault] = React.useState<ComplaintFault | null>(null);
  const [settlement, setSettlement] = React.useState<ComplaintSettlement | null>(null);
  const [redoDate, setRedoDate] = React.useState(today);
  const [redoTime, setRedoTime] = React.useState("");
  const [sourceVisitId, setSourceVisitId] = React.useState(complaint.repeatableVisits[0]?.id ?? "");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [referWorker, setReferWorker] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const dinars = Number(amount.replace(",", "."));
  const problems = new Set<Problem>();
  if (!fault) problems.add("fault");
  if (!settlement) problems.add("settlement");
  if (settlement === "REDO_SERVICE" && !redoDate) problems.add("date");
  if (settlement === "DISCOUNT" && !(Number.isFinite(dinars) && dinars > 0)) problems.add("amount");
  if (settlement === "OTHER" && !note.trim()) problems.add("note");
  const shows = (problem: Problem) => tried && problems.has(problem);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (problems.size > 0 || !fault || !settlement) return;
    setBusy(true);
    const answer = await settleComplaintAction({
      complaintId: complaint.id,
      centreAtFault: fault,
      settlement,
      amount: settlement === "DISCOUNT" ? dinarsToMoney(dinars) : null,
      redo:
        settlement === "REDO_SERVICE"
          ? { date: redoDate, startTime: redoTime || null, sourceVisitId: sourceVisitId || null }
          : null,
      resolutionNote: note,
      referWorker: complaint.worker !== null && referWorker,
    });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("Settle.Failed")));
      return;
    }
    const { redoVisit, violation } = answer.data;
    const description = [
      redoVisit ? t("Settle.RedoPlanned", { number: isolate(redoVisit.number) }) : "",
      violation ? t("Settle.ViolationSent", { number: isolate(violation.number) }) : "",
    ]
      .filter(Boolean)
      .join(" ");
    toast.success(t("Settle.Saved"), description ? { description } : undefined);
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Handshake className="size-6 text-success" />
          {t("Settle.Title")}
        </DialogTitle>
        <DialogDescription>{t("Settle.Description", { number: isolate(complaint.number) })}</DialogDescription>
      </DialogHeader>

      <form onSubmit={save} className="space-y-5" noValidate>
        <Field data-invalid={shows("fault")}>
          <FieldLabel>{t("Fields.Fault")}</FieldLabel>
          <ChoiceToggle
            value={fault}
            onChange={setFault}
            ariaLabel={t("Fields.Fault")}
            invalid={shows("fault")}
            options={COMPLAINT_FAULTS.map((code) => ({ value: code, label: faultLabel(code) }))}
          />
          {shows("fault") && <FieldError>{t("New.Required")}</FieldError>}
        </Field>

        <Field data-invalid={shows("settlement")}>
          <FieldLabel>{t("Fields.Settlement")}</FieldLabel>
          <ChoiceToggle
            value={settlement}
            onChange={setSettlement}
            ariaLabel={t("Fields.Settlement")}
            invalid={shows("settlement")}
            options={offered.map((code) => ({ value: code, label: settlementLabel(code) }))}
          />
          {shows("settlement") && <FieldError>{t("New.Required")}</FieldError>}
        </Field>

        {settlement === "REDO_SERVICE" && (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={shows("date")}>
                <FieldLabel htmlFor="settle-redo-date">{t("Settle.RedoDate")}</FieldLabel>
                <Input
                  id="settle-redo-date"
                  type="date"
                  dir="ltr"
                  min={today}
                  value={redoDate}
                  onChange={(event) => setRedoDate(event.target.value)}
                  aria-invalid={shows("date")}
                />
                {shows("date") && <FieldError>{t("New.Required")}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="settle-redo-time">{t("Settle.RedoTime")}</FieldLabel>
                <Input
                  id="settle-redo-time"
                  type="time"
                  dir="ltr"
                  value={redoTime}
                  onChange={(event) => setRedoTime(event.target.value)}
                />
              </Field>
            </div>
            {complaint.repeatableVisits.length > 1 ? (
              <Field>
                <FieldLabel htmlFor="settle-redo-source">{t("Settle.RedoSource")}</FieldLabel>
                <Select value={sourceVisitId} onValueChange={setSourceVisitId}>
                  <SelectTrigger id="settle-redo-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {complaint.repeatableVisits.map((visit) => (
                      <SelectItem key={visit.id} value={visit.id}>
                        <Ltr>{dates.short(visit.visitDate)}</Ltr>
                        <Ltr className="text-muted-foreground">{visit.number}</Ltr>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <FieldDescription>{t("Settle.RedoHint")}</FieldDescription>
          </div>
        )}

        {settlement === "DISCOUNT" && (
          <Field data-invalid={shows("amount")}>
            <FieldLabel htmlFor="settle-amount">{t("Settle.Amount")}</FieldLabel>
            <Input
              id="settle-amount"
              type="number"
              dir="ltr"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={shows("amount")}
            />
            {shows("amount") ? (
              <FieldError>{t("New.Required")}</FieldError>
            ) : (
              <FieldDescription>{t("Settle.AmountHint")}</FieldDescription>
            )}
          </Field>
        )}

        <Field data-invalid={shows("note")}>
          <FieldLabel htmlFor="settle-note">
            {settlement === "OTHER" ? t("Settle.NoteRequired") : t("Settle.Note")}
          </FieldLabel>
          <Textarea
            id="settle-note"
            rows={3}
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            aria-invalid={shows("note")}
          />
          {shows("note") && <FieldError>{t("New.Required")}</FieldError>}
        </Field>

        {complaint.worker && (
          <label className="flex min-w-0 items-start gap-3 text-base">
            <Checkbox
              className="mt-1"
              checked={referWorker}
              onCheckedChange={(checked) => setReferWorker(checked === true)}
            />
            <span className="min-w-0">
              <span className="block font-semibold">
                {t("Settle.ReferWorker", { name: workerName(complaint.worker) })}
              </span>
              <span className="block text-sm text-muted-foreground">{t("Settle.ReferHint")}</span>
            </span>
          </label>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            {t("Settle.Save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
