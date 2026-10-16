import { isWilayaCode } from "@/lib/geo/wilayas";
import type { Money, Qty } from "@/lib/units";

import { optionCode } from "../forms/answers";
import { FORM_DEFINITIONS } from "../forms/definitions";
import type { FormRow } from "../forms/types";
import type { FieldKey, FormValues } from "../forms/values";

import {
  isDate,
  isPhone,
  isTime,
  SITE_OFFICE_FLAGS,
  SITE_OFFICE_SETS,
  type FileOfficeInput,
  type ResidentInput,
  type SiteOfficeInput,
} from "./file-values";
import type { FormKind } from "./option-lists";

/**
 * The form screen holds what is typed: text as typed, numbers as the digits
 * typed (Arabic digits and a comma accepted), a choice as its code or "", a
 * yes / no as "YES", "NO" or "". This module turns a stored file into that,
 * and back into the data model's units, saying which answers need correcting.
 *
 * Every message is an English sentence under `Errors` (src/i18n/errors.test.ts
 * reads the `message:` of each issue below).
 */

export interface ResidentScreenLine {
  /** The kept line's id; none for a line typed now. (Not `id`: the form library keys its lines by that name.) */
  residentId?: string;
  number: string;
  name: string;
  phone: string;
  registeredDate: string;
}

export interface FileScreenState {
  /** His sheet, by answer key. Several ticks and blank lines are lists. */
  answers: Record<string, string | string[]>;
  office: { source: string; priority: string; officeNotes: string; amountBasis: string; expensesIncluded: boolean };
  site: Record<string, string | string[] | boolean>;
  residents: ResidentScreenLine[];
}

export interface ScreenIssue {
  /** Where the answer is in the screen state: "answers.phone", "residents.2.name". */
  path: string;
  message: string;
}

export interface ParsedFileScreen {
  values: FormValues;
  office: FileOfficeInput;
  siteOffice: SiteOfficeInput;
  residents: ResidentInput[];
  issues: ScreenIssue[];
}

/** The site office block's texts, in the order the screen shows them. */
export const SITE_OFFICE_TEXTS = [
  "district",
  "landmark",
  "floorAndDoor",
  "directions",
  "mapLink",
  "keyHolderName",
  "keyReceivedDate",
  "allowedFrom",
  "allowedTo",
  "receiverName",
  "receiverRole",
  "receiverPhone",
  "meetingPoint",
  "forbiddenAreas",
  "doNotTouch",
  "valuables",
  "specialInstructions",
  "securityInstructionsText",
  "note",
] as const;

/** The site office block's whole numbers. */
export const SITE_OFFICE_COUNTS = ["buildingsCount", "keyCount"] as const;

/** The site's coordinates, typed in degrees and kept in micro-degrees. */
export const SITE_OFFICE_COORDINATES = [
  ["latitude", 90, "The latitude is a number between -90 and 90."],
  ["longitude", 180, "The longitude is a number between -180 and 180."],
] as const;

/** Degrees as typed («35.8754», «7,1135», «-0.5») in micro-degrees, or the reason it is not one. */
export function parseDegrees(typed: string, limit: number, message: string): { value: number } | { message: string } {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(normaliseTyped(typed));
  if (!match) return { message };
  const value = (match[1] ? -1 : 1) * (Number(match[2]) * 1_000_000 + Number((match[3] ?? "").padEnd(6, "0")));
  return Math.abs(value) > limit * 1_000_000 ? { message } : { value };
}

const degreesText = (value: unknown) => (typeof value === "number" ? String(value / 1_000_000) : "");

// ── Typed numbers ────────────────────────────────────────────────────────────

/** Digits as typed on an Arabic keyboard become ASCII; spaces and thousands marks go; a comma is a decimal point. */
export function normaliseTyped(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\s\u00a0\u202f\u066c]/g, "")
    .replace(/[,\u066b]/g, ".");
}

type Parsed = { value: number } | { message: string };

