import type { CSSProperties } from "react";

import { Ltr } from "@/components/ltr";
import { DottedBlank, SheetRow, SheetTable, TickBox } from "@/components/print";
import { workerFormRow, type WorkerFormRow } from "@/features/people/forms/worker-form";
import type { WorkerFormData } from "@/features/people/forms/worker-form-data";
import { HIRING_CRITERIA, type MaritalStatus, type RegSuffix } from "@/features/people/validators/staff-codes";

import { ABOVE_THE_LETTERHEAD, belowHisTop, emptyParagraphMm, hisType, lineMm, mm, typedValue } from "./his-type";
import { DiamondMark, OvalMark, StretchedLabel } from "./marks";
import { dateParts, fullName, phoneParts, slashed } from "./print-values";
import { Cell, FillBlank, InlineDate, NumberAndDate, SlashedBlank, TitleBox } from "./worker-form-parts";

/**
 * His worker registration form, pages 1 and 2: «استمارة التسجيل بمركز إنماء».
 *
 * Two blocks, one per page, each a picture of a `WorkerFormData`. They are
 * blocks and not a sheet because a page break must be a direct child of
 * `PrintSheet`: worker-sheets.tsx puts them on paper.
 *
 * Every string comes from forms/worker-form.ts and every measure from the
 * Checker's layout file, docs/checker/forms/01-worker.md: its cell ids are in
 * the comments. Columns and cells are in reading order, the first rightmost.
 */

const LABEL = { face: "sakkal", pt: 14, bold: true, spacing: 1.15 } as const;
const LABEL_TYPE = hisType("sakkal", 14, { bold: true, spacing: 1.15 });
const LIST_TYPE = hisType("traditional", 14, { spacing: 1.15 });
const LIST_BOLD = hisType("traditional", 14, { bold: true, spacing: 1.15 });
const LIST_LINE_MM = lineMm("traditional", 14, 1.15);

/** P1, the first line of page 1, below the clear top margin. */
const P1_MM = belowHisTop(emptyParagraphMm("typesetting", 11, 1));

/** His tables start 3.1 mm outside the right margin and are wider than the text area. */
const OUTSIDE_THE_MARGIN: CSSProperties = { marginInlineStart: "-3.1mm" };

const T1_COLUMNS = [32.47, 25.01, 37.46, 35.05, 33.76, 33.78] as const;
const T2_COLUMNS = [32.49, 40.02, 22.46, 35.03, 64.88] as const;

/** The word written on «الحالة الإجتماعية», for a man and for a woman. */
const MARITAL_WORD: Record<MaritalStatus, Record<RegSuffix, string>> = {
  SINGLE: { H: "أعزب", F: "عزباء" },
  MARRIED: { H: "متزوج", F: "متزوجة" },
  DIVORCED: { H: "مطلق", F: "مطلقة" },
  WIDOWED: { H: "أرمل", F: "أرملة" },
};

function maritalWord(status: MaritalStatus | null, suffix: RegSuffix | null): string | null {
  if (!status) return null;
  return suffix ? MARITAL_WORD[status][suffix] : `${MARITAL_WORD[status].H} / ${MARITAL_WORD[status].F}`;
}

/** A label cell: his words, as typed, in bold Sakkal Majalla 14. */
function LabelCell({
  id,
  align = "end",
  rowSpan,
}: {
  id: string;
  /** `end` is the left of the cell: Word's "right" in a right-to-left paragraph. */
  align?: "start" | "center" | "end";
  rowSpan?: number;
}) {
  return (
    <Cell align={align} rowSpan={rowSpan} style={LABEL_TYPE}>
      <StretchedLabel raw={workerFormRow(id).raw[0]} {...LABEL} />
    </Cell>
  );
}

/** A value cell with one blank across it. */
function BlankCell({ colSpan, children }: { colSpan?: number; children?: React.ReactNode }) {
  return (
    <Cell colSpan={colSpan} style={{ verticalAlign: "bottom" }}>
      <FillBlank>{children}</FillBlank>
    </Cell>
  );
}

