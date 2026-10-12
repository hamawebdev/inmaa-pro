import type { CSSProperties } from "react";

import { Ltr } from "@/components/ltr";
import { DottedBlank, SheetCell, SHEET_FONT } from "@/components/print";
import type { WorkerFormData } from "@/features/people/forms/worker-form-data";
import { workerFormRow } from "@/features/people/forms/worker-form";

import { hisType, mm, typedValue } from "./his-type";
import { dateParts } from "./print-values";

/**
 * What the two parts of his worker form share: the cells of his tables, the
 * band at the top of each part (the title box with the number and the date
 * beside it), and the way a typed value is written on a blank.
 *
 * Every measure here is the Checker's: docs/checker/forms/01-worker.md.
 */

/**
 * A cell of his tables: a 0.5 pt black rule on every side, 1.9 mm of padding
 * left and right and none above or below, as his Word tables have.
 */
export function Cell({ style, ...props }: React.ComponentProps<typeof SheetCell>) {
  return <SheetCell {...props} style={{ border: "0.5pt solid #000", padding: "0 1.9mm", ...style }} />;
}

/** A blank that fills its cell, with the value on it when there is one. */
export function FillBlank({ children }: { children?: React.ReactNode }) {
  return (
    <span style={{ display: "block", paddingBottom: "1mm", ...typedValue() }}>
      <DottedBlank fill>{children}</DottedBlank>
    </span>
  );
}

const SLASH: CSSProperties = { flex: "none", padding: "0 0.6mm" };

/**
 * A blank drawn in parts between slashes, as his date and phone blanks are.
 * `weights` are the lengths of his rows of dots; the parts share the width in
 * that proportion. Parts are listed in reading order, first part rightmost.
 */
export function SlashedBlank({
  weights,
  values,
  leading = false,
  trailing = false,
  direction = "rtl",
}: {
  weights: readonly number[];
  values?: readonly (string | null)[] | null;
  /** A slash before the first part, and after the last. */
  leading?: boolean;
  trailing?: boolean;
  /** `ltr` for a value read left to right as a whole: a phone number. */
  direction?: "rtl" | "ltr";
}) {
  return (
    <span dir={direction} style={{ display: "flex", alignItems: "flex-end", paddingBottom: "1mm", ...typedValue() }}>
      {leading && <span style={SLASH}>/</span>}
      {weights.map((weight, index) => (
        <span key={index} style={{ display: "contents" }}>
          {index > 0 && <span style={SLASH}>/</span>}
          <span style={{ flex: `${weight} 1 0`, minWidth: 0 }}>
            <DottedBlank fill>{values?.[index] ? <Ltr>{values[index]}</Ltr> : null}</DottedBlank>
          </span>
        </span>
      ))}
      {trailing && <span style={SLASH}>/</span>}
    </span>
  );
}

/** A date written on a short three-part blank inside a line of text: day, month, year. */
export function InlineDate({ iso, widthsMm }: { iso: string | null; widthsMm: readonly [number, number, number] }) {
  const parts = dateParts(iso);
  const values = parts ? [parts.day, parts.month, parts.year] : [null, null, null];
  return (
    <>
      {values.map((value, index) => (
        <span key={index}>
          {index > 0 && <span style={{ padding: "0 0.7mm" }}>/</span>}
          <DottedBlank widthMm={widthsMm[index]}>{value && <Ltr>{value}</Ltr>}</DottedBlank>
        </span>
      ))}
    </>
  );
}

export interface TitleBoxPlace {
  /** From the left edge of the text area, and from the top of the band. */
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  /** The offset of its shadow, in points: Word's "-6pt,4pt". */
  shadowPt: readonly [number, number];
}

/**
 * The shadowed box that holds a part's title: white, no outline, a grey band
 * inside it with the title centred.
 *
 * Word leaves 2.54 mm inside the box on each side and 1.27 mm above and below,
 * fills the paragraph with grey and cuts what does not fit.
 */
export function TitleBox({ place, children }: { place: TitleBoxPlace; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: mm(place.leftMm),
        top: mm(place.topMm),
        width: mm(place.widthMm),
        height: mm(place.heightMm),
        padding: "1.27mm 2.54mm",
        background: "#fff",
        boxShadow: `${place.shadowPt[0]}pt ${place.shadowPt[1]}pt 0 rgb(0 0 0 / 0.5)`,
        overflow: "hidden",
      }}
    >
      <div style={{ height: "100%", background: "#bfbfbf", textAlign: "center", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

/**
 * «رقم التسجيل: …… /H/F» and «التاريخ: …… / …… / ……», the two lines that
 * stand on the left of the title box, at the top of each part.
 *
 * Word starts them 95 mm in from the right margin and ends them 2.5 mm before
 * the left one, and sets them against the left. In his narrow face they end
 * well before the regulations' title box, which starts 73.2 mm from the left
 * edge of the paper; the blanks here are sized so that, in the font bundled
 * with the program, they still do.
 */
export function NumberAndDate({
  data,
  dateLineMm,
}: {
  data: Pick<WorkerFormData, "regNumber" | "regSuffix" | "registrationDate">;
  /** The height of the date line: its spacing differs between the two parts. */
  dateLineMm: number;
}) {
  const line: CSSProperties = {
    ...hisType("typesetting", 18),
    paddingInlineStart: "95mm",
    paddingInlineEnd: "2.5mm",
    textAlign: "end",
    whiteSpace: "nowrap",
  };
  const typed = typedValue(14);

  return (
    <>
      <p style={{ ...line, height: "9mm", lineHeight: "9mm" }}>
        {workerFormRow("W-002").raw[0]}{" "}
        <span style={typed}>
          <DottedBlank widthMm={22}>{data.regNumber && <Ltr>{data.regNumber}</Ltr>}</DottedBlank>
        </span>
        {" /"}
        {/* His blank form prints both letters; a worker's form carries the worker's own. */}
        <span style={{ fontFamily: SHEET_FONT.sakkal }}>
          <Ltr>{data.regSuffix ?? "H/F"}</Ltr>
        </span>
      </p>
      <p style={{ ...line, height: mm(dateLineMm) }}>
        {workerFormRow("W-003").raw[0]}{" "}
        <span style={typed}>
          <InlineDate iso={data.registrationDate} widthsMm={[10, 10, 12]} />
        </span>
      </p>
    </>
  );
}
