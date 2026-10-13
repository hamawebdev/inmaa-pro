import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarClock, ClipboardX, Clock, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntryDialog } from "@/features/people/components/entry-dialog";
import { DayDate, Duration, Nothing } from "@/features/people/components/figures";
import { monthBounds } from "@/features/people/components/format";
import { useMay, useMayIn } from "@/features/people/components/may";
import { MonthSwitch } from "@/features/people/components/month-switch";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import { SimpleTable } from "@/features/people/components/simple-table";
import {
  addHoursAdjustmentAction,
  removeHoursAdjustmentAction,
  workerHoursQuery,
} from "@/features/people/services/hours";
import { HOURS_ADJUSTMENT_KINDS, type HoursAdjustmentKind } from "@/features/people/validators/staff-codes";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

/**
 * One worker's hours of a month, week by week (feature 21), with People's
 * corrections: hours that no order carries (a training day, work at the
 * office) or a mistake put right, each with its reason.
 *
 * A week runs from Saturday to Friday and is counted whole in the month it
 * ends in: that is where its overtime, past 40 hours, is paid.
 *
 * Closest academy screen: a person's check history (staff-check-history.tsx):
 * a period switch, tiles of totals, the table of the period.
 */
export default function WorkerHoursPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Hours");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { today } = useCentreClock();
  const keepsFiles = useMay("staff.write");
  const writesWorkers = useMayIn("WORKERS", "WRITE");
  const corrects = keepsFiles && writesWorkers;
  const [ask, entryDialog] = useEntryDialog();
  const [askReason, reasonDialog] = useReasonDialog();

  const thisMonth = today.slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") ?? "") ? (params.get("month") as string) : thisMonth;
  const { from, to } = monthBounds(month);
  const { data, isPending } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "hours", month, id],
    queryFn: () => workerHoursQuery({ from, to, workerId: id }),
  });
  const hours = data?.[0];
  const back = { href: `/dashboard/hours-pay${month === thisMonth ? "" : `?month=${month}`}`, label: t("Back") };

  const addCorrection = async () => {
    const values = await ask({
      title: t("Corrections.AddTitle"),
      description: t("Corrections.AddDescription"),
      confirmLabel: t("Corrections.AddConfirm"),
      fields: [
        {
          kind: "date",
          name: "date",
          label: t("Corrections.Date"),
          required: true,
          defaultValue: today <= to ? today : to,
        },
        {
          kind: "choice",
          name: "kind",
          label: t("Corrections.Kind"),
          required: true,
          options: HOURS_ADJUSTMENT_KINDS.map((code) => ({ value: code, label: t(`Corrections.Kinds.${code}`) })),
        },
        {
          kind: "choice",
          name: "sign",
          label: t("Corrections.Sign"),
          required: true,
          defaultValue: "add",
          options: [
            { value: "add", label: t("Corrections.Add") },
            { value: "remove", label: t("Corrections.Remove") },
          ],
        },
        { kind: "number", name: "minutes", label: t("Corrections.Minutes"), required: true, min: "1" },
        { kind: "note", name: "reason", label: t("Corrections.Reason"), required: true },
      ],
    });
    if (!values) return;
    const minutes = Math.round(Number(values.minutes)) * (values.sign === "remove" ? -1 : 1);
    const result = await addHoursAdjustmentAction({
      staffId: id,
      date: values.date,
      adjustMin: minutes,
      kind: values.kind as HoursAdjustmentKind,
      reason: values.reason,
    });
    if (result.success) toast.success(t("Corrections.Added"));
    else toast.error(errorMessage(result.error, t("Corrections.Failed")));
  };

  const removeCorrection = async (lineId: string) => {
    const answer = await askReason({
      title: t("Corrections.RemoveTitle"),
      reasonLabel: t("Corrections.RemoveReason"),
      confirmLabel: t("Corrections.RemoveConfirm"),
      confirmTone: "destructive",
    });
    if (!answer) return;
    const result = await removeHoursAdjustmentAction({ id: lineId, reason: answer.reason });
    if (result.success) toast.success(t("Corrections.Removed"));
    else toast.error(errorMessage(result.error, t("Corrections.Failed")));
  };

  return (
    <DetailScreen
      section="workers"
      title={hours ? staffName(hours) : t("WorkerTitle")}
      back={back}
      actions={
        corrects && (
          <Button variant="add" onClick={() => void addCorrection()}>
            <Plus />
            {t("Corrections.AddTitle")}
          </Button>
        )
      }
    >
      {entryDialog}
      {reasonDialog}
      <div className="space-y-5">
        <MonthSwitch
          month={month}
          thisMonth={thisMonth}
          onChange={(next) => navigate(`/dashboard/hours-pay/workers/${id}?month=${next}`, { replace: true })}
        />
        {!hours ? (
          <p className="text-base text-muted-foreground">{t(isPending ? "Loading" : "NoHours")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t("Stats.Worked")}
                value={<Duration minutes={hours.totals.workedMin} />}
                hint={t("Stats.DaysHint", { count: hours.totals.daysWorked })}
                icon={Clock}
                tone="workers"
              />
              <StatCard
                label={t("Stats.Overtime")}
                value={<Duration minutes={hours.totals.overtimeMin} />}
                hint={t("Stats.OvertimeHint")}
                icon={CalendarClock}
                tone="workers"
              />
              <StatCard
                label={t("Stats.Late")}
                value={<Ltr className="tabular-nums">{hours.totals.lateCount}</Ltr>}
                hint={t("Stats.LateHint")}
                icon={AlarmClock}
                tone="workers"
              />
              <StatCard
                label={t("Stats.NotTyped")}
                value={<Ltr className="tabular-nums">{hours.totals.ordersNotTyped}</Ltr>}
                hint={t("Stats.NotTypedHint")}
                icon={ClipboardX}
                tone="workers"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("Weeks.Title")}</CardTitle>
                <CardDescription>{t("Weeks.Hint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={hours.weeks}
                  rowKey={(week) => week.start}
                  emptyMessage={t("Weeks.None")}
                  columns={[
                    {
                      header: t("Weeks.Week"),
                      cell: (week) => (
                        <span className="whitespace-nowrap">
                          <DayDate date={week.start} /> – <DayDate date={week.end} />
                        </span>
                      ),
                    },
                    { header: t("Table.Worked"), cell: (week) => <Duration minutes={week.workedMin} />, numeric: true },
                    {
                      header: t("Table.Overtime"),
                      numeric: true,
                      cell: (week) =>
                        week.overtimeMin > 0 ? (
                          <Duration minutes={week.overtimeMin} className="font-bold text-warning-ink" />
                        ) : (
                          <Nothing />
                        ),
                    },
                    { header: t("Weeks.RestDay"), cell: (week) => <DayDate date={week.restDate} /> },
                    {
                      header: t("Weeks.RestDayWorked"),
                      numeric: true,
                      cell: (week) => (week.restDayMin > 0 ? <Duration minutes={week.restDayMin} /> : <Nothing />),
                    },
                    {
                      header: "",
                      cell: (week) => (week.overCap ? <StatusChip tone="danger" label={t("Weeks.OverCap")} /> : null),
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Corrections.Title")}</CardTitle>
                <CardDescription>{t("Corrections.Hint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={hours.adjustments}
                  rowKey={(line) => line.id}
                  emptyMessage={t("Corrections.None")}
                  columns={[
                    { header: t("Corrections.Date"), cell: (line) => <DayDate date={line.date} /> },
                    { header: t("Corrections.Kind"), cell: (line) => t(`Corrections.Kinds.${line.kind}`) },
                    {
                      header: t("Corrections.Minutes"),
                      numeric: true,
                      cell: (line) => <Duration minutes={line.adjustMin} className="font-bold" />,
                    },
                    { header: t("Corrections.Reason"), cell: (line) => line.reason },
                    {
                      header: "",
                      cell: (line) =>
                        corrects ? (
                          <Button variant="outline" size="sm" onClick={() => void removeCorrection(line.id)}>
                            <Trash2 />
                            {t("Corrections.RemoveConfirm")}
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Absences.Title")}</CardTitle>
                <CardDescription>{t("Absences.Hint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={hours.absences}
                  rowKey={(absence, index) => `${absence.startDate}-${index}`}
                  emptyMessage={t("Absences.None")}
                  columns={[
                    {
                      header: t("Absences.Dates"),
                      cell: (absence) => (
                        <span className="whitespace-nowrap">
                          <DayDate date={absence.startDate} />
                          {absence.endDate !== absence.startDate && (
                            <>
                              {" – "}
                              <DayDate date={absence.endDate} />
                            </>
                          )}
                        </span>
                      ),
                    },
                    {
                      header: t("Table.Absence"),
                      cell: (absence) => <Duration minutes={absence.minutes} />,
                      numeric: true,
                    },
                    {
                      header: "",
                      cell: (absence) => (
                        <StatusChip
                          tone={absence.paid ? "success" : "neutral"}
                          label={t(absence.paid ? "Absences.Paid" : "Absences.Unpaid")}
                        />
                      ),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DetailScreen>
  );
}