/** «/ …… / …… / …… / …… / …… /»: five pairs, read left to right. */
function PhoneCell({ phone }: { phone: string | null }) {
  const parts = phoneParts(phone);
  return (
    <Cell colSpan={2}>
      {parts && "whole" in parts ? (
        <FillBlank>
          <Ltr>{parts.whole}</Ltr>
        </FillBlank>
      ) : (
        // His five rows of dots, as they stand from left to right on his sheet.
        <SlashedBlank direction="ltr" leading trailing weights={[21, 23, 24, 23, 19]} values={parts?.pairs} />
      )}
    </Cell>
  );
}

/** His options one under the other, each after its box, ticked when chosen. */
function TickList({
  row,
  chosen,
  otherText,
}: {
  row: WorkerFormRow;
  chosen: readonly string[];
  otherText?: string | null;
}) {
  return (
    <div style={LIST_TYPE}>
      {(row.options ?? []).map((option) => (
        <div key={option.code}>
          <TickBox checked={chosen.includes(option.code)} />
          {"  "}
          {option.label}
          {option.code === row.optionWithText && (
            <>
              {": "}
              <span style={typedValue()}>
                <DottedBlank widthMm={34}>{otherText}</DottedBlank>
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** The band at the top of page 1: an empty line, then the number and the date beside the title box. */
function RegistrationHead({ data }: { data: WorkerFormData }) {
  const title = workerFormRow("W-001").raw[0];
  // K22: the first half of the title carries a light-grey highlight on top of
  // the grey band. Word prints it; it is one shade lighter than the band.
  const cut = title.indexOf("ل بمر");
  return (
    <div style={{ position: "relative" }}>
      {/* P1, his empty paragraph that makes room under the letterhead (11 pt,
          single spacing). The clear top margin already does, so it shrinks to
          what is still needed: nothing. */}
      <div style={{ height: mm(P1_MM) }} />
      <TitleBox place={{ leftMm: 98.71, topMm: P1_MM + 1.73, widthMm: 98.35, heightMm: 13.63, shadowPt: [-6, 4] }}>
        <StretchedLabel
          raw={[{ text: title.slice(0, cut), background: "#c0c0c0" }, { text: title.slice(cut) }]}
          face="sakkal"
          pt={20}
          bold
        />
      </TitleBox>
      <NumberAndDate data={data} dateLineMm={10.4} />
    </div>
  );
}

/** Page 1: the head, then table T1. */
export function RegistrationFront({ data }: { data: WorkerFormData }) {
  const birth = dateParts(data.birthDate);
  const worked = data.workedInFieldBefore;

  return (
    <div style={ABOVE_THE_LETTERHEAD}>
      <RegistrationHead data={data} />

      <div style={OUTSIDE_THE_MARGIN}>
        <SheetTable columns={T1_COLUMNS}>
          {/* T1.r1 */}
          <SheetRow heightMm={8.84}>
            <Cell colSpan={6} style={{ ...LABEL_TYPE, background: "#e2efd9" }}>
              {workerFormRow("W-004").raw[0]}
            </Cell>
          </SheetRow>

          {/* T1.r2 */}
          <SheetRow heightMm={8.18}>
            <LabelCell id="W-005" />
            <BlankCell colSpan={2}>{fullName(data.lastName, data.firstName)}</BlankCell>
            <LabelCell id="W-006" />
            <BlankCell colSpan={2}>{data.fullNameLatin && <Ltr>{data.fullNameLatin}</Ltr>}</BlankCell>
          </SheetRow>

          {/* T1.r3: the date of birth is a slash and three parts, the third the longest (K15). */}
          <SheetRow heightMm={8.18}>
            <LabelCell id="W-007" />
            <Cell colSpan={2} style={{ verticalAlign: "bottom" }}>
              <SlashedBlank leading weights={[25, 27, 67]} values={birth && [birth.day, birth.month, birth.year]} />
            </Cell>
            <LabelCell id="W-008" />
            <BlankCell colSpan={2}>{slashed(data.birthCommune, data.birthWilaya)}</BlankCell>
          </SheetRow>

          {/* T1.r4: the place of residence is split in two by a slash (K15). */}
          <SheetRow heightMm={8.18}>
            <LabelCell id="W-009" />
            <BlankCell colSpan={2}>{data.address}</BlankCell>
            <LabelCell id="W-010" />
            <Cell colSpan={2} style={{ verticalAlign: "bottom" }}>
              <SplitBlank first={data.residenceCommune} second={data.residenceWilaya} />
            </Cell>
          </SheetRow>

          {/* T1.r5 */}
          <SheetRow heightMm={6.24}>
            <LabelCell id="W-011" />
            <BlankCell colSpan={2}>{maritalWord(data.maritalStatus, data.regSuffix)}</BlankCell>
            <LabelCell id="W-012" />
            <PhoneCell phone={data.phone} />
          </SheetRow>

          {/* T1.r6 and r7: «معلومات الطوارئ» stands beside both. */}
          <SheetRow heightMm={6.24}>
            <LabelCell id="W-013" rowSpan={2} />
            <LabelCell id="W-014" />
            <BlankCell>{data.emergencyName}</BlankCell>
            <LabelCell id="W-015" />
            <BlankCell colSpan={2}>{data.emergencyAddress}</BlankCell>
          </SheetRow>
          <SheetRow heightMm={9.37}>
            <LabelCell id="W-016" />
            <BlankCell>{data.emergencyRelation}</BlankCell>
            <LabelCell id="W-017" />
            <PhoneCell phone={data.emergencyPhone} />
          </SheetRow>

          {/* T1.r8 */}
          <SheetRow heightMm={9.37}>
            <Cell colSpan={6} style={{ ...LABEL_TYPE, background: "#d9d9d9" }}>
              {workerFormRow("W-018").raw[0]}
            </Cell>
          </SheetRow>

          {/* T1.r9: the cell beside «اسم الشهادة» is empty, with no dotted line (K16). */}
          <SheetRow heightMm={9.9}>
            <LabelCell id="W-019" align="center" />
            <BlankCell colSpan={3}>{data.educationLevel}</BlankCell>
            <LabelCell id="W-020" align="center" />
            <Cell align="center" style={typedValue()}>
              {data.certificateName}
            </Cell>
          </SheetRow>

          {/* T1.r10: «نعم» and «لا» each beside a drawn oval, where his other lists have a box (F11). */}
          <SheetRow heightMm={9.9}>
            <LabelCell id="W-021" align="center" />
            <Cell colSpan={2} style={{ verticalAlign: "bottom" }}>
              <YesNoOvals row={workerFormRow("W-021")} answer={worked} />
            </Cell>
            <LabelCell id="W-022" align="center" />
            <BlankCell colSpan={2}>{data.previousEmployer}</BlankCell>
          </SheetRow>

          {/* T1.r11 */}
          <SheetRow heightMm={62.78}>
            <Cell style={LABEL_TYPE}>
              {/* Two paragraphs: the first centred, the second against the right. */}
              <div style={{ textAlign: "center" }}>{workerFormRow("W-023").raw[0]}</div>
              <div>{workerFormRow("W-023").raw[1]}</div>
            </Cell>
            <Cell colSpan={2}>
              <TickList row={workerFormRow("W-023")} chosen={data.abilities} />
            </Cell>
            <Cell align="center" style={LABEL_TYPE}>
              {/* His label is followed by an empty line. */}
              <div>{workerFormRow("W-024").raw[0]}</div>
              <div>{" "}</div>
            </Cell>
            <Cell colSpan={2}>
              <TickList row={workerFormRow("W-024")} chosen={data.availableDays} />
            </Cell>
          </SheetRow>

          {/* T1.r12 */}
          <SheetRow heightMm={69.94}>
            <LabelCell id="W-025" align="center" />
            <Cell colSpan={2}>
              <TickList row={workerFormRow("W-025")} chosen={data.healthConditions} otherText={data.healthOtherText} />
            </Cell>
            <LabelCell id="W-026" align="center" />
            <Cell colSpan={2}>
              <TickList row={workerFormRow("W-026")} chosen={data.documentsDelivered} />
            </Cell>
          </SheetRow>
        </SheetTable>
      </div>
    </div>
  );
}

/** «……/……»: the commune on the long part, the wilaya on the short one. */
function SplitBlank({ first, second }: { first: string | null; second: string | null }) {
  return (
    <span style={{ display: "flex", alignItems: "flex-end", paddingBottom: "1mm", ...typedValue() }}>
      <span style={{ flex: "87 1 0", minWidth: 0 }}>
        <DottedBlank fill>{first}</DottedBlank>
      </span>
      <span style={{ flex: "none", padding: "0 0.6mm" }}>/</span>
      <span style={{ flex: "25 1 0", minWidth: 0 }}>
        <DottedBlank fill>{second}</DottedBlank>
      </span>
    </span>
  );
}

/**
 * T1.r10.c2. The two ovals are where his file draws them, measured from the
 * left edge of the cell's text area: 0.7 mm and 38 mm. Each word stands on the
 * right of its oval, as his line of spaces leaves it.
 */
function YesNoOvals({ row, answer }: { row: WorkerFormRow; answer: boolean | null }) {
  const [yes, no] = row.options ?? [];
  const lineHeight = lineMm("sakkal", 14, 1.15);
  const word: CSSProperties = { position: "absolute", top: 0, whiteSpace: "nowrap" };
  return (
    <div style={{ position: "relative", height: mm(lineHeight), direction: "ltr", ...LABEL_TYPE }}>
      <span style={{ position: "absolute", left: "37.98mm", top: "0.69mm" }}>
        <OvalMark checked={answer === true} />
      </span>
      <span dir="rtl" style={{ ...word, left: "47.6mm" }}>
        {yes?.label}
      </span>
      <span style={{ position: "absolute", left: "0.69mm", top: "0.88mm" }}>
        <OvalMark checked={answer === false} />
      </span>
      <span dir="rtl" style={{ ...word, left: "10.3mm" }}>
        {no?.label}
      </span>
    </div>
  );
}

/** The twelve dotted lines of the score column, as his blank form has them: one, ten, one. */
function ScoreBlanks() {
  const line = mm(lineMm("traditional", 11, 1.15));
  return (
    <div style={hisType("traditional", 11, { spacing: 1.15 })}>
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} style={{ height: line }}>
          <DottedBlank widthMm={index === 0 || index === 11 ? 15 : 16} />
        </div>
      ))}
    </div>
  );
}

/** The scores of a filled form, each on a line beside its criterion. */
function ScoreValues({ scores }: { scores: WorkerFormData["hiringScores"] }) {
  return (
    <div style={{ ...typedValue(), lineHeight: mm(LIST_LINE_MM) }}>
      {HIRING_CRITERIA.map((criterion) => {
        const score = scores[criterion];
        return (
          <div key={criterion} style={{ height: mm(LIST_LINE_MM) }}>
            <DottedBlank widthMm={16}>{score !== null && score !== undefined && <Ltr>{score}</Ltr>}</DottedBlank>
          </div>
        );
      })}
    </div>
  );
}

function hasScores(data: WorkerFormData): boolean {
  return HIRING_CRITERIA.some((criterion) => typeof data.hiringScores[criterion] === "number");
}

/** Page 2: table T2, the «حررت» line and «الإمضاء والختم». */
export function RegistrationBack({ data }: { data: WorkerFormData }) {
  const pledge = workerFormRow("W-027");
  const pledges = pledge.items ?? [];
  const heading = workerFormRow("W-029");
  const total = workerFormRow("W-030");
  const criteria = HIRING_CRITERIA.map((key) => workerFormRow(`W-0${31 + HIRING_CRITERIA.indexOf(key)}`));
  const decision = workerFormRow("W-041");

  return (
    <div style={ABOVE_THE_LETTERHEAD}>
      {/* Of the four empty paragraphs between his two tables (P4 to P7), the
          first stays on page 1, after table T1, and the other three open this
          page, as the Checker's page reading has it: P5 and P6 in 11 pt, P7 in
          2 pt, each at 1.15 lines. Below the clear top margin, T2 then starts
          where they put it. */}
      <div
        style={{
          height: mm(
            belowHisTop(2 * emptyParagraphMm("traditional", 11, 1.15) + emptyParagraphMm("traditional", 2, 1.15)),
          ),
        }}
      />

      <div style={OUTSIDE_THE_MARGIN}>
        <SheetTable columns={T2_COLUMNS}>
          {/* T2.r1: the pledge and its twelve lines, six to a cell. */}
          <SheetRow heightMm={58.24}>
            <Cell align="center" style={LIST_BOLD}>
              {pledge.raw.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </Cell>
            <Cell colSpan={2} style={LIST_TYPE}>
              <PledgeLines lines={pledges.slice(0, 6)} />
            </Cell>
            <Cell colSpan={2} style={LIST_TYPE}>
              <PledgeLines lines={pledges.slice(6)} />
            </Cell>
          </SheetRow>

          {/* T2.r2: the signature row. Its first cell has no rule on either side. */}
          <SheetRow heightMm={16.32}>
            <Cell style={{ borderInlineStart: 0, borderInlineEnd: 0 }} />
            <Cell
              colSpan={2}
              align="center"
              style={{ ...LIST_BOLD, borderInlineStart: 0, paddingInlineStart: "33.1mm", whiteSpace: "nowrap" }}
            >
              {workerFormRow("W-028").raw[0]}
            </Cell>
            <Cell colSpan={2}>
              <DottedBlank fill />
            </Cell>
          </SheetRow>

          {/* T2.r3: the confidential evaluation and the management's decision. */}
          <SheetRow heightMm={89.45}>
            <Cell align="center" style={LIST_BOLD}>
              <div>{heading.raw[0]}</div>
              <div>
                {total.raw[0]}{" "}
                <span style={{ whiteSpace: "nowrap" }}>
                  <span style={typedValue()}>
                    <DottedBlank widthMm={14}>{data.hiringTotal !== null && <Ltr>{data.hiringTotal}</Ltr>}</DottedBlank>
                  </span>
                  /<Ltr>100</Ltr>
                </span>
              </div>
              <div>{" "}</div>
            </Cell>
            <Cell style={LIST_TYPE}>
              {criteria.map((row, index) => (
                <div key={row.id} style={{ display: "flex" }}>
                  {/* The number is Word's, generated by the list. The label starts at his
                      tab stop: 5.6 mm in, and 8.1 mm for the tenth, whose number is wider. */}
                  <span style={{ flex: "none", width: index === 9 ? "8.1mm" : "5.6mm" }}>{row.number}</span>
                  <span>{row.raw[0]}</span>
                </div>
              ))}
            </Cell>
            <Cell>{hasScores(data) ? <ScoreValues scores={data.hiringScores} /> : <ScoreBlanks />}</Cell>
            <Cell align="center" style={LIST_BOLD}>
              <div>{decision.raw[0]}</div>
              <div>{" "}</div>
            </Cell>
            <Cell>
              <TickList row={decision} chosen={data.hiringDecision ? [data.hiringDecision] : []} />
            </Cell>
          </SheetRow>
        </SheetTable>
      </div>

      {/* P8: an empty paragraph, its mark in 11 pt at 1.15 lines. */}
      <div style={{ height: mm(emptyParagraphMm("traditional", 11, 1.15)) }} />

      {/* P9: against the left margin. It prints the record's issue date, and stays blank on an empty form. */}
      <p style={{ ...hisType("traditional", 16, { spacing: 1.08 }), textAlign: "end", marginBottom: "2.82mm" }}>
        {workerFormRow("W-042").raw[0]}{" "}
        <span style={typedValue(14)}>
          <InlineDate iso={data.issuedDate} widthsMm={[14, 15, 28]} />
        </span>
      </p>

      {/* T3: one cell with no rule, 64.9 mm wide, against the left: plain words, not a box. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginInlineEnd: "-3.1mm" }}>
        <SheetTable columns={[64.88]}>
          <SheetRow heightMm={9.9}>
            <Cell
              borderless
              align="end"
              style={{ ...hisType("traditional", 16, { bold: true, spacing: 1.15 }), border: 0 }}
            >
              {workerFormRow("W-043").raw[0]}
            </Cell>
          </SheetRow>
        </SheetTable>
      </div>
    </div>
  );
}

function PledgeLines({ lines }: { lines: readonly string[] }) {
  return (
    <div style={{ paddingInlineStart: "0.6mm" }}>
      {lines.map((line) => (
        <div key={line}>
          <DiamondMark />
          {line}
        </div>
      ))}
    </div>
  );
}
