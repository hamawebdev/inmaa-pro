import { z } from "zod";

import { BUILDING_AREAS } from "../catalog/task-catalog";
import { isIsoDate } from "../rules/calendar";

import { AREA_KINDS, TASK_FREQUENCIES, type AreaKind, type TaskFrequency } from "./option-codes";

/**
 * A task and a place of a file, as File › المهام types them (#13).
 *
 * A task says what is done, where (a place of the file, or the whole site),
 * and how often, in his study's four lists «يومية / أسبوعية / شهرية / خاصة».
 * Each frequency has its own day: the weekday of a weekly task, the day of the
 * month a monthly one starts from, the date of a special one
 * (rules/visit-tasks.ts says which visit carries which). The other two days are
 * left empty: `taskTiming` drops them, so a task moved from weekly to monthly
 * does not keep a weekday nobody can see.
 *
 * A place is a row of «جدول الطوابق والمداخل» on his buildings card: an
 * entrance, a floor under it, a room, a space, or «مناطق أخرى». It may be
 * picked from his list «المناطق المطلوب تنظيفها اليوم» (BUILDING_AREAS).
 */

/** «الأولوية رقم 1 / 2 / 3» of his card (9.md section 8). */
export const TASK_PRIORITIES = [1, 2, 3] as const;

/** His list of building places, by code. */
export const BUILDING_AREA_CODES = BUILDING_AREAS.map((area) => area.code) as [string, ...string[]];

/** Trimmed first: the length checks see what is kept. */
const text = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters.`);
const name = (max: number) =>
  z.string().trim().min(1, "This field is required.").max(max, `Must be at most ${max} characters.`);

export const fileTaskSchema = z.object({
  label: name(200),
  /** Null: the whole site. */
  areaId: z.string().min(1).nullable(),
  frequency: z.enum(TASK_FREQUENCIES),
  /** Weekly: 0 السبت … 6 الجمعة; null is the first visit of the week. */
  dayOfWeek: z.number().int().min(0, "Must be at least 0.").max(6, "Must be at most 6.").nullable(),
  /** Monthly: the first visit on or after this day; null is the 1st. */
  dayOfMonth: z
    .number()
    .int("Must be a whole number.")
    .min(1, "Must be at least 1.")
    .max(31, "Must be at most 31.")
    .nullable(),
  /** Special: its date; null waits until it is given one. */
  specialDate: z.string().refine(isIsoDate, "Enter a valid date.").nullable(),
  priority: z.number().int().min(1, "Must be at least 1.").max(3, "Must be at most 3.").nullable(),
  note: text(500).nullable(),
});
export type FileTaskValues = z.infer<typeof fileTaskSchema>;

export const catalogTasksSchema = z.object({
  codes: z.array(z.string().min(1)).min(1, "Choose at least one task from the list.").max(100),
  areaId: z.string().min(1).nullable(),
});

export const fileAreaSchema = z.object({
  kind: z.enum(AREA_KINDS),
  label: name(120),
  /** The place it sits under: a floor under its entrance. Null: a place of its own. */
  parentAreaId: z.string().min(1).nullable(),
  /** The line of his list it was picked from, if any. */
  catalogCode: z.enum(BUILDING_AREA_CODES).nullable(),
});
export type FileAreaValues = z.infer<typeof fileAreaSchema>;

/** The day that goes with each frequency, and nothing for the other two. */
export function taskTiming(values: {
  frequency: TaskFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  specialDate: string | null;
}): { dayOfWeek: number | null; dayOfMonth: number | null; specialDate: string | null } {
  return {
    dayOfWeek: values.frequency === "WEEKLY" ? values.dayOfWeek : null,
    dayOfMonth: values.frequency === "MONTHLY" ? values.dayOfMonth : null,
    specialDate: values.frequency === "SPECIAL" ? values.specialDate : null,
  };
}

/**
 * The kind a place of his list is given when it is picked: his two entrance
 * lines are entrances, «أخرى» is «مناطق أخرى», the rest are spaces. The office
 * may change it.
 */
export function kindOfBuildingArea(code: string): AreaKind {
  if (code === "BLD_A_01" || code === "BLD_A_02") return "ENTRANCE";
  if (code === "BLD_A_14") return "OTHER";
  return "SPACE";
}

/** «المدخل 01», «الطابق 03»: the names his floor table gives the rows it generates. */
export function generatedAreaLabel(kind: "ENTRANCE" | "FLOOR", rank: number): string {
  return `${kind === "ENTRANCE" ? "المدخل" : "الطابق"} ${String(rank).padStart(2, "0")}`;
}
