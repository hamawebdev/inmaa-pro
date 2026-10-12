import type { CSSProperties } from "react";

import { SHEET_FONT_STAND_IN } from "@/components/print/sheet-constants";

import { weekdayOf, type ClockTime, type IsoDate } from "../rules/calendar";

import { WEEKDAY_WORD } from "./print-labels";

/**
 * Sizes, type and small formatters shared by Operations' sheets.
 *
 * ## The face
 *
 * His six Word forms are set in Traditional Arabic and Sakkal Majalla; the
 * print kit sets them in his face where a PC has it, and in the bundled Noto
 * Naskh, scaled to take the room of his, where it has not. These four sheets
 * have no Word original to follow, so they name the bundled Naskh itself,
 * unscaled: the look of his forms, and the same pages on every PC. What is
 * checked here, page by page, is then what the centre's printer gives.
 */
export const OPS_SHEET_FONT = `"${SHEET_FONT_STAND_IN}", serif`;

/** The width between his side margins on the client forms: 210 − 10 − 12.7, rounded down. */
export const SHEET_WIDTH_MM = 187;

export const BODY_STYLE: CSSProperties = { fontFamily: OPS_SHEET_FONT, fontSize: "9pt", lineHeight: 1.3 };
export const TITLE_STYLE: CSSProperties = { fontSize: "15pt", fontWeight: 700, lineHeight: 1.35 };
export const SUBTITLE_STYLE: CSSProperties = { fontSize: "9.5pt", lineHeight: 1.35 };
export const SECTION_STYLE: CSSProperties = { fontSize: "10pt", fontWeight: 700 };
export const LABEL_STYLE: CSSProperties = { fontWeight: 700 };
export const SMALL_STYLE: CSSProperties = { fontSize: "8pt" };

/** The usual height of a row, and of one whose blanks are written in by hand. */
export const ROW_MM = 5.2;
export const WRITING_ROW_MM = 7.2;

/** A date as his forms write one: day / month / year. */
export function paperDate(date: IsoDate | null | undefined): string | null {
  if (!date) return null;
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** «الاثنين» for a date. */
export function weekdayWordOf(date: IsoDate | null | undefined): string | null {
  return date ? WEEKDAY_WORD[weekdayOf(date)] : null;
}

/** "08:00 – 12:00", or one end when only one is known. */
export function clockRange(start: ClockTime | null | undefined, end: ClockTime | null | undefined): string | null {
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? null;
}

/** «2 من 3». */
export function rankOf(rank: { no: number; count: number } | null | undefined): string | null {
  return rank ? `${rank.no} من ${rank.count}` : null;
}

/** Pads a list with `filler` up to `min` rows, so that an empty sheet has lines to write on. */
export function padTo<T>(rows: readonly T[], min: number, filler: T): T[] {
  return rows.length >= min ? [...rows] : [...rows, ...Array.from({ length: min - rows.length }, () => filler)];
}

/** Splits a list into pairs for a table printed as two halves side by side: the first half on the right. */
export function inTwoHalves<T>(rows: readonly T[]): [T | null, T | null][] {
  const half = Math.ceil(rows.length / 2);
  return Array.from({ length: half }, (_, index) => [rows[index] ?? null, rows[index + half] ?? null]);
}
