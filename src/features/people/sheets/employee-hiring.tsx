import type { CSSProperties, ReactNode } from "react";

import { Ltr } from "@/components/ltr";
import { DottedBlank, PrintSheet, SheetRow, SheetTable } from "@/components/print";
import { workerFormRow } from "@/features/people/forms/worker-form";
import type { HiringSheet } from "@/features/people/services/hiring-sheet";
import { JOB_POSITION_AR, type JobPosition, type MaritalStatus } from "@/features/people/validators/staff-codes";
import type { Sex } from "@/lib/options";
import { phoneText } from "@/lib/text/phone";

import {
  CONFIRMATION,
  fillTemplate,
  forSex,
  INFO_LABELS,
  PART_TITLES,
  PLEDGE,
  SIGNATURES,
  templateText,
  TITLE_LINES,
} from "./employee-hiring-text";
import {
  ABOVE_THE_LETTERHEAD,
  CELL_PADDING_MM,
  faceInstalled,
  hisType,
  mm,
  typedValue,
  WORKER_FORM_MARGINS,
} from "./his-type";
import { DashDotRule } from "./marks";
import { slashed } from "./print-values";
import { Cell, InlineDate, TitleBox } from "./worker-form-parts";

/**
 * «استمارة تسجيل وتعهد موظف»: the one page a centre employee signs at
 * registration (docs/employee-hiring-sheet.md), in the manner of his worker
 * form: his letterhead and margins, his title box with the number and the
 * date beside it, his bordered table with a green heading row, his faces, his
 * dash-dot rule over the two signatures.
 *
 * One page whatever the data: the body is set below his regulations
 * (12.5 pt, single spacing), and a long value wraps inside its cell. A pure
 * picture of its data: it is drawn twice, as the preview and as the copy that
 * prints.
 */

const BODY = hisType("traditional", 12.5, { spacing: 0.95 });
const BODY_BOLD = hisType("traditional", 12.5, { bold: true, spacing: 0.95 });
const HEADING = hisType("sakkal", 13, { bold: true });
const LABEL = hisType("sakkal", 12, { bold: true });
const TYPED = typedValue(12.5);
const GREEN = "#e2efd9";
/** Label, value, label, value: the first labels are the long ones («في حالة الطوارئ: الاسم وصلة القرابة»). */
const TABLE_COLUMNS = [44, 55, 36, 55] as const;

const CONTRACT_AR: Record<string, string> = {
  NONE: "بدون عقد",
  CDD: "عقد محدد المدة",
  CDI: "عقد غير محدد المدة",
};

/** «الحالة الإجتماعية» in the person's form. */
const MARITAL_WORD: Record<MaritalStatus, Record<Sex, string>> = {
  SINGLE: { MALE: "أعزب", FEMALE: "عزباء" },
  MARRIED: { MALE: "متزوج", FEMALE: "متزوجة" },
  DIVORCED: { MALE: "مطلق", FEMALE: "مطلقة" },
  WIDOWED: { MALE: "أرمل", FEMALE: "أرملة" },
};

function maritalWord(status: string | null, sex: string): string | null {
  const words = status ? MARITAL_WORD[status as MaritalStatus] : undefined;
  if (!words) return null;
  return sex === "MALE" || sex === "FEMALE" ? words[sex] : `${words.MALE} / ${words.FEMALE}`;
}

const positionAr = (code: string | null) => (code ? (JOB_POSITION_AR[code as JobPosition] ?? null) : null);

/** «12/10/2026» */
const dateAr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function DateText({ iso }: { iso: string | null }) {
  return iso ? <Ltr>{dateAr(iso)}</Ltr> : null;
}

/**
 * Latin letters: a name in French, an e-mail address.
 *
 * His faces have Latin letters; the Arabic face bundled to stand in for them
 * where they are missing has none, so the browser would draw them in its own
 * serif at full size beside the scaled Arabic. There the bundled Geist draws
 * them instead, at the size of the scaled stand-in.
 */
function Latin({ children }: { children: ReactNode }) {
  const style = faceInstalled("sakkal") ? undefined : { fontFamily: '"Geist Variable", sans-serif', fontSize: "0.8em" };
  return <Ltr style={style}>{children}</Ltr>;
}

// ── The head: his title box, with the number and the date beside it ───────

/**
 * «رقم التسجيل» and «التاريخ», on the left of the title box as on his form,
 * without the «/H/F» of a worker's number: an employee's number has none.
 */
