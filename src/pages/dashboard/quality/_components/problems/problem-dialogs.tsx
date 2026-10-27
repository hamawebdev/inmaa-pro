import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { CircleCheckBig, Forward, MessageSquareWarning, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { DateField, TimeField } from "@/components/pickers";
import { Button } from "@/components/ui/button";
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
  COMPLAINT_KINDS,
  complaintPath,
  listComplaintChoicesQuery,
  listComplaintVisitsQuery,
  type ComplaintKind,
} from "@/features/operations/services/complaints";
import {
  HANDED_TO,
  TYPED_PROBLEM_VIAS,
  closeProblemReportAction,
  handOverProblemAction,
  logProblemReportAction,
  problemToComplaintAction,
  type HandedTo,
  type ProblemLine,
} from "@/features/operations/services/problem-reports";
import { PROBLEM_KINDS, type ProblemKind } from "@/features/operations/validators/option-codes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { useDates } from "../../../worker-attendance/_components/attendance-helpers";
import { isolate, qualityKey, workerName } from "../complaints/complaint-format";

const NONE = "NONE";

/** One dialog box at a time, its form mounted afresh on every opening. */
function Shell({
  open,
  onOpenChange,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "sm:max-w-xl" : "sm:max-w-lg"}>{children}</DialogContent>
    </Dialog>
  );
}

function Footer({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  const tCommon = useTranslations("Common");
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
        {tCommon("Cancel")}
      </Button>
      <Button type="submit" variant="success" loading={busy}>
        {label}
      </Button>
    </DialogFooter>
  );
}

// ── A report phoned in ──────────────────────────────────────────────────────

type Via = (typeof TYPED_PROBLEM_VIAS)[number];
type LogProblem = "file" | "date" | "kind";

/**
 * «تسجيل بلاغ»: a problem the office hears of by phone or from a supervisor
 * («فوراً», offline, is the moment the office types it). The kinds are his
 * worker's notes («نوع المشكلة»).
 *
 * Closest academy component: attendance/_components/add-absence-dialog.tsx.
 */
export function LogProblemDialog({
  open,
  onOpenChange,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}) {
  return (
    <Shell open={open} onOpenChange={onOpenChange} wide>
      <LogProblemForm today={today} onClose={() => onOpenChange(false)} />
    </Shell>
  );
}

