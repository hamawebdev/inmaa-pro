import {
  DottedBlank,
  KeepTogether,
  PrintSheet,
  SHEET_MARGINS_CLEAR_OF_LETTERHEAD,
  SheetCell,
  SheetRow,
  SheetTable,
  TickBox,
} from "@/components/print";
import type { IsoDate } from "@/features/money/rules/dates";
import { formatQuantity, type Thousandths } from "@/features/money/rules/quantities";
import { DIVISION_LABEL, SERVICE_TYPE_LABEL } from "@/features/money/sheets/print-labels";
import { DateText, FieldTable, Gap, Num, SheetHeading, SignatureBlock } from "@/features/money/sheets/sheet-parts";
import { field, TYPE } from "@/features/money/sheets/sheet-style";

import {
  PPE,
  SERVICE_TYPES,
  STOCK_KINDS,
  type Division,
  type HandoutPurpose,
  type ItemCondition,
  type Ppe,
  type ServiceType,
  type StockKind,
  type Unit,
} from "../validators/option-codes";

import { ITEM_CONDITION_LABEL, PPE_LABEL, REGULATIONS_ARTICLE_5, STOCK_KIND_LABEL, UNIT_LABEL } from "./print-labels";

/**
 * «وصل تسليم»: the slip for what is handed to a worker for a job (his notes,
 * section ⑤, «قسم التسليم»).
 *
 * He drew hand-outs as two branches, «المعدات» and «المواد», each by «نوع
 * الخدمة» and by division; one slip carries both branches for one job. Its
 * table is the one on his buildings worker card (item 11): «المادة/المعدة»,
 * «الكمية», «الحالة عند الاستلام» with «جيدة» and «تحتاج صيانة», and under it
 * the protective kit of the same card (item 12).
 *
 * Equipment comes back, so its rows have a part to fill in by hand when it
 * does: quantity, condition, date. Materials are used up and have none.
 *
 * The worker signs for what he received. Article 5 of the regulations he
 * signed at registration is printed above his signature.
 */

export interface HandoutSlipLine {
  kind: StockKind;
  /** The item's name, and the unit's code for a machine followed piece by piece. */
  itemName: string;
  unitCode: string | null;
  qty: Thousandths;
  unit: Unit;
  /** «الحالة عند الاستلام». Equipment only. */
  condition: ItemCondition | null;
  /** The equipment stays at the client's between visits («تخزين معدات: نعم»). */
  stayAtSite: boolean;
}

export interface HandoutSlipData {
  /** `000031/2026`. */
  number: string;
  date: IsoDate;
  /** «أم البواقي». */
  place: string;
  purpose: HandoutPurpose;
  /** The worker who receives: «اللقب والاسم» and «رقم التسجيل» of his registration form. */
  workerName: string;
  workerNumber: string;
  /** Who hands over. */
  handedByName: string;
  /** The job. Empty for a worker's own kit. */
  job: {
    fileNumber: string;
    clientName: string;
    siteAddress: string;
    division: Division;
    serviceType: ServiceType;
    visitDate: IsoDate | null;
  } | null;
  lines: readonly HandoutSlipLine[];
  /** The protective kit handed with it. */
  ppe: readonly Ppe[];
  note: string | null;
  /** Set when the hand-out was cancelled. */
  cancelled: { date: IsoDate; reason: string } | null;
}

const CONDITIONS_ON_HIS_CARD: readonly ItemCondition[] = ["GOOD", "NEEDS_MAINTENANCE"];

function LinesTable({ kind, lines }: { kind: StockKind; lines: readonly HandoutSlipLine[] }) {
  const returns = kind === "EQUIPMENT";
  const head = { ...TYPE.label, fontSize: "10pt", lineHeight: 1.3 };
  // Equipment: what was handed, then three columns to fill in by hand when it comes back.
  const columns = returns ? [12, 47.3, 14, 14, 40, 20, 24, 16] : [12, 111.3, 32, 32];
  const titles = returns
    ? [
        "الرقم",
        "المعدة",
        "الكمية",
        "الوحدة",
        "الحالة عند الاستلام",
        "الكمية المرجعة",
        "الحالة عند الإرجاع",
        "تاريخ الإرجاع",
      ]
    : ["الرقم", "المادة", "الكمية", "الوحدة"];

  return (
    <SheetTable columns={columns}>
      <SheetRow heightMm={6.5}>
        <SheetCell shaded colSpan={columns.length} style={TYPE.heading}>
          {STOCK_KIND_LABEL[kind]}
        </SheetCell>
      </SheetRow>
      <SheetRow heightMm={8}>
        {titles.map((title) => (
          <SheetCell key={title} shaded align="center" style={head}>
            {title}
          </SheetCell>
        ))}
      </SheetRow>
      {lines.map((line, index) => (
        // Equipment rows leave room for the return to be written in by hand.
        <SheetRow key={index} heightMm={returns ? 7.5 : 6.5}>
          <SheetCell align="center" style={CELL}>
            <Num>{index + 1}</Num>
          </SheetCell>
          <SheetCell style={CELL}>
            {line.itemName}
            {line.unitCode && (
              <>
                {" "}
                (<Num>{line.unitCode}</Num>)
              </>
            )}
            {line.stayAtSite && <span style={TYPE.small}> — تبقى بموقع العميل</span>}
          </SheetCell>
          <SheetCell align="center" style={CELL}>
            <Num>{formatQuantity(line.qty)}</Num>
          </SheetCell>
          <SheetCell align="center" style={CELL}>
            {UNIT_LABEL[line.unit]}
          </SheetCell>
          {returns && (
            <>
              <SheetCell style={{ ...CELL, fontSize: "10.5pt" }}>
                <span style={{ display: "inline-flex", flexWrap: "wrap", columnGap: "2.5mm" }}>
                  {CONDITIONS_ON_HIS_CARD.map((condition) => (
                    <TickBox key={condition} checked={line.condition === condition}>
                      {ITEM_CONDITION_LABEL[condition]}
                    </TickBox>
                  ))}
                </span>
              </SheetCell>
              <SheetCell />
              <SheetCell />
              <SheetCell />
            </>
          )}
        </SheetRow>
      ))}
    </SheetTable>
  );
}