function PageHead({ data }: { data: HiringSheet }) {
  const title = hisType("sakkal", 16, { bold: true });
  const line: CSSProperties = {
    ...hisType("typesetting", 18),
    paddingInlineStart: "105mm",
    paddingInlineEnd: "2.5mm",
    textAlign: "end",
    whiteSpace: "nowrap",
  };
  return (
    // The box and its shadow reach 22.5 mm down: what follows starts below them.
    <div style={{ position: "relative", marginBottom: "4.5mm" }}>
      <TitleBox place={{ leftMm: 92, topMm: 0, widthMm: 98, heightMm: 18.98, shadowPt: [-8, 10] }}>
        {TITLE_LINES.map((text) => (
          <div key={text} style={title}>
            {text}
          </div>
        ))}
      </TitleBox>
      <p style={{ ...line, height: "9mm", lineHeight: "9mm" }}>
        {workerFormRow("W-002").raw[0]}{" "}
        <span style={TYPED}>
          <DottedBlank widthMm={30}>
            <Ltr>{data.number}</Ltr>
          </DottedBlank>
        </span>
      </p>
      <p style={{ ...line, height: "9.5mm" }}>
        {workerFormRow("W-003").raw[0]}{" "}
        <span style={TYPED}>
          <InlineDate iso={data.registrationDate} widthsMm={[10, 10, 12]} />
        </span>
      </p>
    </div>
  );
}

// ── 1. معلومات الموظف(ة) ─────────────────────────────────────────────────

function Label({ children }: { children: ReactNode }) {
  return <Cell style={{ ...LABEL, verticalAlign: "middle" }}>{children}</Cell>;
}

/** A value on a dotted line that fills its cell; the line alone when there is nothing to write. */
function Value({ children, colSpan }: { children?: ReactNode; colSpan?: number }) {
  return (
    <Cell colSpan={colSpan} style={{ verticalAlign: "bottom" }}>
      <span style={{ display: "block", paddingBottom: "0.8mm", ...TYPED }}>
        <DottedBlank fill>{children}</DottedBlank>
      </span>
    </Cell>
  );
}

/** Two label and value pairs in a row, or one across it. */
function Pair({ label, value, second }: { label: ReactNode; value?: ReactNode; second?: [ReactNode, ReactNode?] }) {
  return (
    <SheetRow heightMm={7}>
      <Label>{label}</Label>
      <Value colSpan={second ? 1 : 3}>{value}</Value>
      {second && (
        <>
          <Label>{second[0]}</Label>
          <Value>{second[1]}</Value>
        </>
      )}
    </SheetRow>
  );
}

function Information({ data }: { data: HiringSheet }) {
  const birthPlace = slashed(data.birthPlace, data.birthWilaya);
  const residence = slashed(data.residenceCommune, data.residenceWilaya);
  const address = [data.address?.trim(), residence].filter(Boolean).join("، ");
  const emergency = [data.emergencyName?.trim(), data.emergencyRelation?.trim()].filter(Boolean).join("، ");
  const fixedTerm = data.employmentContract === "CDD";
  const contract = data.employmentContract ? (CONTRACT_AR[data.employmentContract] ?? null) : null;
  return (
    <>
      <PartHeading first>{forSex(PART_TITLES.employee, data.sex)}</PartHeading>
      <SheetTable columns={TABLE_COLUMNS}>
        <Pair
          label={INFO_LABELS.name}
          value={data.name}
          second={[INFO_LABELS.nameLatin, data.fullNameLatin && <Latin>{data.fullNameLatin}</Latin>]}
        />
        <Pair
          label={INFO_LABELS.birth}
          value={
            (data.birthDate || birthPlace) && (
              <>
                <DateText iso={data.birthDate} />
                {data.birthDate && birthPlace ? " ب" : ""}
                {birthPlace}
              </>
            )
          }
          second={[INFO_LABELS.marital, maritalWord(data.maritalStatus, data.sex)]}
        />
        <Pair
          label={INFO_LABELS.nationalId}
          value={data.nationalIdNumber && <Ltr>{data.nationalIdNumber}</Ltr>}
          second={[INFO_LABELS.cnas, data.cnasNumber && <Ltr>{data.cnasNumber}</Ltr>]}
        />
        <Pair label={INFO_LABELS.address} value={address || null} />
        <Pair
          label={INFO_LABELS.phone}
          value={data.phone && <Ltr>{phoneText(data.phone)}</Ltr>}
          second={[INFO_LABELS.email, data.email && <Latin>{data.email}</Latin>]}
        />
        <Pair
          label={INFO_LABELS.position}
          value={positionAr(data.jobPosition)}
          second={[INFO_LABELS.startDate, <DateText key="start" iso={data.startDate} />]}
        />
        {fixedTerm ? (
          <Pair
            label={INFO_LABELS.contract}
            value={contract}
            second={[INFO_LABELS.contractEnd, <DateText key="end" iso={data.contractEndDate} />]}
          />
        ) : (
          <Pair label={INFO_LABELS.contract} value={contract} />
        )}
        <Pair
          label={INFO_LABELS.emergency}
          value={emergency || null}
          second={[INFO_LABELS.emergencyPhone, data.emergencyPhone && <Ltr>{phoneText(data.emergencyPhone)}</Ltr>]}
        />
      </SheetTable>
    </>
  );
}

// ── 2 and 3: the confirmation and the تعهد ─────────────────────────────────

/** A part's heading: a green band with his thin rule, as the heading row of his registration table. */
function PartHeading({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <p
      style={{
        ...HEADING,
        background: GREEN,
        border: "0.5pt solid #000",
        padding: "0 1.9mm",
        marginTop: first ? 0 : "2mm",
        // Part 1's band sits on its table, sharing the table's top rule.
        marginBottom: first ? "-0.5pt" : "0.5mm",
      }}
    >
      {children}
    </p>
  );
}

