import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ClipboardPen } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { VisitStatusChip } from "@/features/operations/components/visit-status-chip";
import { getInitialVisitOfferQuery, planInitialVisitAction } from "@/features/operations/services/initial-visit";
import { VISITS_PATH } from "@/features/operations/services/paths";
import type { VisitStatus } from "@/features/operations/validators/option-codes";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { intlLocaleFor } from "@/i18n/config";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The contract's first deep clean (OPS-08, RULINGS item 3): offered when the accepted quote sells one; its day is
 * chosen here, and it is then seated and ordered as any visit.
 */
export function InitialVisitCard({ fileId, mayWrite }: { fileId: string; mayWrite: boolean }) {
  const t = useTranslations("InitialVisit");
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const offer = useQuery({
    queryKey: [...pathKey(`/dashboard/files/${fileId}`), "initial-visit"],
    queryFn: () => getInitialVisitOfferQuery({ fileId }),
  });
  if (!offer.data?.offered) return null;
  const visit = offer.data.visit;
  const dateFormat = new Intl.DateTimeFormat(intlLocaleFor(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>
          {visit ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {t("Planned")} <Ltr>{visit.number}</Ltr> · {dateFormat.format(new Date(`${visit.visitDate}T00:00:00Z`))}
              <VisitStatusChip status={visit.status as VisitStatus} />
            </span>
          ) : (
            t("Hint")
          )}
        </CardDescription>
        <CardAction>
          {visit ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`${VISITS_PATH}/${visit.id}`}>
                <ClipboardPen />
                {t("Open")}
              </Link>
            </Button>
          ) : mayWrite ? (
            <Button variant="add" onClick={() => setOpen(true)}>
              <CalendarPlus />
              {t("Plan")}
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <PlanForm
              fileId={fileId}
              startTime={offer.data.startTime ?? "08:00"}
              workers={offer.data.workersNeeded}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PlanForm({
  fileId,
  startTime,
  workers,
  onClose,
}: {
  fileId: string;
  startTime: string;
  workers: number;
  onClose: () => void;
}) {
  const t = useTranslations("InitialVisit");
  const errorMessage = useErrorMessage();
  const { today } = useCentreClock();
  const [date, setDate] = React.useState(today);
  const [time, setTime] = React.useState(startTime);
  const [hours, setHours] = React.useState("4");
  const [count, setCount] = React.useState(String(workers));
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await planInitialVisitAction({
      fileId,
      date,
      startTime: time,
      durationMin: Math.round(Number(hours) * 60),
      workersNeeded: Number(count),
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Saved", { number: `⁦${result.data.number}⁩` }));
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t("Title")}</DialogTitle>
        <DialogDescription>{t("DialogHint")}</DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="initial-date">{t("Date")}</Label>
          <Input
            id="initial-date"
            type="date"
            dir="ltr"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="initial-time">{t("Time")}</Label>
          <Input id="initial-time" type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="initial-hours">{t("Hours")}</Label>
          <Input
            id="initial-hours"
            type="number"
            min={1}
            step={0.5}
            dir="ltr"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="initial-workers">{t("Workers")}</Label>
          <Input
            id="initial-workers"
            type="number"
            min={1}
            dir="ltr"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("Back")}
        </Button>
        <Button type="submit" variant="success" loading={busy} disabled={!date}>
          {t("Confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}
