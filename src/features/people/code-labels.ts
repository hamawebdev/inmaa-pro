import { YES_NO } from "@/features/people/forms/worker-form";
import {
  ABILITIES,
  HEALTH_CONDITIONS,
  HIRING_CRITERIA,
  HIRING_DECISIONS,
  MARITAL_STATUSES,
  PAY_BASES,
  PAY_PERIODS,
  SANCTION_STATES,
  SEXES,
  STAFF_DOCUMENT_TYPES,
  WEEKDAYS,
  WORKER_ROLES,
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
 * forms/worker-form.test.ts compares them with his form.
 */
export const codeLabelCases: readonly CodeLabelCase[] = [
  ["WorkerForm.YesNo", YES_NO],
  ["WorkerForm.Sexes", SEXES],
  ["WorkerForm.Abilities", ABILITIES],
  ["WorkerForm.Weekdays", WEEKDAYS],
  ["WorkerForm.HealthConditions", HEALTH_CONDITIONS],
  ["WorkerForm.Documents", STAFF_DOCUMENT_TYPES],
  ["WorkerForm.Decisions", HIRING_DECISIONS],
  ["WorkerForm.MaritalStatuses", MARITAL_STATUSES],
  ["WorkerForm.Roles", WORKER_ROLES],
  ["WorkerForm.RolesFeminine", WORKER_ROLES],
  ["WorkerForm.PayBases", PAY_BASES],
  ["WorkerForm.PayPeriods", PAY_PERIODS],
  // «موقف / معاقب» for a worker or an employee, «متوقف / معاقب» for a client.
  ["WorkerForm.Sanction.States", SANCTION_STATES],
  ["WorkerForm.Sanction.ClientStates", SANCTION_STATES],
  // The ten criteria of the confidential evaluation are labelled as rows of the form.
  ["WorkerForm.Labels", HIRING_CRITERIA],
];