function LogProblemForm({ today, onClose }: { today: string; onClose: () => void }) {
  const t = useTranslations("Problems");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const dates = useDates();
  const kindLabel = useCodeLabel("ProblemKinds");
  const viaLabel = useCodeLabel("Problems.Vias");
  const divisionLabel = useCodeLabel("Options.Division");
  const visitStatusLabel = useCodeLabel("VisitStatuses");

  const [clientId, setClientId] = React.useState("");
  const [fileId, setFileId] = React.useState("");
  const [visitId, setVisitId] = React.useState(NONE);
  const [workerId, setWorkerId] = React.useState(NONE);
  const [via, setVia] = React.useState<Via>("PHONE");
  const [date, setDate] = React.useState(today);
  const [time, setTime] = React.useState("");
  const [kind, setKind] = React.useState<ProblemKind | "">("");
  const [details, setDetails] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const choices = useQuery({
    queryKey: qualityKey("complaints", "choices"),
    queryFn: () => listComplaintChoicesQuery({}),
  });
  const clients = (choices.data ?? []).filter((client) => client.files.length > 0);
  const files = clients.find((client) => client.id === clientId)?.files ?? [];
  const visits = useQuery({
    queryKey: qualityKey("complaints", "choices", fileId),
    queryFn: () => listComplaintVisitsQuery({ fileId }),
    enabled: fileId !== "",
  });
  const visit = (visits.data ?? []).find((each) => each.id === visitId);

  const problems = new Set<LogProblem>();
  if (!fileId) problems.add("file");
  if (!date || date > today) problems.add("date");
  if (!kind) problems.add("kind");
  const shows = (problem: LogProblem) => tried && problems.has(problem);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (problems.size > 0 || !kind) return;
    setBusy(true);
    const answer = await logProblemReportAction({
      fileId,
      visitId: visitId === NONE ? null : visitId,
      reportedVia: via,
      reportedByWorkerId: workerId === NONE ? null : workerId,
      occurredDate: date,
      occurredTime: time || null,
      kind,
      details,
    });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("Log.Failed")));
      return;
    }
    toast.success(t("Log.Saved"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <TriangleAlert className="size-6 text-warning-ink" />
          {t("Log.Title")}
        </DialogTitle>
        <DialogDescription>{t("Log.Description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={shows("file")}>
            <FieldLabel htmlFor="problem-client">{t("Fields.Client")}</FieldLabel>
            <Select
              value={clientId}
              onValueChange={(next) => {
                setClientId(next);
                const own = clients.find((client) => client.id === next)?.files ?? [];
                setFileId(own.length === 1 ? own[0].id : (own.find((file) => file.current)?.id ?? ""));
                setVisitId(NONE);
                setWorkerId(NONE);
              }}
            >
              <SelectTrigger id="problem-client" className="w-full" aria-invalid={shows("file")}>
                <SelectValue placeholder={choices.isPending ? tCommon("Loading") : t("Log.ChooseClient")} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    <bdi>{client.name}</bdi>
                    <Ltr className="text-muted-foreground">{client.number}</Ltr>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={shows("file")}>
            <FieldLabel htmlFor="problem-file">{t("Fields.File")}</FieldLabel>
            <Select
              value={fileId}
              onValueChange={(next) => {
                setFileId(next);
                setVisitId(NONE);
                setWorkerId(NONE);
              }}
              disabled={files.length === 0}
            >
              <SelectTrigger id="problem-file" className="w-full" aria-invalid={shows("file")}>
                <SelectValue placeholder={t("Log.ChooseFile")} />
              </SelectTrigger>
              <SelectContent>
                {files.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    <Ltr>{file.number}</Ltr>
                    <span className="text-muted-foreground">
                      {divisionLabel(file.division)}
                      {file.siteName && (
                        <>
                          {" · "}
                          <bdi>{file.siteName}</bdi>
                        </>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {shows("file") && <FieldError className="sm:col-span-2">{t("Log.Required")}</FieldError>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="problem-visit">{t("Fields.Visit")}</FieldLabel>
            <Select
              value={visitId}
              onValueChange={(next) => {
                setVisitId(next);
                setWorkerId(NONE);
                const picked = (visits.data ?? []).find((each) => each.id === next);
                if (picked) setDate(picked.visitDate);
              }}
              disabled={!fileId}
            >
              <SelectTrigger id="problem-visit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("Log.NoVisit")}</SelectItem>
                {(visits.data ?? []).map((each) => (
                  <SelectItem key={each.id} value={each.id}>
                    <Ltr>{dates.short(each.visitDate)}</Ltr>
                    <span className="text-muted-foreground">
                      <Ltr>{each.number}</Ltr> · {visitStatusLabel(each.status)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="problem-worker">{t("Fields.Reporter")}</FieldLabel>
            <Select value={workerId} onValueChange={setWorkerId} disabled={!visit || visit.workers.length === 0}>
              <SelectTrigger id="problem-worker" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("Log.NoWorker")}</SelectItem>
                {(visit?.workers ?? []).map((worker) => (
                  <SelectItem key={worker.id} value={worker.id}>
                    <bdi>{workerName(worker)}</bdi>
                    <Ltr className="text-muted-foreground">{worker.number}</Ltr>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="problem-via">{t("Fields.Via")}</FieldLabel>
            <Select value={via} onValueChange={(next) => setVia(next as Via)}>
              <SelectTrigger id="problem-via" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPED_PROBLEM_VIAS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {viaLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={shows("date")}>
            <FieldLabel htmlFor="problem-date">{t("Fields.Date")}</FieldLabel>
            <DateField id="problem-date" max={today} value={date} onChange={setDate} aria-invalid={shows("date")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="problem-time">{t("Fields.Time")}</FieldLabel>
            <TimeField id="problem-time" clearable value={time} onChange={setTime} />
          </Field>
          {shows("date") && <FieldError className="sm:col-span-3">{t("Log.DateHint")}</FieldError>}
        </div>

        <Field data-invalid={shows("kind")}>
          <FieldLabel htmlFor="problem-kind">{t("Fields.Kind")}</FieldLabel>
          <Select value={kind} onValueChange={(next) => setKind(next as ProblemKind)}>
            <SelectTrigger id="problem-kind" className="w-full" aria-invalid={shows("kind")}>
              <SelectValue placeholder={t("Log.ChooseKind")} />
            </SelectTrigger>
            <SelectContent>
              {PROBLEM_KINDS.map((code) => (
                <SelectItem key={code} value={code}>
                  {kindLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {shows("kind") && <FieldError>{t("Log.Required")}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="problem-details">{t("Fields.Details")}</FieldLabel>
          <Textarea
            id="problem-details"
            rows={3}
            value={details}
            maxLength={1000}
            onChange={(event) => setDetails(event.target.value)}
          />
        </Field>

        <Footer busy={busy} onClose={onClose} label={t("Log.Save")} />
      </form>
    </>
  );
}

// ── Handing over ────────────────────────────────────────────────────────────

/** «إحالة»: the report goes to the owner who can act on it. */
export function HandOverDialog({
  report,
  onOpenChange,
}: {
  report: ProblemLine | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Shell open={report !== null} onOpenChange={onOpenChange}>
      {report && <HandOverForm report={report} onClose={() => onOpenChange(false)} />}
    </Shell>
  );
}

/** Who usually deals with each kind: offered first. */
const USUAL_OWNER: Partial<Record<ProblemKind, HandedTo>> = {
  MATERIAL_SHORTAGE: "STOCK",
  EQUIPMENT_SHORTAGE: "STOCK",
  EXTRA_SERVICE: "CLIENTS",
  AREA_UNAVAILABLE: "CLIENTS",
  OBSTACLE: "CLIENTS",
  DAMAGE_DURING_WORK: "PEOPLE",
  INJURY_ACCIDENT: "PEOPLE",
};

function HandOverForm({ report, onClose }: { report: ProblemLine; onClose: () => void }) {
  const t = useTranslations("Problems");
  const errorMessage = useErrorMessage();
  const kindLabel = useCodeLabel("ProblemKinds");
  const handedLabel = useCodeLabel("Problems.HandedTo");
  const [to, setTo] = React.useState<HandedTo | null>(USUAL_OWNER[report.kind] ?? null);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (!to) return;
    setBusy(true);
    const answer = await handOverProblemAction({ problemReportId: report.id, to });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("HandOver.Failed")));
      return;
    }
    toast.success(t("HandOver.Saved", { to: handedLabel(to) }));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Forward className="size-6 text-info" />
          {t("HandOver.Title")}
        </DialogTitle>
        <DialogDescription>{t("HandOver.Description", { kind: kindLabel(report.kind) })}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5" noValidate>
        <Field data-invalid={tried && !to}>
          <FieldLabel>{t("Fields.HandedTo")}</FieldLabel>
          <ChoiceToggle
            value={to}
            onChange={setTo}
            ariaLabel={t("Fields.HandedTo")}
            invalid={tried && !to}
            options={HANDED_TO.map((code) => ({ value: code, label: handedLabel(code) }))}
          />
          {to ? (
            <FieldDescription>{t(`HandOver.Hint.${to}`)}</FieldDescription>
          ) : (
            tried && <FieldError>{t("Log.Required")}</FieldError>
          )}
        </Field>
        <Footer busy={busy} onClose={onClose} label={t("HandOver.Save")} />
      </form>
    </>
  );
}

// ── Closing ─────────────────────────────────────────────────────────────────

/** «إغلاق البلاغ» with what was done («الإجراء المتخذ»). */
export function CloseProblemDialog({
  report,
  onOpenChange,
}: {
  report: ProblemLine | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Shell open={report !== null} onOpenChange={onOpenChange}>
      {report && <CloseForm report={report} onClose={() => onOpenChange(false)} />}
    </Shell>
  );
}

function CloseForm({ report, onClose }: { report: ProblemLine; onClose: () => void }) {
  const t = useTranslations("Problems");
  const errorMessage = useErrorMessage();
  const kindLabel = useCodeLabel("ProblemKinds");
  const [actionTaken, setActionTaken] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const missing = actionTaken.trim() === "";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (missing) return;
    setBusy(true);
    const answer = await closeProblemReportAction({ problemReportId: report.id, actionTaken });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("Close.Failed")));
      return;
    }
    toast.success(t("Close.Saved"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CircleCheckBig className="size-6 text-success" />
          {t("Close.Title")}
        </DialogTitle>
        <DialogDescription>{t("Close.Description", { kind: kindLabel(report.kind) })}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5" noValidate>
        <Field data-invalid={tried && missing}>
          <FieldLabel htmlFor="problem-action">{t("Fields.ActionTaken")}</FieldLabel>
          <Textarea
            id="problem-action"
            rows={3}
            value={actionTaken}
            maxLength={1000}
            onChange={(event) => setActionTaken(event.target.value)}
            aria-invalid={tried && missing}
          />
          {tried && missing && <FieldError>{t("Log.Required")}</FieldError>}
        </Field>
        <Footer busy={busy} onClose={onClose} label={t("Close.Save")} />
      </form>
    </>
  );
}

// ── A resident's complaint ──────────────────────────────────────────────────

/** «تسجيل كشكوى»: a resident's complaint on the order becomes a complaint, with its counter. */
export function ToComplaintDialog({
  report,
  onOpenChange,
}: {
  report: ProblemLine | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Shell open={report !== null} onOpenChange={onOpenChange} wide>
      {report && <ToComplaintForm report={report} onClose={() => onOpenChange(false)} />}
    </Shell>
  );
}

function ToComplaintForm({ report, onClose }: { report: ProblemLine; onClose: () => void }) {
  const t = useTranslations("Problems");
  const tComplaints = useTranslations("Complaints");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const kindLabel = useCodeLabel("Complaints.Kinds");
  const [kind, setKind] = React.useState<ComplaintKind | "">("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [description, setDescription] = React.useState(report.details ?? "");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (!kind) return;
    setBusy(true);
    const answer = await problemToComplaintAction({
      problemReportId: report.id,
      kind,
      description,
      complainantName: name,
      complainantPhone: phone,
    });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("ToComplaint.Failed")));
      return;
    }
    const { complaintId, number } = answer.data;
    toast.success(tComplaints("New.Saved", { number: isolate(number) }), {
      action: { label: tComplaints("Open"), onClick: () => navigate(complaintPath(complaintId)) },
    });
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquareWarning className="size-6 text-warning-ink" />
          {t("ToComplaint.Title")}
        </DialogTitle>
        <DialogDescription>{t("ToComplaint.Description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5" noValidate>
        <Field data-invalid={tried && !kind}>
          <FieldLabel htmlFor="to-complaint-kind">{tComplaints("Fields.Kind")}</FieldLabel>
          <Select value={kind} onValueChange={(next) => setKind(next as ComplaintKind)}>
            <SelectTrigger id="to-complaint-kind" className="w-full" aria-invalid={tried && !kind}>
              <SelectValue placeholder={tComplaints("New.Choose")} />
            </SelectTrigger>
            <SelectContent>
              {COMPLAINT_KINDS.map((code) => (
                <SelectItem key={code} value={code}>
                  {kindLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tried && !kind && <FieldError>{t("Log.Required")}</FieldError>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="to-complaint-name">{tComplaints("Fields.Complainant")}</FieldLabel>
            <Input
              id="to-complaint-name"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="to-complaint-phone">{tComplaints("Fields.ComplainantPhone")}</FieldLabel>
            <Input
              id="to-complaint-phone"
              dir="ltr"
              inputMode="tel"
              value={phone}
              maxLength={20}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="to-complaint-description">{tComplaints("Fields.Description")}</FieldLabel>
          <Textarea
            id="to-complaint-description"
            rows={3}
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Footer busy={busy} onClose={onClose} label={t("ToComplaint.Save")} />
      </form>
    </>
  );
}
