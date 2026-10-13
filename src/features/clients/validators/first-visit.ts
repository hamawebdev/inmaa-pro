import { z } from "zod";

import { CLEANLINESS_LEVELS, TRANSPORT_MEANS } from "@/lib/options";

import { isDate, isTime } from "./file-values";
import type { Division } from "./option-lists";

/**
 * «الزيارة الأولية» (plan feature 3): the codes of the first visit and what
 * its form sends. OPTION-CODES.md: FIRST_VISIT_RESULT, CONDITION_FACTOR,
 * FIRST_VISIT_RECOMMENDATION. The Arabic is what the printed sheet says.
 */

export const FIRST_VISIT_RESULTS = [
  "SUITABLE",
  "NEEDS_STUDY",
  "NEEDS_INITIAL_DEEP",
  "NEEDS_EQUIPMENT",
  "NEEDS_EXTRA_TEAM",
  "NEEDS_SPECIAL_SERVICES",
] as const;
export type FirstVisitResult = (typeof FIRST_VISIT_RESULTS)[number];
export const FIRST_VISIT_RESULT_AR: Readonly<Record<FirstVisitResult, string>> = {
  SUITABLE: "مناسب للخدمة",
  NEEDS_STUDY: "يحتاج إلى دراسة",
  NEEDS_INITIAL_DEEP: "يحتاج إلى تنظيف أولي عميق",
  NEEDS_EQUIPMENT: "يحتاج إلى معدات",
  NEEDS_EXTRA_TEAM: "يحتاج إلى فريق إضافي",
  NEEDS_SPECIAL_SERVICES: "يحتاج إلى خدمات خاصة",
};

export const CONDITION_FACTORS = [
  "CEMENT_PAINT_TRACES",
  "GREASE",
  "STRONG_SMELLS",
  "PETS",
  "PILED_WASTE",
  "RECENT_WORKS",
  "SENSITIVE_EQUIPMENT",
] as const;
export type ConditionFactor = (typeof CONDITION_FACTORS)[number];
export const CONDITION_FACTOR_AR: Readonly<Record<ConditionFactor, string>> = {
  CEMENT_PAINT_TRACES: "بقايا إسمنت أو طلاء",
  GREASE: "دهون",
  STRONG_SMELLS: "روائح قوية",
  PETS: "حيوانات أليفة",
  PILED_WASTE: "نفايات متراكمة",
  RECENT_WORKS: "أشغال حديثة",
  SENSITIVE_EQUIPMENT: "أجهزة حساسة",
};

export const FIRST_VISIT_RECOMMENDATIONS = [
  "NORMAL",
  "EXTRA_WORKER",
  "SPECIAL_EQUIPMENT",
  "EXTRA_TIME",
  "SECOND_VISIT",
  "NOT_ADVISED",
  "STANDARD_QUOTE",
  "MONTHLY_CONTRACT",
  "ANNUAL_CONTRACT",
  "INITIAL_THEN_PERIODIC",
  "ADD_SPECIAL_SERVICES",
  "REINSPECT",
  "REFUSE",
  "PERIODIC_CONTRACT",
  "INITIAL_DEEP_FIRST",
  "MORE_WORKERS",
  "FEWER_VISITS",
  "ADD_PERIODIC_SERVICES",
] as const;
export type FirstVisitRecommendation = (typeof FIRST_VISIT_RECOMMENDATIONS)[number];
export const FIRST_VISIT_RECOMMENDATION_AR: Readonly<Record<FirstVisitRecommendation, string>> = {
  NORMAL: "يمكن تنفيذ الخدمة بشكل عادي",
  EXTRA_WORKER: "تحتاج عاملة إضافية",
  SPECIAL_EQUIPMENT: "تحتاج معدات خاصة",
  EXTRA_TIME: "تحتاج وقتًا إضافيًا",
  SECOND_VISIT: "تحتاج زيارة ثانية",
  NOT_ADVISED: "لا يُنصح بتنفيذها بالشروط الحالية",
  STANDARD_QUOTE: "تقديم عرض سعر عادي",
  MONTHLY_CONTRACT: "تقديم عقد شهري",
  ANNUAL_CONTRACT: "تقديم عقد سنوي",
  INITIAL_THEN_PERIODIC: "تنفيذ خدمة أولية ثم عقد دوري",
  ADD_SPECIAL_SERVICES: "إضافة خدمات خاصة",
  REINSPECT: "إعادة المعاينة",
  REFUSE: "رفض الخدمة لأسباب تشغيلية",
  PERIODIC_CONTRACT: "عقد تنظيف دوري",
  INITIAL_DEEP_FIRST: "تنظيف أولي عميق قبل بداية العقد",
  MORE_WORKERS: "زيادة عدد العمال",
  FEWER_VISITS: "تقليل عدد الزيارات",
  ADD_PERIODIC_SERVICES: "إضافة خدمات دورية",
};

