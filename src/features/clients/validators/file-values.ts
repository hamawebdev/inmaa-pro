import { z } from "zod";

import { isWilayaCode } from "@/lib/geo/wilayas";
import { ABILITIES, FORBIDDEN_PLACES, PPE, SITE_INSTRUCTIONS, WEEKDAYS } from "@/lib/options";

import { optionCode } from "../forms/answers";
import { FORM_DEFINITIONS } from "../forms/definitions";
import type { FormRow } from "../forms/types";
import type { FieldKey } from "../forms/values";

import {
  AMOUNT_BASES,
  codesOf,
  DURATION_UNITS,
  FORM_KINDS,
  PRIORITIES,
  REQUEST_SOURCES,
  type FormKind,
  type OptionListName,
} from "./option-lists";

/**
 * What a service accepts for a file: his sheet's answers in the data model's
 * units (`FormValues`), the office-only answers of the file and of its site,
 * and the residents of a building.
 *
 * The schema of a sheet is built from its form's definition: an answer the
 * form does not print is dropped, a choice must be one of that form's options.
 * The screen turns what was typed into these units first
 * (./file-screen.ts); this is the check at the service's edge.
 *
 * Every message is an English sentence under `Errors` in a messages/en.json;
 * the generic ones (a whole number, a length) come from the shared error map.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar day written YYYY-MM-DD. */
export function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const isTime = (value: string) => TIME.test(value);

/** A phone as typed, with or without spaces, dots or dashes: 9 digits (a fixed line) or 10 (a mobile). */
export function isPhone(value: string): boolean {
  return /^\d{9,10}$/.test(value.replace(/[\s./-]/g, ""));
}

const date = z.string().refine(isDate, "Enter a valid date.");
const time = z.string().refine(isTime, "Enter a time as HH:MM.");
const phone = z.string().refine(isPhone, "The phone number has 9 or 10 digits.");
const text = (max: number) => z.string().max(max);
/** A count on his sheet: rooms, floors, workers. */
const count = z.number().int().min(0).max(100_000);
/** Thousandths of a unit: an area in m², a duration in hours or days. */
const thousandths = z.number().int().min(0).max(1_000_000_000);
/** Centimes. */
const amount = z.number().int().min(0).max(100_000_000_000);

/** The codes a row of this form offers: his options on this sheet, not the whole list. */
function codeOf(row: FormRow) {
  const codes = (row.options ?? []).flatMap((option) => {
    const code = optionCode(row.list!, option);
    return code === null ? [] : [code];
  });
  return z.enum((codes.length ? codes : codesOf(row.list as OptionListName)) as [string, ...string[]]);
}

/** The answer of one row of a form, by the kind of answer it takes. */
function answerSchema(row: FormRow): z.ZodTypeAny | null {
  switch (row.answer) {
    case "text":
      return text(300);
    case "number":
      return count;
    case "area":
    case "duration":
      return thousandths;
    case "money":
      return amount;
    case "date":
      return date;
    case "time":
      return time;
    case "phone":
      return phone;
    case "place":
      return text(100);
    case "single":
      // «عدد الزيارات» is kept as the number of visits, 1 to 6.
      return row.list === "VISITS_PER_WEEK" ? z.number().int().min(1).max(6) : codeOf(row);
    case "several":
      return z.array(codeOf(row));
    case "yesNo":
      return z.boolean();
    default:
      return null;
  }
}

function sheetShape(kind: FormKind): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const add = (key: FieldKey | null | undefined, schema: z.ZodTypeAny | null) => {
    if (key && schema) shape[key] = schema.optional();
  };
  for (const row of FORM_DEFINITIONS[kind].rows) {
    // The header is the program's: its number, the client's number and «حالة الملف» are never typed.
    if (row.key === "registrationNumber" || row.key === "dossierNumber" || row.answer === "computed") continue;
    add(row.key, answerSchema(row));
    add(row.noteKey, text(300));
    add(row.otherKey, text(200));
    add(row.labelKey, text(100));
    if (row.freeKey) add(row.freeKey, z.array(text(200).nullable()));
    if (row.pairKey === "wilaya") {
      add("wilaya", z.string().refine(isWilayaCode, "Choose a wilaya from the list."));
    } else if (row.pairKey === "executionDurationUnit") {
      add("executionDurationUnit", z.enum(DURATION_UNITS));
    }
  }
  return shape;
}

const SHEETS = new Map<FormKind, z.ZodObject<Record<string, z.ZodTypeAny>>>();

/** His sheet's answers for one form: what it prints, in the data model's units. Unknown answers are dropped. */
export function sheetSchema(kind: FormKind) {
  let schema = SHEETS.get(kind);
  if (!schema) {
    schema = z.object(sheetShape(kind));
    SHEETS.set(kind, schema);
  }
  return schema;
}

