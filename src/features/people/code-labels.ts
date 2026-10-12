import {
  DECISION_STATUSES,
  EMPLOYMENT_CONTRACTS,
  ENGAGEMENT_STATUSES,
  HEALTH_CONDITIONS,
  HIRING_CRITERIA,
  HIRING_DECISIONS,
  JOB_POSITIONS,
  MARITAL_STATUSES,
  MATCH_BASES,
  PAY_BASES,
  PAY_PERIODS,
  SANCTION_CONTEXTS,
  SANCTION_STATES,
  SANCTION_SUBJECTS,
  STAFF_DOCUMENT_TYPES,
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
  // The ten criteria of the confidential evaluation are labelled as rows of the form.
  ["WorkerForm.Labels", HIRING_CRITERIA],
];