const ORGANISATION_RECOMMENDATIONS: readonly FirstVisitRecommendation[] = [
  "STANDARD_QUOTE",
  "MONTHLY_CONTRACT",
  "ANNUAL_CONTRACT",
  "INITIAL_THEN_PERIODIC",
  "ADD_SPECIAL_SERVICES",
  "REINSPECT",
  "REFUSE",
];

/** Each division's screen and sheet offer their own subset, in the plan's order (D4, D6, D8). */
export const RECOMMENDATIONS_OF: Readonly<Record<Division, readonly FirstVisitRecommendation[]>> = {
  HOUSING: ["NORMAL", "EXTRA_WORKER", "SPECIAL_EQUIPMENT", "EXTRA_TIME", "SECOND_VISIT", "NOT_ADVISED"],
  ORGANISATION: ORGANISATION_RECOMMENDATIONS,
  BUILDING: [
    ...ORGANISATION_RECOMMENDATIONS,
    "PERIODIC_CONTRACT",
    "INITIAL_DEEP_FIRST",
    "MORE_WORKERS",
    "FEWER_VISITS",
    "ADD_PERIODIC_SERVICES",
  ],
  COMPLEX: [
    ...ORGANISATION_RECOMMENDATIONS,
    "PERIODIC_CONTRACT",
    "INITIAL_DEEP_FIRST",
    "MORE_WORKERS",
    "FEWER_VISITS",
    "ADD_PERIODIC_SERVICES",
  ],
};

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
const optional = (check: (value: string) => boolean, message: string) =>
  z
    .string()
    .nullish()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || check(value), message);
const count = z.number().int().min(0).max(1_000_000).nullable();

export const spaceSchema = z.object({
  label: z.string().trim().min(1, "Every space needs its name.").max(200),
  countOrArea: text(100),
  state: z.enum(CLEANLINESS_LEVELS).nullable(),
  workRequired: text(500),
  frequency: text(100),
});
export type SpaceInput = z.infer<typeof spaceSchema>;

export const firstVisitSchema = z.object({
  plannedDate: optional(isDate, "Enter a valid date."),
  plannedTime: optional(isTime, "Enter a time as HH:MM."),
  doneDate: optional(isDate, "Enter a valid date."),
  startTime: optional(isTime, "Enter a time as HH:MM."),
  endTime: optional(isTime, "Enter a time as HH:MM."),
  inspectorEmployeeId: z.string().nullable(),
  clientRepresentative: text(200),
  firstResult: z.array(z.enum(FIRST_VISIT_RESULTS)),
  conditionFactors: z.array(z.enum(CONDITION_FACTORS)),
  spaces: z.array(spaceSchema).max(60),
  estimatedWorkers: count,
  /** Minutes. */
  perVisitMin: count,
  /** Thousandths of a day. */
  daysNeeded: count,
  weeklyMin: count,
  monthlyMin: count,
  /** Thousandths of a kilometre. */
  distanceKm: count,
  travelMin: count,
  transportMeans: z.enum(TRANSPORT_MEANS).nullable(),
  accessDifficulty: text(1000),
  materialsAndEquipmentNeeds: text(2000),
  excludedServices: text(2000),
  recommendation: z.array(z.enum(FIRST_VISIT_RECOMMENDATIONS)),
  recommendationReason: text(2000),
  note: text(2000),
  needsSecondVisit: z.boolean(),
});
export type FirstVisitInput = z.infer<typeof firstVisitSchema>;

/** A first visit with nothing typed yet but its day: what a new one starts from. */
export function emptyFirstVisit(plannedDate: string | null): FirstVisitInput {
  return {
    plannedDate,
    plannedTime: null,
    doneDate: null,
    startTime: null,
    endTime: null,
    inspectorEmployeeId: null,
    clientRepresentative: null,
    firstResult: [],
    conditionFactors: [],
    spaces: [],
    estimatedWorkers: null,
    perVisitMin: null,
    daysNeeded: null,
    weeklyMin: null,
    monthlyMin: null,
    distanceKm: null,
    travelMin: null,
    transportMeans: null,
    accessDifficulty: null,
    materialsAndEquipmentNeeds: null,
    excludedServices: null,
    recommendation: [],
    recommendationReason: null,
    note: null,
    needsSecondVisit: false,
  };
}