export const formKindSchema = z.enum(FORM_KINDS);

/** The office-only answers of a file (scope A4, A7): never printed on his sheet. */
export const fileOfficeSchema = z
  .object({
    source: z.enum(REQUEST_SOURCES).nullable(),
    priority: z.enum(PRIORITIES).nullable(),
    officeNotes: text(2000).nullable(),
    amountBasis: z.enum(AMOUNT_BASES).nullable(),
    expensesIncluded: z.boolean(),
  })
  .partial();
export type FileOfficeInput = z.infer<typeof fileOfficeSchema>;

/**
 * The office-only block of a site: how to find it, its keys and hours, and what
 * a mission order needs that his form does not carry (coordinator's ruling:
 * once, on the site; Operations reads it).
 */
export const siteOfficeSchema = z
  .object({
    district: text(200).nullable(),
    landmark: text(200).nullable(),
    directions: text(1000).nullable(),
    mapLink: text(500).nullable(),
    /** Micro-degrees (@udeg): the site's coordinates, for the optional QR on the order (`geo:<lat>,<lng>`). */
    latitude: z
      .number()
      .int()
      .min(-90_000_000, "The latitude is a number between -90 and 90.")
      .max(90_000_000, "The latitude is a number between -90 and 90.")
      .nullable()
      .optional(),
    longitude: z
      .number()
      .int()
      .min(-180_000_000, "The longitude is a number between -180 and 180.")
      .max(180_000_000, "The longitude is a number between -180 and 180.")
      .nullable()
      .optional(),
    floorAndDoor: text(100).nullable(),
    buildingsCount: z.number().int().min(1).max(1000).nullable(),
    keysHeld: z.boolean(),
    keyCount: z.number().int().min(0).max(1000).nullable(),
    keyReceivedDate: date.nullable(),
    keyHolderName: text(200).nullable(),
    allowedDays: z.array(z.enum(WEEKDAYS)).nullable(),
    allowedFrom: time.nullable(),
    allowedTo: time.nullable(),
    forbiddenCodes: z.array(z.enum(FORBIDDEN_PLACES)).nullable(),
    forbiddenAreas: text(1000).nullable(),
    doNotTouch: text(1000).nullable(),
    valuables: text(1000).nullable(),
    instructionCodes: z.array(z.enum(SITE_INSTRUCTIONS)).nullable(),
    specialInstructions: text(1000).nullable(),
    securityInstructionsText: text(1000).nullable(),
    ppeCodes: z.array(z.enum(PPE)).nullable(),
    meetingPoint: text(300).nullable(),
    receiverName: text(200).nullable(),
    receiverRole: text(200).nullable(),
    receiverPhone: phone.nullable(),
    sameWorkerRule: z.boolean(),
    womenOnly: z.boolean(),
    requiredAbilityCodes: z.array(z.enum(ABILITIES)).nullable(),
    photoConsent: z.boolean(),
    note: text(2000).nullable(),
  })
  .partial()
  .refine(
    (site) => !site.allowedFrom || !site.allowedTo || site.allowedFrom < site.allowedTo,
    "The allowed hours must end after they start.",
  );
export type SiteOfficeInput = z.infer<typeof siteOfficeSchema>;

/** The sets of the site's office block, kept as JSON arrays. */
export const SITE_OFFICE_SETS = [
  "allowedDays",
  "forbiddenCodes",
  "instructionCodes",
  "ppeCodes",
  "requiredAbilityCodes",
] as const satisfies readonly (keyof SiteOfficeInput)[];

/** The yes / no rules of the site's office block (never null). */
export const SITE_OFFICE_FLAGS = [
  "keysHeld",
  "sameWorkerRule",
  "womenOnly",
  "photoConsent",
] as const satisfies readonly (keyof SiteOfficeInput)[];

/** One line of «قائمة القاطنين بالعمارة», with the id of a line already kept. */
export const residentInputSchema = z.object({
  id: z.string().optional(),
  number: z.number().int().min(1).max(100_000),
  name: z.string().trim().min(1, "A resident's name is required.").max(200),
  phone: phone.nullable().optional(),
  registeredDate: date.nullable().optional(),
});
export type ResidentInput = z.infer<typeof residentInputSchema>;

export const residentsSchema = z
  .array(residentInputSchema)
  .max(2000)
  .refine(
    (lines) => new Set(lines.map((line) => line.number)).size === lines.length,
    "Two residents have the same number.",
  );

/** A reason the user typed: editing a signed file, moving a stage back, removing a resident. */
export const reasonSchema = z.string().trim().max(500).optional();
