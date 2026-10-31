import {
  KeepTogether,
  PageBreak,
  PrintSheet,
  SHEET_MARGINS_CLEAR_OF_LETTERHEAD,
  SheetCell,
  SheetRow,
  SheetTable,
  TickBox,
} from "@/components/print";

import type { BasisPoints, Centimes } from "../rules/centimes";
import type { IsoDate } from "../rules/dates";
import { formatQuantity, type Thousandths } from "../rules/quantities";
import {
  PAYMENT_METHODS,
  type Division,
  type InvoiceLineKind,
  type PaymentMethod,
  type ServiceType,
  type TaxMode,
} from "../validators/option-codes";

import { CURRENCY, DIVISION_LABEL, PAYMENT_METHOD_LABEL, SERVICE_TYPE_LABEL } from "./print-labels";
import {
  Amount,
  CopyMark,
  DateText,
  FieldTable,
  Gap,
  Num,
  SheetHeading,
  SignatureBlock,
  VoidMark,
  VoidStamp,
} from "./sheet-parts";
import { field, TYPE, type FieldCell } from "./sheet-style";
import { VisitStatementBody, type VisitStatementData } from "./visit-statement-sheet";

/**
 * «فاتورة»: the invoice (plan features 19 and 31).
 *
 * He has no Word invoice, so the sheet follows the style of his forms and
 * carries what Executive Decree 05-468 requires, as the build notes list it:
 *
 *  - the seller: name, legal form, address, trade register (RC), statistical
 *    number (NIS), tax number (NIF) and article number;
 *  - the buyer: name and address, and for a business the same identifiers;
 *  - a number from the unbroken yearly sequence, and the date;
 *  - each service with its quantity, unit price and amount; discounts;
 *  - the total before tax, the tax with its rate, the total with tax; or, under
 *    the single flat tax (IFU), one total, no VAT, and the mention that says so;
 *  - stamp duty when it is paid in cash;
 *  - the amount to pay in words, in Arabic and in French;
 *  - the method of payment and the due date;
 *  - the place for the signature and the stamp.
 *
 * Every figure is printed as it was frozen when the invoice was issued; the
 * sheet computes nothing. A voided invoice is still printable, marked.
 *
 * With `statement`, the visit statement follows on its own page.
 */

/** The centre as it stood when the invoice was issued. */
export interface SellerSnapshot {
  nameAr: string;
  nameLatin: string | null;
  legalForm: string | null;
  address: string | null;
  phone: string | null;
  rc: string | null;
  nis: string | null;
  nif: string | null;
  nin: string | null;
  articleNumber: string | null;
  bankName: string | null;
  bankAccount: string | null;
  ccpNumber: string | null;
  ccpKey: string | null;
  /** «حررت: ب…», frozen at issue (INV-7). Absent on a document written before it was frozen. */
  city?: string | null;
}

/** The client as it stood when the invoice was issued. */
export interface BuyerSnapshot {
  name: string;
  legalForm: string | null;
  address: string | null;
  commune: string | null;
  wilayaCode: string | null;
  /** «السجل التجاري: نعم / لا» on his organisation forms. A business prints its identifiers. */
  hasTradeRegister: boolean;
  rc: string | null;
  nis: string | null;
  nif: string | null;
  articleNumber: string | null;
  /** «مسدد أتعاب» and his phone. */
  payerName: string | null;
  payerPhone: string | null;
  /** The site's address with its commune, and the file's number, as the visit statement prints them (INV-X1). */
  siteAddress?: string | null;
  fileNumber?: string | null;
}

export interface InvoiceSheetLine {
  seq: number;
  kind: InvoiceLineKind;
  description: string;
  quantity: Thousandths;
  /** «زيارة», «شهر», «أسبوع», «خدمة». */
  unitLabel: string;
  unitPrice: Centimes;
  /** Negative for a missed visit, a discount, a deposit. */
  amount: Centimes;
}

export interface InvoiceSheetData {
  /** `000012/2026`. */
  number: string;
  issueDate: IsoDate;
  /** Where it is drawn up: «أم البواقي». */
  place: string;
  fileNumber: string;
  division: Division;
  serviceType: ServiceType;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
  lines: readonly InvoiceSheetLine[];
  taxMode: TaxMode;
  vatRate: BasisPoints;
  pricesIncludeVat: boolean;
  grossAmount: Centimes;
  discountAmount: Centimes;
  totalHT: Centimes;
  vatAmount: Centimes;
  totalTTC: Centimes;
  paymentMethod: PaymentMethod;
  stampDuty: Centimes;
  netToPay: Centimes;
  amountWordsAr: string;
  amountWordsFr: string;
  dueDate: IsoDate;
  paymentPlace: string | null;
  /** The mention printed in place of VAT under IFU, in both languages. */
  ifuMention: { ar: string; fr: string } | null;
  note: string | null;
  /** Set when the invoice was voided. */
  voided: { date: IsoDate; reason: string } | null;
  /** Printed on the laptop that does not hold the books: a copy, marked «نسخة». */
  copy?: boolean;
}

