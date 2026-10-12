import { Ltr } from "@/components/ltr";
import { KeepTogether, SheetCell, SheetRow, SheetTable } from "@/components/print";

import { formatMoney, type Centimes } from "../rules/centimes";
import { formatDate, type IsoDate } from "../rules/dates";

import { TEXT_WIDTH_MM, TYPE, type FieldCell } from "./sheet-style";

/**
 * The pieces Money's and Stock's sheets share.
 *
 * None of these five sheets (invoice, visit statement, cash receipt, payment
 * reminder, hand-out slip) has a Word original, so they borrow the look of his
 * forms: his letterhead, a shaded title box at the top left with the number
 * and the date beside it, bordered tables with shaded heading rows, and
 * «حررت: بـ…، بتاريخ: …» over an «الإمضاء والختم» box.
 *
 * Widths and type sizes are in ./sheet-style.ts.
 */

/** Digits are never cut at the end of a line: a date or a number broken in two reads as two. */
const WHOLE = { whiteSpace: "nowrap" } as const;

/** A number, a code or a clock time, read left to right and kept on one line. */
export function Num({ children }: { children: React.ReactNode }) {
  return <Ltr style={WHOLE}>{children}</Ltr>;
}

/** An amount: `45.675,00`, read left to right. */
export function Amount({ value }: { value: Centimes }) {
  return <Ltr style={WHOLE}>{formatMoney(value)}</Ltr>;
}

/** A date: `30/11/2026`, read left to right. Nothing for an empty date. */
export function DateText({ value }: { value: IsoDate | null | undefined }) {
  return value ? <Ltr style={WHOLE}>{formatDate(value)}</Ltr> : null;
}

/** Empty space between two blocks. */
export function Gap({ mm }: { mm: number }) {
  return <div style={{ height: `${mm}mm` }} />;
}

/**
 * The top of a sheet, as on his forms: the title in a shaded box with a shadow
 * at the reading start (the right), the number and the date at the left.
 *
 * His box is a white frame round a grey band, its shadow cast down and to the
 * left (offset −6 pt, 4 pt, black at half strength: docs/checker/forms, the
 * text box P2.box).
 */
export function SheetHeading({
  title,
  references,
  compact = false,
}: {
  title: string;
  /** «رقم الفاتورة: 000012/2026», «التاريخ: 30/11/2026»… */
  references: readonly { label: string; value: React.ReactNode }[];
  /** Smaller type, for a sheet printed twice on one page (the cash receipt). */
  compact?: boolean;
}) {
  const titleType = compact ? { ...TYPE.title, fontSize: "17pt" } : TYPE.title;
  const referenceType = compact ? { ...TYPE.reference, fontSize: "13pt" } : TYPE.reference;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6mm" }}>
      <div
        style={{
          minWidth: compact ? "80mm" : "96mm",
          padding: "1.4mm",
          background: "#fff",
          boxShadow: "-2.1mm 1.4mm 0 #808080",
          marginInlineStart: "0.8mm",
          marginBottom: "1.4mm",
        }}
      >
        <div style={{ ...titleType, padding: "0.6mm 6mm", textAlign: "center", background: "#d9d9d9" }}>{title}</div>
      </div>
      <div>
        {references.map((reference) => (
          <p key={reference.label} style={referenceType}>
            {reference.label}: {reference.value}
          </p>
        ))}
      </div>
    </div>
  );
}

/** A table of label and value pairs, one or more pairs to a row, under an optional shaded heading. */
export function FieldTable({
  heading,
  widths,
  rows,
  rowHeightMm = 7,
  fontSize,
}: {
  heading?: string;
  /** Column widths in millimetres: label, value, label, value… */
  widths: readonly number[];
  /** Each row lists its cells in reading order: label, value, label, value… A value may span to the row's end. */
  rows: readonly (readonly FieldCell[])[];
  rowHeightMm?: number;
  /** A smaller size for a dense table: `"11pt"`. */
  fontSize?: string;
}) {
  const size = fontSize ? { fontSize, lineHeight: 1.3 } : null;
  return (
    <SheetTable columns={widths}>
      {heading && (
        <SheetRow heightMm={rowHeightMm}>
          <SheetCell shaded colSpan={widths.length} style={{ ...TYPE.heading, ...(size && { lineHeight: 1.3 }) }}>
            {heading}
          </SheetCell>
        </SheetRow>
      )}
      {rows.map((cells, rowIndex) => (
        <SheetRow key={rowIndex} heightMm={rowHeightMm}>
          {cells.map((cell, cellIndex) => (
            <SheetCell
              key={cellIndex}
              colSpan={cell.span}
              align={cell.align}
              style={{ ...(cell.label ? TYPE.label : TYPE.body), ...size }}
            >
              {cell.content}
            </SheetCell>
          ))}
        </SheetRow>
      ))}
    </SheetTable>
  );
}

