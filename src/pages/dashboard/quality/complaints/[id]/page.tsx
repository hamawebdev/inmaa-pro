import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Ban, Handshake, MessageSquareReply, PhoneCall } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { Fact } from "@/features/operations/components/visit-entry/visit-entry-fields";
import {
  getComplaintQuery,
  recordClientToldAction,
  rejectComplaintAction,
  type ComplaintDetail,
} from "@/features/operations/services/complaints";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { useSectionLevel } from "@/hooks/use-session";
import { useMoneyText } from "@/hooks/use-money-text";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { useReasonConfirm } from "../../../worker-attendance/_components/reason-confirm";
import {
  ComplaintStatusChip,
  CounterChip,
  CounterNote,
  DayText,
  Moment,
  isolate,
  qualityKey,
  useDuration,
  workerName,
} from "../../_components/complaints/complaint-bits";
import { FirstResponseDialog, SettleDialog } from "../../_components/complaints/complaint-dialogs";
import { qualityHref } from "../../_components/quality-views";

/**
 * One complaint (#18), below «الجودة والشكاوى»: what came in and from whom,
 * the counter against his target, the office's first answer, then the
 * settlement or the rejection and the day the client was told.
 *
 * Closest academy screen: employees/[id]/page.tsx with its form
 * (employees/_components/employee-form.tsx): the record's chips in a row under
 * the heading, then its facts in stacked cards of two columns. The acts on the
 * complaint are in the heading row, as on the visit's page; each opens a
 * dialog.
 */
