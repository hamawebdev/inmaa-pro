import {
  ARTICLE_14_ITEMS,
  CHECK_TYPES,
  EVALUATION_CRITERIA,
  INTERVIEW_STATUSES,
  PAY_ITEM_TYPES,
  REGULATION_ARTICLES,
  TRAINING_ATTENDANCES,
  TRAINING_MODULE_CODES,
  VIOLATION_ACTIONS,
  VIOLATION_SEVERITIES,
  VIOLATION_SOURCES,
  VIOLATION_STATUSES,
  DEBT_REASONS,
  DECISION_STATUSES,
  EMPLOYMENT_CONTRACTS,
  ENGAGEMENT_STATUSES,
  HEALTH_CONDITIONS,
  HIRING_CRITERIA,
  HIRING_DECISIONS,
  HOURS_ADJUSTMENT_KINDS,
  JOB_POSITIONS,
  LEAVE_STATUSES,
  MARITAL_STATUSES,
  MATCH_BASES,
  PAY_BASES,
  PAY_PERIODS,
  PAY_RUN_STATUSES,
  PAYOUT_KINDS,
  SANCTION_CONTEXTS,
  SANCTION_STATES,
  SANCTION_SUBJECTS,
  STAFF_DOCUMENT_TYPES,
  STAFF_KINDS,
  WORK_TIMES,
} from "@/features/people/validators/staff-codes";
import type { CodeLabelCase } from "@/i18n/code-labels";

/**
 * The stored codes this folder shows through `useCodeLabel`, each paired with
 * the message namespace that labels them.
 *
 * src/i18n/code-labels.test.ts fails when a code has no label in one of the
 * three languages, which is what stops "FULL_DAY" appearing on an Arabic screen.
 *
 * The Arabic labels of the worker form's lists are his own words:
 * forms/worker-form.test.ts compares them with his form. The lists shared with
 * other owners (yes and no, sex, abilities, weekdays, the worker's role) are
 * labelled once, in Foundation's `Options.*`.
 */
export const codeLabelCases: readonly CodeLabelCase[] = [
  ["WorkerForm.HealthConditions", HEALTH_CONDITIONS],
  ["WorkerForm.Documents", STAFF_DOCUMENT_TYPES],
  ["WorkerForm.Decisions", HIRING_DECISIONS],
  ["WorkerForm.MaritalStatuses", MARITAL_STATUSES],
  ["WorkerForm.PayBases", PAY_BASES],
  ["WorkerForm.PayPeriods", PAY_PERIODS],
  // «موقف / معاقب» for a worker or an employee, «متوقف / معاقب» for a client.
  ["Sanctions.States", SANCTION_STATES],
  ["Sanctions.ClientStates", SANCTION_STATES],
  ["Sanctions.Subjects", SANCTION_SUBJECTS],
  ["Sanctions.Bases", MATCH_BASES],
  ["Sanctions.DecisionStatuses", DECISION_STATUSES],
  ["Sanctions.Contexts", SANCTION_CONTEXTS],
  ["Workers.Statuses", ENGAGEMENT_STATUSES],
  ["Employees.Positions", JOB_POSITIONS],
  ["Employees.Contracts", EMPLOYMENT_CONTRACTS],
  ["Employees.WorkTimes", WORK_TIMES],
  // Hours and pay.
  ["Hours.Corrections.Kinds", HOURS_ADJUSTMENT_KINDS],
  ["Pay.Kinds", STAFF_KINDS],
  ["Pay.KindsShort", STAFF_KINDS],
  ["Pay.PersonKinds", STAFF_KINDS],
  ["Pay.RunStatuses", PAY_RUN_STATUSES],
  ["Pay.PayoutKinds", PAYOUT_KINDS],
  ["Pay.DebtReasons", DEBT_REASONS],
  ["Pay.ItemTypes", PAY_ITEM_TYPES],
  // Hiring and training, violations, evaluation.
  ["Hiring.InterviewStatuses", INTERVIEW_STATUSES],
  ["Hiring.TrainingAttendances", TRAINING_ATTENDANCES],
  ["Hiring.Modules", TRAINING_MODULE_CODES],
  ["Hiring.Severities", VIOLATION_SEVERITIES],
  ["Hiring.Sources", VIOLATION_SOURCES],
  ["Hiring.Actions", VIOLATION_ACTIONS],
  ["Hiring.ViolationStatuses", VIOLATION_STATUSES],
  ["Hiring.Articles", REGULATION_ARTICLES],
  ["Hiring.Article14", ARTICLE_14_ITEMS],
  ["Hiring.Criteria", EVALUATION_CRITERIA],
  // Centre employees' attendance.
  ["EmployeeAttendance.CheckTypes", CHECK_TYPES],
  ["EmployeeAttendance.LeaveStatuses", LEAVE_STATUSES],
  // The ten criteria of the confidential evaluation are labelled as rows of the form.
  ["WorkerForm.Labels", HIRING_CRITERIA],
];
