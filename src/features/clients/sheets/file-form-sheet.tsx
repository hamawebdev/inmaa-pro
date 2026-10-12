import { Ltr } from "@/components/ltr";
import {
  DottedBlank,
  PageBreak,
  PrintSheet,
  SHEET_FONT,
  SheetCell,
  SheetRow,
  SheetTable,
  TickBox,
} from "@/components/print";

import {
  freeText,
  isTicked,
  phonePieces,
  optionLabel,
  placeParts,
  sideText,
  writtenValue,
  type WrittenValue,
} from "../forms/answers";
import { rowOf } from "../forms/definitions";
import type { FormDefinition, FormRow, SheetBlock, SheetCellDef, SheetPart } from "../forms/types";
import type { FormValues, ResidentLine } from "../forms/values";
import { registrationPlaces } from "../rules/registration-number";

/**
 * One of his five client forms, or the complexes copy, on paper.
 *
 * One renderer for the six: it walks the form's definition
 * (`../forms/definitions`) and draws each table of his Word file with the
 * file's values on the blanks and in the boxes. Without values it is the empty
 * form. A pure picture of its two arguments.
 *
 * What is his and what is ours:
 *
 *  - Wording, order, the side of every tick box, the numbers in front of the
 *    labels, column widths, shading, alignment and the saved row heights are
 *    his, read from the definition.
 *  - Line heights are ours and fixed in points, so that a row is as high on a
 *    PC without his fonts as on one with them. The page breaks are where his
 *    runs of empty paragraphs put them.
 *  - Nothing prints over his letterhead or footer pictures (coordinator's
 *    ruling). His margins would put the first lines of a page under the header
 *    picture and the last ones on the footer picture, so the sheet is laid in
 *    the kit's text area (`SHEET_BODY`, its default): each page's text starts just under
 *    the letterhead, and a row that would reach the footer runs on to the next
 *    page. His empty first paragraph, which only made room under the
 *    letterhead, is left out: the margin does its work.
 */

// ── Type ──────────────────────────────────────────────────────────────────

/**
 * His three faces, as his Word files name them. Where one is not installed,
 * the Naskh bundled with the program stands in, scaled by the print kit to take
 * about the room his face takes (src/components/print/sheet-constants.ts).
 */
const FACE = SHEET_FONT;

/**
 * A line is this many times its type size, whatever the font. Tighter than
 * Word's (the Checker counts 1.57 for Traditional Arabic) so that each page of
 * his holds on a page that stops clear of the letterhead, with room to spare:
 * page 1 of the building contract, the fullest, ends 6 mm above the footer, so
 * an answer that runs onto a second line does not push a table to a new page.
 */
const LINE = 1.36;
const type = (pt: number, weight: 400 | 700 = 400): React.CSSProperties => ({
  fontSize: `${pt}pt`,
  lineHeight: `${pt * LINE}pt`,
  fontWeight: weight,
});

const HEADING_PT = 18;
const LABEL_PT = 16;
const NUMBER_PT = 14;
const OPTION_PT = 14;
/** What is written on a blank. */
const VALUE_PT = 13;
/** The commune and the wilaya share one narrow cell. */
const PLACE_PT = 12;

// ── Places on the page, in millimetres ────────────────────────────────────

/** The registration line and the date line. */
const HEADER_LINES_MM = [8, 10.8] as const;
/** One of his empty paragraphs between two tables: under the Checker's estimate (4.7 mm), for the same reason. */
const EMPTY_PARAGRAPH_MM = 3;

// ── Small pieces ──────────────────────────────────────────────────────────

function Written({ value }: { value: WrittenValue | null }) {
  if (!value) return null;
  return value.ltr ? <Ltr>{value.text}</Ltr> : <>{value.text}</>;
}

/** A dotted blank that takes the room left on its line. */
function FillingBlank({ children }: { children?: React.ReactNode }) {
  return (
    <span style={{ flex: "1 1 0", minWidth: "6mm", ...type(VALUE_PT) }}>
      <DottedBlank fill>{children}</DottedBlank>
    </span>
  );
}

function FixedBlank({ widthMm, children }: { widthMm: number; children?: React.ReactNode }) {
  return (
    <span style={type(VALUE_PT)}>
      <DottedBlank widthMm={widthMm}>{children}</DottedBlank>
    </span>
  );
}

/**
 * A blank shorter than the kit's shortest (12 mm): the pieces of a date, the
 * pairs of digits of a resident's phone. Drawn like the kit's.
 */
