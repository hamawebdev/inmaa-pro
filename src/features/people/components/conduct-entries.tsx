import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useEntryDialog, type EntryField } from "@/features/people/components/entry-dialog";
import { centimesOf } from "@/features/people/components/format";
import { isolate } from "@/features/people/components/may";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import { renewStaffDocumentAction } from "@/features/people/services/documents";
import { deleteEvaluationAction, recordEvaluationAction } from "@/features/people/services/evaluations";
import {
  decideHiringAction,
  recordInterviewOutcomeAction,
  scheduleInterviewAction,
} from "@/features/people/services/hiring";
import {
  addSkillAction,
  cancelTrainingSessionAction,
  listSkillsQuery,
  planTrainingSessionAction,
  setTrainingAttendanceAction,
  setWorkerSkillsAction,
  type TrainingSessionRow,
} from "@/features/people/services/training";
import {
  cancelViolationAction,
  decideViolationAction,
  recordViolationAction,
  type ViolationRow,
} from "@/features/people/services/violations";
import { listWorkersQuery } from "@/features/people/services/worker-reads";
import {
  ARTICLE_14_ITEMS,
  EVALUATION_CRITERIA,
  EVALUATION_RECOMMENDATIONS,
  HIRING_DECISIONS,
  REGULATION_ARTICLES,
  TRAINING_ATTENDANCES,
  TRAINING_MODULE_CODES,
  VIOLATION_ACTIONS,
  VIOLATION_SEVERITIES,
  type EvaluationRecommendation,
  type HiringDecision,
  type InterviewStatus,
  type StaffDocumentType,
  type TrainingAttendanceStatus,
  type ViolationAction,
  type ViolationSeverity,
} from "@/features/people/validators/staff-codes";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

type Result = { success: boolean; error?: string };

/**
 * The entries of hiring and training, violations, evaluations and documents
 * (feature 37, articles 16 and 17 of his regulations), each a short dialog:
 * one hook, so that the «التوظيف والتدريب» tab and a worker's file ask the
 * same questions in the same words.
 *
 * Closest academy component: its attendance family's add dialogs, opened the
 * way `useConfirm` is.
 */