/** A sentence of the plan with its values written in bold, or a dotted blank where one is missing. */
function Filled({ template, sex, values }: { template: string; sex: string; values: Record<string, ReactNode> }) {
  return fillTemplate(template, sex).map((part, index) => {
    if ("text" in part) return <span key={index}>{part.text}</span>;
    const value = values[part.value];
    return (
      <span key={index} style={{ fontWeight: 700 }}>
        {value === null || value === undefined || value === "" ? <DottedBlank widthMm={28} /> : value}
      </span>
    );
  });
}

function Confirmation({ data }: { data: HiringSheet }) {
  return (
    <>
      <PartHeading>{PART_TITLES.confirmation}</PartHeading>
      <p style={{ ...BODY, textAlign: "justify" }}>
        <Filled
          template={CONFIRMATION}
          sex={data.sex}
          values={{
            name: data.name,
            number: <Ltr>{data.number}</Ltr>,
            registrationDate: <DateText iso={data.registrationDate} />,
            post: positionAr(data.jobPosition),
            startDate: data.startDate && <DateText iso={data.startDate} />,
          }}
        />
      </p>
    </>
  );
}

function Pledge({ sex }: { sex: string }) {
  return (
    <>
      <PartHeading>{PART_TITLES.pledge}</PartHeading>
      <p style={BODY_BOLD}>{templateText(PLEDGE.opening, sex)}</p>
      <ol style={{ ...BODY, listStyle: "none", padding: 0, margin: 0 }}>
        {PLEDGE.points.map((point, index) => (
          <li key={point} style={{ display: "flex", textAlign: "justify" }}>
            <span style={{ flex: "none", width: "6mm", paddingInlineStart: "1.5mm", fontWeight: 700 }}>
              {index + 1}.
            </span>
            <span style={{ flex: 1 }}>{point}</span>
          </li>
        ))}
      </ol>
      <p style={{ ...BODY, textAlign: "justify" }}>{PLEDGE.closing}</p>
    </>
  );
}

// ── 4. The place and date, and the two signatures ─────────────────────────

const NO_RULE: CSSProperties = { border: 0, padding: "0 1.9mm", verticalAlign: "top" };
/** The dotted lines under the two signatures: his 12 pt, at 1.15 lines. */
const SIGNATURE_LINE = hisType("traditional", 12, { spacing: 1.15 });
const SIGNATURE_LABEL = hisType("traditional", 13, { bold: true });

function Signatures({ data }: { data: HiringSheet }) {
  return (
    <div style={{ marginTop: "2mm" }}>
      <p style={{ ...BODY_BOLD, textAlign: "end", paddingInlineEnd: "6mm", marginBottom: "1.5mm" }}>
        {SIGNATURES.writtenAt}
        {data.city || <DottedBlank widthMm={30} />} {SIGNATURES.writtenOn}{" "}
        <span style={TYPED}>
          <DottedBlank widthMm={30}>
            <DateText iso={data.registrationDate} />
          </DottedBlank>
        </span>
      </p>
      {/* His T4: a heavy dash-dot rule, the person signs on the right and the centre on the left. */}
      <div style={{ marginInlineStart: mm(-CELL_PADDING_MM) }}>
        <DashDotRule widthMm={192.5} />
        <SheetTable columns={[96.24, 96.26]}>
          <SheetRow>
            <Cell borderless style={{ ...SIGNATURE_LABEL, ...NO_RULE, paddingTop: "1.5mm" }}>
              {templateText(SIGNATURES.employee, data.sex)}
              <div style={hisType("traditional", 10.5, { bold: true })}>{SIGNATURES.readAndApproved}</div>
            </Cell>
            <Cell borderless align="end" style={{ ...SIGNATURE_LABEL, ...NO_RULE, paddingTop: "1.5mm" }}>
              {SIGNATURES.centre}
            </Cell>
          </SheetRow>
          {/* His dotted lines under the two labels, with room below them to sign and to stamp. */}
          <SheetRow heightMm={12}>
            <Cell borderless style={{ ...SIGNATURE_LINE, ...NO_RULE }}>
              <DottedBlank widthMm={40} />
            </Cell>
            <Cell borderless align="end" style={{ ...SIGNATURE_LINE, ...NO_RULE }}>
              <DottedBlank widthMm={45} />
            </Cell>
          </SheetRow>
        </SheetTable>
      </div>
    </div>
  );
}

// ── The sheet ──────────────────────────────────────────────────────────────

export function EmployeeHiringSheet({ data }: { data: HiringSheet }) {
  return (
    <PrintSheet letterhead="worker" margins={WORKER_FORM_MARGINS}>
      <div style={ABOVE_THE_LETTERHEAD}>
        <PageHead data={data} />
        <Information data={data} />
        <Confirmation data={data} />
        <Pledge sex={data.sex} />
        <Signatures data={data} />
      </div>
    </PrintSheet>
  );
}
