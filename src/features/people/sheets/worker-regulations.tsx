import type { CSSProperties } from "react";

import { DottedBlank, KeepTogether, SheetCell, SheetRow, SheetTable } from "@/components/print";
import { workerFormRow } from "@/features/people/forms/worker-form";
import type { WorkerFormData } from "@/features/people/forms/worker-form-data";

import {
  ABOVE_THE_LETTERHEAD,
  belowHisTop,
  emptyParagraphMm,
  hisType,
  lineMm,
  mm,
  typedValue,
  WORD_DEFAULT,
} from "./his-type";
import { BulletMark, DashDotRule, PenMark } from "./marks";
import { fullName } from "./print-values";
import { NumberAndDate, TitleBox } from "./worker-form-parts";

/**
 * «النظام الداخلي لعمال وعاملات النظافة», pages 3 and 4 of his worker form:
 * the eighteen articles, then the worker's acknowledgement and the two
 * signatures.
 *
 * One block that runs from page 3 onto page 4 by itself, as it does in his
 * Word file, which has no page break in it. A picture of the few values it
 * prints: the registration number, the date and the worker's name.
 *
 * Every string comes from forms/worker-form.ts and every measure from the
 * Checker's layout file, docs/checker/forms/01-worker.md, whose paragraph ids
 * (P21 to P56) are in the comments.
 */

export type WorkerRegulationsData = Pick<
  WorkerFormData,
  "regNumber" | "regSuffix" | "registrationDate" | "lastName" | "firstName"
>;

const TEXT = hisType("traditional", 14, { spacing: 1.15 });
const BOLD = hisType("traditional", 14, { bold: true, spacing: 1.15 });
const LINE_MM = lineMm("traditional", 14, 1.15);
/** Each signature label of T4 follows an empty paragraph whose mark is 11 pt, at 1.15 lines. */
const SIGNATURE_GAP_MM = emptyParagraphMm("traditional", 11, 1.15);

/**
 * His paragraphs, each with the articles it holds. Where a paragraph holds
 * several, he separated them with a line break, not a new paragraph.
 */
const P25 = ["W-047", "W-048"];
const P30 = ["W-049", "W-050", "W-051"];
const P31 = ["W-052"];
const P32 = ["W-053", "W-054"];
const P33_TO_P36 = ["W-055", "W-056", "W-057", "W-058"];
const P37 = ["W-059", "W-060"];
const P46 = ["W-061"];
const P47 = ["W-062"];
const P49_P50 = ["W-063", "W-064"];

/**
 * Word stretches a justified line that ends in a line break across the whole
 * width, as it does the lines above it, unless a compatibility switch says
 * otherwise, and his file does not set that switch. Word does it by
 * lengthening the letters; a browser can only widen the spaces, which on a
 * line of two words leaves one wide gap. So the last line of an article that
 * is followed by a line break is left as a last line. To set to true if a
 * print from Word shows those five lines stretched and the gap is preferred.
 */
const STRETCH_LINE_BEFORE_BREAK = false;

/** «المادة 1: الالتزام بالعمل:» in bold, then the text: the head ends at the second colon. */
function splitArticle(raw: string): [head: string, body: string] {
  const end = raw.indexOf(":", raw.indexOf(":") + 1) + 1;
  return [raw.slice(0, end), raw.slice(end)];
}

/** One of his justified paragraphs, with its articles one under the other. */
function Articles({ ids, keepWithNext = false }: { ids: readonly string[]; keepWithNext?: boolean }) {
  return (
    // An article that introduces a list stays on the page of the list's first line.
    <p style={{ ...TEXT, textAlign: "justify", ...(keepWithNext ? { breakAfter: "avoid" } : null) }}>
      {ids.map((id, index) => {
        const [head, body] = splitArticle(workerFormRow(id).raw[0]);
        const beforeBreak = index < ids.length - 1;
        return (
          <span
            key={id}
            style={{ display: "block", textAlignLast: beforeBreak && STRETCH_LINE_BEFORE_BREAK ? "justify" : "start" }}
          >
            <span style={{ fontWeight: 700 }}>{head}</span>
            {body}
          </span>
        );
      })}
    </p>
  );
}

