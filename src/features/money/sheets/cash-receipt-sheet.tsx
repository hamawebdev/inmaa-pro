import { LETTERHEAD } from "@/assets/letterhead/placement";
import { DottedBlank, PageBreak, PrintSheet, SheetCell, SheetRow, SheetTable } from "@/components/print";

import type { Centimes } from "../rules/centimes";
import type { IsoDate } from "../rules/dates";
import type { CollectorKind } from "../validators/option-codes";

import type { SellerSnapshot } from "./invoice-sheet";
import { CURRENCY } from "./print-labels";
import { Amount, CopyMark, DateText, Gap, Num, SheetHeading, VoidMark, VoidStamp } from "./sheet-parts";
import { TYPE } from "./sheet-style";

/**
 * «سند قبض»: the receipt for money taken in cash (plan feature 32).
 *
 * His regulations, article 12: a worker takes money from a client only when
 * officially authorised, «مع توثيق أي مبلغ مستلم». This sheet is that record.
 *
 * One A4 page carries the receipt twice, to be cut in two: the client's copy
 * and the centre's. Both bear the same number, from the unbroken yearly
 * sequence. Each copy has his letterhead at its own top, since the page's
 * letterhead would mark only one of them.
 *
 * Two uses of the same sheet:
 *
 *  - **Filled** (`payment` given): printed at the office when the money is
 *    received, or to hand a collector a receipt already made out.
 *  - **Blank** (`payment` empty): a numbered receipt handed to an authorised
 *    collector before the round, filled in by hand at the client's and brought
 *    back the same day. The scale of the stamp duty is printed on it, because
 *    the collector works it out on the spot.
 *
 * Stamp duty is charged on what is paid in cash and shown on its own line;
 * the total is what the client hands over.
 */

export interface CashReceiptPayment {
  /** «استلمنا من». */
  payerName: string;
  /** The amount settled, stamp duty not included. */
  amount: Centimes;
  stampDuty: Centimes;
  /** What the client hands over: amount + stamp duty. */
  total: Centimes;
  amountWordsAr: string;
  amountWordsFr: string;
  /** What it pays: the invoice, the period. */
  reason: string;
}

export interface CashReceiptData {
  /** `000045/2026`. */
  number: string;
  /** The day it is drawn up; empty on a blank one, to be written by hand. */
  issueDate: IsoDate | null;
  seller: SellerSnapshot;
  /** Known for office receipts and for receipts made out for one file. */
  fileNumber: string | null;
  clientName: string | null;
  collectorKind: CollectorKind;
  /** The collector's name; the office's cashier for `OFFICE`. */
  collectorName: string;
  /** His registration number, for a worker or an employee. */
  collectorNumber: string | null;
  /** Empty for a blank receipt. */
  payment: CashReceiptPayment | null;
  /** The scale printed on a blank receipt, as one sentence. */
  stampScaleNote: string;
  /** Set when the receipt was voided. */
  voided: { date: IsoDate; reason: string } | null;
  /** Printed on the laptop that does not hold the books: a copy, marked «نسخة» (not one of the two halves). */
  copy?: boolean;
}

const COPIES = ["نسخة العميل", "نسخة المركز"] as const;

const COLLECTOR_TITLE: Record<CollectorKind, string> = {
  OFFICE: "أمين الصندوق",
  EMPLOYEE: "المحصِّل (موظف مخوَّل)",
  WORKER: "المحصِّل (عامل مخوَّل)",
};

/** The width his header picture is drawn at on a half page: a little narrower than the text, centred. */
const COPY_HEADER_WIDTH_MM = 160;

/** His header picture, stretched as his Word files stretch it. */
function CopyLetterhead() {
  const header = LETTERHEAD.client.header;
  const height = (COPY_HEADER_WIDTH_MM * header.heightMm) / header.widthMm;
  return (
    <img
      src={header.src}
      alt=""
      style={{ display: "block", width: `${COPY_HEADER_WIDTH_MM}mm`, height: `${height}mm`, margin: "0 auto" }}
    />
  );
}

