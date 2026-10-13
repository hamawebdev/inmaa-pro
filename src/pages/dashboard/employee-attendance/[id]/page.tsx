import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CalendarOff,
  CalendarPlus,
  Check,
  Clock,
  PalmtreeIcon,
  PencilLine,
  Plus,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DayDate, Days, Duration, Nothing } from "@/features/people/components/figures";
import { monthBounds } from "@/features/people/components/format";
import { useMay, useMayIn } from "@/features/people/components/may";
import { MonthSwitch } from "@/features/people/components/month-switch";
import { usePeopleDates } from "@/features/people/components/people-dates";
import { SimpleTable } from "@/features/people/components/simple-table";
import { LEAVE_TONE } from "@/features/people/components/status-tones";
import { listEmployeeAttendanceQuery } from "@/features/people/services/employee-attendance";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { useAttendanceEntries } from "../_components/use-attendance-entries";
import { staffName } from "@/lib/text/names";

/**
 * One employee's month: every day with its times in and out, the absences,
 * the leave and what is left of it. Section «الموظفون», below the tab «الحضور
 * والغياب». Owner: People.
 *
 * Closest academy screen: a person's check history (staff-check-history.tsx)
 * and absence detail (staff-absence-detail.tsx), on one page; each line can be
 * changed or taken off with its reason, which the academy cannot do.
 */
