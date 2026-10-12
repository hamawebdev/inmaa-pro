import { useQuery } from "@tanstack/react-query";
import { LogOut, RotateCcw } from "lucide-react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayAtTheCentre, useMay } from "@/features/people/components/may";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import { SanctionCard } from "@/features/people/components/sanction-card";
import { SanctionChip } from "@/features/people/components/sanction-chip";
import { STATUS_TONE } from "@/features/people/components/status-tones";
import { useSanctionGate } from "@/features/people/components/sanction-gate";
import {
  employeeIdentity,
  openEmployeeFileAction,
  readmitEmployeeAction,
  recordEmployeeLeavingAction,
} from "@/features/people/services/employees";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { EmployeeForm } from "../_components/employee-form";

/**
 * One centre employee's file. Section «الموظفون», below the tab «الموظفون». Owner: People.
 *
 * Closest academy screen: the employee file (employees/[id]): a strip of
 * badges and the record's actions above the same form as the new page. Here
 * the strip says the number, the post, whether the employee is in post and
 * whether they are «موقف» or «معاقب»; then the sanction and its history, the
 * login account that belongs to the employee, and the form, to change.
 *
 * Opening the file is a consultation of personal data: the read is an action,
 * and it is logged.
 */
export default function EmployeePage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Employees");
  const tWorker = useTranslations("WorkerForm");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const [askReason, reasonDialog] = useReasonDialog();
  const [passGate, gateDialogs] = useSanctionGate();

  const {
    data: file,
    error,
    refetch,
  } = useQuery({
    queryKey: pathKey(`/dashboard/employees/${id}`),
    queryFn: async () => {
      const result = await openEmployeeFileAction({ id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const back = { href: "/dashboard/employees", label: tNav("EmployeesList") };
  const keepsFiles = useMay("staff.write");

  if (!file) {
    return (
      <DetailScreen section="employees" title={t("File.Title")} back={back}>
        {error && <ErrorState description={errorMessage(error.message)} onRetry={() => refetch()} />}
      </DetailScreen>
    );
  }

  const name = `${file.values.lastName} ${file.values.firstName}`;

  const leave = async () => {
    const answer = await askReason({
      title: t("File.LeaveTitle", { name }),
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
    const result = await recordEmployeeLeavingAction({ id, leftDate: answer.values.leftDate, reason: answer.reason });
    if (result.success) toast.success(t("File.LeaveDone"));
    else toast.error(errorMessage(result.error, t("File.ActionFailed")));
  };

  const readmit = async () => {
    const passage = await passGate({
      context: "READMISSION",
      subjectKind: "EMPLOYEE",
      subjectId: id,
      identity: employeeIdentity(file.values),
    });
    if (!passage) return;
    const result = await readmitEmployeeAction({ id, ...passage });
    if (result.success) toast.success(t("File.ReadmitDone"));
    else toast.error(errorMessage(result.error, t("File.ActionFailed")));
  };

  return (
    <DetailScreen
      section="employees"
      title={name}
      description={t("File.Description")}
      back={back}
      actions={
        keepsFiles &&
        (file.status === "LEFT" ? (
          <Button type="button" variant="outline" onClick={readmit}>
            <RotateCcw />
            {t("File.Readmit")}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={leave}>
            <LogOut />
            {t("File.Leave")}
          </Button>
        ))
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-base font-bold">
          {tWorker("Labels.regNumber")} <Ltr>{file.number}</Ltr>
        </span>
        <StatusChip tone="info" label={t(`Positions.${file.values.jobPosition}`)} />
        <StatusChip
          tone={STATUS_TONE[file.status]}
          label={t(file.status === "LEFT" ? "Statuses.LEFT" : "Statuses.IN_POST")}
        />
        <SanctionChip kind="EMPLOYEE" state={file.sanction?.state} />
        {file.status === "LEFT" && file.leftDate && (
          <span className="text-base text-muted-foreground">
            <Ltr>{file.leftDate}</Ltr>
            {file.leftReason ? ` · ${file.leftReason}` : ""}
          </span>
        )}
      </div>

      <div className="space-y-6">
        <SanctionCard subjectKind="EMPLOYEE" subjectId={id} />
        <Card id="employee-card-account">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-base">{t("File.AccountTitle")}</CardTitle>
              {file.account ? (
                <StatusChip
                  tone={file.account.isActive ? "success" : "neutral"}
                  label={t(file.account.isActive ? "File.AccountActive" : "File.AccountInactive")}
                />
              ) : (
                <StatusChip tone="neutral" label={t("File.NoAccount")} />
              )}
            </div>
            <CardDescription>{t("File.AccountDescription")}</CardDescription>
          </CardHeader>
          {file.account && (
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-base">
              <span>
                {t("File.AccountUser")} <Ltr className="font-bold">{file.account.username}</Ltr>
              </span>
              <span>{file.account.displayName}</span>
              <span className="text-muted-foreground">
                {t.has(`Positions.${file.account.roleId}`)
                  ? t(`Positions.${file.account.roleId}`)
                  : file.account.roleId}
              </span>
            </CardContent>
          )}
        </Card>
        <EmployeeForm key={file.id} mode={{ kind: "edit", id, number: file.number }} defaultValues={file.values} />
      </div>
      {reasonDialog}
      {gateDialogs}
    </DetailScreen>
  );
}