/**
 * The foot of a sheet: «حررت: بأم البواقي، بتاريخ: …» and where to sign. Kept
 * on one page.
 *
 * With one box it is the last row of his forms: the place and date in one
 * cell, «الإمضاء والختم» in the cell beside it. With several, the place and
 * date stand above a row of titled boxes.
 */
export function SignatureBlock({
  place,
  date,
  boxes,
  boxHeightMm = 24,
}: {
  place: string;
  date: IsoDate | null;
  /** The title of each box, first on the right. His own is «الإمضاء والختم». */
  boxes: readonly string[];
  boxHeightMm?: number;
}) {
  const drawnUp = (
    <>
      حررت: ب{place}، بتاريخ: {date ? <DateText value={date} /> : <span style={WHOLE}>…… / …… / …………</span>}
    </>
  );

  if (boxes.length === 1) {
    return (
      <KeepTogether>
        <SheetTable columns={[TEXT_WIDTH_MM / 2, TEXT_WIDTH_MM / 2]}>
          <SheetRow heightMm={boxHeightMm}>
            <SheetCell style={{ ...TYPE.label, verticalAlign: "top", paddingTop: "1.5mm" }}>{drawnUp}</SheetCell>
            <SheetCell align="center" style={{ ...TYPE.label, verticalAlign: "top", paddingTop: "1.5mm" }}>
              {boxes[0]}
            </SheetCell>
          </SheetRow>
        </SheetTable>
      </KeepTogether>
    );
  }

  const width = TEXT_WIDTH_MM / boxes.length;
  return (
    <KeepTogether>
      <p style={{ ...TYPE.label, marginBottom: "2mm" }}>{drawnUp}</p>
      <SheetTable columns={boxes.map(() => width)}>
        <SheetRow heightMm={7}>
          {boxes.map((title) => (
            <SheetCell key={title} shaded align="center" style={TYPE.label}>
              {title}
            </SheetCell>
          ))}
        </SheetRow>
        <SheetRow heightMm={boxHeightMm}>
          {boxes.map((title) => (
            <SheetCell key={title} />
          ))}
        </SheetRow>
      </SheetTable>
    </KeepTogether>
  );
}

/**
 * The mark of a voided document. A voided invoice or receipt is kept and stays
 * printable («تُلغى إلغاءً ظاهراً», plan feature 33); a print of it must never
 * pass for a valid one. Two marks together:
 *
 *  - this box, at the top: the word, the date and the reason, legible;
 *  - `VoidStamp`, the word across the whole body, so that no part of the page
 *    can be cut out and used on its own.
 */
export function VoidMark({
  word,
  what,
  reason,
  date,
}: {
  /** «ملغاة» for an invoice, «ملغى» for a receipt. */
  word: string;
  /** «هذه الفاتورة», «هذا السند». */
  what: string;
  reason: string;
  date: IsoDate;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4mm",
        border: "2.25pt solid #000",
        outline: "0.75pt solid #000",
        outlineOffset: "0.8mm",
        margin: "1mm 1mm 3mm",
        padding: "0.8mm 3mm",
      }}
    >
      <p style={{ fontSize: "20pt", fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap" }}>{word}</p>
      <p style={{ ...TYPE.body, fontSize: "11pt", lineHeight: 1.35 }}>
        {what} {word} بتاريخ <DateText value={date} />. السبب: {reason}
      </p>
    </div>
  );
}

/**
 * The word of a voided document drawn across the block it is placed in. The
 * block must be `position: relative`. Grey ink, so the text under it stays
 * readable; it takes no room in the layout.
 */
export function VoidStamp({ word }: { word: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontSize: "110pt",
          fontWeight: 700,
          lineHeight: 1,
          color: "rgb(0 0 0 / 0.13)",
          border: "5pt solid rgb(0 0 0 / 0.13)",
          padding: "2mm 10mm 6mm",
          transform: "rotate(-28deg)",
          whiteSpace: "nowrap",
        }}
      >
        {word}
      </span>
    </div>
  );
}