/** The centre's address and telephone, then its identifiers: the receipt is a record of the centre's. */
function Identifiers({ seller }: { seller: SellerSnapshot }) {
  const codes = (
    [
      ["RC", seller.rc],
      ["NIS", seller.nis],
      ["NIF", seller.nif],
      ["AI", seller.articleNumber],
    ] as const
  ).filter(([, value]) => value);
  const line = { ...TYPE.small, fontSize: "9.5pt", textAlign: "center" } as const;
  return (
    <div style={{ marginTop: "0.6mm" }}>
      <p style={line}>
        {seller.nameAr}
        {seller.address && <> — {seller.address}</>}
        {seller.phone && (
          <>
            {" — "}
            <Num>{seller.phone}</Num>
          </>
        )}
      </p>
      {codes.length > 0 && (
        <p style={line}>
          {codes.map(([label, value], index) => (
            <span key={label}>
              {index > 0 && " — "}
              <Num>
                {label}: {value}
              </Num>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** A figure, or a blank to write it in. */
function AmountOrBlank({ value }: { value: Centimes | undefined }) {
  return value === undefined ? (
    <DottedBlank fill />
  ) : (
    <>
      <Amount value={value} /> {CURRENCY}
    </>
  );
}

function ReceiptCopy({ receipt, copy }: { receipt: CashReceiptData; copy: string }) {
  const payment = receipt.payment ?? undefined;
  const label = { ...TYPE.label, fontSize: "11.5pt" };
  const body = { ...TYPE.body, fontSize: "11.5pt" };
  // A blank is filled in by hand: its rows leave room for handwriting. A voided one is not.
  const blank = !payment && !receipt.voided;
  const row = blank ? 8 : 7;

  return (
    // Half a page each, so that the cut falls near the middle.
    <div style={{ minHeight: "136mm", position: "relative" }}>
      {receipt.voided ? <VoidStamp word="ملغى" /> : receipt.copy && <VoidStamp word="نسخة" />}
      <CopyLetterhead />
      <Identifiers seller={receipt.seller} />
      <Gap mm={1.5} />
      <SheetHeading
        compact
        title="سند قبض"
        references={[
          { label: "رقم السند", value: <Num>{receipt.number}</Num> },
          {
            label: "التاريخ",
            value: receipt.issueDate ? <DateText value={receipt.issueDate} /> : <DottedBlank widthMm={38} />,
          },
        ]}
      />
      <Gap mm={2} />
      {receipt.voided && (
        <VoidMark word="ملغى" what="هذا السند" reason={receipt.voided.reason} date={receipt.voided.date} />
      )}
      {receipt.copy && <CopyMark what="من السند الأصلي" />}

      <SheetTable columns={[46, 54, 32, 55.3]}>
        <SheetRow heightMm={row}>
          <SheetCell style={label}>استلمنا من</SheetCell>
          <SheetCell style={body}>{payment ? payment.payerName : <DottedBlank fill />}</SheetCell>
          <SheetCell style={label}>رقم الملف</SheetCell>
          <SheetCell style={body}>
            {receipt.fileNumber ? <Num>{receipt.fileNumber}</Num> : <DottedBlank fill />}
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={row}>
          <SheetCell style={label}>العميل</SheetCell>
          <SheetCell colSpan={3} style={body}>
            {receipt.clientName ?? <DottedBlank fill />}
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={row}>
          <SheetCell style={label}>المبلغ</SheetCell>
          <SheetCell style={body}>
            <AmountOrBlank value={payment?.amount} />
          </SheetCell>
          <SheetCell style={label}>حق الطابع</SheetCell>
          <SheetCell style={body}>
            <AmountOrBlank value={payment?.stampDuty} />
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={row}>
          <SheetCell shaded style={label}>
            المجموع المقبوض نقدًا
          </SheetCell>
          <SheetCell shaded colSpan={3} style={TYPE.heading}>
            <AmountOrBlank value={payment?.total} />
          </SheetCell>
        </SheetRow>
        <SheetRow heightMm={row}>
          <SheetCell style={label}>المبلغ بالحروف</SheetCell>
          <SheetCell colSpan={3} style={body}>
            {payment ? `${payment.amountWordsAr}.` : <DottedBlank fill />}
          </SheetCell>
        </SheetRow>
        {payment && (
          <SheetRow heightMm={row}>
            <SheetCell colSpan={4} style={{ ...body, fontSize: "10.5pt", direction: "ltr", textAlign: "left" }}>
              <span lang="fr">{payment.amountWordsFr}.</span>
            </SheetCell>
          </SheetRow>
        )}
        <SheetRow heightMm={row}>
          <SheetCell style={label}>وذلك مقابل</SheetCell>
          <SheetCell colSpan={3} style={body}>
            {payment ? payment.reason : <DottedBlank fill />}
          </SheetCell>
        </SheetRow>
      </SheetTable>

      {blank && <p style={{ ...TYPE.small, fontSize: "9.5pt", marginTop: "1mm" }}>{receipt.stampScaleNote}</p>}
      <Gap mm={2} />

      <SheetTable columns={[62.4, 62.4, 62.5]}>
        <SheetRow heightMm={6.5}>
          {[COLLECTOR_TITLE[receipt.collectorKind], "إمضاء الدافع", "ختم المركز"].map((title) => (
            <SheetCell key={title} shaded align="center" style={label}>
              {title}
            </SheetCell>
          ))}
        </SheetRow>
        <SheetRow heightMm={blank ? 16 : 15}>
          <SheetCell align="center" style={{ ...TYPE.small, verticalAlign: "top" }}>
            {receipt.collectorName}
            {receipt.collectorNumber && (
              <>
                {" — "}
                <Num>{receipt.collectorNumber}</Num>
              </>
            )}
          </SheetCell>
          <SheetCell />
          <SheetCell />
        </SheetRow>
      </SheetTable>
      <p style={{ ...TYPE.small, textAlign: "center", marginTop: "0.6mm" }}>{copy}</p>
    </div>
  );
}

/** The receipt's two copies, the client's above the centre's, with the line to cut along between them. */
function ReceiptPair({ receipt }: { receipt: CashReceiptData }) {
  return (
    <>
      <ReceiptCopy receipt={receipt} copy={COPIES[0]} />
      <div style={{ borderTop: "0.75pt dashed #000", margin: "3mm 0", position: "relative" }}>
        <span
          style={{
            ...TYPE.small,
            position: "absolute",
            top: "-2.6mm",
            insetInlineStart: "8mm",
            background: "#fff",
            padding: "0 2mm",
          }}
        >
          يُقص هنا
        </span>
      </div>
      <ReceiptCopy receipt={receipt} copy={COPIES[1]} />
    </>
  );
}

/** No page letterhead: each copy carries its own. Side margins as his client forms. */
const RECEIPT_MARGINS = { top: 7, right: 10, bottom: 6, left: 12.7 };

export function CashReceiptSheet({ receipt }: { receipt: CashReceiptData }) {
  return (
    <PrintSheet margins={RECEIPT_MARGINS}>
      <ReceiptPair receipt={receipt} />
    </PrintSheet>
  );
}

/** A block of numbered blank receipts for a collector: one A4 page per receipt, both copies on it. */
export function CashReceiptBatchSheet({ receipts }: { receipts: readonly CashReceiptData[] }) {
  return (
    <PrintSheet margins={RECEIPT_MARGINS}>
      {receipts.flatMap((receipt, index) => [
        index > 0 ? <PageBreak key={`break-${receipt.number}`} /> : null,
        <ReceiptPair key={receipt.number} receipt={receipt} />,
      ])}
    </PrintSheet>
  );
}
