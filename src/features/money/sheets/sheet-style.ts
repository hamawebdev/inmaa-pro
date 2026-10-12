import { SHEET_FONT } from "@/components/print";

/**
 * Measures and type shared by Money's and Stock's sheets.
 *
 * Sizes are millimetres and points. His forms are set at 14 to 18 points in
 * Traditional Arabic, a small face; these sheets carry more on a page and are
 * set at 12, which also fits where his fonts are missing and the wider bundled
 * face stands in.
 */

/** The width between the side margins of his client forms: 210 − 10 − 12.7 mm. */
export const TEXT_WIDTH_MM = 187.3;

/** Type used across the sheets. */
export const TYPE = {
  /** The title in its box: his «نوع الخدمة : عقد (عمارة)». */
  title: { fontFamily: SHEET_FONT.traditional, fontSize: "20pt", fontWeight: 700, lineHeight: 1.25 },
  /** The number and date lines beside the title box: his «رقم التسجيل: …». */
  reference: { fontFamily: SHEET_FONT.typesetting, fontSize: "15pt", fontWeight: 700, lineHeight: 1.35 },
  /** A shaded heading row. */
  heading: { fontSize: "13pt", fontWeight: 700 },
  /** A label cell. */
  label: { fontSize: "12pt", fontWeight: 700 },
  body: { fontSize: "12pt", fontWeight: 400 },
  small: { fontSize: "10pt", fontWeight: 400, lineHeight: 1.3 },
} as const satisfies Record<string, React.CSSProperties>;

/** One cell of a `FieldTable`. */
export interface FieldCell {
  content: React.ReactNode;
  /** A label cell is bold. */
  label?: boolean;
  span?: number;
  align?: "start" | "center" | "end";
}

/** A label cell and its value cell. */
export function field(label: string, content: React.ReactNode, span?: number): [FieldCell, FieldCell] {
  return [
    { content: label, label: true },
    { content, span },
  ];
}
