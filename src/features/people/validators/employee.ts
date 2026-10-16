import { z } from "zod";

import { isDate } from "@/features/people/rules/dates";
import { isWilayaCode } from "@/lib/geo/wilayas";

import {
  EMPLOYMENT_CONTRACTS,
  HOME_WILAYA_CODE,
  JOB_POSITIONS,
  MARITAL_STATUSES,
  PAY_BASES,
  PAY_PERIODS,
  SEXES,
  WORK_TIMES,
} from "./staff-codes";
import { phoneDigits } from "./worker";

/**
 * The screen of a centre employee (scope A2): the academy's employee file,
 * with the personal block of his worker form, a job position, the terms of the
 * post and the pay.
 *
 * Values are what the screen holds: text as typed (empty when left blank),
 * dates as `YYYY-MM-DD`, numbers as the digits typed, choices as codes. Every
 * message is an English sentence under `Errors`.
 */

const text = z.string().trim().max(200, "Must be at most 200 characters.");
const date = z.string().refine((value) => value === "" || isDate(value), "Enter a valid date.");
const phoneOk = (value: string) => /^\d{9,10}$/.test(phoneDigits(value));
const optionalPhone = z
  .string()
  .refine((value) => value.trim() === "" || phoneOk(value), "The phone number has 9 or 10 digits.");

export const employeeFormSchema = z
  .object({
    // ── The number is given on saving ──
    registrationDate: z.string().min(1, "This field is required.").pipe(date),

    // ── «المعلومات الشخصية والعائلية», as on his worker form ──
    lastName: z.string().trim().min(1, "The surname is required.").max(100, "Must be at most 100 characters."),
    firstName: z.string().trim().min(1, "The first name is required.").max(100, "Must be at most 100 characters."),
    fullNameLatin: text,
    sex: z.enum(SEXES, { errorMap: () => ({ message: "Choose whether the employee is a man or a woman." }) }),
    birthDate: date,
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
    phone2: optionalPhone,
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || z.string().email().safeParse(value).success, "Enter a valid email address."),
    nationalIdNumber: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{6,20}$/.test(value.replace(/\s/g, "")),
        "An identity number is 6 to 20 digits.",
      ),

    // ── «معلومات الطوارئ» ──
    emergencyName: text,
    emergencyAddress: text,
    emergencyRelation: text,
    emergencyPhone: optionalPhone,

    // ── The post ──
    jobPosition: z.enum(JOB_POSITIONS, { errorMap: () => ({ message: "Choose the job position." }) }),
    educationLevel: text,
    certificateName: text,
    startDate: date,
    employmentContract: z.enum(EMPLOYMENT_CONTRACTS).optional(),
    workTimeKind: z.enum(WORK_TIMES).optional(),
    contractEndDate: date,
    // Annual leave brought in from paper: the days left on that date (LAB-6; the count goes on from the day after).
    leaveOpeningDays: z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{1,3}([.,]\d{1,3})?$/.test(value), "Enter a number of days."),
    leaveOpeningDate: date,
    cnasDeclared: z.boolean(),
    cnasNumber: text,

    // ── Pay ──
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
  })
  .superRefine((data, ctx) => {
    // The coordinator's ruling: once a wilaya other than the centre's is chosen, its commune is required.
    if (data.residenceWilayaCode && data.residenceWilayaCode !== HOME_WILAYA_CODE && !data.residenceCommuneId) {
      ctx.addIssue({ code: "custom", path: ["residenceCommuneId"], message: "Choose the commune of residence." });
    }
    if (data.birthDate !== "" && data.registrationDate !== "" && data.birthDate >= data.registrationDate) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "The date of birth must be before the registration date.",
      });
    }
    if (data.startDate !== "" && data.contractEndDate !== "" && data.contractEndDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["contractEndDate"],
        message: "The end of the contract cannot be before its start.",
      });
    }
    if (data.payRate !== "" && !data.payBasis) {
      ctx.addIssue({ code: "custom", path: ["payBasis"], message: "Choose how this rate is paid." });
    }
  });

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export function emptyEmployeeValues(today: string): EmployeeFormValues {
  return {
    registrationDate: today,
    lastName: "",
    firstName: "",
    fullNameLatin: "",
    sex: undefined as unknown as EmployeeFormValues["sex"],
    birthDate: "",
    birthPlace: "",
    birthWilayaCode: "",
    address: "",
    residenceCommuneId: "",
    residenceWilayaCode: HOME_WILAYA_CODE,
    maritalStatus: undefined,
    phone: "",
    phone2: "",
    email: "",
    nationalIdNumber: "",
    emergencyName: "",
    emergencyAddress: "",
    emergencyRelation: "",
    emergencyPhone: "",
    jobPosition: undefined as unknown as EmployeeFormValues["jobPosition"],
    educationLevel: "",
    certificateName: "",
    startDate: today,
    employmentContract: undefined,
    workTimeKind: undefined,
    contractEndDate: "",
    leaveOpeningDays: "",
    leaveOpeningDate: "",
    cnasDeclared: false,
    cnasNumber: "",
    payBasis: undefined,
    payRate: "",
    payPeriod: undefined,
    weeklyCapacityHours: "40",
  };
}