/** A typed decimal as a whole number of `10^places` units, without floating-point error. */
function parseUnits(typed: string, places: number): Parsed {
  const text = normaliseTyped(typed);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return { message: "Must be a number." };
  const fraction = match[2] ?? "";
  if (fraction.length > places) {
    if (places === 0) return { message: "Must be a whole number." };
    if (places === 2) return { message: "An amount has at most two decimals." };
    return { message: "A value has at most three decimals." };
  }
  const value = Number(match[1]) * 10 ** places + Number(fraction.padEnd(places, "0") || "0");
  return Number.isSafeInteger(value) ? { value } : { message: "Must be a number." };
}

/** Units of `10^places` written back as typed: 1750050 centimes is "17500.5". */
function formatUnits(value: number, places: number): string {
  const scale = 10 ** places;
  const whole = Math.trunc(value / scale);
  const fraction = String(value % scale)
    .padStart(places, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

const PLACES = { number: 0, area: 3, duration: 3, money: 2 } as const;

// ── A stored file on screen ──────────────────────────────────────────────────

function freeSlots(row: FormRow): number {
  return (row.options ?? []).filter((option) => option.free).length;
}

/** The rows of a form that take an answer from the office (not the header the program writes). */
function answerRows(kind: FormKind): FormRow[] {
  return FORM_DEFINITIONS[kind].rows.filter(
    (row) =>
      row.key !== null && row.answer !== "computed" && row.key !== "registrationNumber" && row.key !== "dossierNumber",
  );
}

function screenValueOf(row: FormRow, value: unknown): string | string[] {
  switch (row.answer) {
    case "number":
    case "area":
    case "duration":
    case "money":
      return typeof value === "number" ? formatUnits(value, PLACES[row.answer]) : "";
    case "single":
      return value === undefined || value === null ? "" : String(value);
    case "several":
      return Array.isArray(value) ? value.map(String) : [];
    case "yesNo":
      return value === true ? "YES" : value === false ? "NO" : "";
    default:
      return typeof value === "string" ? value : "";
  }
}

/** What the screen shows for a file's sheet and its office blocks. */
export function screenStateOf(
  kind: FormKind,
  values: FormValues,
  office: Partial<FileOfficeInput> = {},
  siteOffice: SiteOfficeInput = {},
  residents: readonly (ResidentInput & { id?: string })[] = [],
): FileScreenState {
  const answers: Record<string, string | string[]> = {};
  for (const row of answerRows(kind)) {
    const key = row.key!;
    answers[key] = screenValueOf(row, values[key]);
    for (const extra of [row.noteKey, row.otherKey, row.labelKey]) {
      if (extra) answers[extra] = typeof values[extra] === "string" ? (values[extra] as string) : "";
    }
    if (row.freeKey) {
      const lines = (values[row.freeKey] as readonly (string | null)[] | undefined) ?? [];
      answers[row.freeKey] = Array.from({ length: freeSlots(row) }, (_, slot) => lines[slot] ?? "");
    }
    if (row.pairKey)
      answers[row.pairKey] = typeof values[row.pairKey] === "string" ? (values[row.pairKey] as string) : "";
  }

  const site: Record<string, string | string[] | boolean> = {};
  for (const key of SITE_OFFICE_TEXTS) site[key] = (siteOffice[key] as string | null | undefined) ?? "";
  for (const key of SITE_OFFICE_COUNTS) {
    const count = siteOffice[key];
    site[key] = typeof count === "number" ? String(count) : "";
  }
  for (const [key] of SITE_OFFICE_COORDINATES) site[key] = degreesText(siteOffice[key]);
  for (const key of SITE_OFFICE_SETS)
    site[key] = [...((siteOffice[key] as readonly string[] | null | undefined) ?? [])];
  for (const key of SITE_OFFICE_FLAGS) site[key] = siteOffice[key] === true;

  return {
    answers,
    office: {
      source: office.source ?? "",
      priority: office.priority ?? "",
      officeNotes: office.officeNotes ?? "",
      amountBasis: office.amountBasis ?? "",
      expensesIncluded: office.expensesIncluded ?? true,
    },
    site,
    residents: residents.map((line) => ({
      ...(line.id ? { residentId: line.id } : {}),
      number: String(line.number),
      name: line.name,
      phone: line.phone ?? "",
      registeredDate: line.registeredDate ?? "",
    })),
  };
}

// ── Back to the data model ───────────────────────────────────────────────────

/** The answers a file cannot be saved without. */
const REQUIRED: readonly FieldKey[] = ["clientName", "phone", "address", "commune", "wilaya"];

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Turns what was typed into the data model's units, and lists what needs correcting. */
export function parseFileScreen(kind: FormKind, state: FileScreenState): ParsedFileScreen {
  const issues: ScreenIssue[] = [];
  const values: Record<string, unknown> = {};
  const answer = (key: string) => state.answers[key];

  for (const row of answerRows(kind)) {
    const key = row.key!;
    const path = `answers.${key}`;
    const typed = answer(key);
    switch (row.answer) {
      case "number":
      case "area":
      case "duration":
      case "money": {
        if (text(typed) === "") break;
        const parsed = parseUnits(text(typed), PLACES[row.answer]);
        if ("message" in parsed) issues.push({ path, message: parsed.message });
        else values[key] = parsed.value as Money | Qty;
        break;
      }
      case "single": {
        if (text(typed) === "") break;
        values[key] = row.list === "VISITS_PER_WEEK" ? Number(typed) : text(typed);
        break;
      }
      case "several": {
        const codes = new Set(Array.isArray(typed) ? typed : []);
        // In his order, whatever order they were ticked in.
        values[key] = (row.options ?? []).flatMap((option) => {
          const code = optionCode(row.list!, option);
          return code !== null && codes.has(code) ? [code] : [];
        });
        break;
      }
      case "yesNo": {
        if (typed === "YES") values[key] = true;
        if (typed === "NO") values[key] = false;
        break;
      }
      case "date": {
        if (text(typed) === "") break;
        if (!isDate(text(typed))) issues.push({ path, message: "Enter a valid date." });
        else values[key] = text(typed);
        break;
      }
      case "time": {
        if (text(typed) === "") break;
        if (!isTime(text(typed))) issues.push({ path, message: "Enter a time as HH:MM." });
        else values[key] = text(typed);
        break;
      }
      case "phone": {
        if (text(typed) === "") break;
        if (!isPhone(text(typed))) issues.push({ path, message: "The phone number has 9 or 10 digits." });
        else values[key] = text(typed);
        break;
      }
      default: {
        if (text(typed) !== "") values[key] = text(typed);
      }
    }
    for (const extra of [row.noteKey, row.otherKey, row.labelKey]) {
      if (extra && text(answer(extra)) !== "") values[extra] = text(answer(extra));
    }
    if (row.freeKey) {
      const lines = answer(row.freeKey);
      const kept = Array.from({ length: freeSlots(row) }, (_, slot) => {
        const line = Array.isArray(lines) ? text(lines[slot]) : "";
        return line === "" ? null : line;
      });
      if (kept.some((line) => line !== null)) values[row.freeKey] = kept;
    }
    if (row.pairKey === "wilaya") {
      const code = text(answer("wilaya"));
      if (code !== "" && !isWilayaCode(code)) {
        issues.push({ path: "answers.wilaya", message: "Choose a wilaya from the list." });
      } else if (code !== "") values.wilaya = code;
    } else if (row.pairKey && text(answer(row.pairKey)) !== "") {
      values[row.pairKey] = text(answer(row.pairKey));
    }
  }

  for (const key of REQUIRED) {
    if (values[key] === undefined && !issues.some((issue) => issue.path === `answers.${key}`)) {
      issues.push({ path: `answers.${key}`, message: "This field is required." });
    }
  }

  // ── The office blocks ──
  const office: FileOfficeInput = {
    source: (text(state.office.source) || null) as FileOfficeInput["source"],
    priority: (text(state.office.priority) || null) as FileOfficeInput["priority"],
    officeNotes: text(state.office.officeNotes) || null,
    amountBasis: (text(state.office.amountBasis) || null) as FileOfficeInput["amountBasis"],
    expensesIncluded: state.office.expensesIncluded,
  };

  const site: Record<string, unknown> = {};
  for (const key of SITE_OFFICE_TEXTS) {
    const typed = text(state.site[key]);
    site[key] = typed === "" ? null : typed;
  }
  for (const key of ["keyReceivedDate"] as const) {
    if (site[key] !== null && !isDate(site[key] as string)) {
      issues.push({ path: `site.${key}`, message: "Enter a valid date." });
    }
  }
  for (const key of ["allowedFrom", "allowedTo"] as const) {
    if (site[key] !== null && !isTime(site[key] as string)) {
      issues.push({ path: `site.${key}`, message: "Enter a time as HH:MM." });
    }
  }
  if (site.receiverPhone !== null && !isPhone(site.receiverPhone as string)) {
    issues.push({ path: "site.receiverPhone", message: "The phone number has 9 or 10 digits." });
  }
  if (site.allowedFrom && site.allowedTo && (site.allowedFrom as string) >= (site.allowedTo as string)) {
    issues.push({ path: "site.allowedTo", message: "The allowed hours must end after they start." });
  }
  for (const [key, limit, message] of SITE_OFFICE_COORDINATES) {
    const typed = text(state.site[key]);
    site[key] = null;
    if (typed === "") continue;
    const parsed = parseDegrees(typed, limit, message);
    if ("message" in parsed) issues.push({ path: `site.${key}`, message: parsed.message });
    else site[key] = parsed.value;
  }
  for (const key of SITE_OFFICE_COUNTS) {
    const typed = text(state.site[key]);
    site[key] = null;
    if (typed === "") continue;
    const parsed = parseUnits(typed, 0);
    if ("message" in parsed) issues.push({ path: `site.${key}`, message: parsed.message });
    else if (key === "buildingsCount" && parsed.value < 1) {
      issues.push({ path: `site.${key}`, message: `Must be at least ${1}.` });
    } else site[key] = parsed.value;
  }
  for (const key of SITE_OFFICE_SETS) {
    const codes = state.site[key];
    site[key] = Array.isArray(codes) ? [...codes] : [];
  }
  for (const key of SITE_OFFICE_FLAGS) site[key] = state.site[key] === true;

  // ── The residents ──
  const residents: ResidentInput[] = [];
  state.residents.forEach((line, index) => {
    const path = `residents.${index}`;
    const number = parseUnits(text(line.number), 0);
    if ("message" in number) issues.push({ path: `${path}.number`, message: number.message });
    else if (number.value < 1) issues.push({ path: `${path}.number`, message: `Must be at least ${1}.` });
    if (text(line.name) === "") issues.push({ path: `${path}.name`, message: "A resident's name is required." });
    if (text(line.phone) !== "" && !isPhone(text(line.phone))) {
      issues.push({ path: `${path}.phone`, message: "The phone number has 9 or 10 digits." });
    }
    if (text(line.registeredDate) !== "" && !isDate(text(line.registeredDate))) {
      issues.push({ path: `${path}.registeredDate`, message: "Enter a valid date." });
    }
    residents.push({
      ...(line.residentId ? { id: line.residentId } : {}),
      number: "value" in number ? number.value : 0,
      name: text(line.name),
      phone: text(line.phone) || null,
      registeredDate: text(line.registeredDate) || null,
    });
  });
  const numbers = residents.map((line) => line.number);
  numbers.forEach((number, index) => {
    if (number > 0 && numbers.indexOf(number) !== index) {
      issues.push({ path: `residents.${index}.number`, message: "Two residents have the same number." });
    }
  });

  return { values: values as FormValues, office, siteOffice: site as SiteOfficeInput, residents, issues };
}
