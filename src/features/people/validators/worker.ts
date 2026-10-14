import { z } from "zod";

import { YES_NO } from "@/features/people/forms/worker-form";
import { isDate } from "@/features/people/rules/dates";
import { typedTotalAgrees } from "@/features/people/rules/scores";
import { isWilayaCode } from "@/lib/geo/wilayas";

import {
  HOME_WILAYA_CODE,
  ABILITIES,
  HEALTH_CONDITIONS,
  HIRING_CRITERIA,
  HIRING_DECISIONS,
  MARITAL_STATUSES,
  PAY_BASES,
  PAY_PERIODS,
  SEXES,
  STAFF_DOCUMENT_TYPES,
  WEEKDAYS,
  WORKER_ROLES,
} from "./staff-codes";

/**
 * The registration screen of a cleaning worker: his worker form, then the
 * office-only block (scope A4).
 *
 * Values are what the screen holds: text as typed (empty when left blank),
 * dates as `YYYY-MM-DD`, numbers as the digits typed, choices as codes. The
 * service turns them into a record (centimes, minutes, nulls).
 *
 * Every message is an English sentence under `Errors` in a messages/en.json
 * (src/i18n/errors.test.ts checks it); the shared ones are Foundation's.
 */

const text = z.string().trim().max(200, "Must be at most 200 characters.");
const longText = z.string().trim().max(500, "Must be at most 500 characters.");
const date = z.string().refine((value) => value === "" || isDate(value), "Enter a valid date.");

/** A phone as typed, with or without spaces, dots or dashes. */
export function phoneDigits(value: string): string {
  return value.replace(/[\s./-]/g, "");
}
const phoneOk = (value: string) => /^\d{9,10}$/.test(phoneDigits(value));

const score = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (/^\d{1,2}$/.test(value) && Number(value) <= 10),
    "A score is a whole number from 0 to 10.",
  );

/** The scores as numbers, those left blank left out. */
export function scoresAsNumbers(
  scores: Record<string, string>,
): Partial<Record<(typeof HIRING_CRITERIA)[number], number>> {
  return Object.fromEntries(
    HIRING_CRITERIA.filter((criterion) => (scores[criterion] ?? "").trim() !== "").map((criterion) => [
      criterion,
      Number(scores[criterion]),
    ]),
  );
}

export const workerDocumentSchema = z.object({
  type: z.enum(STAFF_DOCUMENT_TYPES),
  delivered: z.boolean(),
  expiryDate: date,
});

