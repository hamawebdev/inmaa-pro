import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, CalendarPlus, ClipboardCheck, Gavel, ListChecks, Scale, Star, Trash2, UserCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { useConductEntries } from "@/features/people/components/conduct-entries";
import { DayDate, Nothing } from "@/features/people/components/figures";
import { ListTable } from "@/features/people/components/list-table";
import { useMay } from "@/features/people/components/may";
import { usePeopleDates } from "@/features/people/components/people-dates";
import { RowMenu } from "@/features/people/components/row-menu";
import { SimpleTable } from "@/features/people/components/simple-table";
import { STATUS_TONE } from "@/features/people/components/status-tones";
import {
  listEvaluationsDueQuery,
  listEvaluationsQuery,
  type EvaluationRow,
} from "@/features/people/services/evaluations";
import { listCandidatesQuery, type CandidateRow } from "@/features/people/services/hiring";
import { listTrainingSessionsQuery } from "@/features/people/services/training";
import { listViolationsQuery, type ViolationRow } from "@/features/people/services/violations";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

type Entries = ReturnType<typeof useConductEntries>;
const KEY = pathKey("/dashboard/hiring");
const INTERVIEW_TONE: Record<string, StatusTone> = {
  SCHEDULED: "pending",
  DONE: "success",
  NO_SHOW: "warning",
  CANCELLED: "neutral",
};
const VIOLATION_TONE: Record<string, StatusTone> = { OPEN: "warning", DECIDED: "success", CANCELLED: "neutral" };

/**
 * The candidates and workers on trial: interview, decision, training days.
 *
 * Closest academy screen: the employees list (a table to search, the record's
 * actions on each row).
 */
export function CandidatesView({ entries }: { entries: Entries }) {
  const t = useTranslations("Hiring");
  const tWorkers = useTranslations("Workers");
  const tForm = useTranslations("WorkerForm");
  const keepsFiles = useMay("staff.write");
  const decides = useMay("hiring.decide");
  const { data, isPending } = useQuery({
    queryKey: [...KEY, "candidates"],
    queryFn: () => listCandidatesQuery(undefined),
  });
  const { scheduleInterview, recordOutcome, decide } = entries;
  const dates = usePeopleDates();
  const navigate = useNavigate();

  const columns = React.useMemo<ColumnDef<CandidateRow>[]>(
    () => [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => <Ltr className="font-bold whitespace-nowrap">{row.original.number}</Ltr>,
      },
      {
        id: "name",
        header: t("Table.Name"),
        cell: ({ row }) => (
          <Link to={`/dashboard/workers/${row.original.id}`} className="font-bold whitespace-nowrap hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "interview",
        header: t("Table.Interview"),
        cell: ({ row }) =>
          row.original.interview ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              <DayDate date={row.original.interview.date} />
              {row.original.interview.status !== "SCHEDULED" && (
                <StatusChip
                  tone={INTERVIEW_TONE[row.original.interview.status]}
                  label={t(`InterviewStatuses.${row.original.interview.status}`)}
                />
              )}
            </span>
          ) : (
            <Nothing />
          ),
      },
      {
        id: "decision",
        header: t("Table.Decision"),
        cell: ({ row }) =>
          row.original.decision?.trialEndDate && row.original.status === "ON_TRIAL" ? (
            <StatusChip
              tone={row.original.trialEnding ? "warning" : "info"}
              label={`${t("Table.TrialUntil")} ${dates.short(row.original.decision.trialEndDate)}`}
            />
          ) : row.original.decision ? (
            <span className="whitespace-nowrap">{tForm(`Decisions.${row.original.decision.decision}`)}</span>
          ) : (
            <Nothing />
          ),
      },
      {
        id: "training",
        header: t("Table.Training"),
        cell: ({ row }) =>
          row.original.training.completedDate ? (
            <StatusChip tone="success" label={t("Table.TrainingDone")} />
          ) : (
            <Ltr className="whitespace-nowrap">
              {row.original.training.done}/{row.original.training.required}
            </Ltr>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const interview = row.original.interview;
          const scheduled = interview?.status === "SCHEDULED";
          return (
            <div className="flex items-center justify-end gap-2">
              {keepsFiles && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void (scheduled ? recordOutcome(interview.id) : scheduleInterview(row.original.id))}
                >
                  {scheduled ? <ClipboardCheck /> : <CalendarPlus />}
                  {t(scheduled ? "Table.Outcome" : "Table.Interview")}
                </Button>
              )}
              <RowMenu
                label={t("Table.More")}
                items={[
                  {
                    label: t("Table.Score"),
                    icon: <Star />,
                    onSelect: () => navigate(`/dashboard/workers/${row.original.id}#worker-card-hiringScore`),
                  },
                  ...(decides
                    ? [{ label: t("Table.Decide"), icon: <UserCheck />, onSelect: () => void decide(row.original.id) }]
                    : []),
                ]}
              />
            </div>
          );
        },
      },
    ],
    [t, tWorkers, tForm, dates, navigate, keepsFiles, decides, scheduleInterview, recordOutcome, decide],
  );

  return (
    <ListTable
      rows={data ?? []}
      columns={columns}
      text={(row) => `${row.name} ${row.number}`}
      searchPlaceholder={t("Search")}
      emptyMessage={t(isPending ? "Loading" : "Candidates.None")}
    />
  );
}