/** The items of an article: a round dot 6.35 mm in from the right, the text 12.7 mm in. */
function Bullets({ id }: { id: string }) {
  return (
    <div style={TEXT}>
      {(workerFormRow(id).items ?? []).map((item) => (
        <div key={item} style={{ display: "flex", paddingInlineStart: "6.35mm" }}>
          <span style={{ flex: "none", width: "6.35mm", height: mm(LINE_MM), display: "flex", alignItems: "center" }}>
            <BulletMark />
          </span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

/** The band at the top of page 3: the two-line title box, with the number and the date beside it. */
function RegulationsHead({ data }: { data: WorkerRegulationsData }) {
  const lines = workerFormRow("W-044").raw;
  const title = hisType("sakkal", 16, { bold: true });
  return (
    <div style={{ position: "relative" }}>
      {/* P21: the paragraph the title box hangs from, empty but set in 18 pt.
          In Word the box starts 4.5 mm below it, which is over the bottom of
          the letterhead; here box and lines start no higher than the clear top. */}
      <div style={{ height: mm(belowHisTop(lineMm("typesetting", 18, 1.15))) }} />
      <TitleBox
        place={{ leftMm: 65.74, topMm: belowHisTop(4.5), widthMm: 131.32, heightMm: 18.98, shadowPt: [-8, 10] }}
      >
        {lines.map((line) => (
          <div key={line} style={title}>
            {line}
          </div>
        ))}
      </TitleBox>
      {/* P22 and P23, then P24: an empty paragraph whose mark is 1 pt, in Word's default spacing. */}
      <NumberAndDate data={data} dateLineMm={11.6} />
      <div style={{ height: mm(emptyParagraphMm("other", 1, WORD_DEFAULT.spacing, WORD_DEFAULT.afterPt)) }} />
    </div>
  );
}

/** The dotted lines under the two signatures: his 12 pt, at 1.15 lines. */
const SIGNATURE_LINE = hisType("traditional", 12, { spacing: 1.15 });

const NO_RULE: CSSProperties = { border: 0, padding: "0 1.9mm", verticalAlign: "top" };

export function Regulations({ data }: { data: WorkerRegulationsData }) {
  // His heading starts with the emoji ✍️, which is drawn instead (PenMark): the words start at «إقرار».
  const acknowledgement = workerFormRow("W-065").raw[0];
  const heading = acknowledgement.slice(acknowledgement.indexOf("إقرار"));
  const undersigned = workerFormRow("W-066").raw[0];
  // «اللقب والاسم» inside that line is set in Sakkal Majalla, the rest in Traditional Arabic.
  const nameAt = undersigned.indexOf("الل");
  const name = fullName(data.lastName, data.firstName);

  return (
    <div style={ABOVE_THE_LETTERHEAD}>
      <RegulationsHead data={data} />

      {/* P25 to P29: articles 1 and 2. */}
      <Articles ids={P25} keepWithNext />
      <Bullets id="W-048" />
      {/* P30 to P36: articles 3 to 12. */}
      <Articles ids={P30} />
      <Articles ids={P31} />
      <Articles ids={P32} />
      {P33_TO_P36.map((id) => (
        <Articles key={id} ids={[id]} />
      ))}
      {/* Page 4 as the Checker reads it, P37 to the end: kept on one page, so
          that article 13 does not stay behind on page 3 when there is room for
          it there. If page 3 itself runs over, this simply follows it. */}
      <KeepTogether>
        {/* P37 to P43: articles 13 and 14. */}
        <Articles ids={P37} keepWithNext />
        <Bullets id="W-060" />
        {/* P44 and P45: two empty paragraphs, their marks in 14 pt at 1.15 lines. */}
        <div style={{ height: mm(2 * emptyParagraphMm("traditional", 14, 1.15)) }} />
        {/* P46 to P50: articles 15 to 18. The seven criteria of article 16 are one centred bold line. */}
        <Articles ids={P46} />
        <Articles ids={P47} keepWithNext />
        <p style={{ ...BOLD, textAlign: "center" }}>{workerFormRow("W-062").items?.[0]}</p>
        {P49_P50.map((id) => (
          <Articles key={id} ids={[id]} />
        ))}

        {/* P51: the heading of the acknowledgement, after a drawn pen. */}
        <p style={BOLD}>
          <PenMark />
          {heading}
        </p>
        {/* P52: the worker's name on the blank. */}
        <p style={{ ...BOLD, textAlign: "center" }}>
          {undersigned.slice(0, nameAt)}
          <span style={hisType("sakkal", 14, { bold: true, spacing: 1.15 })}>{undersigned.slice(nameAt, -1)}</span>
          {": "}
          <span style={typedValue()}>
            <DottedBlank widthMm={78}>{name}</DottedBlank>
          </span>
        </p>
        {/* P53 */}
        <p style={{ ...hisType("traditional", 15, { bold: true, spacing: 1.15 }), textAlign: "justify" }}>
          {workerFormRow("W-067").raw[0]}
        </p>
        {/* P54 opens with a line break after a 14 pt run: an empty line, then the golden rule. */}
        <div style={{ height: mm(LINE_MM) }} />
        <p style={{ ...hisType("traditional", 16, { bold: true, spacing: 1.15 }), textAlign: "center" }}>
          {workerFormRow("W-068").raw[0]}
        </p>
        {/* P55: an empty paragraph, its mark in 7 pt at 1.15 lines. */}
        <div style={{ height: mm(emptyParagraphMm("traditional", 7, 1.15)) }} />

        {/* T4: no grid, only a heavy dash-dot rule across its top; the worker signs on the right, the centre on the left. */}
        <KeepTogether>
          <DashDotRule widthMm={192.5} />
          <SheetTable columns={[96.24, 96.26]}>
            <SheetRow>
              <SheetCell borderless style={{ ...BOLD, ...NO_RULE, paddingTop: mm(SIGNATURE_GAP_MM) }}>
                {workerFormRow("W-069").raw[0]}
              </SheetCell>
              <SheetCell borderless align="end" style={{ ...BOLD, ...NO_RULE, paddingTop: mm(SIGNATURE_GAP_MM) }}>
                {workerFormRow("W-070").raw[0]}
              </SheetCell>
            </SheetRow>
            <SheetRow>
              <SheetCell borderless style={{ ...SIGNATURE_LINE, ...NO_RULE }}>
                <DottedBlank widthMm={19} />
              </SheetCell>
              <SheetCell borderless align="end" style={{ ...SIGNATURE_LINE, ...NO_RULE }}>
                <DottedBlank widthMm={26} />
              </SheetCell>
            </SheetRow>
          </SheetTable>
        </KeepTogether>
      </KeepTogether>
    </div>
  );
}