function ShortBlank({ widthMm, children }: { widthMm: number; children?: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: `${widthMm}mm`,
        minHeight: "1.25em",
        borderBottom: "1pt dotted #000",
        textAlign: "center",
        ...type(VALUE_PT),
        lineHeight: 1.25,
      }}
    >
      {children}
    </span>
  );
}

/**
 * His «…… / …… / ……». He types the longest blank last, which in a right-to-left
 * line is the leftmost: the day goes on the first blank, the year on the last.
 */
function DateBlanks({ iso, widthsMm }: { iso: string | undefined; widthsMm: readonly [number, number, number] }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  const pieces = match ? [match[3], match[2], match[1]] : ["", "", ""];
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "1mm", whiteSpace: "nowrap" }}>
      {pieces.map((piece, index) => (
        <span key={index} style={{ display: "inline-flex", alignItems: "baseline", gap: "1mm" }}>
          {index > 0 && <span>/</span>}
          <ShortBlank widthMm={widthsMm[index]}>{piece && <Ltr>{piece}</Ltr>}</ShortBlank>
        </span>
      ))}
    </span>
  );
}

function Suffix({ text }: { text: string }) {
  // «م2» is square metres: his file raises the 2.
  if (text === "م2") {
    return (
      <span style={type(OPTION_PT, 700)}>
        م<sup style={{ fontSize: "0.65em", lineHeight: 0 }}>2</sup>
      </span>
    );
  }
  return <span style={type(OPTION_PT)}>{text}</span>;
}

// ── The parts of a cell ───────────────────────────────────────────────────

interface Drawing {
  definition: FormDefinition;
  values: FormValues;
}

/**
 * A label he stretched to fill its cell («مكــــان التخــــلص مــــن النفايات») is
 * a little wider in the bundled Naskh than in his face, and would run into the
 * next cell. One stretching character is taken from each long run: the label
 * still fills its cell, in his face and in the stand-in.
 */
function fitted(raw: string): string {
  return raw.replace(/\u0640{3,}/g, (run) => run.slice(1));
}

function Label({ row, part }: { row: FormRow; part: Extract<SheetPart, { t: "label" }> }) {
  return (
    <span style={{ ...type(part.pt ?? LABEL_PT, part.regular ? 400 : 700), whiteSpace: "nowrap" }}>
      {/* No line height of its own: the smaller number must not deepen the line it sits on. */}
      {row.number && <span style={{ fontSize: `${NUMBER_PT}pt`, lineHeight: 0 }}>{row.number}&nbsp;</span>}
      {fitted(row.raw)}
    </span>
  );
}

function ValueBlank({ row, values }: { row: FormRow; values: FormValues }) {
  if (row.role === "date") return <DateBlanks iso={values[row.key as "issuedDate"]} widthsMm={[11, 11, 20]} />;
  if (row.answer === "place" && (row.blankParts ?? 1) > 1) {
    // «……………………/…………»: the commune on the long part, the wilaya on the short one after the slash.
    const [commune, wilaya] = placeParts(row, values);
    // Each part is at least as wide as what is written on it: a name is never cut in two lines.
    return (
      <>
        <span style={{ flex: "2 1 auto", minWidth: "6mm", whiteSpace: "nowrap", ...type(PLACE_PT) }}>
          <DottedBlank fill>{commune}</DottedBlank>
        </span>
        <span style={type(PLACE_PT)}>/</span>
        <span style={{ flex: "1 1 auto", minWidth: "6mm", whiteSpace: "nowrap", ...type(PLACE_PT) }}>
          <DottedBlank fill>{wilaya}</DottedBlank>
        </span>
      </>
    );
  }
  return (
    <>
      {row.prefix && <span style={{ ...type(OPTION_PT, 700), whiteSpace: "nowrap" }}>{row.prefix}</span>}
      <FillingBlank>
        <Written value={writtenValue(row, values)} />
      </FillingBlank>
      {row.suffix && <Suffix text={row.suffix} />}
    </>
  );
}

function Option({
  row,
  index,
  values,
  alone,
}: {
  row: FormRow;
  index: number;
  values: FormValues;
  /** The only option on its line: its dotted place can be long. */
  alone: boolean;
}) {
  const option = row.options?.[index];
  if (!option) return null;
  const checked = isTicked(row, index, values);

  let body: React.ReactNode = optionLabel(option);
  if (option.free) {
    // A blank that shares its line with an option has only what the option leaves.
    body = <FixedBlank widthMm={option.sameLine ? 13 : 32}>{freeText(row, index, values)}</FixedBlank>;
  } else if (option.withText) {
    body = (
      <>
        {optionLabel(option)}{" "}
        <FixedBlank widthMm={alone ? 110 : 30}>{checked ? sideText(row, "other", values) : ""}</FixedBlank>
      </>
    );
  }
  // A label his file prints without a box («ستة بالأسبوع»), or a blank line without one. No box is added;
  // when the label is the file's answer, a bare tick stands beside it, as a pen would leave one.
  if (option.side === "none") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "1.2mm", whiteSpace: "nowrap" }}>
        {body}
        {checked && !option.free && <BareTick />}
      </span>
    );
  }
  return (
    <TickBox side={option.side} checked={checked}>
      {body}
    </TickBox>
  );
}

