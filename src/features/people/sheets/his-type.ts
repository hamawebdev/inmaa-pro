import type { CSSProperties } from "react";

import {
  SHEET_BODY,
  SHEET_FONT,
  SHEET_FONT_NAME,
  SHEET_MARGINS,
  type SheetFont,
  type SheetMargins,
} from "@/components/print";

/**
 * The type of his Word forms, for People's sheets.
 *
 * Two things a sheet must not leave to chance:
 *
 *  - **How high a line is.** Word spaces lines by the font's own height times
 *    the paragraph's line spacing. A browser left alone would use the height of
 *    whatever font it found. So every line height here is written out in
 *    millimetres, from the same factors the Checker's layout files use, and a
 *    row or a page is as high with the bundled font as with his.
 *  - **How wide the words are when his font is missing.** That is the print
 *    kit's: his three faces are set at his own sizes, and where one is not on
 *    the PC the kit's stand-in (Noto Naskh, scaled per face, `SHEET_FONT_SCALE`)
 *    takes about the room his face takes. Nothing is scaled here.
 *
 * Whether a face is installed is still asked of the browser, once, for the one
 * thing the stand-in cannot imitate: the width of his stretching character
 * (marks.tsx, `StretchedLabel`).
 */

const MM_PER_PT = 25.4 / 72;

/** The height of one line as a multiple of the type size (docs/checker/forms/README.md). */
const LINE_FACTOR: Record<SheetFont, number> = { traditional: 1.57, sakkal: 1.41, typesetting: 1.2 };

const installed = new Map<SheetFont, boolean>();

/**
 * True when his face is installed on this PC.
 *
 * Found by measuring: a line set in "his face, else a generic one" is as wide
 * as the generic one alone exactly when his face is missing. Two generic faces
 * are tried, in case his face is one of them.
 */
export function faceInstalled(face: SheetFont): boolean {
  const known = installed.get(face);
  if (known !== undefined) return known;
  if (typeof document === "undefined") return false;

  const context = document.createElement("canvas").getContext("2d");
  let found = false;
  if (context) {
    const sample = "اللقب والاسم أبجد هوز 0123 mmmwwwlli";
    const width = (family: string) => {
      context.font = `72px ${family}`;
      return context.measureText(sample).width;
    };
    found = ["monospace", "serif"].some(
      (generic) => width(`"${SHEET_FONT_NAME[face]}", ${generic}`) !== width(generic),
    );
  }
  installed.set(face, found);
  return found;
}

/** The height in millimetres of one line of `pt` type in `face`, at Word's line spacing (1 is single). */
export function lineMm(face: SheetFont, pt: number, spacing = 1): number {
  return pt * LINE_FACTOR[face] * spacing * MM_PER_PT;
}

export interface HisTypeOptions {
  bold?: boolean;
  /** Word's line spacing: 1 single, 1.15 as most of his paragraphs. */
  spacing?: number;
}

/**
 * The style of a run of his type: face, size, weight and line height.
 *
 *     <p style={hisType("traditional", 14, { spacing: 1.15 })}>…</p>
 */
export function hisType(
  face: SheetFont,
  pt: number,
  { bold = false, spacing = 1 }: HisTypeOptions = {},
): CSSProperties {
  return {
    fontFamily: SHEET_FONT[face],
    fontSize: `${round(pt)}pt`,
    fontWeight: bold ? 700 : 400,
    lineHeight: `${round(lineMm(face, pt, spacing))}mm`,
  };
}

/** What the office typed, as it is written on one of his blanks. */
export function typedValue(pt = 14): CSSProperties {
  return hisType("sakkal", pt);
}

/**
 * In Word the letterhead belongs to the page's header and footer, and the text
 * of a page is drawn over those. The print kit draws the letterhead in front,
 * so a block of this form asks to be drawn above it.
 */
export const ABOVE_THE_LETTERHEAD: CSSProperties = { position: "relative", zIndex: 2 };

/**
 * The margins his worker form prints with: clear of his pictures.
 *
 * Nothing in this program prints over his letterhead or his footer (the
 * coordinator's ruling, for every sheet). His own margins would: his top
 * margin, 22.5 mm, is above the bottom of his letterhead, 28.3 mm, and the text
 * of a full page runs down past the top of his footer, 280.7 mm. So the body
 * of every page is the print kit's `SHEET_BODY.worker`: 30.9 mm from the top
 * and 18.8 mm from the bottom, with his side margins.
 */
export const WORKER_FORM_MARGINS: SheetMargins = SHEET_BODY.worker;

/**
 * Where something that his Word file places `mm` below his own top margin lands
 * below the clear one: at the same place on the paper when that is below the
 * clear top, otherwise at the clear top itself.
 *
 * His pages open with empty paragraphs whose one purpose is to make room under
 * the letterhead. The clear margin does that now, so each opening shrinks by
 * as much as the margin grew, and the first thing on the page stays where he
 * put it whenever it can.
 */
export function belowHisTop(mm: number): number {
  return Math.max(0, SHEET_MARGINS.worker.top + mm - WORKER_FORM_MARGINS.top);
}

/**
 * The height of one of his empty paragraphs. Word makes an empty paragraph as
 * high as its paragraph mark's type: the face and size of the mark, its line
 * spacing, and the space after it. All of these are in the XML.
 */
export function emptyParagraphMm(face: SheetFont | "other", pt: number, spacing: number, afterPt = 0): number {
  const factor = face === "other" ? 1.22 : LINE_FACTOR[face];
  return pt * factor * spacing * MM_PER_PT + afterPt * MM_PER_PT;
}

/** Word's default paragraph in his file: 11 pt, line spacing 259/240, 8 pt after. */
export const WORD_DEFAULT = { pt: 11, spacing: 259 / 240, afterPt: 8 } as const;

/** A length in millimetres for `style`. */
export function mm(value: number): string {
  return `${round(value)}mm`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
