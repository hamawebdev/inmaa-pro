import * as React from "react";

import { CalendarCheck, Repeat, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { confirmVisitAction, removeVisitWorkerAction } from "../../services/assignment";
import { workerName, type VisitEntryData, type VisitEntryWorker } from "../visit-entry/visit-entry-data";

import { ReplacementDialog } from "./replacement-dialog";
import { SeatPickerDialog } from "./seat-picker-dialog";

/** Statuses in which the team of a visit may still change. */
const TEAM_OPEN = ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS"];

/**
 * The team of a visit before it happens: who holds a seat, the seats still open,
 * and the three acts on them — add a worker (the seat picker), replace one
 * (the suggestions), take one off. An on-demand visit with its team complete is
 * confirmed here once the client has been reached.
 *
 * Closest academy screen: the group page's list of its members with row
 * buttons (pages/dashboard/groups/[groupId]/page.tsx), in a card like the
 * employee form's.
 */
export function VisitTeamCard({ data, mayWrite = true }: { data: VisitEntryData; mayWrite?: boolean }) {
  const t = useTranslations("VisitTeam");
  const errorMessage = useErrorMessage();
  const roleLabel = useCodeLabel("Options.WorkerRole");
  const roleLabelFeminine = useCodeLabel("Options.WorkerRoleFeminine");
  const [picking, setPicking] = React.useState(false);
  const [replacing, setReplacing] = React.useState<VisitEntryWorker | null>(null);
  const [removing, setRemoving] = React.useState<VisitEntryWorker | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const { visit } = data;
  const open = mayWrite && TEAM_OPEN.includes(visit.status);
  const seated = data.workers.filter((entry) => entry.seat.seatStatus === "ASSIGNED").length;
  const openSeats = Math.max(0, visit.workersNeeded - seated);

  const confirm = async () => {
    setConfirming(true);
    const result = await confirmVisitAction({ visitId: visit.id });
    setConfirming(false);
    if (result.success) toast.success(t("Confirmed"));
    else toast.error(errorMessage(result.error, t("SaveFailed")));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5" />
          {t("Title")}
        </CardTitle>
        <CardDescription>
          {t("Seats", { seated, needed: visit.workersNeeded })}
          {openSeats > 0 && (
            <span className="ms-2 font-semibold text-warning-ink">{t("OpenSeats", { count: openSeats })}</span>
          )}
        </CardDescription>
        {open && (
          <CardAction className="flex flex-wrap gap-2">
            {visit.status === "AWAITING_CONFIRMATION" && openSeats === 0 && (
              <Button type="button" variant="outline" onClick={() => void confirm()} loading={confirming}>
                <CalendarCheck />
                {t("Confirm")}
              </Button>
            )}
            {openSeats > 0 && (
              <Button type="button" variant="add" onClick={() => setPicking(true)}>
                <UserPlus />
                {t("AddWorker")}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {data.workers.length === 0 && (data.resting ?? []).length === 0 ? (
          <p className="text-muted-foreground">{t("NoWorker")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.workers.map((entry) => {
              const absent = entry.seat.seatStatus === "ABSENT";
              const role = entry.seat.role
                ? (entry.worker.sex === "FEMALE" ? roleLabelFeminine : roleLabel)(entry.seat.role)
                : null;
              return (
                <li key={entry.seat.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">
                        <bdi>{workerName(entry.worker)}</bdi>
                      </span>
                      {absent && <StatusChip tone="danger" label={t("Absent")} />}
                      {absent && entry.replaced && <StatusChip tone="info" label={t("ReplacedChip")} />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <Ltr>{entry.worker.number}</Ltr>
                      {role && ` · ${role}`}
                    </p>
                  </div>
                  {open && (
                    <div className="flex flex-wrap items-center gap-2">
                      {!(absent && entry.replaced) && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(entry)}>
                          <Repeat />
                          {t("ReplaceWorker")}
                        </Button>
                      )}
                      {!absent && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(entry)}>
                          <UserMinus />
                          {t("RemoveWorker")}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {(data.resting ?? []).map((entry) => (
              <li key={entry.seat.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">
                      <bdi>{workerName(entry.worker)}</bdi>
                    </span>
                    <StatusChip tone="info" label={t(entry.replaced ? "RestingReplaced" : "Resting")} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <Ltr>{entry.worker.number}</Ltr>
                  </p>
                </div>
                {open && !entry.replaced && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(entry)}>
                    <Repeat />
                    {t("ReplaceWorker")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <SeatPickerDialog visitId={visit.id} open={picking} onOpenChange={setPicking} />
      <ReplacementDialog
        key={replacing?.seat.id ?? "none"}
        visitId={visit.id}
        seatId={replacing?.seat.id ?? null}
        workerName={replacing ? workerName(replacing.worker) : ""}
        absent={replacing?.seat.seatStatus === "ABSENT"}
        resting={replacing?.seat.seatStatus === "RESTING"}
        open={replacing !== null}
        onOpenChange={(next) => !next && setReplacing(null)}
      />
      <RemoveDialog entry={removing} onClose={() => setRemoving(null)} />
    </Card>
  );
}

/** Taking a worker off the visit: the reason is asked and kept. */
function RemoveDialog({ entry, onClose }: { entry: VisitEntryWorker | null; onClose: () => void }) {
  const t = useTranslations("VisitTeam");
  const errorMessage = useErrorMessage();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const close = () => {
    setReason("");
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!entry) return;
    setBusy(true);
    const result = await removeVisitWorkerAction({ seatId: entry.seat.id, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Removed"));
    close();
  };

  return (
    <Dialog open={entry !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="size-6 text-destructive" />
            {t("RemoveTitle")}
          </DialogTitle>
          <DialogDescription>{entry ? t("RemoveHint", { name: workerName(entry.worker) }) : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="remove-reason">{t("RemoveReason")}</Label>
            <Textarea id="remove-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="destructive" loading={busy} disabled={reason.trim() === ""}>
              {t("Remove")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
