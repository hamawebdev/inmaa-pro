import { z } from "zod";

import { isClockTime, isIsoDate } from "../rules/calendar";

import { QUALITY_LEVELS, type CorrectiveAction } from "./option-codes";

/**
 * The supervisor's inspection (#17) and the corrective tasks that follow a
 * low one: the stored codes, and the returned sheet as the office types it.
 *
 * The sheet is typed in one pass and saved once (the inspection page). Empty
 * text and an empty mark are written as "", a box left blank as null.
 */

/** INSPECTION_STATUS. */
export const INSPECTION_STATUSES = ["PLANNED", "DONE", "MISSED", "CANCELLED"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

/** INSPECTION_FREQUENCY: how often a file's plan puts an inspection on the calendar. */
export const INSPECTION_FREQUENCIES = ["WEEKLY", "MONTHLY", "NONE"] as const;
export type InspectionFrequency = (typeof INSPECTION_FREQUENCIES)[number];

/**
 * «الإجراء المقترح» on the sheet: the three actions of his study under the
 * threshold, in its order (the sheet's own list, ../sheets/print-labels.ts).
 */
export const INSPECTION_RESULT_ACTIONS = [
  "REDO_SERVICE",
  "TRAIN_WORKER",
  "CHANGE_WORKER",
] as const satisfies readonly CorrectiveAction[];
export type InspectionResultAction = (typeof INSPECTION_RESULT_ACTIONS)[number];

/** CORRECTIVE_SOURCE: what a corrective task comes from. */
export const CORRECTIVE_SOURCES = ["INSPECTION", "COMPLAINT", "PROBLEM_REPORT", "SIGNOFF", "MANUAL"] as const;
export type CorrectiveSource = (typeof CORRECTIVE_SOURCES)[number];

/** TASK_STATUS: a corrective task. */
export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** A task still to be done: it can be started, completed, cancelled, and it falls overdue. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ["OPEN", "IN_PROGRESS"];

/**
 * The inspections list, filtered in the address (`?state=`); the first is the
 * default. `due`: still planned for today or a day already past.
 */
export const INSPECTION_FILTERS = ["planned", "due", "done", "missed", "all"] as const;
export type InspectionFilter = (typeof INSPECTION_FILTERS)[number];

/** The corrective tasks list (`?view=corrective&state=`); the first is the default. `overdue`: still to be done, its date past. */
export const CORRECTIVE_FILTERS = ["open", "overdue", "done", "all"] as const;
export type CorrectiveFilter = (typeof CORRECTIVE_FILTERS)[number];

// ── The returned sheet ──────────────────────────────────────────────────────

const MARK = /^(10|[0-9])$/;
const timeOrEmpty = z.string().refine((value) => value === "" || isClockTime(value), "Enter a time as HH:MM.");

/** A mark as typed ("", "0" … "10") as stored: null when the box is empty. */
export function markOf(typed: string): number | null {
  const value = typed.trim();
  return MARK.test(value) ? Number(value) : null;
}

/** One line of «عناصر التقييم». */
export const inspectionMarkSchema = z.object({
  criterionCode: z.string().min(1),
  /** The mark out of 10, as typed; "" when the box is empty. */
  score: z
    .string()
    .refine((value) => value.trim() === "" || MARK.test(value.trim()), "A score is a whole number from 0 to 10."),
  /** «لا ينطبق»: the site has no such thing. Its mark is then ignored. */
  notApplicable: z.boolean(),
  note: z.string().max(500),
});

/** One line of «ملاحظات حول العمال الحاضرين». */
export const inspectionWorkerSchema = z.object({
  workerId: z.string().min(1),
  /** «حاضر(ة)»: null when neither box is ticked. */
  present: z.boolean().nullable(),
  remark: z.string().max(500),
});

export const inspectionResultSchema = z.object({
  /** The visit inspected; "" when none. */
  visitId: z.string(),
  /** «اسم المشرف»; "" when none is named yet. */
  supervisorEmployeeId: z.string(),
  /** «تاريخ التفتيش» and «الساعة». */
  doneDate: z.string().refine(isIsoDate, "Enter a valid date."),
  doneAtTime: timeOrEmpty,
  marks: z.array(inspectionMarkSchema),
  workers: z.array(inspectionWorkerSchema),
  /** «مستوى جودة العمل». It triggers nothing: only the score and the supervisor's tick do. */
  overallLevel: z.enum(QUALITY_LEVELS).nullable(),
  /** «هل يحتاج العمل إلى تصحيح؟ نعم / لا». */
  correctionNeeded: z.boolean().nullable(),
  /** «الإجراء المقترح». */
  recommendedAction: z.enum(INSPECTION_RESULT_ACTIONS).nullable(),
  /** «ملاحظات المشرف». */
  supervisorNotes: z.string().max(2000),
  /** «ملاحظة المسؤول في الموقع». */
  clientRemark: z.string().max(2000),
});
export type InspectionResultValues = z.infer<typeof inspectionResultSchema>;