/** A value, or a dash where the centre or the client has none. */
function orDash(value: string | null | undefined, ltr = false): React.ReactNode {
  if (!value) return "—";
  return ltr ? <Num>{value}</Num> : value;
}

type Pair = readonly [FieldCell, FieldCell];

/** A label and its value across the whole row. */
function wide([label, value]: Pair): FieldCell[] {
  return [label, { ...value, span: 3 }];
}

/** Two pairs to a row; an odd last pair runs to the end of its row. */
function inPairs(pairs: readonly Pair[]): FieldCell[][] {
  const rows: FieldCell[][] = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const second = pairs[index + 1];
    rows.push(second ? [...pairs[index], ...second] : wide(pairs[index]));
  }
  return rows;
}

function sellerRows(seller: SellerSnapshot): FieldCell[][] {
  const name = seller.nameLatin ? (
    <>
      {seller.nameAr} (<bdi>{seller.nameLatin}</bdi>)
    </>
  ) : (
    seller.nameAr
  );
  return [
    wide(field("الاسم", name)),
    wide(field("العنوان", orDash(seller.address))),
    ...inPairs([
      field("الشكل القانوني", orDash(seller.legalForm)),
      field("رقم الهاتف", orDash(seller.phone, true)),
      field("السجل التجاري (RC)", orDash(seller.rc, true)),
      field("التعريف الإحصائي (NIS)", orDash(seller.nis, true)),
      field("التعريف الجبائي (NIF)", orDash(seller.nif, true)),
      field("رقم المادة (AI)", orDash(seller.articleNumber, true)),
      ...(seller.nin ? [field("التعريف الوطني (NIN)", <Num>{seller.nin}</Num>)] : []),
    ]),
  ];
}

function buyerRows(buyer: BuyerSnapshot): FieldCell[][] {
  const address = [buyer.address, buyer.commune].filter(Boolean).join("، ");
  // A household is a consumer: the decree asks for its name and address only.
  const business = buyer.hasTradeRegister || Boolean(buyer.rc || buyer.nis || buyer.nif);
  const name = field("الاسم", buyer.name);
  return [
    buyer.legalForm ? [...name, ...field("الشكل القانوني", buyer.legalForm)] : wide(name),
    wide(field("العنوان", orDash(address))),
    ...(business
      ? inPairs([
          field("السجل التجاري (RC)", orDash(buyer.rc, true)),
          field("التعريف الإحصائي (NIS)", orDash(buyer.nis, true)),
          field("التعريف الجبائي (NIF)", orDash(buyer.nif, true)),
          field("رقم المادة (AI)", orDash(buyer.articleNumber, true)),
        ])
      : []),
    [...field("مسدد أتعاب", orDash(buyer.payerName)), ...field("رقم الهاتف", orDash(buyer.payerPhone, true))],
  ];
}

/** The centre's postal account as it is written: `CCP 0000000000 / 00`, or a dash. */
export function CcpAccount({ seller }: { seller: SellerSnapshot }) {
  if (!seller.ccpNumber) return "—";
  return <Num>{seller.ccpKey ? `CCP ${seller.ccpNumber} / ${seller.ccpKey}` : `CCP ${seller.ccpNumber}`}</Num>;
}

/** A rate in basis points as a percentage: 1900 → `19`. */
function percent(rate: BasisPoints): string {
  return formatQuantity(rate * 10);
}

/** The dense tables of the invoice: 11 points, so that a usual invoice keeps its signature on page one. */
const DENSE = "11pt";
const DENSE_ROW_MM = 6.2;

