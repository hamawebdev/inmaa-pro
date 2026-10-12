import { cn } from "@/lib/utils";

/**
 * The pieces a printed sheet is built from. Use them inside `<PrintSheet>`.
 *
 * His forms are tables of labels, dotted blanks and tick boxes. These are those
 * three things, drawn so that they print the same on every PC: borders instead
 * of backgrounds, a drawn tick instead of a glyph that needs a font, widths in
 * millimetres.
 */

/**
 * Ends the page here. On screen it is a dashed line.
 *
 * It must be a **direct child of `<PrintSheet>`**, between the blocks of the
 * sheet. The sheet takes its page breaks out and starts a new page frame at
 * each one; that is what keeps the bottom margin on every page. (A break forced
 * from inside a frame makes the print engine stop repeating the frame's foot,
 * and the text of the following pages then runs down to the paper's edge.)
 *
 * So this body runs only when the break is somewhere else, for example inside a
 * component of your own. It still breaks the page, with that defect, and says
 * so in the console while developing.
 */
export function PageBreak() {
  if (import.meta.env.DEV) {
    console.error(
      "PageBreak must be a direct child of PrintSheet. Here it loses the bottom margin of the pages after it.",
    );
  }
  return <div className="sheet-page-break" />;
}

/** Keeps its content on one page: a signature block, a heading with its first lines. */
export function KeepTogether({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="sheet-keep" style={style}>
      {children}
    </div>
  );
}

/**
 * A tick box with its label.
 *
 * `side` is where the box sits relative to the label in reading order: his
 * forms have both «☐ عقد» and «سبت ☐», and the side is a fact of each form
 * (docs/checker/forms, "☐ sides").
 */
export function TickBox({
  checked = false,
  side = "before",
  children,
}: {
  checked?: boolean;
  side?: "before" | "after";
  /** The label. Leave out for a bare box. */
  children?: React.ReactNode;
}) {
  const box = (
    <span className="sheet-tick-box" aria-hidden>
      {checked && (
        <svg viewBox="0 0 12 12">
          <path
            d="M2.2 6.4 5 9.3 10 2.7"
            fill="none"
            stroke="#000"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );

  return (
    <span className="sheet-tick" data-checked={checked ? "yes" : "no"}>
      {side === "before" && box}
      {children !== undefined && <span>{children}</span>}
      {side === "after" && box}
    </span>
  );
}

/**
 * A blank to write in: a dotted line, with the value on it when there is one.
 *
 * His blanks are rows of full stops that run to the end of their cell; `fill`
 * draws that. Otherwise give a width in millimetres.
 */
export function DottedBlank({
  widthMm,
  fill = false,
  children,
}: {
  widthMm?: number;
  fill?: boolean;
  /** What is written on the line. Empty for a blank form. */
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn("sheet-blank", fill && "sheet-blank-fill")}
      style={widthMm === undefined ? undefined : { width: `${widthMm}mm` }}
    >
      {children}
    </span>
  );
}

/**
 * A bordered table whose columns have fixed widths, in millimetres.
 *
 * Columns are listed in reading order, so the first is the rightmost on paper,
 * as in the Checker's layout files. Rows are never split between two pages.
 *
 * `head` rows (its column titles) are printed again at the top of every page
 * the table runs onto: a visit statement of two pages has its titles on both.
 */
export function SheetTable({
  columns,
  head,
  children,
  style,
}: {
  /** The width of each column in millimetres, first column first. */
  columns: readonly number[];
  /** `<SheetRow>` elements repeated at the top of every page the table runs onto. */
  head?: React.ReactNode;
  /** `<SheetRow>` elements. */
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const total = columns.reduce((sum, width) => sum + width, 0);
  return (
    <table className="sheet-table" style={{ width: `${total}mm`, ...style }}>
      <colgroup>
        {columns.map((width, index) => (
          <col key={index} style={{ width: `${width}mm` }} />
        ))}
      </colgroup>
      {head ? <thead>{head}</thead> : null}
      <tbody>{children}</tbody>
    </table>
  );
}

export function SheetRow({
  heightMm,
  children,
}: {
  /** A minimum height, as Word's rows have. */ heightMm?: number;
  children: React.ReactNode;
}) {
  return <tr style={heightMm === undefined ? undefined : { height: `${heightMm}mm` }}>{children}</tr>;
}

export function SheetCell({
  colSpan,
  rowSpan,
  shaded = false,
  borderless = false,
  align,
  children,
  style,
}: {
  colSpan?: number;
  rowSpan?: number;
  /** A grey fill that prints with the print dialog's default settings. */
  shaded?: boolean;
  borderless?: boolean;
  align?: "start" | "center" | "end";
  children?: React.ReactNode;
  /** Type for this cell: `{ fontFamily: SHEET_FONT.sakkal, fontSize: "9pt", fontWeight: 700 }`. */
  style?: React.CSSProperties;
}) {
  return (
    <td
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={cn(shaded && "sheet-cell-shaded", borderless && "sheet-cell-borderless")}
      style={{ ...(align ? { textAlign: align } : null), ...style }}
    >
      {children}
    </td>
  );
}