export const workerFormSchema = z
  .object({
    // ── His header: the number is given on saving; the sex gives its letter, H or F ──
    sex: z.enum(SEXES, { errorMap: () => ({ message: "Choose whether the worker is a man or a woman." }) }),
    registrationDate: z.string().min(1, "This field is required.").pipe(date),

    // ── «المعلومات الشخصية والعائلية» ──
    lastName: z.string().trim().min(1, "The surname is required.").max(100, "Must be at most 100 characters."),
    firstName: z.string().trim().min(1, "The first name is required.").max(100, "Must be at most 100 characters."),
    fullNameLatin: text,
    birthDate: z.string().min(1, "The date of birth is required.").pipe(date),
    birthPlace: text,
    birthWilayaCode: z
      .string()
      .refine((value) => value === "" || isWilayaCode(value), "Choose a wilaya from the list."),
    address: text,
    residenceCommuneId: z.string(),
    // «بلدية/ولاية إقامة»: his two blanks, the wilaya and its commune (Foundation's picker).
    residenceWilayaCode: z
      .string()
      .refine((value) => value === "" || isWilayaCode(value), "Choose a wilaya from the list."),
    maritalStatus: z.enum(MARITAL_STATUSES).optional(),
    phone: z.string().trim().min(1, "This field is required.").refine(phoneOk, "The phone number has 9 or 10 digits."),

    // ── «معلومات الطوارئ» ──
    emergencyName: text,
    emergencyAddress: text,
    emergencyRelation: text,
    emergencyPhone: z
      .string()
      .refine((value) => value.trim() === "" || phoneOk(value), "The phone number has 9 or 10 digits."),

    // ── «المعلومات الدراسية والمهنية» ──
    educationLevel: text,
    certificateName: text,
    workedInFieldBefore: z.enum(YES_NO).optional(),
    previousEmployer: text,
    abilities: z.array(z.enum(ABILITIES)),
    availableDays: z.array(z.enum(WEEKDAYS)),

    // ── «هل تعاني من» (restricted) ──
    healthConditions: z.array(z.enum(HEALTH_CONDITIONS)),
    healthOtherText: text,

    // ── «الوثائق المسلمة», with an expiry date for each ──
    documents: z.array(workerDocumentSchema),

    // ── «تقييم مسئول الموارد البشرية (سري)» (restricted) ──
    hiringScores: z.object(
      Object.fromEntries(HIRING_CRITERIA.map((criterion) => [criterion, score])) as Record<
        (typeof HIRING_CRITERIA)[number],
        typeof score
      >,
    ),
    hiringTotal: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || (/^\d{1,3}$/.test(value) && Number(value) <= 100),
        "A total is a whole number from 0 to 100.",
      ),

    // ── «قرار الإدارة», «حررت: بأم البواقي، بتاريخ» ──
    hiringDecision: z.enum(HIRING_DECISIONS).optional(),
    issuedDate: date,

    // ── «للاستخدام الإداري»: the office's own block, not printed ──
    nationalIdNumber: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{6,20}$/.test(value.replace(/\s/g, "")),
        "An identity number is 6 to 20 digits.",
      ),
    zoneId: z.string(),
    role: z.enum(WORKER_ROLES),
    payBasis: z.enum(PAY_BASES).optional(),
    payRate: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{1,9}([.,]\d{1,2})?$/.test(value),
        "A pay rate is an amount in dinars, 0 or more.",
      ),
    payPeriod: z.enum(PAY_PERIODS).optional(),
    weeklyCapacityHours: z
      .string()
      .trim()
      .refine(
        (value) =>
          /^\d{1,2}([.,]\d)?$/.test(value) &&
          Number(value.replace(",", ".")) >= 1 &&
          Number(value.replace(",", ".")) <= 48,
        "The weekly capacity is between 1 and 48 hours.",
      ),
    canCollectCash: z.boolean(),
    collectAuthFrom: date,
    collectAuthNote: longText,
    cnasDeclared: z.boolean(),
    cnasNumber: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{6,20}$/.test(value.replace(/\s/g, "")),
        "A social security number is 6 to 20 digits.",
      ),
  })
  .superRefine((data, ctx) => {
    // The coordinator's ruling: once a wilaya other than the centre's is chosen, its commune is required.
    if (data.residenceWilayaCode && data.residenceWilayaCode !== HOME_WILAYA_CODE && !data.residenceCommuneId) {
      ctx.addIssue({ code: "custom", path: ["residenceCommuneId"], message: "Choose the commune of residence." });
    }
    if (data.healthConditions.includes("NONE") && data.healthConditions.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["healthConditions"],
        message: "None cannot be ticked together with an illness.",
      });
    }
    if (data.healthConditions.includes("OTHER") && data.healthOtherText === "") {
      ctx.addIssue({ code: "custom", path: ["healthOtherText"], message: "Write what the other illness is." });
    }
    const total = data.hiringTotal === "" ? null : Number(data.hiringTotal);
    if (!typedTotalAgrees(total, scoresAsNumbers(data.hiringScores))) {
      ctx.addIssue({ code: "custom", path: ["hiringTotal"], message: "The total does not agree with the scores." });
    }
    if (data.birthDate !== "" && data.registrationDate !== "" && data.birthDate >= data.registrationDate) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "The date of birth must be before the registration date.",
      });
    }
    if (data.payRate !== "" && !data.payBasis) {
      ctx.addIssue({ code: "custom", path: ["payBasis"], message: "Choose how this rate is paid." });
    }
  });

export type WorkerFormValues = z.infer<typeof workerFormSchema>;
export type WorkerDocumentValue = z.infer<typeof workerDocumentSchema>;