function TotalsTable({ invoice }: { invoice: InvoiceSheetData }) {
  const rows: { label: React.ReactNode; key: string; value: Centimes; strong?: boolean }[] = [];
  if (invoice.discountAmount > 0) {
    rows.push({ key: "gross", label: "قيمة الخدمة", value: invoice.grossAmount });
    rows.push({ key: "discount", label: "الخصم", value: -invoice.discountAmount });
  }
  if (invoice.taxMode === "VAT") {
    rows.push({ key: "ht", label: "المجموع خارج الرسم", value: invoice.totalHT });
    rows.push({
      key: "vat",
      // After Arabic letters a figure's "%" would jump to its left: the rate is kept whole.
      label: (
        <>
          الرسم على القيمة المضافة (<Num>{percent(invoice.vatRate)}%</Num>)
        </>
      ),
      value: invoice.vatAmount,
    });
    rows.push({ key: "ttc", label: "المبلغ المستحق بكل الرسوم", value: invoice.totalTTC });
  } else {
    rows.push({ key: "ttc", label: "المبلغ المستحق", value: invoice.totalTTC });
  }
  if (invoice.paymentMethod === "CASH") rows.push({ key: "stamp", label: "حق الطابع", value: invoice.stampDuty });
  rows.push({ key: "net", label: "الصافي للدفع", value: invoice.netToPay, strong: true });

  const label = { ...TYPE.label, fontSize: DENSE };
  return (
    <SheetTable columns={[55, 33]}>
      <SheetRow heightMm={DENSE_ROW_MM}>
        <SheetCell shaded colSpan={2} style={TYPE.heading}>
          المبالغ ({CURRENCY})
        </SheetCell>
      </SheetRow>
      {rows.map((row) => (
        <SheetRow key={row.key} heightMm={DENSE_ROW_MM}>
          <SheetCell shaded={row.strong} style={row.strong ? TYPE.heading : label}>
            {row.label}
          </SheetCell>
          <SheetCell shaded={row.strong} align="end" style={row.strong ? TYPE.heading : TYPE.body}>
            <Amount value={row.value} />
          </SheetCell>
        </SheetRow>
      ))}
    </SheetTable>
  );
}

function TermsTable({ invoice }: { invoice: InvoiceSheetData }) {
  const { seller } = invoice;
  return (
    <FieldTable
      heading="التسديد"
      widths={[33, 64]}
      fontSize={DENSE}
      rowHeightMm={DENSE_ROW_MM}
      rows={[
        field(
          "طريقة السداد",
          // The box after its label, as «طريقة السداد» is on his forms.
          <span style={{ display: "inline-flex", flexWrap: "wrap", columnGap: "2.5mm" }}>
            {PAYMENT_METHODS.map((method) => (
              <TickBox key={method} side="after" checked={method === invoice.paymentMethod}>
                {PAYMENT_METHOD_LABEL[method]}
              </TickBox>
            ))}
          </span>,
        ),
        field("تاريخ التسديد", <DateText value={invoice.dueDate} />),
        field("مكان التسديد", orDash(invoice.paymentPlace)),
        field(
          "الحساب البنكي",
          seller.bankAccount ? (
            <>
              {seller.bankName} <Num>{seller.bankAccount}</Num>
            </>
          ) : (
            "—"
          ),
        ),
        field("الحساب البريدي", <CcpAccount seller={seller} />),
      ]}
    />
  );
}

/** Label, value, label, value across the text width. */
const PARTY_WIDTHS = [46, 47.65, 46, 47.65] as const;

