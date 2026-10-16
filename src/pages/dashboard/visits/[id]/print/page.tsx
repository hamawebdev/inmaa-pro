import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { PrintButton } from "@/components/print";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  getMissionOrderQuery,
  getOrderHoldQuery,
  recordOrderPrintedAction,
  releaseSanctionedOrderAction,
  type OrderHold,
} from "@/features/operations/services/mission-order";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { MissionOrderSheet } from "@/features/operations/sheets/mission-order-sheet";
import { sampleMissionOrder } from "@/features/operations/sheets/samples";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { intlLocaleFor } from "@/i18n/config";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The mission order of one visit, to print. Section «طلبات الخدمة», below «الزيارات».
 *
 * Closest academy screen: students/[id]/card/page.tsx, a page below a record
 * that shows what will be printed, with the print button in its heading. Here
 * the content is an A4 sheet on the print kit instead of a card.
 *
 * The order is built from what is stored. Sending it to the printer freezes its
 * tick lines, counts the print and logs it (the order names the team).
 * `blank-<division>` (`blank-building`…) prints the empty order the office
 * fills by hand when the PC is not at hand. The order of a client «متوقف» or
 * «معاقب» prints only once the manager released it (RULINGS item 12): until
 * then the page says so and offers the release to the manager alone.
 */
export default function VisitOrderPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("OperationsSheets");
  const errorMessage = useErrorMessage();
  const blank = id.startsWith("blank-");
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const order = useQuery({
    queryKey: [...pathKey(`${VISITS_PATH}/${id}`), "order"],
    queryFn: () => getMissionOrderQuery({ visitId: id }),
    enabled: !blank,
  });
  const hold = useQuery({
    queryKey: [...pathKey(`${VISITS_PATH}/${id}`), "order-hold"],
    queryFn: () => getOrderHoldQuery({ visitId: id }),
    enabled: !blank,
  });
  const held = !blank && (hold.data === undefined || (hold.data !== null && hold.data.released === null));

  // The order leaves the office: frozen, counted and logged first; nothing prints if that fails.
  const recordPrint = async () => {
    const result = await recordOrderPrintedAction({ visitId: id });
    if (!result.success) toast.error(errorMessage(result.error, t("MissionOrder.PrintNotRecorded")));
    return result.success;
  };

  return (
    <DetailScreen
      section="requests"
      title={t("MissionOrder.Title")}
      description={t("MissionOrder.Description")}
      back={{ href: blank ? VISITS_PATH : `${VISITS_PATH}/${id}`, label: t("MissionOrder.Back") }}
      actions={blank ? <PrintButton /> : mayWrite && !held ? <PrintButton onPrint={recordPrint} /> : undefined}
    >
      {!blank && hold.data && <HoldNotice visitId={id} hold={hold.data} />}
      {blank ? (
        <MissionOrderSheet order={sampleMissionOrder(id)} />
      ) : order.isError ? (
        <ErrorState onRetry={() => void order.refetch()} />
      ) : order.data ? (
        <MissionOrderSheet order={order.data} />
      ) : (
        <Skeleton className="h-[297mm] w-[210mm] max-w-full" />
      )}
    </DetailScreen>
  );
}

/** The client is sanctioned: the order waits for the manager's release, or says it was given. */
function HoldNotice({ visitId, hold }: { visitId: string; hold: OrderHold }) {
  const t = useTranslations("OperationsSheets.MissionOrder.Hold");
  const locale = useLocale();
  const stateLabel = useCodeLabel("Sanctions.ClientStates");
  const mayRelease = useCan("order.releaseSanctioned");
  const [releasing, setReleasing] = React.useState(false);
  const day = (date: string) =>
    new Intl.DateTimeFormat(intlLocaleFor(locale), { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(`${date.slice(0, 10)}T00:00:00Z`),
    );

  if (hold.released) {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <p className="text-sm">
          {t("Released", { state: stateLabel(hold.state) })}{" "}
          <Ltr>
            {day(hold.released.date)} {hold.released.time}
          </Ltr>
        </p>
      </div>
    );
  }
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-ink" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-bold">{t("Title", { client: hold.client.name, state: stateLabel(hold.state) })}</p>
        <p className="text-sm text-muted-foreground">
          {t("Since")} <Ltr>{day(hold.since)}</Ltr>
          {hold.until && (
            <>
              {" "}
              {t("Until")} <Ltr>{day(hold.until)}</Ltr>
            </>
          )}
          {" · "}
          <bdi>{hold.reason}</bdi>
        </p>
        <p className="text-sm">{mayRelease ? t("ManagerHint") : t("WaitHint")}</p>
      </div>
      {mayRelease && (
        <Button variant="info" onClick={() => setReleasing(true)}>
          <ShieldCheck />
          {t("Release")}
        </Button>
      )}
      <ReleaseDialog visitId={visitId} open={releasing} onClose={() => setReleasing(false)} />
    </div>
  );
}

function ReleaseDialog({ visitId, open, onClose }: { visitId: string; open: boolean; onClose: () => void }) {
  const t = useTranslations("OperationsSheets.MissionOrder.Hold");
  const errorMessage = useErrorMessage();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await releaseSanctionedOrderAction({ visitId, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Done"));
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("DialogTitle")}</DialogTitle>
            <DialogDescription>{t("DialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="order-release-reason">{t("Reason")}</Label>
            <Textarea
              id="order-release-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t("Back")}
            </Button>
            <Button type="submit" variant="success" loading={busy} disabled={reason.trim() === ""}>
              {t("Confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
