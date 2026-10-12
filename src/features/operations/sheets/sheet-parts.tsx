import { Children } from "react";

import { Ltr } from "@/components/ltr";
import { DottedBlank, KeepTogether, SheetCell, SheetRow, SheetTable, TickBox } from "@/components/print";

import {
  BODY_STYLE,
  LABEL_STYLE,
  ROW_MM,
  SECTION_STYLE,
  SHEET_WIDTH_MM,
  SMALL_STYLE,
  SUBTITLE_STYLE,
  TITLE_STYLE,
} from "./sheet-format";

/**
 * The pieces Operations' four sheets share, built on the print kit.
 *
 * They follow the look of his six forms: a grey title box, a number and a date
 * beside it, bordered tables whose first row is a grey section heading, bold
 * centred labels, dotted blanks and tick boxes.
 */

/** Everything inside an Operations sheet, set in its face and size. */
export function OpsSheetBody({ children }: { children: React.ReactNode }) {
  return <div style={BODY_STYLE}>{children}</div>;
}

/**
 * The head of a sheet: the grey title box on the right, as on his forms, and
 * beside it the lines that identify the sheet (its number, its date).
 */
export function SheetHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** `<HeadingLine>` elements. */
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8mm", marginBottom: "2.5mm" }}>
      <div
        style={{
          width: "96mm",
          flex: "none",
          padding: "0.8mm 2mm 1.2mm",
          border: "0.75pt solid #000",
          background: "#d9d9d9",
          boxShadow: "-1.2mm 1mm 0 #8c8c8c",
          textAlign: "center",
        }}
      >
        <div style={TITLE_STYLE}>{title}</div>
        {subtitle && <div style={SUBTITLE_STYLE}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1, lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

export function HeadingLine({
  label,
  widthMm = 42,
  children,
}: {
  label: string;
  widthMm?: number;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <span style={LABEL_STYLE}>{label}</span> <DottedBlank widthMm={widthMm}>{children}</DottedBlank>
    </div>
  );
}

/**
 * One bordered table of the sheet, with its grey heading row. `columns` are
 * millimetres, first column on the right, and should add up to the sheet's
 * width.
 *
 * It is kept on one page. A table that can be long (a task list, a day's
 * visits, a call list) passes `flow`: it may then break between two rows, which
 * fills the page instead of leaving its foot empty. The heading never stays
 * alone at the foot of a page: it is kept with the first `keepRows` rows, so
 * give the number of rows that belong with it (column titles and one line).
 */
export function Block({
  title,
  columns = [SHEET_WIDTH_MM],
  flow = false,
  keepRows = 1,
  children,
}: {
  title?: string;
  columns?: readonly number[];
  flow?: boolean;
  keepRows?: number;
  /** `<SheetRow>` elements. */
  children: React.ReactNode;
}) {
  const heading = title && (
    <SheetRow heightMm={ROW_MM}>
      <SheetCell shaded colSpan={columns.length} style={SECTION_STYLE}>
        {title}
      </SheetCell>
    </SheetRow>
  );
  const gap = { marginTop: "1.4mm" };

  if (!flow) {
    return (
      <KeepTogether style={gap}>
        <SheetTable columns={columns}>
          {heading}
          {children}
        </SheetTable>
      </KeepTogether>
    );
  }

  // Two tables with the same columns, the second drawn over the first one's
  // last border: on paper one table, which can break only after `keepRows`.
  const rows = Children.toArray(children);
  const rest = rows.slice(keepRows);
  return (
    <div style={gap}>
      <KeepTogether>
        <SheetTable columns={columns}>
          {heading}
          {rows.slice(0, keepRows)}
        </SheetTable>
      </KeepTogether>
      {rest.length > 0 && (
        <SheetTable columns={columns} style={{ marginTop: "-0.75pt" }}>
          {rest}
        </SheetTable>
      )}
    </div>
  );
}

/** A label: bold and centred, as the first cell of every row on his forms. */
export function LabelCell({
  colSpan,
  rowSpan,
  children,
}: {
  colSpan?: number;
  rowSpan?: number;
  children: React.ReactNode;
}) {
  return (
    <SheetCell colSpan={colSpan} rowSpan={rowSpan} align="center" style={LABEL_STYLE}>
      {children}
    </SheetCell>
  );
}

/** A value on a dotted blank that fills its cell. `ltr` for a phone, a date, a time or a number. */
export function ValueCell({
  colSpan,
  ltr = false,
  children,
}: {
  colSpan?: number;
  ltr?: boolean;
  children?: React.ReactNode;
}) {
  const empty = children === null || children === undefined || children === "";
  return (
    <SheetCell colSpan={colSpan} align="center">
      <DottedBlank fill>{empty ? null : ltr ? <Ltr>{children}</Ltr> : children}</DottedBlank>
    </SheetCell>
  );
}

/** A plain cell of a list table: centred, with digits kept left to right when asked. */
export function ListCell({
  colSpan,
  ltr = false,
  align = "center",
  children,
}: {
  colSpan?: number;
  ltr?: boolean;
  align?: "start" | "center";
  children?: React.ReactNode;
}) {
  const empty = children === null || children === undefined || children === "";
  return (
    <SheetCell colSpan={colSpan} align={align}>
      {empty ? null : ltr ? <Ltr>{children}</Ltr> : children}
    </SheetCell>
  );
}

export interface TickItem {
  key: string;
  label: React.ReactNode;
  checked?: boolean;
}

/** Tick boxes one after another, wrapping onto further lines; each box stays with its label. */
export function TickList({ items, gapMm = 4.5 }: { items: readonly TickItem[]; gapMm?: number }) {
  return (
    <>
      {items.map((item) => (
        <span key={item.key} style={{ display: "inline-block", marginInlineEnd: `${gapMm}mm` }}>
          <TickBox checked={item.checked}>{item.label}</TickBox>
        </span>
      ))}
    </>
  );
}

/** «☐ نعم ☐ لا», in the order of his forms. Null leaves both empty. */
export function YesNo({ value }: { value?: boolean | null }) {
  return (
    <TickList
      gapMm={3.5}
      items={[
        { key: "yes", label: "نعم", checked: value === true },
        { key: "no", label: "لا", checked: value === false },
      ]}
    />
  );
}

/** Dotted lines to write on; the first carries the text when there is one. */
export function WritingLines({ count, children }: { count: number; children?: React.ReactNode }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} style={{ padding: "0.9mm 0 0.5mm" }}>
          <DottedBlank fill>{index === 0 ? children : null}</DottedBlank>
        </div>
      ))}
    </>
  );
}

