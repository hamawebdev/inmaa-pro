import { LETTERHEAD, type FormFamily } from "@/assets/letterhead/placement";

/** Page margins in millimetres. */
export interface SheetMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The paper, in millimetres. */
export const A4_MM = { width: 210, height: 297 } as const;

/**
 * The page margins of his Word files, per family of forms
 * (docs/checker/forms/01-worker.md and 02-building-contract.md, section 2).
 *
 * For reference only: they are not where a sheet's text goes. His margins let
 * text run under his pictures (the worker form's bottom margin is 5 mm, and
 * People measured its last text 9.3 mm from the edge, while the footer picture
 * is 16 mm tall). The ruling is that nothing prints over his letterhead or
 * footer pictures, so every sheet is laid in `SHEET_BODY`.
 */
export const SHEET_MARGINS: Record<FormFamily, SheetMargins> = {
  worker: { top: 22.5, right: 12.5, bottom: 5, left: 7.5 },
  client: { top: 12.7, right: 10, bottom: 12.7, left: 12.7 },
};

/** Between a picture's edge and the nearest text. The vertical positions of the pictures are estimates. */
export const LETTERHEAD_GAP_MM = 2.5;

const round = (mm: number) => Math.round(mm * 10) / 10;

function clearBox(family: FormFamily): SheetMargins {
  const { header, footer } = LETTERHEAD[family];
  return {
    top: round(header.topMm + header.heightMm + LETTERHEAD_GAP_MM),
    right: SHEET_MARGINS[family].right,
    bottom: round(A4_MM.height - footer.topMm + LETTERHEAD_GAP_MM),
    left: SHEET_MARGINS[family].left,
  };
}

/**
 * Where the text of a sheet with his letterhead goes, on every page: below the
 * header picture and above the footer picture, with his side margins. The
 * default of `<PrintSheet letterhead=…>`, for his own forms as for ours (the
 * ruling: nothing prints over his pictures). Derived from the placement of the
 * pictures (src/assets/letterhead/placement.ts), so it follows them.
 *
 *     worker: top 30.9, bottom 18.8 · client: top 27.6, bottom 16.7 (mm)
 */
export const SHEET_BODY: Record<FormFamily, SheetMargins> = {
  worker: clearBox("worker"),
  client: clearBox("client"),
};

/** The earlier name of `SHEET_BODY`, kept so that sheets written with it go on working. */
export const SHEET_MARGINS_CLEAR_OF_LETTERHEAD = SHEET_BODY;

/** The default margins of a sheet without his letterhead. */
export const SHEET_MARGINS_PLAIN: SheetMargins = { top: 15, right: 15, bottom: 15, left: 15 };

/**
 * Margins that keep the text clear of a family's pictures: what a sheet asked
 * for, or more where it would reach them. `<PrintSheet>` applies it to every
 * sheet with a letterhead, so no sheet can print over the pictures.
 */
export function clearOfLetterhead(family: FormFamily, margins: SheetMargins): SheetMargins {
  const body = SHEET_BODY[family];
  return { ...margins, top: Math.max(margins.top, body.top), bottom: Math.max(margins.bottom, body.bottom) };
}

/**
 * The three faces his Word files are set in. Use as
 * `style={{ fontFamily: SHEET_FONT.sakkal }}`; the sheet's running text is set
 * with `<PrintSheet font=…>`.
 *
 * On a PC that has his face (Windows with Arabic, as his), it is his face. On
 * one that does not, such as this program's development machine, the font
 * bundled with the program stands in: Noto Naskh Arabic
 * (public/fonts/noto-naskh-arabic, SIL Open Font License), scaled so that a
 * line takes about the room his face takes (`SHEET_FONT_SCALE`).
 */
export const SHEET_FONT = {
  traditional: "var(--sheet-font-traditional)",
  sakkal: "var(--sheet-font-sakkal)",
  typesetting: "var(--sheet-font-typesetting)",
} as const;

export type SheetFont = keyof typeof SHEET_FONT;

/** His face's own name, as a PC that has it knows it. */
export const SHEET_FONT_NAME: Record<SheetFont, string> = {
  traditional: "Traditional Arabic",
  sakkal: "Sakkal Majalla",
  typesetting: "Arabic Typesetting",
};

/** The font that stands in for his three, unscaled: what the calibration measures against. */
export const SHEET_FONT_STAND_IN = "Sheet Naskh";

/**
 * How large the stand-in is set for each of his faces, as CSS `size-adjust`
 * (print-sheet.css writes the same numbers; a test checks they agree).
 *
 * His fonts are not on the development machine, so these were found from his
 * own forms (F2b): every label of his tables sits on one line in a cell of
 * known width, set in his face at a known size. Noto Naskh at the same size
 * needs more room; the shortest labels without stretching (tatweel) give the
 * most it can be scaled to:
 *
 *  - Traditional Arabic: regular 14 pt «عدد مواقف السيارات» fits 29.25 mm,
 *    0.80 of Noto Naskh; bold 16 pt «يوجد حارس ؟» fits 22.3 mm, 0.76;
 *  - Sakkal Majalla: bold 14 pt «هل عملت في المجال» fits 28.7 mm, 0.79;
 *  - Arabic Typesetting: never in a cell of his. Estimated from how much
 *    smaller it sets than Traditional Arabic at one size; not measured.
 *
 * Each value is set just under its ceiling. On a PC that has his fonts, the
 * print sample's calibration panel measures the true ratio
 * (/dashboard/settings/print-sample); change the numbers here and in the CSS.
 */
export const SHEET_FONT_SCALE: Record<SheetFont, { regular: number; bold: number }> = {
  traditional: { regular: 0.79, bold: 0.75 },
  sakkal: { regular: 0.78, bold: 0.78 },
  typesetting: { regular: 0.62, bold: 0.62 },
};