export function useConductEntries() {
  const t = useTranslations("Hiring");
  const tForm = useTranslations("WorkerForm");
  const recommendationLabel = useCodeLabel("Options.EvaluationRecommendation");
  const errorMessage = useErrorMessage();
  const { today } = useCentreClock();
  const [ask, entryDialog] = useEntryDialog();
  const [askReason, reasonDialog] = useReasonDialog();
  const workers = useQuery({
    queryKey: [...pathKey("/dashboard/workers"), "all"],
    queryFn: () => listWorkersQuery(undefined),
  });
  const skills = useQuery({
    queryKey: [...pathKey("/dashboard/hiring"), "skills"],
    queryFn: () => listSkillsQuery(undefined),
  });

  const inPost = (workers.data ?? []).filter((worker) => worker.status !== "LEFT");
  const workerChoice = (name = "staffId"): EntryField => ({
    kind: "choice",
    name,
    label: t("Entry.Worker"),
    required: true,
    options: inPost.map((worker) => ({ value: worker.id, label: `${staffName(worker)} · ${isolate(worker.number)}` })),
  });
  const done = (result: Result, message: string) => {
    if (result.success) toast.success(message);
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
    return result.success;
  };
  const options = <T extends string>(codes: readonly T[], label: (code: T) => string) =>
    codes.map((code) => ({ value: code, label: label(code) }));

  // ── Hiring ──────────────────────────────────────────────────────────────
  const scheduleInterview = async (staffId: string) => {
    const values = await ask({
      title: t("Entry.InterviewTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [
        { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: today },
        { kind: "time", name: "time", label: t("Entry.Time") },
        { kind: "note", name: "note", label: t("Entry.Note") },
      ],
    });
    if (values)
      done(
        await scheduleInterviewAction({ staffId, date: values.date, time: values.time, note: values.note }),
        t("Entry.InterviewSaved"),
      );
  };
  const recordOutcome = async (interviewId: string) => {
    const values = await ask({
      title: t("Entry.OutcomeTitle"),
      description: t("Entry.OutcomeDescription"),
      confirmLabel: t("Entry.Save"),
      fields: [
        {
          kind: "choice",
          name: "status",
          label: t("Entry.Outcome"),
          required: true,
          defaultValue: "DONE",
          options: options(["DONE", "NO_SHOW", "CANCELLED"] as const, (code) => t(`InterviewStatuses.${code}`)),
        },
        { kind: "note", name: "note", label: t("Entry.Note"), required: false },
      ],
    });
    if (values) {
      done(
        await recordInterviewOutcomeAction({
          interviewId,
          status: values.status as InterviewStatus,
          note: values.note,
        }),
        t("Entry.Saved"),
      );
    }
  };
  const decide = async (staffId: string) => {
    const values = await ask({
      title: t("Entry.DecisionTitle"),
      description: t("Entry.DecisionDescription"),
      confirmLabel: t("Entry.Save"),
      fields: [
        {
          kind: "choice",
          name: "decision",
          label: tForm("Labels.hiringDecision"),
          required: true,
          options: options(HIRING_DECISIONS, (code) => tForm(`Decisions.${code}`)),
        },
        { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: today },
        {
          kind: "date",
          name: "trialEndDate",
          label: t("Entry.TrialEnd"),
          notBefore: "date",
          when: { field: "decision", in: ["ACCEPTED_ON_TRIAL"] },
        },
        { kind: "note", name: "note", label: t("Entry.Note") },
      ],
    });
    if (values) {
      done(
        await decideHiringAction({ staffId, ...values, decision: values.decision as HiringDecision }),
        t("Entry.DecisionSaved"),
      );
    }
  };

  // ── Training and skills ─────────────────────────────────────────────────
  const planSession = async () => {
    const values = await ask({
      title: t("Entry.SessionTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [
        { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: today },
        {
          kind: "choice",
          name: "moduleCode",
          label: t("Entry.Module"),
          required: true,
          options: options(TRAINING_MODULE_CODES, (code) => t(`Modules.${code}`)),
        },
        { kind: "text", name: "place", label: t("Entry.Place") },
        ...inPost.map(
          (worker): EntryField => ({
            kind: "tick",
            name: `w:${worker.id}`,
            label: `${staffName(worker)} · ${worker.number}`,
          }),
        ),
      ],
    });
    if (!values) return;
    const staffIds = Object.entries(values)
      .filter(([key, value]) => key.startsWith("w:") && value === "1")
      .map(([key]) => key.slice(2));
    done(
      await planTrainingSessionAction({
        date: values.date,
        moduleCode: values.moduleCode,
        place: values.place,
        staffIds,
      }),
      t("Entry.SessionSaved"),
    );
  };
  const attendance = async (session: TrainingSessionRow) => {
    const values = await ask({
      title: t("Entry.AttendanceTitle"),
      confirmLabel: t("Entry.Save"),
      fields: session.attendees.map(
        (attendee): EntryField => ({
          kind: "choice",
          name: attendee.staffId,
          label: `${attendee.name} · ${attendee.number}`,
          required: true,
          defaultValue: attendee.status,
          options: options(TRAINING_ATTENDANCES, (code) => t(`TrainingAttendances.${code}`)),
        }),
      ),
    });
    if (!values) return;
    for (const attendee of session.attendees) {
      if (values[attendee.staffId] === attendee.status) continue;
      const result = await setTrainingAttendanceAction({
        sessionId: session.id,
        staffId: attendee.staffId,
        status: values[attendee.staffId] as TrainingAttendanceStatus,
      });
      if (!done(result, t("Entry.Saved"))) return;
    }
  };
  const cancelSession = async (sessionId: string) => {
    const answer = await askReason({
      title: t("Entry.SessionCancelTitle"),
      reasonLabel: t("Entry.Why"),
      confirmLabel: t("Entry.CancelIt"),
      confirmTone: "destructive",
    });
    if (answer) done(await cancelTrainingSessionAction({ sessionId, reason: answer.reason }), t("Entry.Saved"));
  };
  const addSkill = async () => {
    const values = await ask({
      title: t("Entry.SkillTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [{ kind: "text", name: "labelAr", label: t("Entry.SkillName"), required: true }],
    });
    if (values) done(await addSkillAction({ labelAr: values.labelAr }), t("Entry.Saved"));
  };
  const giveSkills = async (worker?: { id: string; skills: readonly string[] }) => {
    const values = await ask({
      title: t("Entry.WorkerSkillsTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [
        ...(worker ? [] : [workerChoice("workerId")]),
        ...(skills.data ?? []).map(
          (skill): EntryField => ({
            kind: "tick",
            name: `s:${skill.code}`,
            label: skill.labelAr,
            defaultValue: worker?.skills.includes(skill.code) ? "1" : "",
          }),
        ),
      ],
    });
    if (!values) return;
    const skillCodes = Object.entries(values)
      .filter(([key, value]) => key.startsWith("s:") && value === "1")
      .map(([key]) => key.slice(2));
    done(await setWorkerSkillsAction({ workerId: worker?.id ?? values.workerId, skillCodes }), t("Entry.Saved"));
  };

  // ── Violations (article 17) ─────────────────────────────────────────────
  const recordViolation = async (workerId?: string) => {
    const values = await ask({
      title: t("Entry.ViolationTitle"),
      confirmLabel: t("Entry.Save"),
      fields: [
        ...(workerId ? [] : [workerChoice("workerId")]),
        { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: today },
        {
          kind: "choice",
          name: "severity",
          label: t("Entry.Severity"),
          required: true,
          defaultValue: "SERIOUS",
          options: options(VIOLATION_SEVERITIES, (code) => t(`Severities.${code}`)),
        },
        {
          kind: "choice",
          name: "article",
          label: t("Entry.Article"),
          options: options(REGULATION_ARTICLES, (code) => t(`Articles.${code}`)),
        },
        {
          kind: "choice",
          name: "article14Item",
          label: t("Entry.Article14"),
          when: { field: "article", in: ["ART_14"] },
          options: options(ARTICLE_14_ITEMS, (code) => t(`Article14.${code}`)),
        },
        { kind: "note", name: "description", label: t("Entry.Description"), required: true },
        { kind: "note", name: "staffStatement", label: t("Entry.Statement") },
      ],
    });
    if (!values) return;
    done(
      await recordViolationAction({
        workerId: workerId ?? values.workerId,
        date: values.date,
        severity: values.severity as ViolationSeverity,
        article: values.article,
        article14Item: values.article14Item,
        description: values.description,
        staffStatement: values.staffStatement,
      }),
      t("Entry.ViolationSaved"),
    );
  };
  const decideViolation = async (violation: ViolationRow) => {
    const values = await ask({
      title: t("Entry.DecideTitle", { number: isolate(violation.number) }),
      description: violation.description,
      confirmLabel: t("Entry.Save"),
      fields: [
        {
          kind: "choice",
          name: "action",
          label: t("Entry.Action"),
          required: true,
          options: options(VIOLATION_ACTIONS, (code) => t(`Actions.${code}`)),
        },
        { kind: "date", name: "actionDate", label: t("Entry.Date"), required: true, defaultValue: today },
        {
          kind: "number",
          name: "amount",
          label: t("Entry.Amount"),
          step: "0.01",
          suffix: t("Entry.Dinars"),
          required: true,
          when: { field: "action", in: ["DEDUCTION"] },
        },
        {
          kind: "date",
          name: "endDate",
          label: t("Entry.SanctionEnd"),
          notBefore: "actionDate",
          when: { field: "action", in: ["SUSPENSION", "PENALTY"] },
        },
        {
          kind: "choice",
          name: "severity",
          label: t("Entry.Severity"),
          required: true,
          defaultValue: violation.severity,
          options: options(VIOLATION_SEVERITIES, (code) => t(`Severities.${code}`)),
        },
      ],
    });
    if (!values) return;
    done(
      await decideViolationAction({
        violationId: violation.id,
        action: values.action as ViolationAction,
        actionDate: values.actionDate,
        amount: values.amount ? centimesOf(values.amount) : null,
        endDate: values.endDate,
        severity: values.severity as ViolationSeverity,
      }),
      t("Entry.Saved"),
    );
  };
  const cancelViolation = async (violation: ViolationRow) => {
    const answer = await askReason({
      title: t("Entry.ViolationCancelTitle", { number: isolate(violation.number) }),
      reasonLabel: t("Entry.Why"),
      confirmLabel: t("Entry.CancelIt"),
      confirmTone: "destructive",
    });
    if (answer)
      done(await cancelViolationAction({ violationId: violation.id, reason: answer.reason }), t("Entry.Saved"));
  };

  // ── Periodic evaluation (article 16) ────────────────────────────────────
  const evaluate = async (workerId?: string, since?: string) => {
    const values = await ask({
      title: t("Entry.EvaluationTitle"),
      description: t("Entry.EvaluationDescription"),
      confirmLabel: t("Entry.Save"),
      fields: [
        ...(workerId ? [] : [workerChoice()]),
        { kind: "date", name: "periodStart", label: t("Entry.PeriodStart"), required: true, defaultValue: since ?? "" },
        {
          kind: "date",
          name: "periodEnd",
          label: t("Entry.PeriodEnd"),
          required: true,
          defaultValue: today,
          notBefore: "periodStart",
        },
        ...EVALUATION_CRITERIA.map(
          (key): EntryField => ({ kind: "number", name: key, label: t(`Criteria.${key}`), required: true, min: "1" }),
        ),
        {
          kind: "choice",
          name: "recommendation",
          label: t("Entry.Recommendation"),
          options: options(EVALUATION_RECOMMENDATIONS, (code) => recommendationLabel(code)),
        },
        { kind: "note", name: "comment", label: t("Entry.Comment") },
      ],
    });
    if (!values) return;
    done(
      await recordEvaluationAction({
        staffId: workerId ?? values.staffId,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        scores: Object.fromEntries(EVALUATION_CRITERIA.map((key) => [key, Number(values[key])])) as Record<
          (typeof EVALUATION_CRITERIA)[number],
          number
        >,
        recommendation: (values.recommendation || null) as EvaluationRecommendation | null,
        comment: values.comment,
      }),
      t("Entry.EvaluationSaved"),
    );
  };
  const deleteEvaluation = async (evaluationId: string) => {
    const answer = await askReason({
      title: t("Entry.EvaluationDeleteTitle"),
      reasonLabel: t("Entry.Why"),
      confirmLabel: t("Entry.Delete"),
      confirmTone: "destructive",
    });
    if (answer) done(await deleteEvaluationAction({ evaluationId, reason: answer.reason }), t("Entry.Saved"));
  };

  // ── Documents ───────────────────────────────────────────────────────────
  const renewDocument = async (staffId: string, type: StaffDocumentType) => {
    const values = await ask({
      title: t("Entry.RenewTitle", { document: tForm(`Documents.${type}`) }),
      confirmLabel: t("Entry.Save"),
      fields: [
        { kind: "date", name: "deliveredDate", label: t("Entry.Delivered"), required: true, defaultValue: today },
        { kind: "date", name: "issueDate", label: t("Entry.Issued") },
        { kind: "date", name: "expiryDate", label: t("Entry.Expiry"), notBefore: "issueDate" },
        { kind: "note", name: "note", label: t("Entry.Note") },
      ],
    });
    if (values) done(await renewStaffDocumentAction({ staffId, type, ...values }), t("Entry.Saved"));
  };

  return {
    scheduleInterview,
    recordOutcome,
    decide,
    planSession,
    attendance,
    cancelSession,
    addSkill,
    giveSkills,
    recordViolation,
    decideViolation,
    cancelViolation,
    evaluate,
    deleteEvaluation,
    renewDocument,
    skills: skills.data ?? [],
    dialogs: (
      <>
        {entryDialog}
        {reasonDialog}
      </>
    ) as React.ReactNode,
  };
}