/** The kit's tick without its box. */
function BareTick() {
  return (
    <svg viewBox="0 0 12 12" style={{ width: "3.6mm", height: "3.6mm", flex: "none" }} aria-hidden>
      <path
        d="M2.2 6.4 5 9.3 10 2.7"
        fill="none"
        stroke="#000"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Options typed on one line: his order, spread evenly across the room they have. */
function OptionsInLine({
  row,
  part,
  values,
}: {
  row: FormRow;
  part: Extract<SheetPart, { t: "options" }>;
  values: FormValues;
}) {
  const indexes = Array.from({ length: part.to - part.from }, (_, offset) => part.from + offset);
  return (
    <span
      style={{
        flex: "1 1 0",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-around",
        columnGap: "2mm",
        ...type(part.pt ?? OPTION_PT),
      }}
    >
      {indexes.map((index) => (
        <Option key={index} row={row} index={index} values={values} alone={indexes.length === 1} />
      ))}
    </span>
  );
}

/** Options typed one per paragraph: the lists of services. */
function OptionsStacked({ cell, definition, values }: Drawing & { cell: SheetCellDef }) {
  const lines: React.ReactNode[][] = [];
  let pt = OPTION_PT;
  for (const part of cell.parts) {
    if (part.t !== "options") continue;
    pt = part.pt ?? OPTION_PT;
    const row = rowOf(definition, part.row);
    for (let index = part.from; index < part.to; index += 1) {
      const drawn = <Option key={index} row={row} index={index} values={values} alone={false} />;
      if (row.options?.[index]?.sameLine && lines.length > 0) lines[lines.length - 1].push(drawn);
      else lines.push([drawn]);
    }
  }
  const justify = cell.align === "center" ? "center" : cell.align === "end" ? "flex-end" : "flex-start";
  return (
    <>
      {lines.map((line, index) => (
        <div
          key={index}
          style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: "2mm", ...type(pt) }}
        >
          {line}
        </div>
      ))}
    </>
  );
}

function Part({ part, definition, values }: Drawing & { part: SheetPart }) {
  if (part.t === "break") return null;
  const row = rowOf(definition, part.row);
  switch (part.t) {
    case "heading":
      return (
        <span style={type(HEADING_PT, 700)}>
          {row.number && <>{row.number}&nbsp;</>}
          {row.raw}
        </span>
      );
    case "label":
      return <Label row={row} part={part} />;
    case "signature":
      return <span style={type(LABEL_PT)}>{row.raw}</span>;
    case "options":
      return <OptionsInLine row={row} part={part} values={values} />;
    default:
      if (part.of === "note") return <FixedBlank widthMm={24}>{sideText(row, "note", values)}</FixedBlank>;
      // The label the office gives to the pair his form leaves unlabelled: nothing is printed while it is empty.
      if (part.of === "label") return <span style={type(OPTION_PT)}>{sideText(row, "label", values)}</span>;
      return <ValueBlank row={row} values={values} />;
  }
}

function CellContent({ cell, definition, values }: Drawing & { cell: SheetCellDef }) {
  if (cell.stacked) return <OptionsStacked cell={cell} definition={definition} values={values} />;

  // A line break he typed inside the cell starts a new line here too.
  const lines: SheetPart[][] = [[]];
  for (const part of cell.parts) {
    if (part.t === "break") lines.push([]);
    else lines[lines.length - 1].push(part);
  }
  const justify = cell.align === "center" ? "center" : cell.align === "end" ? "flex-end" : "flex-start";
  return (
    <>
      {lines.map((line, index) => (
        // Centred, not on a common baseline: the dotted line under a value would otherwise deepen every row.
        <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: "1.5mm" }}>
          {line.map((part, partIndex) => (
            <Part key={partIndex} part={part} definition={definition} values={values} />
          ))}
        </div>
      ))}
    </>
  );
}

// ── Blocks ────────────────────────────────────────────────────────────────

const BORDER = "0.5pt solid #000";

