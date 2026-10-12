import type { FormFamily } from "@/assets/letterhead/placement";

/** Page margins in millimetres. */
export interface SheetMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The page margins of his Word files, per family of forms
 * (docs/checker/forms/01-worker.md and 02-building-contract.md, section 2).
 * A sheet of our own design (an invoice, a mission order) chooses its own.
 */
export const SHEET_MARGINS: Record<FormFamily, SheetMargins> = {
  worker: { top: 22.5, right: 12.5, bottom: 5, left: 7.5 },
  client: { top: 12.7, right: 10, bottom: 12.7, left: 12.7 },
};

/**
 * Margins that keep the text clear of the letterhead on every page: below the
 * header picture and above the footer picture, with his side margins.
 *
 * His own forms do not need them: they are laid out for his margins and begin
 * with an empty paragraph that makes room under the header. A sheet that can
 * run onto further pages by itself (a statement, a list, a report) does: with
 * his margins, the first lines of page two would sit under the picture.
 */
export const SHEET_MARGINS_CLEAR_OF_LETTERHEAD: Record<FormFamily, SheetMargins> = {
  worker: { top: 31, right: 12.5, bottom: 18, left: 7.5 },
  client: { top: 28, right: 10, bottom: 16, left: 12.7 },
};

/**
 * The three faces his Word files are set in, each followed by the font bundled
 * with the program for PCs that lack it. Use as `style={{ fontFamily: SHEET_FONT.sakkal }}`.
 */
export const SHEET_FONT = {
  traditional: "var(--sheet-font-traditional)",
  sakkal: "var(--sheet-font-sakkal)",
  typesetting: "var(--sheet-font-typesetting)",
} as const;

export type SheetFont = keyof typeof SHEET_FONT;
