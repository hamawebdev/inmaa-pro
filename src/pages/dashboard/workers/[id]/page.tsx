import { useQuery } from "@tanstack/react-query";
import { Clock, IdCard, LogOut, Printer, RotateCcw, Scale, ShieldAlert, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConductEntries } from "@/features/people/components/conduct-entries";
import { DOCUMENT_FILE_CAPABILITY } from "@/features/people/services/documents";
import { todayAtTheCentre, useMay, useMayIn } from "@/features/people/components/may";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import { SanctionCard } from "@/features/people/components/sanction-card";
import { SanctionChip } from "@/features/people/components/sanction-chip";
import { STATUS_TONE } from "@/features/people/components/status-tones";
import { useSanctionGate } from "@/features/people/components/sanction-gate";
import { listWorkerHoldingsQuery } from "@/features/people/services/worker-equipment";
import { openWorkerFileAction } from "@/features/people/services/worker-reads";
import { readmitWorkerAction, recordWorkerLeavingAction, workerIdentity } from "@/features/people/services/workers";
import type { WorkerHoldings } from "@/features/stock/services/recovery";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { WorkerEquipmentIncidents, WorkerHoldingsDetails } from "../_components/worker-equipment";
import { WorkerAttachmentsCard, WorkerDocumentsCard, WorkerHistoryCard } from "../_components/worker-file-cards";
import { EvaluationsView, ViolationsView } from "../../hiring/_components/hiring-views";
import { WorkerForm } from "../_components/worker-form";
import { staffName } from "@/lib/text/names";

/**
 * One cleaning worker's file. Section «عمال النظافة», below the tab «العمال».
 * Owner: People.
 *
 * Closest academy screen: the employee file (employees/[id]) and the teacher
 * file (teachers/[id]): a strip of badges and the record's actions above the
 * same form as the new page. Here the strip says her number, where she stands
 * and whether she is «موقف» or «معاقب»; the cards under it are her sanction and
 * its history, her photo and signed scan, her documents and the decisions; then
 * his form, to change.
 *
 * Opening the file is a consultation of her personal data: the read is an
 * action, and it is logged.
 */
