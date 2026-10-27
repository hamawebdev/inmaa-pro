import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, CircleSlash } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { DateField, TimeField } from "@/components/pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  dismissExtraVisitProposalAction,
  listExtraVisitProposalsQuery,
  planExtraVisitAction,
  type ExtraVisitProposal,
} from "@/features/operations/services/extra-visits";
import { intlLocaleFor } from "@/i18n/config";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * «زيارات إضافية مقترحة»: the returned orders of the file that said «هل تحتاج
 * إلى زيارة إضافية؟ نعم» and no extra visit names yet. The office plans it, or
 * says no extra visit is needed, with its reason. Shown only when there is one.
 */
export function ExtraVisitProposals({ fileId, mayWrite }: { fileId: string; mayWrite: boolean }) {
  const t = useTranslations("ExtraVisits");
  const locale = useLocale();
  const [planning, setPlanning] = React.useState<ExtraVisitProposal | null>(null);
  const [dismissing, setDismissing] = React.useState<ExtraVisitProposal | null>(null);
  const proposals = useQuery({
    queryKey: [...pathKey(`/dashboard/files/${fileId}`), "proposals"],
    queryFn: () => listExtraVisitProposalsQuery({ fileId }),
  });
  if (!proposals.data || proposals.data.length === 0) return null;
  const dateFormat = new Intl.DateTimeFormat(intlLocaleFor(locale), { dateStyle: "full", timeZone: "UTC" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>{t("Hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {proposals.data.map((proposal) => (
            <li key={proposal.visitId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-bold">
                  {dateFormat.format(new Date(`${proposal.visitDate}T00:00:00Z`))}
                  <span className="ms-2 text-sm font-normal text-muted-foreground">
                    <Ltr>{proposal.visitNumber}</Ltr>
                  </span>
                </p>
                {(proposal.workerNotes || proposal.incompleteReason) && (
                  <p className="max-w-xl truncate text-sm text-muted-foreground" title={proposal.workerNotes ?? ""}>
                    <bdi>{proposal.workerNotes ?? proposal.incompleteReason}</bdi>
                  </p>
                )}
              </div>
              {mayWrite && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPlanning(proposal)}>
                    <CalendarPlus />
                    {t("Plan")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDismissing(proposal)}>
                    <CircleSlash />
                    {t("Dismiss")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      <PlanDialog proposal={planning} onClose={() => setPlanning(null)} />
      <DismissDialog proposal={dismissing} onClose={() => setDismissing(null)} />
    </Card>
  );
}

function PlanDialog({ proposal, onClose }: { proposal: ExtraVisitProposal | null; onClose: () => void }) {
  const t = useTranslations("ExtraVisits");
  const errorMessage = useErrorMessage();
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [workers, setWorkers] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const close = () => {
    setDate("");
    setTime("");
    setWorkers("");
    onClose();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!proposal) return;
    setBusy(true);
    const result = await planExtraVisitAction({
      sourceVisitId: proposal.visitId,
      date,
      startTime: time || null,
      workersNeeded: workers ? Number(workers) : null,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Planned", { number: result.data.number }));
    close();
  };
  return (
    <Dialog open={proposal !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("PlanTitle")}</DialogTitle>
          <DialogDescription>{t("PlanHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid min-w-0 gap-4 sm:grid-cols-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="extra-date">{t("Date")}</Label>
              <DateField id="extra-date" value={date} onChange={setDate} />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="extra-time">{t("Time")}</Label>
              <TimeField id="extra-time" value={time || proposal?.plannedStartTime || ""} onChange={setTime} />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="extra-workers">{t("Workers")}</Label>
              <Input
                id="extra-workers"
                type="number"
                min={1}
                dir="ltr"
                value={workers || String(proposal?.workersNeeded ?? "")}
                onChange={(event) => setWorkers(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="success" loading={busy} disabled={!date}>
              {t("PlanConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DismissDialog({ proposal, onClose }: { proposal: ExtraVisitProposal | null; onClose: () => void }) {
  const t = useTranslations("ExtraVisits");
  const errorMessage = useErrorMessage();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const close = () => {
    setReason("");
    onClose();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!proposal) return;
    setBusy(true);
    const result = await dismissExtraVisitProposalAction({ sourceVisitId: proposal.visitId, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t(result.data.jobClosed ? "DismissedJobClosed" : "Dismissed"));
    close();
  };
  return (
    <Dialog open={proposal !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("DismissTitle")}</DialogTitle>
          <DialogDescription>{t("DismissHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="extra-dismiss-reason">{t("Reason")}</Label>
            <Textarea
              id="extra-dismiss-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="success" loading={busy} disabled={reason.trim() === ""}>
              {t("Dismiss")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