export default function EmployeeAttendanceDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("EmployeeAttendance");
  const absenceLabel = useCodeLabel("Options.AbsenceType");
  const leaveLabel = useCodeLabel("Options.LeaveType");
  const dates = usePeopleDates();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { today } = useCentreClock();
  const writes = useMayIn("EMPLOYEES", "WRITE");
  const edits = useMay("attendance.employee.edit") && writes;
  const entries = useAttendanceEntries();

  const thisMonth = today.slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") ?? "") ? (params.get("month") as string) : thisMonth;
  const { from, to } = monthBounds(month);
  const { data, isPending } = useQuery({
    queryKey: [...pathKey("/dashboard/employee-attendance"), "month", month, id],
    queryFn: () => listEmployeeAttendanceQuery({ from, to, staffId: id }),
  });
  const person = data?.[0];
  const back = {
    href: `/dashboard/employee-attendance${month === thisMonth ? "" : `?month=${month}`}`,
    label: t("Back"),
  };

  return (
    <DetailScreen
      section="employees"
      title={person ? staffName(person) : t("DetailTitle")}
      back={back}
      actions={
        writes && (
          <>
            <Button variant="outline" onClick={() => void entries.requestLeave(id)}>
              <CalendarPlus />
              {t("Entry.LeaveTitle")}
            </Button>
            <Button variant="outline" onClick={() => void entries.addAbsence(id)}>
              <CalendarOff />
              {t("Entry.AbsenceTitle")}
            </Button>
            <Button variant="add" onClick={() => void entries.addCheck(id)}>
              <Plus />
              {t("Entry.CheckTitle")}
            </Button>
          </>
        )
      }
    >
      {entries.dialogs}
      <div className="space-y-5">
        <MonthSwitch
          month={month}
          thisMonth={thisMonth}
          onChange={(next) => navigate(`/dashboard/employee-attendance/${id}?month=${next}`, { replace: true })}
        />
        {!person ? (
          <p className="text-base text-muted-foreground">{t(isPending ? "Loading" : "Missing")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t("Stats.Hours")}
                value={<Duration minutes={person.totals.workedMin} />}
                icon={Clock}
                tone="employees"
              />
              <StatCard
                label={t("Stats.DaysPresent")}
                value={<Ltr className="tabular-nums">{person.totals.daysPresent}</Ltr>}
                hint={
                  person.totals.incompleteDays > 0
                    ? t("Table.Incomplete", { count: person.totals.incompleteDays })
                    : undefined
                }
                icon={UserCheck}
                tone="employees"
              />
              <StatCard
                label={t("Stats.Absence")}
                value={<Duration minutes={person.totals.absenceMin} />}
                icon={CalendarOff}
                tone="employees"
              />
              <StatCard
                label={t("Stats.LeaveBalance")}
                value={<Days thousandths={person.leave.balance} />}
                hint={t("Stats.LeaveHint")}
                icon={PalmtreeIcon}
                tone="employees"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("Days.Title")}</CardTitle>
                <CardDescription>{t("Days.Hint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={[...person.days].sort((a, b) => b.date.localeCompare(a.date))}
                  rowKey={(day) => day.date}
                  emptyMessage={t("Days.None")}
                  columns={[
                    {
                      header: t("Table.Date"),
                      cell: (day) => (
                        <span className="whitespace-nowrap">
                          {dates.weekday(day.date)} <DayDate date={day.date} />
                        </span>
                      ),
                    },
                    {
                      header: t("Days.Checks"),
                      cell: (day) => (
                        <div className="flex flex-wrap items-center gap-2">
                          {day.checks.map((check) => (
                            <span
                              key={check.id}
                              className="border-app inline-flex items-center gap-2 rounded-lg border-border bg-muted/40 px-2 py-1"
                            >
                              <span className={check.type === "CHECK_IN" ? "text-success" : "text-warning-ink"}>
                                {t(`CheckTypes.${check.type}`)}
                              </span>
                              <Ltr className="font-bold tabular-nums">{check.time}</Ltr>
                              {edits && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t("Table.Edit")}
                                    onClick={() => void entries.editCheck({ ...check, date: day.date })}
                                  >
                                    <PencilLine />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t("Table.Delete")}
                                    onClick={() => void entries.deleteCheck(check.id)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                      ),
                    },
                    { header: t("Table.Hours"), numeric: true, cell: (day) => <Duration minutes={day.minutes} /> },
                    {
                      header: "",
                      cell: (day) => (day.complete ? null : <StatusChip tone="warning" label={t("Days.Incomplete")} />),
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Absences.Title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={person.absences}
                  rowKey={(absence) => absence.id}
                  emptyMessage={t("Absences.None")}
                  columns={[
                    { header: t("Table.Date"), cell: (absence) => <DayDate date={absence.date} /> },
                    {
                      header: t("Table.Kind"),
                      cell: (absence) => (
                        <span className="whitespace-nowrap">
                          {absenceLabel(absence.type)} · <Duration minutes={absence.absenceMin} />
                        </span>
                      ),
                    },
                    {
                      header: t("Table.Justified"),
                      cell: (absence) => (
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip
                            tone={absence.justified ? "success" : "warning"}
                            label={t(absence.justified ? "Table.IsJustified" : "Table.NotJustified")}
                          />
                          <StatusChip
                            tone={absence.paid ? "info" : "neutral"}
                            label={t(absence.paid ? "Table.IsPaid" : "Table.NotPaid")}
                          />
                        </div>
                      ),
                    },
                    { header: t("Table.Reason"), cell: (absence) => absence.reason ?? <Nothing /> },
                    {
                      header: "",
                      cell: (absence) =>
                        edits ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void entries.editAbsence({ ...absence, staffId: id })}
                            >
                              <PencilLine />
                              {t("Table.Edit")}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void entries.deleteAbsence(absence.id)}>
                              <Trash2 />
                              {t("Table.Delete")}
                            </Button>
                          </div>
                        ) : null,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Leave.Title")}</CardTitle>
                <CardDescription>
                  {t("Leave.Earned")} <Days thousandths={person.leave.earned} className="font-bold text-foreground" />
                  {" · "}
                  {t("Leave.Taken")} <Days thousandths={person.leave.taken} className="font-bold text-foreground" />
                  {" · "}
                  {t("Leave.Left")} <Days thousandths={person.leave.balance} className="font-bold text-foreground" />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={person.leaves}
                  rowKey={(leave) => leave.id}
                  emptyMessage={t("Leave.None")}
                  columns={[
                    { header: t("Table.Kind"), cell: (leave) => leaveLabel(leave.type) },
                    {
                      header: t("Table.Dates"),
                      cell: (leave) => (
                        <span className="whitespace-nowrap">
                          <DayDate date={leave.startDate} /> – <DayDate date={leave.endDate} />
                        </span>
                      ),
                    },
                    { header: t("Table.Days"), numeric: true, cell: (leave) => <Days thousandths={leave.days} /> },
                    {
                      header: t("Table.Status"),
                      cell: (leave) => (
                        <StatusChip
                          tone={LEAVE_TONE[leave.status] ?? "neutral"}
                          label={t(`LeaveStatuses.${leave.status}`)}
                        />
                      ),
                    },
                    {
                      header: "",
                      cell: (leave) =>
                        edits ? (
                          <div className="flex items-center justify-end gap-2">
                            {leave.status === "REQUESTED" && (
                              <>
                                <Button variant="success" size="sm" onClick={() => void entries.approveLeave(leave.id)}>
                                  <Check />
                                  {t("Table.Approve")}
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => void entries.refuseLeave(leave.id)}>
                                  <X />
                                  {t("Table.Refuse")}
                                </Button>
                              </>
                            )}
                            {(leave.status === "REQUESTED" || leave.status === "APPROVED") && (
                              <Button variant="outline" size="sm" onClick={() => void entries.cancelLeave(leave.id)}>
                                <Ban />
                                {t("Table.CancelLeave")}
                              </Button>
                            )}
                          </div>
                        ) : null,
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