function cellStyle(cell: SheetCellDef): React.CSSProperties {
  return {
    // His tables pad left and right only, and rule at half a point.
    padding: "0 1.9mm",
    border: BORDER,
    verticalAlign: cell.valign ?? "middle",
    ...(cell.open ? { borderRight: 0, borderBottom: 0, borderLeft: 0 } : null),
    ...(cell.noTop ? { borderTop: 0 } : null),
  };
}

function FormTable({ block, definition, values }: Drawing & { block: Extract<SheetBlock, { t: "table" }> }) {
  return (
    <SheetTable
      columns={block.columnsMm}
      style={{ marginInlineStart: `${block.offsetMm}mm`, fontFamily: FACE.traditional }}
    >
      {block.rows.map((row, rowIndex) => (
        <SheetRow key={rowIndex} heightMm={row.minMm}>
          {row.cells.map((cell, cellIndex) => (
            <SheetCell key={cellIndex} colSpan={cell.span} shaded={cell.shaded} style={cellStyle(cell)}>
              <CellContent cell={cell} definition={definition} values={values} />
            </SheetCell>
          ))}
        </SheetRow>
      ))}
    </SheetTable>
  );
}

/** The title box at the right, the registration number and the date at the left. */
function Header({ definition, values }: Drawing) {
  const title = definition.rows.find((row) => row.role === "title");
  const number = definition.rows.find((row) => row.role === "number");
  const date = definition.rows.find((row) => row.role === "date" && row.key === "registrationDate");
  const box = definition.titleBox;
  const places = registrationPlaces(definition, values.registrationNumber);
  const lineStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: "1mm",
    // Clear of the box's shadow, which falls 6 pt to its left.
    width: `${box.leftMm - 5}mm`,
    marginInlineStart: "auto",
    fontFamily: FACE.sakkal,
    whiteSpace: "nowrap",
  };
  const labelStyle: React.CSSProperties = { fontFamily: FACE.typesetting, ...type(18, 700) };

  return (
    <div style={{ position: "relative", height: `${HEADER_LINES_MM[0] + HEADER_LINES_MM[1]}mm` }}>
      {/* The box is white and without an outline; its shadow falls to the left and below. */}
      <div
        style={{
          position: "absolute",
          left: `${box.leftMm}mm`,
          top: `${box.topMm}mm`,
          width: `${box.widthMm}mm`,
          height: `${box.heightMm}mm`,
          zIndex: 2,
        }}
      >
        <div
          style={{ position: "absolute", inset: 0, transform: "translate(-6pt, 4pt)", background: "rgb(0 0 0 / 0.5)" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            // Word anchors the text of a text box at its top, inside insets of 0.05 and 0.1 inch.
            alignItems: "flex-start",
            padding: "3.6pt 7.2pt",
            background: "#fff",
          }}
        >
          <div
            style={{
              width: "100%",
              background: "#d9d9d9",
              textAlign: "center",
              fontFamily: FACE.traditional,
              ...type(20, 700),
              lineHeight: "24pt",
              whiteSpace: "nowrap",
            }}
          >
            {title?.raw}
          </div>
        </div>
      </div>

      <div style={{ ...lineStyle, height: `${HEADER_LINES_MM[0]}mm` }}>
        <span style={labelStyle}>{number?.raw}</span>
        <FillingBlank>{places.sequence && <Ltr>{places.sequence}</Ltr>}</FillingBlank>
        {places.suffix === null ? (
          <>
            <span style={type(16)}>/</span>
            <ShortBlank widthMm={9} />
          </>
        ) : (
          // His file joins the slash and the suffix: «/BLC».
          <span style={{ display: "inline-flex", ...type(16) }}>
            <span>/</span>
            <Ltr>{places.suffix}</Ltr>
          </span>
        )}
      </div>
      <div style={{ ...lineStyle, height: `${HEADER_LINES_MM[1]}mm` }}>
        <span style={labelStyle}>{date?.raw}</span>
        <DateBlanks iso={values.registrationDate} widthsMm={[9, 9, 14]} />
      </div>
    </div>
  );
}