/** The slip is dense: 11 points, so that a usual job keeps its signatures on page one. */
const CELL = { ...TYPE.body, fontSize: "11pt" } as const;
const DENSE = "11pt";

export function HandoutSlipSheet({ slip }: { slip: HandoutSlipData }) {
  const { job } = slip;
  const worker = [...field("العامل المستلم", slip.workerName), ...field("رقم التسجيل", <Num>{slip.workerNumber}</Num>)];

  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <SheetHeading
        title="وصل تسليم"
        references={[
          { label: "رقم الوصل", value: <Num>{slip.number}</Num> },
          { label: "التاريخ", value: <DateText value={slip.date} /> },
        ]}
      />
      <Gap mm={3} />

      {slip.cancelled && (
        <p style={{ ...TYPE.heading, border: "2.25pt solid #000", padding: "1.5mm 4mm", marginBottom: "3mm" }}>
          وصل ملغى بتاريخ <DateText value={slip.cancelled.date} />. السبب: {slip.cancelled.reason}
        </p>
      )}

      {job ? (
        <FieldTable
          heading="المستلم والمهمة"
          widths={[32, 61.65, 32, 61.65]}
          fontSize={DENSE}
          rowHeightMm={6.5}
          rows={[
            worker,
            [...field("رقم الملف", <Num>{job.fileNumber}</Num>), ...field("العميل", job.clientName)],
            [
              ...field("القسم", DIVISION_LABEL[job.division]),
              ...field(
                "نوع الخدمة",
                <span style={{ display: "inline-flex", columnGap: "6mm" }}>
                  {SERVICE_TYPES.map((type) => (
                    <TickBox key={type} checked={type === job.serviceType}>
                      {SERVICE_TYPE_LABEL[type]}
                    </TickBox>
                  ))}
                </span>,
              ),
            ],
            [
              ...field("العنوان", job.siteAddress),
              ...field("تاريخ الزيارة", job.visitDate ? <DateText value={job.visitDate} /> : <DottedBlank fill />),
            ],
          ]}
        />
      ) : (
        <FieldTable
          heading="المستلم والغرض"
          widths={[32, 61.65, 32, 61.65]}
          fontSize={DENSE}
          rowHeightMm={6.5}
          rows={[
            worker,
            [
              { content: "الغرض", label: true },
              { content: "تجهيز العامل (خارج أي مهمة)", span: 3 },
            ],
          ]}
        />
      )}
      <Gap mm={2.5} />

      {STOCK_KINDS.map((kind) => {
        const lines = slip.lines.filter((line) => line.kind === kind);
        return lines.length > 0 ? (
          <div key={kind} style={{ marginBottom: "2.5mm" }}>
            <LinesTable kind={kind} lines={lines} />
          </div>
        ) : null;
      })}

      <FieldTable
        heading="معدات الوقاية"
        widths={[187.3]}
        fontSize={DENSE}
        rowHeightMm={6.5}
        rows={[
          [
            {
              content: (
                <span style={{ display: "inline-flex", flexWrap: "wrap", columnGap: "6mm", rowGap: "0.8mm" }}>
                  {PPE.map((item) => (
                    <TickBox key={item} checked={slip.ppe.includes(item)}>
                      {PPE_LABEL[item]}
                    </TickBox>
                  ))}
                </span>
              ),
            },
          ],
        ]}
      />

      {slip.note && (
        <p style={{ ...CELL, marginTop: "2mm" }}>
          <span style={TYPE.label}>ملاحظات: </span>
          {slip.note}
        </p>
      )}
      <Gap mm={3} />

      <KeepTogether>
        <p style={{ ...TYPE.small, fontSize: "10.5pt", border: "0.75pt solid #000", padding: "1.2mm 3mm" }}>
          {REGULATIONS_ARTICLE_5}
        </p>
        <Gap mm={3} />
        <SignatureBlock
          place={slip.place}
          date={slip.date}
          boxes={[`إمضاء المسلِّم: ${slip.handedByName}`, "إمضاء المستلم (العامل)"]}
          boxHeightMm={20}
        />
      </KeepTogether>
    </PrintSheet>
  );
}