export default function WorkerPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Workers");
  const tForm = useTranslations("WorkerForm");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const [askReason, reasonDialog] = useReasonDialog();
  const [passGate, gateDialogs] = useSanctionGate();

  const {
    data: file,
    error,
    refetch,
  } = useQuery({
    queryKey: pathKey(`/dashboard/workers/${id}`),
    queryFn: async () => {
      const result = await openWorkerFileAction({ id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const back = { href: "/dashboard/workers", label: tNav("WorkersList") };
  // The file's actions need the workers' section written, as the list does (ACC-10).
  const holdsFiles = useMay("staff.write");
  const writesWorkers = useMayIn("WORKERS", "WRITE");
  const keepsFiles = holdsFiles && writesWorkers;
  const holdsDocuments = useMay(DOCUMENT_FILE_CAPABILITY);
  const conduct = useConductEntries();
  const tHiring = useTranslations("Hiring");
  const tCards = useTranslations("Cards");
  const readsPay = useMay("pay.read");
  const printsFilledForm = useMay("staff.printFilledForm");

  if (!file) {
    return (
      <DetailScreen section="workers" title={t("File.Title")} back={back}>
        {error && <ErrorState description={errorMessage(error.message)} onRetry={() => refetch()} />}
      </DetailScreen>
    );
  }

  const name = staffName(file.values);
  const decision = file.decisions[0];

  const leave = async () => {
    // What she still holds (equipment, blocks of receipts) is shown where her leaving is decided (MON-13).
    const holdings: WorkerHoldings | null = await listWorkerHoldingsQuery({ workerId: id }).catch(() => null);
    const answer = await askReason({
      title: t("File.LeaveTitle", { name }),
      description: t("File.LeaveDescription"),
      details: holdings ? (
        <WorkerHoldingsDetails holdings={holdings} female={file.values.sex === "FEMALE"} />
      ) : undefined,
      fields: [
        {
          kind: "date",
          name: "leftDate",
          label: t("File.LeaveDate"),
          required: true,
          defaultValue: todayAtTheCentre(),
        },
      ],
      reasonLabel: t("File.LeaveReason"),
      confirmLabel: t("File.Leave"),
      confirmTone: "destructive",
    });
    if (!answer) return;
    const result = await recordWorkerLeavingAction({ id, leftDate: answer.values.leftDate, reason: answer.reason });
    if (result.success) toast.success(t("File.LeaveDone"));
    else toast.error(errorMessage(result.error, t("File.ActionFailed")));
  };

  const readmit = async () => {
    // Coming back is an attempt to register her: her own sanction counts, and the manager answers it.
    const passage = await passGate({
      context: "READMISSION",
      subjectKind: "WORKER",
      subjectId: id,
      identity: workerIdentity(file.values),
    });
    if (!passage) return;
    const result = await readmitWorkerAction({ id, ...passage });
    if (result.success) toast.success(t("File.ReadmitDone"));
    else toast.error(errorMessage(result.error, t("File.ActionFailed")));
  };

  return (
    <DetailScreen
      section="workers"
      title={name}
      back={back}
      actions={
        <div className="flex flex-wrap gap-3">
          {keepsFiles &&
            (file.status === "LEFT" || file.status === "REFUSED" ? (
              <Button type="button" variant="outline" onClick={readmit}>
                <RotateCcw />
                {t("File.Readmit")}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={leave}>
                <LogOut />
                {t("File.Leave")}
              </Button>
            ))}
          {/* An ID card is for someone in post, on trial or accepted (PEO-12). */}
          {keepsFiles && (file.status === "ON_TRIAL" || file.status === "ACCEPTED") && (
            <Button asChild variant="outline">
              <Link to={`/dashboard/workers/${id}/print-card`}>
                <IdCard />
                {tCards("Print")}
              </Link>
            </Button>
          )}
          {printsFilledForm && (
            <Button asChild variant="info">
              <Link to={`/dashboard/workers/${id}/print`}>
                <Printer />
                {t("PrintForm")}
              </Link>
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-base font-bold">
          {tForm("Labels.regNumber")} <Ltr>{file.number}</Ltr>
        </span>
        <StatusChip tone={STATUS_TONE[file.status]} label={t(`Statuses.${file.status}`)} />
        {decision && <StatusChip tone="info" label={tForm(`Decisions.${decision.decision}`)} />}
        <SanctionChip kind="WORKER" state={file.sanction?.state} />
        {file.status === "LEFT" && file.leftDate && (
          <span className="text-base text-muted-foreground">
            {t("File.LeftOn")} <Ltr>{file.leftDate}</Ltr>
            {file.leftReason ? ` · ${file.leftReason}` : ""}
          </span>
        )}
        {/* Her hours, and her payslips, advances and payments: the pages of «الساعات والأجور» about her. */}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/dashboard/hours-pay/workers/${id}`}>
              <Clock />
              {t("File.Hours")}
            </Link>
          </Button>
          {readsPay && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/dashboard/hours-pay/people/${id}`}>
                <Wallet />
                {t("File.Pay")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <SanctionCard subjectKind="WORKER" subjectId={id} />
        <WorkerAttachmentsCard file={file} />
        <WorkerDocumentsCard
          file={file}
          onRenew={keepsFiles ? (type) => void conduct.renewDocument(id, type) : undefined}
          filesScans={keepsFiles && holdsDocuments}
        />
        <Card id="worker-card-conduct">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">{t("File.ConductTitle")}</CardTitle>
              {keepsFiles && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void conduct.recordViolation(id)}>
                    <ShieldAlert />
                    {tHiring("Entry.ViolationTitle")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void conduct.evaluate(id)}>
                    <Scale />
                    {tHiring("Entry.EvaluationTitle")}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ViolationsView entries={conduct} staffId={id} />
            <WorkerEquipmentIncidents workerId={id} />
            <EvaluationsView entries={conduct} staffId={id} />
          </CardContent>
        </Card>
        <WorkerHistoryCard file={file} />
        <WorkerForm key={file.id} mode={{ kind: "edit", id, number: file.number }} defaultValues={file.values} />
      </div>
      {reasonDialog}
      {conduct.dialogs}
      {gateDialogs}
    </DetailScreen>
  );
}