/** The five marks of «تقييم الخدمة من 1 إلى 5»: numbered boxes, the chosen one filled. */
export function RatingBoxes({ value }: { value?: number | null }) {
  return (
    <span style={{ display: "inline-flex", gap: "0.9mm" }}>
      {[1, 2, 3, 4, 5].map((mark) => (
        <span
          key={mark}
          style={{
            display: "inline-block",
            width: "4.6mm",
            height: "4.6mm",
            border: "0.75pt solid #000",
            background: value === mark ? "#000" : "#fff",
            color: value === mark ? "#fff" : "#000",
            fontSize: "8pt",
            fontWeight: 700,
            lineHeight: "4.2mm",
            textAlign: "center",
          }}
        >
          {mark}
        </span>
      ))}
    </span>
  );
}

/** A line to cut along, with a word in its middle. */
export function CutLine({ children }: { children: React.ReactNode }) {
  const rule = { flex: 1, borderTop: "0.75pt dashed #000" } as const;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3mm", margin: "3mm 0 1mm", ...SMALL_STYLE }}>
      <span style={rule} />
      <span>{children}</span>
      <span style={rule} />
    </div>
  );
}

/** A small note under a table. */
export function FinePrint({ children }: { children: React.ReactNode }) {
  return <p style={{ ...SMALL_STYLE, marginTop: "1.2mm" }}>{children}</p>;
}

/** A box to sign in, with what it is for written at its top. */
export function SignatureCell({ colSpan, label }: { colSpan?: number; label: string }) {
  return (
    <SheetCell colSpan={colSpan} align="center" style={{ ...LABEL_STYLE, verticalAlign: "top" }}>
      {label}
    </SheetCell>
  );
}
