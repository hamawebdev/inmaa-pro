import * as React from "react";

import { CalendarClock, CalendarX, ChevronDown, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import type { LocalDate, LocalTime } from "@/lib/units";

import {
  VISIT_STATUS_REASONS,
  cancelVisitAction,
  postponeVisitAction,
  reopenVisitAction,
  type VisitStatusReason,
} from "../../services/visit-status";

type Act = "postpone" | "cancel" | "reopen";

/**
 * «تأجيل / إلغاء» in a visit's heading row (#10): postpone it (with the
 * make-up visit's day when it is known), cancel it, or open again a postponed
 * or cancelled one (the manager's). Each asks for its reason.
 *
 * Closest academy screen: the header actions of the attendance family
 * (attendance-header-actions.tsx), whose buttons open small dialogs.
 */
export function VisitStatusMenu({ visit }: { visit: { id: string; status: string; plannedStartTime: string } }) {
  const t = useTranslations("VisitStatus");
  const mayReopen = useCan("visit.reopen");
  const [act, setAct] = React.useState<Act | null>(null);
  const open = visit.status === "CONFIRMED" || visit.status === "AWAITING_CONFIRMATION";
  const closed = visit.status === "POSTPONED" || visit.status === "CANCELLED";
  if (!open && !(closed && mayReopen)) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            {t("Menu")}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {open && (
            <>
              <DropdownMenuItem onSelect={() => setAct("postpone")}>
                <CalendarClock />
                {t("Postpone")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAct("cancel")} className="text-destructive">
                <CalendarX />
                {t("Cancel")}
              </DropdownMenuItem>
            </>
          )}
          {closed && mayReopen && (
            <DropdownMenuItem onSelect={() => setAct("reopen")}>
              <RotateCcw />
              {t("Reopen")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <StatusDialog act={act} visit={visit} onClose={() => setAct(null)} />
    </>
  );
}

function StatusDialog({
  act,
  visit,
  onClose,
}: {
  act: Act | null;
  visit: { id: string; plannedStartTime: string };
  onClose: () => void;
}) {
  const t = useTranslations("VisitStatus");
  const errorMessage = useErrorMessage();
  const reasonLabel = useCodeLabel("VisitStatus.Reasons");
  const [reason, setReason] = React.useState<VisitStatusReason>("CLIENT_REQUEST");
  const [note, setNote] = React.useState("");
  const [newDate, setNewDate] = React.useState("");
  const [newTime, setNewTime] = React.useState(visit.plannedStartTime);
  const [busy, setBusy] = React.useState(false);

  const close = () => {
    setNote("");
    setNewDate("");
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result =
      act === "postpone"
        ? await postponeVisitAction({
            visitId: visit.id,
            reason,
            note,
            newDate: newDate ? (newDate as LocalDate) : null,
            newStartTime: newDate && newTime ? (newTime as LocalTime) : null,
          })
        : act === "cancel"
          ? await cancelVisitAction({ visitId: visit.id, reason, note })
          : await reopenVisitAction({ visitId: visit.id, reason: note });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t(`Done.${act}`));
    close();
  };

  return (
    <Dialog open={act !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{act ? t(`Title.${act}`) : ""}</DialogTitle>
          <DialogDescription>{act ? t(`Hint.${act}`) : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {act !== "reopen" && (
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="visit-status-reason">{t("Reason")}</Label>
              <Select value={reason} onValueChange={(value) => setReason(value as VisitStatusReason)}>
                <SelectTrigger id="visit-status-reason" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_STATUS_REASONS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {reasonLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="visit-status-note">{t("Note")}</Label>
            <Textarea id="visit-status-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          {act === "postpone" && (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="visit-status-date">{t("NewDate")}</Label>
                <DateField id="visit-status-date" clearable value={newDate} onChange={setNewDate} />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="visit-status-time">{t("NewTime")}</Label>
                <TimeField id="visit-status-time" clearable value={newTime} disabled={!newDate} onChange={setNewTime} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {t("Back")}
            </Button>
            <Button
              type="submit"
              variant={act === "cancel" ? "destructive" : "success"}
              loading={busy}
              disabled={note.trim() === ""}
            >
              {act ? t(`Confirm.${act}`) : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
