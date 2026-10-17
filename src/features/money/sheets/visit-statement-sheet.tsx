import {
  KeepTogether,
  PrintSheet,
  SHEET_MARGINS_CLEAR_OF_LETTERHEAD,
  SheetCell,
  SheetRow,
  SheetTable,
} from "@/components/print";

import type { IsoDate } from "../rules/dates";
import { hoursText } from "../rules/hours";
import type { Division, ServiceType } from "../validators/option-codes";

import { DIVISION_LABEL, SERVICE_TYPE_LABEL } from "./print-labels";
import { DateText, FieldTable, Gap, Num, SheetHeading, SignatureBlock, VoidMark, VoidStamp } from "./sheet-parts";
import { field, TYPE } from "./sheet-style";

/**
 * «كشف الزيارات المنجزة»: the statement that goes with a contract invoice
 * (plan feature 19).
 *
 * One row per planned visit of the period billed: when the team came and left,
 * how many they were, whether the work was complete, how the client took
 * delivery. It is what a building's representative or an organisation's
 * office shows to justify the payment, and what a public client asks for each
 * month.
 *
 * Its rows are frozen with the invoice when it is issued: what is printed a
 * year later is what was billed, not what the visits say by then.
 */

export interface VisitStatementRow {
  seq: number;
  visitDate: IsoDate;
  /** «السبت», «الأحد»… as frozen at issue. */
  dayName: string;
  /** `HH:MM`, or empty when the visit did not take place. */
  arrival: string | null;
  departure: string | null;
  workersCount: number;
  /** Time worked by the whole team, in minutes. */
  workedMin: number | null;
  /** Operations' wording, frozen: «مكتملة بالكامل», «مكتملة جزئياً», «لم تكتمل». */
  completion: string;
  /** Operations' wording, frozen: «تم قبول الخدمة», «راضٍ»… */
  signOff: string | null;
  signedBy: string | null;
  /** Whether the visit is counted on the invoice. */
  billable: boolean;
  remark: string | null;
}

export interface VisitStatementData {
  invoiceNumber: string;
  issueDate: IsoDate;
  fileNumber: string;
  clientName: string;
  siteAddress: string;
  division: Division;
  serviceType: ServiceType;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  /** Where the sheet is drawn up: «أم البواقي». */
  place: string;
  rows: readonly VisitStatementRow[];
  /** Set when the invoice was voided. */
  voided: { date: IsoDate; reason: string } | null;
}

/** The rows of the statement: 11 points, so that a month of daily visits stays readable on two pages. */
const CELL = { ...TYPE.body, fontSize: "11pt" } as const;

/**
 * The statement without its paper, so that the invoice can carry it after a
 * page break as well.
 */
