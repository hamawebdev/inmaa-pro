import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { MessageSquareWarning } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPLAINT_KINDS,
  TYPED_COMPLAINT_CHANNELS,
  complaintPath,
  listComplaintChoicesQuery,
  listComplaintVisitsQuery,
  openComplaintAction,
  type ComplaintKind,
} from "@/features/operations/services/complaints";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { useDates } from "../../../worker-attendance/_components/attendance-helpers";
import { isolate, qualityKey, workerName } from "./complaint-bits";

/** A Select item cannot carry an empty value: this one stands for "none". */
const NONE = "NONE";

type Channel = (typeof TYPED_COMPLAINT_CHANNELS)[number];

/**
 * «شكوى جديدة»: the office records a complaint as the client tells it. His
 * study: «العميل ← المكتب، ثم تسجيل الشكوى … نوع المشكلة». The counter starts
 * when it is saved.
 *
 * Closest academy component: attendance/_components/add-absence-dialog.tsx
 * (who, what kind, the details; Cancel and Save at the foot), with the client,
 * his file, the visit and the worker the complaint is about.
 */
export function NewComplaintDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {/* Radix unmounts the content on close: the form starts afresh on every opening. */}
        <ComplaintForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type Problem = "client" | "kind" | "description";

function ComplaintForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Complaints");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const dates = useDates();
  const channelLabel = useCodeLabel("Complaints.Channels");
  const kindLabel = useCodeLabel("Complaints.Kinds");
  const divisionLabel = useCodeLabel("Options.Division");
  const visitStatusLabel = useCodeLabel("VisitStatuses");

  const [channel, setChannel] = React.useState<Channel>("PHONE");
  const [clientId, setClientId] = React.useState("");
  const [fileId, setFileId] = React.useState(NONE);
  const [visitId, setVisitId] = React.useState(NONE);
  const [workerId, setWorkerId] = React.useState(NONE);
  const [complainantName, setComplainantName] = React.useState("");
  const [complainantPhone, setComplainantPhone] = React.useState("");
  const [kind, setKind] = React.useState<ComplaintKind | "">("");
  const [description, setDescription] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const choices = useQuery({
    queryKey: qualityKey("complaints", "choices"),
    queryFn: () => listComplaintChoicesQuery({}),
  });
  const clients = choices.data ?? [];
  const client = clients.find((each) => each.id === clientId);
  const files = client?.files ?? [];
  const visits = useQuery({
    queryKey: qualityKey("complaints", "choices", fileId),
    queryFn: () => listComplaintVisitsQuery({ fileId }),
    enabled: fileId !== NONE,
  });
  const visit = (visits.data ?? []).find((each) => each.id === visitId);

  const pickClient = (next: string) => {
    setClientId(next);
    const own = clients.find((each) => each.id === next)?.files ?? [];
    // One live file: it is the one complained about.
    const current = own.filter((file) => file.current);
    setFileId(current.length === 1 ? current[0].id : NONE);
    setVisitId(NONE);
    setWorkerId(NONE);
  };
  const pickFile = (next: string) => {
    setFileId(next);
    setVisitId(NONE);
    setWorkerId(NONE);
  };
  const pickVisit = (next: string) => {
    setVisitId(next);
    setWorkerId(NONE);
  };

  const problems = new Set<Problem>();
  if (!clientId) problems.add("client");
  if (!kind) problems.add("kind");
  if (!description.trim()) problems.add("description");
  const shows = (problem: Problem) => tried && problems.has(problem);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (problems.size > 0 || !kind) return;
    setBusy(true);
    const answer = await openComplaintAction({
      channel,
      clientId,
      fileId: fileId === NONE ? null : fileId,
      visitId: visitId === NONE ? null : visitId,
      workerId: workerId === NONE ? null : workerId,
      complainantName,
      complainantPhone,
      kind,
      description,
    });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("New.SaveFailed")));
      return;
    }
    const { complaintId, number } = answer.data;
    toast.success(t("New.Saved", { number: isolate(number) }), {
      action: { label: t("Open"), onClick: () => navigate(complaintPath(complaintId)) },
    });
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquareWarning className="size-6 text-warning-ink" />
          {t("New.Title")}
        </DialogTitle>
        <DialogDescription>{t("New.Description")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={save} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="complaint-channel">{t("Fields.Channel")}</FieldLabel>
            <Select value={channel} onValueChange={(value) => setChannel(value as Channel)}>
              <SelectTrigger id="complaint-channel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPED_COMPLAINT_CHANNELS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {channelLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={shows("kind")}>
            <FieldLabel htmlFor="complaint-kind">{t("Fields.Kind")}</FieldLabel>
            <Select value={kind} onValueChange={(value) => setKind(value as ComplaintKind)}>
              <SelectTrigger id="complaint-kind" className="w-full" aria-invalid={shows("kind")}>
                <SelectValue placeholder={t("New.Choose")} />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINT_KINDS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {kindLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {shows("kind") && <FieldError>{t("New.Required")}</FieldError>}
          </Field>
        </div>

        <Field data-invalid={shows("client")}>
          <FieldLabel htmlFor="complaint-client">{t("Fields.Client")}</FieldLabel>
          <Select value={clientId} onValueChange={pickClient}>
            <SelectTrigger id="complaint-client" className="w-full" aria-invalid={shows("client")}>
              <SelectValue placeholder={choices.isPending ? tCommon("Loading") : t("New.ChooseClient")} />
            </SelectTrigger>
            <SelectContent>
              {clients.map((each) => (
                <SelectItem key={each.id} value={each.id}>
                  <bdi>{each.name}</bdi>
                  <Ltr className="text-muted-foreground">{each.number}</Ltr>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {shows("client") && <FieldError>{t("New.Required")}</FieldError>}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="complaint-file">{t("Fields.File")}</FieldLabel>
            <Select value={fileId} onValueChange={pickFile} disabled={!client}>
              <SelectTrigger id="complaint-file" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("New.NoFile")}</SelectItem>
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
          <Field>
            <FieldLabel htmlFor="complaint-visit">{t("Fields.Visit")}</FieldLabel>
            <Select value={visitId} onValueChange={pickVisit} disabled={fileId === NONE}>
              <SelectTrigger id="complaint-visit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("New.NoVisit")}</SelectItem>
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
        </div>

        <Field>
          <FieldLabel htmlFor="complaint-worker">{t("Fields.Worker")}</FieldLabel>
          <Select value={workerId} onValueChange={setWorkerId} disabled={!visit || visit.workers.length === 0}>
            <SelectTrigger id="complaint-worker" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("New.NoWorker")}</SelectItem>
              {(visit?.workers ?? []).map((worker) => (
                <SelectItem key={worker.id} value={worker.id}>
                  <bdi>{workerName(worker)}</bdi>
                  <Ltr className="text-muted-foreground">{worker.number}</Ltr>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="complaint-complainant">{t("Fields.Complainant")}</FieldLabel>
            <Input
              id="complaint-complainant"
              value={complainantName}
              maxLength={120}
              placeholder={t("New.ComplainantHint")}
              onChange={(event) => setComplainantName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="complaint-phone">{t("Fields.ComplainantPhone")}</FieldLabel>
            <Input
              id="complaint-phone"
              dir="ltr"
              inputMode="tel"
              value={complainantPhone}
              maxLength={20}
              onChange={(event) => setComplainantPhone(event.target.value)}
            />
          </Field>
        </div>

        <Field data-invalid={shows("description")}>
          <FieldLabel htmlFor="complaint-description">{t("Fields.Description")}</FieldLabel>
          <Textarea
            id="complaint-description"
            rows={3}
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            aria-invalid={shows("description")}
          />
          {shows("description") && <FieldError>{t("New.Required")}</FieldError>}
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            {t("New.Save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