/** One page of «قائمة القاطنين بالعمارة»: his 26 lines, written on or blank. */
function ResidentsTable({
  block,
  definition,
  lines,
  firstNumber,
}: {
  block: Extract<SheetBlock, { t: "residents" }>;
  definition: FormDefinition;
  lines: readonly (ResidentLine | undefined)[];
  firstNumber: number;
}) {
  const heading = rowOf(definition, block.heading);
  // The phone and the date columns are drawn in parts, as his blanks are.
  const phoneParts = rowOf(definition, block.columns[2]).blankParts ?? 1;
  const cell: React.CSSProperties = { padding: "0 1.9mm", border: BORDER, textAlign: "center", ...type(VALUE_PT) };
  return (
    <SheetTable
      columns={block.columnsMm}
      style={{ marginInlineStart: `${block.offsetMm}mm`, fontFamily: FACE.traditional }}
    >
      <SheetRow heightMm={block.titleMinMm}>
        <SheetCell colSpan={block.columnsMm.length} shaded style={{ ...cell, ...type(HEADING_PT, 700) }}>
          {heading.number && <>{heading.number}&nbsp;</>}
          {heading.raw}
        </SheetCell>
      </SheetRow>
      <SheetRow heightMm={block.headMinMm}>
        {block.columns.map((id) => (
          <SheetCell key={id} style={{ ...cell, ...type(LABEL_PT, 700) }}>
            {rowOf(definition, id).raw}
          </SheetCell>
        ))}
      </SheetRow>
      {lines.map((line, index) => (
        <SheetRow key={index} heightMm={block.lineMinMm}>
          <SheetCell style={cell}>
            <ShortBlank widthMm={10}>{line && <Ltr>{line.number ?? firstNumber + index}</Ltr>}</ShortBlank>
          </SheetCell>
          <SheetCell style={cell}>
            <DottedBlank fill>{line?.name}</DottedBlank>
          </SheetCell>
          <SheetCell style={cell}>
            {/* His dotted pairs of digits, read left to right; a typed phone is written in them. */}
            <span dir="ltr" style={{ display: "inline-flex", direction: "ltr", alignItems: "baseline", gap: "1mm" }}>
              {phonePieces(line?.phone, phoneParts).map((piece, pair) => (
                <span key={pair} style={{ display: "inline-flex", alignItems: "baseline", gap: "1mm" }}>
                  {pair > 0 && <span>/</span>}
                  <ShortBlank widthMm={8}>{piece}</ShortBlank>
                </span>
              ))}
            </span>
          </SheetCell>
          <SheetCell style={cell}>
            <DateBlanks iso={line?.registeredDate} widthsMm={[8, 8, 12]} />
          </SheetCell>
        </SheetRow>
      ))}
    </SheetTable>
  );
}

/** The residents in pages of his 26 lines; at least one page, the last one completed with blank lines. */
function residentPages(residents: readonly ResidentLine[], linesPerPage: number): (ResidentLine | undefined)[][] {
  const pages: (ResidentLine | undefined)[][] = [];
  for (let start = 0; start === 0 || start < residents.length; start += linesPerPage) {
    const page: (ResidentLine | undefined)[] = residents.slice(start, start + linesPerPage);
    while (page.length < linesPerPage) page.push(undefined);
    pages.push(page);
  }
  return pages;
}

function residentBlocks(
  block: Extract<SheetBlock, { t: "residents" }>,
  definition: FormDefinition,
  residents: readonly ResidentLine[],
): React.ReactNode[] {
  return residentPages(residents, block.lines).flatMap((lines, page) => [
    ...(page > 0 ? [<PageBreak key={`break-${page}`} />] : []),
    <ResidentsTable
      key={`residents-${page}`}
      block={block}
      definition={definition}
      lines={lines}
      firstNumber={page * block.lines + 1}
    />,
  ]);
}

/** His form for a file. `values` left out, or `{}`, prints the empty form. */
export function FileFormSheet({ definition, values = {} }: { definition: FormDefinition; values?: FormValues }) {
  // A flat list: a page break must be a direct child of the sheet.
  const blocks: React.ReactNode[] = [];
  definition.sheet.forEach((block, index) => {
    const key = `block-${index}`;
    switch (block.t) {
      case "header":
        blocks.push(<Header key={key} definition={definition} values={values} />);
        break;
      case "gap":
        blocks.push(<div key={key} style={{ height: `${block.paragraphs * EMPTY_PARAGRAPH_MM}mm` }} />);
        break;
      case "pageBreak":
        blocks.push(<PageBreak key={key} />);
        break;
      case "table":
        blocks.push(<FormTable key={key} block={block} definition={definition} values={values} />);
        break;
      default:
        blocks.push(...residentBlocks(block, definition, values.residents ?? []));
    }
  });

  return <PrintSheet letterhead="client">{blocks}</PrintSheet>;
}

/** «قائمة القاطنين بالعمارة» alone, for a building or a complex whose list has changed. */
export function ResidentsSheet({
  definition,
  residents,
}: {
  definition: FormDefinition;
  residents: readonly ResidentLine[];
}) {
  const block = definition.sheet.find((candidate) => candidate.t === "residents");
  if (!block) return null;
  return <PrintSheet letterhead="client">{residentBlocks(block, definition, residents)}</PrintSheet>;
}