export function VisitStatementBody({ data }: { data: VisitStatementData }) {
  const billed = data.rows.filter((row) => row.billable);
  const workedMin = data.rows.reduce((sum, row) => sum + (row.workedMin ?? 0), 0);
  const split = Math.max(0, data.rows.length - ROWS_KEPT_WITH_SIGNATURES);
  const body = data.rows.slice(0, split);
  const tail = data.rows.slice(split);

  return (
    <div style={{ position: "relative" }}>
      {data.voided && <VoidStamp word="ملغاة" />}
      <SheetHeading
        title="كشف الزيارات المنجزة"
        references={[
          { label: "مرفق بالفاتورة رقم", value: <Num>{data.invoiceNumber}</Num> },
          { label: "التاريخ", value: <DateText value={data.issueDate} /> },
        ]}
      />
      <Gap mm={5} />
      {data.voided && <VoidMark word="ملغاة" what="الفاتورة" reason={data.voided.reason} date={data.voided.date} />}

      <FieldTable
        widths={[28, 65.65, 28, 65.65]}
        rows={[
          [...field("رقم الملف", <Num>{data.fileNumber}</Num>), ...field("العميل", data.clientName)],
          [
            ...field("القسم", DIVISION_LABEL[data.division]),
            ...field("نوع الخدمة", SERVICE_TYPE_LABEL[data.serviceType]),
          ],
          [
            ...field("العنوان", data.siteAddress),
            ...field(
              "الفترة",
              data.periodStart && data.periodEnd ? (
                <>
                  من <DateText value={data.periodStart} /> إلى <DateText value={data.periodEnd} />
                </>
              ) : null,
            ),
          ],
        ]}
      />
      <Gap mm={4} />

      <SheetTable
        columns={STATEMENT_COLUMNS}
        // The title row is printed again at the top of every page the statement runs onto, the last one too.
        head={titleRow}
      >
        {body.map(visitRow)}
        {/* The last rows, the counts and the signatures are one row of the same table, kept whole: a signature
            never stands on a page alone, and on the page they open the table's title row is printed above them. */}
        <SheetRow>
          <SheetCell colSpan={STATEMENT_COLUMNS.length} borderless style={{ padding: 0 }}>
            <KeepTogether>
              <SheetTable columns={STATEMENT_COLUMNS}>{tail.map(visitRow)}</SheetTable>
              <Gap mm={3} />

              <FieldTable
                widths={[37, 11, 37, 11, 30, 11, 28, 22.3]}
                rows={[
                  [
                    ...field("الزيارات المبرمجة", <Num>{data.rows.length}</Num>),
                    ...field("الزيارات المحتسبة", <Num>{billed.length}</Num>),
                    ...field("غير المحتسبة", <Num>{data.rows.length - billed.length}</Num>),
                    ...field("ساعات العمل", <Num>{hoursText(workedMin)}</Num>),
                  ],
                ]}
              />
              <Gap mm={6} />

              <SignatureBlock place={data.place} date={data.issueDate} boxes={["إمضاء العميل", "الإمضاء والختم"]} />
            </KeepTogether>
          </SheetCell>
        </SheetRow>
      </SheetTable>
    </div>
  );
}

const STATEMENT_COLUMNS = [12, 27, 16, 15, 15, 15, 27, 28, 32.3];

/** How many of the last rows go to the page of the counts and the signatures. */
const ROWS_KEPT_WITH_SIGNATURES = 3;

const titleRow = (
  <SheetRow heightMm={9}>
    {[
      "الرقم",
      "التاريخ",
      "اليوم",
      "وقت الوصول",
      "المغادرة",
      "عدد العمال",
      "حالة الإنجاز",
      "استلام الخدمة",
      "ملاحظات",
    ].map((label) => (
      <SheetCell key={label} shaded align="center" style={{ ...TYPE.label, fontSize: "10.5pt" }}>
        {label}
      </SheetCell>
    ))}
  </SheetRow>
);

function visitRow(row: VisitStatementData["rows"][number]) {
  return (
    <SheetRow key={row.seq} heightMm={7}>
      <SheetCell align="center" style={CELL}>
        <Num>{row.seq}</Num>
      </SheetCell>
      <SheetCell align="center" style={CELL}>
        <DateText value={row.visitDate} />
      </SheetCell>
      <SheetCell align="center" style={CELL}>
        {row.dayName}
      </SheetCell>
      <SheetCell align="center" style={CELL}>
        {row.arrival ? <Num>{row.arrival}</Num> : "—"}
      </SheetCell>
      <SheetCell align="center" style={CELL}>
        {row.departure ? <Num>{row.departure}</Num> : "—"}
      </SheetCell>
      <SheetCell align="center" style={CELL}>
        <Num>{row.workersCount}</Num>
      </SheetCell>
      <SheetCell align="center" style={CELL}>
        {row.completion}
      </SheetCell>
      <SheetCell align="center" style={CELL}>
        {row.signOff ?? "—"}
      </SheetCell>
      <SheetCell style={TYPE.small}>{row.remark}</SheetCell>
    </SheetRow>
  );
}

/** The statement on its own sheet. */
export function VisitStatementSheet({ data }: { data: VisitStatementData }) {
  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <VisitStatementBody data={data} />
    </PrintSheet>
  );
}
