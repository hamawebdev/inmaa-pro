import type { DescriptionFamily, FormKind, OptionListName } from "../validators/option-lists";

import type { FieldKey } from "./values";

/**
 * What a form definition is made of.
 *
 * A definition is one of his Word forms as data: every label, blank and option
 * in his order (`rows`), and the tables that carry them on paper (`sheet`).
 * The screen form and the printed sheet are both drawn from it, so neither can
 * lose a field or an option, and each form keeps its own wording where the
 * siblings differ («يوجد حارس ؟», «الزيارة الأولية», «تاريخ التسديد»).
 */

/** Where the tick box sits in reading order. "none": a label his file prints without a box. */
export type BoxSide = "before" | "after" | "none";

export interface FormOption {
  /** His wording on this form. Empty for a blank line. */
  raw: string;
  side: BoxSide;
  /** A blank line the office may write a service on. */
  free?: boolean;
  /** The option is followed by a dotted place for text («أخرى: ……»). */
  withText?: boolean;
  /** Shares its line with the option before it (the organisation services). */
  sameLine?: boolean;
  /** The agreed correction of a typo (scope A8): shown and printed instead of `raw`. */
  printAs?: string;
}

/** The kind of row, as the Checker names it. */
export type RowRole = "title" | "number" | "date" | "heading" | "field" | "choice" | "signature";

/** What is written or ticked. "computed" is «حالة الملف»: the program ticks it, nobody types it. */
export type Answer =
  | "text"
  | "number"
  | "area"
  | "money"
  | "date"
  | "time"
  | "phone"
  | "place"
  | "duration"
  | "single"
  | "several"
  | "yesNo"
  | "computed";

export interface FormRow {
  /** The Checker's row, e.g. "HR-005" (docs/checker-table.md). */
  id: string;
  role: RowRole;
  /** The label as his file prints it, stretching characters included. Empty when the form prints none. */
  raw: string;
  /** The label on screen: his words without the stretching character and the closing colon. */
  label: string;
  /** The number Word generates in front of the label ("3." or "1-"), slips included. */
  number: string | null;
  /** Where the answer lives in `FormValues`. */
  key: FieldKey | null;
  answer: Answer | null;
  list?: OptionListName;
  options?: FormOption[];
  /** The dotted place in front of the options. */
  noteKey?: FieldKey;
  /** The text of the option that has a dotted place. */
  otherKey?: FieldKey;
  /** What the office wrote on the blank lines, in print order. */
  freeKey?: FieldKey;
  /** The second value written on the same blank: the wilaya after the commune, the unit after a duration. */
  pairKey?: FieldKey;
  /** The label the office gives to a blank that his form leaves unlabelled. */
  labelKey?: FieldKey;
  /** Printed before the blank: «(01):». */
  prefix?: string;
  /** Printed after the blank: «دج», «م2». */
  suffix?: string;
  /**
   * His blank is this many dotted parts with a slash between them: 2 for
   * «…… / ……», 3 for a date, 5 for a resident's phone. Left out: one.
   */
  blankParts?: number;
  /** The Checker's remarks on the row ("numbering-slip", "label-without-box", …). */
  flags?: string[];
}

export type SheetPart =
  | { t: "heading"; row: string }
  | { t: "label"; row: string; pt?: number; regular?: boolean; inline?: boolean }
  | { t: "blank"; row: string; of?: "note" | "label" }
  | { t: "options"; row: string; from: number; to: number; pt?: number }
  | { t: "break" }
  | { t: "signature"; row: string };

export interface SheetCellDef {
  /** How many columns of the table's grid the cell covers. */
  span: number;
  parts: SheetPart[];
  /** On paper: "start" is the right. Left out when it is the start. */
  align?: "center" | "end";
  valign?: "bottom";
  shaded?: boolean;
  /** A top border only: the signature row. */
  open?: boolean;
  /** No top border, as his file has on the first row of most tables. */
  noTop?: boolean;
  /** One option per line. */
  stacked?: boolean;
}

export interface SheetRowDef {
  /** The row height saved in his file; the printed row is at least this high. */
  minMm: number;
  cells: SheetCellDef[];
}

export type SheetBlock =
  /** The empty first paragraph, the title box, the registration number and the date. */
  | { t: "header" }
  | {
      t: "table";
      id: string;
      /** First column first, which is the rightmost on paper. */
      columnsMm: number[];
      /** How far the table starts from the right margin; negative reaches into it. */
      offsetMm: number;
      rows: SheetRowDef[];
    }
  /** His empty paragraphs between two tables on the same page. */
  | { t: "gap"; paragraphs: number }
  /** His run of empty paragraphs that sends the next table to a new page. */
  | { t: "pageBreak" }
  | {
      t: "residents";
      id: string;
      columnsMm: number[];
      offsetMm: number;
      /** The row of the heading «قائمة القاطنين بالعمارة». */
      heading: string;
      /** The rows of the four column headings. */
      columns: string[];
      /** Lines per printed page: 26 in his file. */
      lines: number;
      titleMinMm: number;
      headMinMm: number;
      lineMinMm: number;
    };

export interface FormDefinition {
  kind: FormKind;
  /** Where the facts come from: the prefix of the Checker's rows and its data file. */
  checker: { prefix: string; file: string };
  family: DescriptionFamily;
  /** The suffix his file prints after the registration number («BLC»), or null where it is a blank. */
  registrationSuffix: string | null;
  /**
   * Whether the number is followed by a place for a suffix (a slash and a blank, or «/BLC»). The
   * complexes copy has none: its number prints alone (the coordinator's ruling on B-002).
   */
  registrationSuffixPlace?: boolean;
  /** The title box, measured from the left edge of the text area and the top of its paragraph. */
  titleBox: { leftMm: number; topMm: number; widthMm: number; heightMm: number };
  rows: FormRow[];
  sheet: SheetBlock[];
}