/** The invoice without its paper. */
function InvoiceBody({ invoice }: { invoice: InvoiceSheetData }) {
  const sideBySide = { display: "flex", alignItems: "flex-start", justifyContent: "space-between" } as const;

  return (
    <div style={{ position: "relative" }}>
      {invoice.voided ? <VoidStamp word="ملغاة" /> : invoice.copy && <VoidStamp word="نسخة" />}
      <SheetHeading
        title="فاتورة"
        references={[
          { label: "رقم الفاتورة", value: <Num>{invoice.number}</Num> },
          { label: "تاريخ الفاتورة", value: <DateText value={invoice.issueDate} /> },
        ]}
      />
      <Gap mm={3} />
      {invoice.voided && (
        <VoidMark word="ملغاة" what="هذه الفاتورة" reason={invoice.voided.reason} date={invoice.voided.date} />
      )}
      {invoice.copy && <CopyMark what="من الفاتورة الأصلية" />}

      <FieldTable
        heading="مقدم الخدمة"
        widths={PARTY_WIDTHS}
        rows={sellerRows(invoice.seller)}
        fontSize={DENSE}
        rowHeightMm={DENSE_ROW_MM}
      />
      <Gap mm={2} />
      <FieldTable
        heading="العميل"
        widths={PARTY_WIDTHS}
        rows={buyerRows(invoice.buyer)}
        fontSize={DENSE}
        rowHeightMm={DENSE_ROW_MM}
      />
      <Gap mm={2} />

      <FieldTable
        widths={[24, 38, 20, 40, 24, 41.3]}
        fontSize={DENSE}
        rowHeightMm={DENSE_ROW_MM}
        rows={[
          [
            ...field("رقم الملف", <Num>{invoice.fileNumber}</Num>),
            ...field("القسم", DIVISION_LABEL[invoice.division]),
            ...field("نوع الخدمة", SERVICE_TYPE_LABEL[invoice.serviceType]),
          ],
          ...(invoice.periodStart && invoice.periodEnd
            ? [
                [
                  { content: "الفترة", label: true },
                  {
                    content: (
                      <>
                        من <DateText value={invoice.periodStart} /> إلى <DateText value={invoice.periodEnd} />
                      </>
                    ),
                    span: 5,
                  },
                ],
              ]
            : []),
        ]}
      />
      <Gap mm={2} />

      <SheetTable columns={[14, 79.3, 18, 18, 29, 29]}>
        <SheetRow heightMm={8}>
          {[
            "الرقم",
            "البيان",
            "الكمية",
            "الوحدة",
            // Under VAT the lines are before tax (Decree 05-468); under the IFU there is no tax to say.
            invoice.taxMode === "VAT" ? `سعر الوحدة خارج الرسم (${CURRENCY})` : `سعر الوحدة (${CURRENCY})`,
            invoice.taxMode === "VAT" ? `المبلغ خارج الرسم (${CURRENCY})` : `المبلغ (${CURRENCY})`,
          ].map((label) => (
            <SheetCell key={label} shaded align="center" style={{ ...TYPE.label, fontSize: DENSE }}>
              {label}
            </SheetCell>
          ))}
        </SheetRow>
        {invoice.lines.map((line) => (
          <SheetRow key={line.seq} heightMm={7}>
            <SheetCell align="center" style={TYPE.body}>
              <Num>{line.seq}</Num>
            </SheetCell>
            <SheetCell style={TYPE.body}>{line.description}</SheetCell>
            <SheetCell align="center" style={TYPE.body}>
              <Num>{formatQuantity(line.quantity)}</Num>
            </SheetCell>
            <SheetCell align="center" style={TYPE.body}>
              {line.unitLabel}
            </SheetCell>
            <SheetCell align="end" style={TYPE.body}>
              <Amount value={line.unitPrice} />
            </SheetCell>
            <SheetCell align="end" style={TYPE.body}>
              <Amount value={line.amount} />
            </SheetCell>
          </SheetRow>
        ))}
      </SheetTable>
      <Gap mm={2} />

      <KeepTogether>
        <div style={sideBySide}>
          <TermsTable invoice={invoice} />
          <TotalsTable invoice={invoice} />
        </div>
        <Gap mm={2} />

        <SheetTable columns={[187.3]}>
          <SheetRow heightMm={DENSE_ROW_MM}>
            <SheetCell style={{ ...TYPE.body, fontSize: DENSE }}>
              <span style={TYPE.label}>أوقفت هذه الفاتورة عند مبلغ: </span>
              {invoice.amountWordsAr}.
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={DENSE_ROW_MM}>
            <SheetCell style={{ ...TYPE.body, fontSize: DENSE, direction: "ltr", textAlign: "left" }}>
              <span lang="fr">Arrêtée la présente facture à la somme de : {invoice.amountWordsFr}.</span>
            </SheetCell>
          </SheetRow>
          {invoice.taxMode === "IFU" && invoice.ifuMention && (
            <SheetRow heightMm={DENSE_ROW_MM}>
              <SheetCell align="center" style={TYPE.small}>
                {invoice.ifuMention.ar} <span style={{ padding: "0 2mm" }}>|</span>
                <bdi dir="ltr" lang="fr">
                  {invoice.ifuMention.fr}
                </bdi>
              </SheetCell>
            </SheetRow>
          )}
        </SheetTable>
      </KeepTogether>

      {invoice.note && (
        <p style={{ ...TYPE.body, fontSize: DENSE, marginTop: "2mm" }}>
          <span style={TYPE.label}>ملاحظة: </span>
          {invoice.note}
        </p>
      )}
      <Gap mm={3.5} />

      <SignatureBlock place={invoice.place} date={invoice.issueDate} boxes={["الإمضاء والختم"]} boxHeightMm={24} />
    </div>
  );
}

export function InvoiceSheet({
  invoice,
  statement,
}: {
  invoice: InvoiceSheetData;
  /** The visit statement of a contract invoice. It follows on its own page. */
  statement?: VisitStatementData | null;
}) {
  return (
    // The invoice may run onto a second page by itself (many lines), so its
    // margins keep the text clear of the letterhead on every page.
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <InvoiceBody invoice={invoice} />
      {statement && <PageBreak />}
      {statement && <VisitStatementBody data={statement} />}
    </PrintSheet>
  );
}
