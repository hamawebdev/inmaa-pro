import type { CodeLabelCase } from "@/i18n/code-labels";

import { REPLACEMENT_REASONS } from "./services/absences";

import {
  COMPLAINT_COUNTER_STATES,
  COMPLETIONS,
  PROBLEM_KINDS,
  PROGRAMME_WARNINGS,
  REPLACEMENT_EXCLUSIONS,
  REPLACEMENT_TIERS,
  SIGNOFF_STATUSES,
  TASK_FREQUENCIES,
  VISIT_STATUSES,
  WORK_RULE_CODES,
  WORK_RULE_LEVELS,
} from "./validators/option-codes";

/**
 * The stored codes this folder shows through `useCodeLabel`, each paired with
 * the message namespace that labels them.
 *
 *     ["Workers.Genders", WORKER_GENDERS]
 *
 * src/i18n/code-labels.test.ts fails when a code has no label in one of the
 * three languages, which is what stops "FULL_DAY" appearing on an Arabic screen.
 *
 * The lists themselves are written once, in ./validators/option-codes.ts.
 */
export const codeLabelCases: readonly CodeLabelCase[] = [
  ["VisitStatuses", VISIT_STATUSES],
  ["TaskFrequencies", TASK_FREQUENCIES],
  ["WorkRules", WORK_RULE_CODES],
  ["WorkRuleLevels", WORK_RULE_LEVELS],
  ["ReplacementExclusions", REPLACEMENT_EXCLUSIONS],
  ["ReplacementTiers", REPLACEMENT_TIERS],
  ["ProgrammeWarnings", PROGRAMME_WARNINGS],
  ["ComplaintCounter", COMPLAINT_COUNTER_STATES],
  ["ProblemKinds", PROBLEM_KINDS],
  ["Completions", COMPLETIONS],
  // Homes are worded as his homes file, the other divisions as his buildings card.
  ["SignoffStatuses.Housing", SIGNOFF_STATUSES],
  ["SignoffStatuses.Other", SIGNOFF_STATUSES],
  ["ReplacementReasons", REPLACEMENT_REASONS],
];