/**
 * His eight training days (D1): the sessions held, who attended; and the
 * skills the centre keeps.
 *
 * Closest academy screen: the attendance overview (a table per day).
 */
export function TrainingView({ entries }: { entries: Entries }) {
  const t = useTranslations("Hiring");
  const keepsFiles = useMay("staff.write");
  const { data, isPending } = useQuery({
    queryKey: [...KEY, "sessions"],
    queryFn: () => listTrainingSessionsQuery({}),
  });
  const attendanceTone: Record<string, StatusTone> = { ATTENDED: "success", ABSENT: "danger", EXCUSED: "neutral" };
  return (
    <div className="space-y-6">
      <SimpleTable
        rows={data ?? []}
        rowKey={(session) => session.id}
        emptyMessage={t(isPending ? "Loading" : "Training.None")}
        columns={[
          { header: t("Table.Date"), cell: (session) => <DayDate date={session.date} /> },
          { header: t("Table.Module"), cell: (session) => t(`Modules.${session.moduleCode}`) },
          {
            header: t("Table.Attendees"),
            cell: (session) => (
              <div className="flex flex-wrap gap-2">
                {session.attendees.map((attendee) => (
                  <StatusChip
                    key={attendee.staffId}
                    tone={attendanceTone[attendee.status] ?? "neutral"}
                    label={attendee.name}
                  />
                ))}
              </div>
            ),
          },
          {
            header: "",
            cell: (session) =>
              keepsFiles ? (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => void entries.attendance(session)}>
                    <ListChecks />
                    {t("Table.Attendance")}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("Entry.SessionCancelTitle")}
                    title={t("Entry.SessionCancelTitle")}
                    onClick={() => void entries.cancelSession(session.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ) : null,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("Skills.Title")}</CardTitle>
          <CardDescription>{t("Skills.Hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {entries.skills.length === 0 ? (
              <span className="text-muted-foreground">{t("Skills.None")}</span>
            ) : (
              entries.skills.map((skill) => <StatusChip key={skill.code} tone="info" label={skill.labelAr} />)
            )}
          </div>
          {keepsFiles && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void entries.addSkill()}>
                {t("Entry.SkillTitle")}
              </Button>
              {entries.skills.length > 0 && (
                <Button variant="outline" onClick={() => void entries.giveSkills()}>
                  {t("Entry.WorkerSkillsTitle")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Article 17: the violations written or handed over, and what followed. */
export function ViolationsView({ entries, staffId }: { entries: Entries; staffId?: string }) {
  const t = useTranslations("Hiring");
  const keepsFiles = useMay("staff.write");
  const { data, isPending } = useQuery({
    queryKey: [...KEY, "violations", staffId ?? "all"],
    queryFn: () => listViolationsQuery({ staffId }),
  });
  const { decideViolation, cancelViolation } = entries;
  const columns = React.useMemo<ColumnDef<ViolationRow>[]>(
    () => [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => <Ltr className="font-bold whitespace-nowrap">{row.original.number}</Ltr>,
      },
      { id: "date", header: t("Table.Date"), cell: ({ row }) => <DayDate date={row.original.date} /> },
      {
        id: "worker",
        header: t("Table.Name"),
        cell: ({ row }) => (
          <Link
            to={`/dashboard/workers/${row.original.staffId}`}
            className="font-bold whitespace-nowrap hover:underline"
          >
            {row.original.staffName}
          </Link>
        ),
      },
      {
        id: "what",
        header: t("Table.Violation"),
        cell: ({ row }) => (
          <span className="flex items-center gap-2 whitespace-nowrap" title={row.original.description}>
            <StatusChip
              tone={row.original.severity === "SERIOUS" ? "danger" : "info"}
              label={t(`Severities.${row.original.severity}`)}
            />
            {row.original.article ? t(`Articles.${row.original.article}`) : <Nothing />}
          </span>
        ),
      },
      {
        id: "status",
        header: t("Table.Status"),
        cell: ({ row }) => (
          <StatusChip
            tone={VIOLATION_TONE[row.original.status]}
            label={
              row.original.status === "DECIDED" && row.original.action
                ? t(`Actions.${row.original.action}`)
                : t(`ViolationStatuses.${row.original.status}`)
            }
          />
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          keepsFiles && row.original.status === "OPEN" ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Table.Decide")}
                title={t("Table.Decide")}
                onClick={() => void decideViolation(row.original)}
              >
                <Gavel />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Table.Cancel")}
                title={t("Table.Cancel")}
                onClick={() => void cancelViolation(row.original)}
              >
                <Ban />
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, keepsFiles, decideViolation, cancelViolation],
  );
  return (
    <ListTable
      rows={data ?? []}
      columns={columns}
      text={staffId ? undefined : (row) => `${row.staffName} ${row.number}`}
      searchPlaceholder={t("Search")}
      emptyMessage={t(isPending ? "Loading" : "Violations.None")}
      pageSize={staffId ? 10 : 25}
    />
  );
}

/** Article 16: who is due, and the evaluations written. */
export function EvaluationsView({ entries, staffId }: { entries: Entries; staffId?: string }) {
  const t = useTranslations("Hiring");
  const recommendationLabel = useCodeLabel("Options.EvaluationRecommendation");
  const keepsFiles = useMay("staff.write");
  const due = useQuery({
    queryKey: [...KEY, "evaluations-due"],
    queryFn: () => listEvaluationsDueQuery(undefined),
    enabled: !staffId,
  });
  const done = useQuery({
    queryKey: [...KEY, "evaluations", staffId ?? "all"],
    queryFn: () => listEvaluationsQuery({ staffId }),
  });
  const columns = [
    ...(staffId
      ? []
      : [
          {
            header: t("Table.Name"),
            cell: (row: EvaluationRow) => (
              <Link to={`/dashboard/workers/${row.staffId}`} className="font-bold whitespace-nowrap hover:underline">
                {row.staffName}
              </Link>
            ),
          },
        ]),
    {
      header: t("Table.Period"),
      cell: (row: EvaluationRow) => (
        <span className="whitespace-nowrap">
          <DayDate date={row.periodStart} /> – <DayDate date={row.periodEnd} />
        </span>
      ),
    },
    {
      header: t("Table.Total"),
      numeric: true,
      cell: (row: EvaluationRow) => <Ltr className="font-bold">{row.total}%</Ltr>,
    },
    {
      header: t("Table.Recommendation"),
      cell: (row: EvaluationRow) => (row.recommendation ? recommendationLabel(row.recommendation) : <Nothing />),
    },
    {
      header: "",
      cell: (row: EvaluationRow) =>
        keepsFiles ? (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("Entry.EvaluationDeleteTitle")}
            title={t("Entry.EvaluationDeleteTitle")}
            onClick={() => void entries.deleteEvaluation(row.id)}
          >
            <Trash2 />
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="space-y-6">
      {!staffId && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Evaluations.DueTitle")}</CardTitle>
            <CardDescription>{t("Evaluations.DueHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
              rows={due.data ?? []}
              rowKey={(row) => row.staffId}
              emptyMessage={t(due.isPending ? "Loading" : "Evaluations.NoneDue")}
              columns={[
                {
                  header: t("Table.Name"),
                  cell: (row) => (
                    <Link
                      to={`/dashboard/workers/${row.staffId}`}
                      className="font-bold whitespace-nowrap hover:underline"
                    >
                      {row.name}
                    </Link>
                  ),
                },
                { header: t("Table.Since"), cell: (row) => <DayDate date={row.since} /> },
                {
                  header: t("Table.LastTotal"),
                  numeric: true,
                  cell: (row) => (row.lastTotal === null ? <Nothing /> : <Ltr>{row.lastTotal}%</Ltr>),
                },
                {
                  header: "",
                  cell: (row) =>
                    keepsFiles ? (
                      <Button variant="outline" size="sm" onClick={() => void entries.evaluate(row.staffId, row.since)}>
                        <Scale />
                        {t("Table.Evaluate")}
                      </Button>
                    ) : null,
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
      <SimpleTable
        rows={done.data ?? []}
        rowKey={(row) => row.id}
        emptyMessage={t(done.isPending ? "Loading" : "Evaluations.None")}
        columns={columns}
      />
    </div>
  );
}