export default function ComplaintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("Complaints");
  const tQuality = useTranslations("Quality");
  const errorMessage = useErrorMessage();
  const clock = useCentreClock();
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const complaint = useQuery({
    queryKey: qualityKey("complaints", id),
    queryFn: () => getComplaintQuery({ complaintId: id }),
  });
  const data = complaint.data;

  const [answering, setAnswering] = React.useState(false);
  const [settling, setSettling] = React.useState(false);
  const [askReason, reasonDialog] = useReasonConfirm();
  const [confirm, confirmDialog] = useConfirm();

  const reject = async () => {
    if (!data) return;
    const reason = await askReason({
      title: t("Reject.Title"),
      description: t("Reject.Description", { number: isolate(data.number) }),
      reasonLabel: t("Reject.Reason"),
      confirmLabel: t("Reject.Confirm"),
      cancelLabel: t("Reject.Keep"),
    });
    if (reason === null) return;
    const answer = await rejectComplaintAction({ complaintId: data.id, reason });
    if (!answer.success) toast.error(errorMessage(answer.error, t("Reject.Failed")));
    else toast.success(t("Reject.Done"));
  };

  const told = async () => {
    if (!data) return;
    const yes = await confirm({
      title: t("Told.Title"),
      description: t("Told.Description", { number: isolate(data.number) }),
      confirmLabel: t("Told.Confirm"),
    });
    if (!yes) return;
    const answer = await recordClientToldAction({ complaintId: data.id });
    if (!answer.success) toast.error(errorMessage(answer.error, t("Told.Failed")));
    else toast.success(t("Told.Done"));
  };

  const open = data !== undefined && (data.status === "NEW" || data.status === "IN_PROGRESS");
  const actions =
    mayWrite && data ? (
      <div className="flex flex-wrap items-center gap-2">
        {open && !data.firstResponse && (
          <Button variant="info" onClick={() => setAnswering(true)}>
            <MessageSquareReply />
            {t("Actions.Answer")}
          </Button>
        )}
        {open && (
          <Button variant="success" onClick={() => setSettling(true)}>
            <Handshake />
            {t("Actions.Settle")}
          </Button>
        )}
        {open && (
          <Button variant="outline" onClick={() => void reject()}>
            <Ban />
            {t("Actions.Reject")}
          </Button>
        )}
        {!open && !data.clientTold && (
          <Button variant="info" onClick={() => void told()}>
            <PhoneCall />
            {t("Actions.Told")}
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <DetailScreen
      section="requests"
      title={data ? t("Page.Title", { number: isolate(data.number) }) : t("Page.TitleLoading")}
      back={{ href: qualityHref("complaints"), label: tQuality("Views.complaints") }}
      actions={actions}
    >
      {complaint.isError ? (
        <ErrorState onRetry={() => void complaint.refetch()} />
      ) : data ? (
        <ComplaintFacts complaint={data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
      {data && open && (
        <>
          <FirstResponseDialog complaint={data} open={answering} onOpenChange={setAnswering} />
          <SettleDialog complaint={data} today={clock.today} open={settling} onOpenChange={setSettling} />
        </>
      )}
      {reasonDialog}
      {confirmDialog}
    </DetailScreen>
  );
}

function ComplaintFacts({ complaint }: { complaint: ComplaintDetail }) {
  const t = useTranslations("Complaints");
  const money = useMoneyText();
  const duration = useDuration();
  const channelLabel = useCodeLabel("Complaints.Channels");
  const kindLabel = useCodeLabel("Complaints.Kinds");
  const faultLabel = useCodeLabel("Complaints.Faults");
  const settlementLabel = useCodeLabel("Complaints.Settlements");
  const divisionLabel = useCodeLabel("Options.Division");
  const visitStatusLabel = useCodeLabel("VisitStatuses");
  const problemLabel = useCodeLabel("ProblemKinds");
  const violationLabel = useCodeLabel("Hiring.ViolationStatuses");
  const closed = complaint.status === "SETTLED" || complaint.status === "REJECTED";
  const none = <span className="text-muted-foreground">—</span>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <ComplaintStatusChip status={complaint.status} />
        <CounterChip counter={complaint.counter} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Page.Complaint")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <Fact label={t("Fields.Received")}>
              <Moment at={complaint.received} />
              {complaint.receivedBy && (
                <bdi className="block text-sm font-normal text-muted-foreground">{complaint.receivedBy}</bdi>
              )}
            </Fact>
            <Fact label={t("Fields.Channel")}>{channelLabel(complaint.channel)}</Fact>
            <Fact label={t("Fields.Kind")}>{kindLabel(complaint.kind)}</Fact>
            <Fact label={t("Fields.Client")}>
              <bdi className="block">{complaint.client.name}</bdi>
              {complaint.clientPhones.length > 0 && (
                <Ltr className="block text-sm font-normal text-muted-foreground">
                  {complaint.clientPhones.join(" · ")}
                </Ltr>
              )}
            </Fact>
            <Fact label={t("Fields.File")}>
              {complaint.file ? (
                <>
                  <Link to={`/dashboard/files/${complaint.file.id}`} className="underline-offset-4 hover:underline">
                    <Ltr>{complaint.file.number}</Ltr>
                  </Link>
                  <span className="block text-sm font-normal text-muted-foreground">
                    {divisionLabel(complaint.file.division)}
                    {complaint.file.siteName && (
                      <>
                        {" · "}
                        <bdi>{complaint.file.siteName}</bdi>
                      </>
                    )}
                  </span>
                </>
              ) : (
                none
              )}
            </Fact>
            <Fact label={t("Fields.Visit")}>
              {complaint.visit ? (
                <>
                  <Link to={`${VISITS_PATH}/${complaint.visit.id}`} className="underline-offset-4 hover:underline">
                    <Ltr>{complaint.visit.number}</Ltr>
                  </Link>
                  <span className="block text-sm font-normal text-muted-foreground">
                    <DayText date={complaint.visit.visitDate} />
                    {complaint.visitStatus && <> · {visitStatusLabel(complaint.visitStatus)}</>}
                  </span>
                </>
              ) : (
                none
              )}
            </Fact>
            <Fact label={t("Fields.Worker")}>
              {complaint.worker ? (
                <>
                  <bdi className="block">{workerName(complaint.worker)}</bdi>
                  <Ltr className="block text-sm font-normal text-muted-foreground">{complaint.worker.number}</Ltr>
                </>
              ) : (
                none
              )}
            </Fact>
            <Fact label={t("Fields.Complainant")}>
              {complaint.complainantName || complaint.complainantPhone ? (
                <>
                  {complaint.complainantName && <bdi className="block">{complaint.complainantName}</bdi>}
                  {complaint.complainantPhone && (
                    <Ltr className="block text-sm font-normal text-muted-foreground">{complaint.complainantPhone}</Ltr>
                  )}
                </>
              ) : (
                <span className="font-normal text-muted-foreground">{t("Page.TheClient")}</span>
              )}
            </Fact>
            {complaint.problemReports.length > 0 && (
              <Fact label={t("Page.FromReport")}>
                {complaint.problemReports.map((report) => (
                  <span key={report.id} className="block">
                    {problemLabel(report.kind)} · <DayText date={report.occurredDate} />
                  </span>
                ))}
              </Fact>
            )}
            <Fact label={t("Fields.Description")} className="sm:col-span-2 xl:col-span-3">
              <bdi className="block font-normal whitespace-pre-line">{complaint.description}</bdi>
            </Fact>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Page.Answer")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <Fact label={t("Fields.Target")}>{t("Page.TargetText", { duration: duration(complaint.targetMin) })}</Fact>
            <Fact label={t("Fields.Due")}>
              <Moment at={complaint.counter.due} />
            </Fact>
            <Fact label={t("Fields.Counter")}>
              <CounterChip counter={complaint.counter} />
              <CounterNote counter={complaint.counter} className="mt-1 font-normal" />
            </Fact>
            <Fact label={t("Fields.FirstResponse")}>
              {complaint.firstResponse ? (
                <>
                  <Moment at={complaint.firstResponse.at} />
                  {complaint.firstResponse.by && (
                    <bdi className="block text-sm font-normal text-muted-foreground">{complaint.firstResponse.by}</bdi>
                  )}
                </>
              ) : (
                <span className="font-normal text-muted-foreground">{t("Page.NotAnswered")}</span>
              )}
            </Fact>
            {complaint.firstResponse?.note && (
              <Fact label={t("Fields.ResponseNote")} className="sm:col-span-2">
                <bdi className="block font-normal whitespace-pre-line">{complaint.firstResponse.note}</bdi>
              </Fact>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Page.Settlement")}</CardTitle>
        </CardHeader>
        <CardContent>
          {closed ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label={t("Fields.Closed")}>
                {complaint.closed ? <Moment at={complaint.closed} /> : none}
                {complaint.closedBy && (
                  <bdi className="block text-sm font-normal text-muted-foreground">{complaint.closedBy}</bdi>
                )}
              </Fact>
              {complaint.status === "SETTLED" && (
                <>
                  <Fact label={t("Fields.Fault")}>
                    {complaint.centreAtFault ? faultLabel(complaint.centreAtFault) : none}
                  </Fact>
                  <Fact label={t("Fields.Settlement")}>
                    {complaint.settlement ? settlementLabel(complaint.settlement) : none}
                    {complaint.settlementAmount !== null && (
                      <Ltr className="block">{money(complaint.settlementAmount)}</Ltr>
                    )}
                  </Fact>
                </>
              )}
              {complaint.redoVisit && (
                <Fact label={t("Fields.RedoVisit")}>
                  <Link
                    to={`${VISITS_PATH}/${complaint.redoVisit.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    <Ltr>{complaint.redoVisit.number}</Ltr>
                  </Link>
                  <span className="block text-sm font-normal text-muted-foreground">
                    <DayText date={complaint.redoVisit.visitDate} /> ·{" "}
                    {visitStatusLabel(complaint.redoVisit.status)}
                  </span>
                </Fact>
              )}
              <Fact label={t("Fields.ClientTold")}>
                {complaint.clientTold ? (
                  <Moment at={complaint.clientTold} />
                ) : (
                  <span className="font-normal text-muted-foreground">{t("Page.NotTold")}</span>
                )}
              </Fact>
              {complaint.violations.length > 0 && (
                <Fact label={t("Fields.Violations")}>
                  {complaint.violations.map((violation) => (
                    <span key={violation.id} className="block">
                      <Ltr>{violation.number}</Ltr> · {violationLabel(violation.status)}
                    </span>
                  ))}
                </Fact>
              )}
              {complaint.resolutionNote && (
                <Fact
                  label={complaint.status === "REJECTED" ? t("Fields.RejectReason") : t("Fields.Resolution")}
                  className="sm:col-span-2 xl:col-span-3"
                >
                  <bdi className="block font-normal whitespace-pre-line">{complaint.resolutionNote}</bdi>
                </Fact>
              )}
            </dl>
          ) : (
            <p className="text-base text-muted-foreground">{t("Page.NotSettled")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
