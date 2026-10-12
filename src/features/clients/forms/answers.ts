import { WILAYAS } from "@/lib/geo/wilayas";

import { OPTION_LISTS, OTHER_CODE, type OptionListName } from "../validators/option-lists";

import type { FormOption, FormRow } from "./types";
import type { FormValues } from "./values";

/**
 * Reading a form's rows against a file's values: which box is ticked, what is
 * written on which blank. Pure functions; the sheet and the screen share them.
 */

const TATWEEL = /ـ/g;

/** His wording without the stretching character, as a screen shows it. */
export function withoutTatweel(text: string): string {
  return text.replace(TATWEEL, "");
}

/** The option's label without the colon that announces its dotted place. */
function optionWording(option: FormOption): string {
  return option.raw.replace(/:$/, "").trim();
}

/**
 * The stored code of an option: his wording looked up in the row's list.
 * A blank line has none. Throws when the wording is in no list, which the
 * tests turn into a failure before a form can be shown.
 */
export function optionCode(list: OptionListName, option: FormOption): string | null {
  if (option.free) return null;
  const wording = optionWording(option);
  const entry = OPTION_LISTS[list].find((candidate) => candidate.ar === wording);
  if (entry) return entry.code;
  if (option.withText) return OTHER_CODE;
  throw new Error(`No code for the option "${option.raw}" in the list ${list}.`);
}

/** The label of an option as shown and printed: his wording, or its agreed correction. */
export function optionLabel(option: FormOption): string {
  return option.printAs ?? option.raw;
}

/** The place of a blank line among the row's blank lines, 0 first. */
export function freeSlot(row: FormRow, optionIndex: number): number {
  return (row.options ?? []).slice(0, optionIndex).filter((option) => option.free).length;
}

/** What the office wrote on a blank line, or "" when nothing. */
export function freeText(row: FormRow, optionIndex: number, values: FormValues): string {
  if (!row.freeKey) return "";
  const lines = values[row.freeKey];
  if (!Array.isArray(lines)) return "";
  const text: unknown = lines[freeSlot(row, optionIndex)];
  return typeof text === "string" ? text : "";
}

/** Whether the box of the row's option number `optionIndex` is ticked. */
export function isTicked(row: FormRow, optionIndex: number, values: FormValues): boolean {
  const option = row.options?.[optionIndex];
  if (!option || !row.key || !row.list) return false;
  if (option.free) return freeText(row, optionIndex, values) !== "";

  const code = optionCode(row.list, option);
  const value: unknown = values[row.key];
  if (value === undefined || value === null) return false;
  if (row.answer === "yesNo") return value === (code === "YES");
  if (Array.isArray(value)) return value.includes(code);
  return String(value) === code;
}

/** "2026-10-12" as he writes a date: 12/10/2026. Anything else comes back unchanged. */
export function formatSheetDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/**
 * An amount in centimes as the program writes money everywhere, on screen and
 * on paper (coordinator's ruling, the academy's format): a dot between the
 * thousands, a comma before the centimes, always two decimals. 1250000 is
 * «12.500,00». Whole numbers only, so no rounding. Money's shared helper takes
 * its place once it is in.
 */
export function formatSheetMoney(centimes: number): string {
  const sign = centimes < 0 ? "-" : "";
  const magnitude = Math.abs(Math.trunc(centimes));
  const whole = String(Math.floor(magnitude / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${whole},${String(magnitude % 100).padStart(2, "0")}`;
}

/** Thousandths of a unit as a number with a decimal comma: 180500 is «180,5». */
export function formatSheetQty(thousandths: number): string {
  const sign = thousandths < 0 ? "-" : "";
  const magnitude = Math.abs(Math.trunc(thousandths));
  const fraction = String(magnitude % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${sign}${Math.floor(magnitude / 1000)}${fraction ? `,${fraction}` : ""}`;
}

const DURATION_UNIT = { HOURS: "ساعة", DAYS: "يوم" } as const;

/** A wilaya's Arabic name from its code; the code itself when it is not in the list. */
export function wilayaName(code: string): string {
  return WILAYAS.find((wilaya) => wilaya.code === code)?.nameAr ?? code;
}

export interface WrittenValue {
  text: string;
  /** Digits that are read left to right: goes inside `<Ltr>`. */
  ltr: boolean;
}

const asText = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

/**
 * «البلدية / الولاية»: what is written on each of its parts, the commune first.
 * His home request draws one undivided blank; the other forms two, with a slash.
 */
export function placeParts(row: FormRow, values: FormValues): [commune: string, wilaya: string] {
  const commune = row.key ? asText(values[row.key]) : null;
  const wilaya = row.pairKey ? asText(values[row.pairKey]) : null;
  return [commune ?? "", wilaya ? wilayaName(wilaya) : ""];
}

/** What is written on the row's blank, or null when the blank is empty. */
export function writtenValue(row: FormRow, values: FormValues): WrittenValue | null {
  if (!row.key) return null;
  const value: unknown = values[row.key];

  if (row.answer === "place") {
    const parts = placeParts(row, values).filter((part) => part !== "");
    return parts.length > 0 ? { text: parts.join(" / "), ltr: false } : null;
  }
  if (value === undefined || value === null || value === "") return null;

  switch (row.answer) {
    case "money":
      return typeof value === "number" ? { text: formatSheetMoney(value), ltr: true } : null;
    case "area":
      return typeof value === "number" ? { text: formatSheetQty(value), ltr: true } : null;
    case "number":
      return typeof value === "number" ? { text: String(value), ltr: true } : null;
    case "date":
      return typeof value === "string" ? { text: formatSheetDate(value), ltr: true } : null;
    case "time":
    case "phone":
      return typeof value === "string" ? { text: value, ltr: true } : null;
    case "duration": {
      if (typeof value !== "number") return null;
      const unit: unknown = row.pairKey ? values[row.pairKey] : undefined;
      const word = unit === "HOURS" || unit === "DAYS" ? ` ${DURATION_UNIT[unit]}` : "";
      return { text: `${formatSheetQty(value)}${word}`, ltr: false };
    }
    default:
      return typeof value === "string" ? { text: value, ltr: false } : null;
  }
}

/** The text of one of the row's side blanks: the note before the options, the text of «أخرى», a typed label. */
export function sideText(row: FormRow, which: "note" | "other" | "label", values: FormValues): string {
  const key = which === "note" ? row.noteKey : which === "other" ? row.otherKey : row.labelKey;
  if (!key) return "";
  const value: unknown = values[key];
  return typeof value === "string" ? value : "";
}
