import { amountInWordsAr } from "../rules/amount-in-words-ar";
import { amountInWordsFr } from "../rules/amount-in-words-fr";
import { computeInvoiceTotals, missedVisitDeduction, visitPrice } from "../rules/invoice-totals";
import { DEFAULT_STAMP_SETTINGS, stampDuty } from "../rules/stamp-duty";
import type { PaymentMethod, TaxMode } from "../validators/option-codes";

import type { CashReceiptData } from "./cash-receipt-sheet";
import type { BuyerSnapshot, InvoiceSheetData, InvoiceSheetLine, SellerSnapshot } from "./invoice-sheet";
import type { PaymentReminderData, ReminderItem } from "./payment-reminder-sheet";
import { DEFAULT_PLACE } from "./print-labels";
import { stampScaleNote } from "./stamp-scale-note";
import type { VisitStatementData, VisitStatementRow } from "./visit-statement-sheet";

/**
 * Sample objects for Money's sheets, so that each sheet can be seen and
 * printed before the services that will feed it exist.
 *
 * The figures are not typed in: they come out of the same rules the services
 * will use (totals, stamp duty, the amount in words), so a sample sheet is
 * also a check of those rules on paper. The amounts are the worked examples of
 * the study.
 *
 * Everything that would identify a real person or the centre's tax file is
 * invented and plainly so (identifiers are rows of zeros). The page that shows
 * a sample says it is one. This file goes when the print pages read real
 * records.
 */

const da = (dinars: number) => Math.round(dinars * 100);
const IFU_MENTION = {
  ar: "غير خاضع للرسم على القيمة المضافة – نظام الضريبة الجزافية الوحيدة",
  fr: "Non assujetti à la TVA – régime de l'IFU",
};

export const SAMPLE_SELLER: SellerSnapshot = {
  nameAr: "مركز إنماء برو",
  nameLatin: "UNMAA Pro Center",
  legalForm: "مؤسسة فردية",
  address: "أم البواقي",
  phone: "06 59 53 81 83",
  rc: "04/00-0000000 A 00",
  nis: "000000000000000",
  nif: "000000000000000",
  nin: null,
  articleNumber: "04000000000",
  bankName: "البنك (نموذج)",
  bankAccount: "000 00000 0000000000 00",
  ccpNumber: "0000000000",
  ccpKey: "00",
};

const BUILDING: BuyerSnapshot = {
  name: "عمارة الياسمين (ممثل السكان)",
  legalForm: null,
  address: "حي 200 مسكن، عمارة 12",
  commune: "أم البواقي",
  wilayaCode: "04",
  hasTradeRegister: false,
  rc: null,
  nis: null,
  nif: null,
  articleNumber: null,
  payerName: "رشيد بوزيد",
  payerPhone: "0661 20 31 42",
};

const ORGANISATION: BuyerSnapshot = {
  name: "مؤسسة النور للتجارة",
  legalForm: "ش.ذ.م.م",
  address: "المنطقة الصناعية، قطعة 14",
  commune: "أم البواقي",
  wilayaCode: "04",
  hasTradeRegister: true,
  rc: "04/00-1111111 B 20",
  nis: "111111111111111",
  nif: "111111111111111",
  articleNumber: "04111111111",
  payerName: "مصلحة المحاسبة",
  payerPhone: "032 00 00 00",
};

const HOUSEHOLD: BuyerSnapshot = {
  name: "كريم بن عيسى",
  legalForm: null,
  address: "حي النصر، رقم 27",
  commune: "أم البواقي",
  wilayaCode: "04",
  hasTradeRegister: false,
  rc: null,
  nis: null,
  nif: null,
  articleNumber: null,
  payerName: "كريم بن عيسى",
  payerPhone: "0770 11 22 33",
};

/** An invoice from its lines and its terms: the totals and the words are computed, as a service will. */
function invoice(
  base: Omit<
    InvoiceSheetData,
    | "seller"
    | "place"
    | "taxMode"
    | "vatRate"
    | "pricesIncludeVat"
    | "grossAmount"
    | "discountAmount"
    | "totalHT"
    | "vatAmount"
    | "totalTTC"
    | "paymentMethod"
    | "stampDuty"
    | "netToPay"
    | "amountWordsAr"
    | "amountWordsFr"
    | "ifuMention"
    | "voided"
    | "note"
  > & { note?: string | null; voided?: InvoiceSheetData["voided"] },
  terms: { taxMode: TaxMode; pricesIncludeVat: boolean; paymentMethod: PaymentMethod },
): InvoiceSheetData {
  const totals = computeInvoiceTotals({
    lineAmounts: base.lines.map((line) => line.amount),
    taxMode: terms.taxMode,
    vatRate: 1900,
    pricesIncludeVat: terms.pricesIncludeVat,
    paymentMethod: terms.paymentMethod,
    stamp: DEFAULT_STAMP_SETTINGS,
  });
  return {
    note: null,
    voided: null,
    ...base,
    place: DEFAULT_PLACE,
    seller: SAMPLE_SELLER,
    taxMode: terms.taxMode,
    pricesIncludeVat: terms.pricesIncludeVat,
    paymentMethod: terms.paymentMethod,
    ...totals,
    amountWordsAr: amountInWordsAr(totals.netToPay),
    amountWordsFr: amountInWordsFr(totals.netToPay),
    ifuMention: terms.taxMode === "IFU" ? IFU_MENTION : null,
  };
}

/** November 2026, Saturday, Monday and Wednesday: 13 planned visits, one of them missed. */
const NOVEMBER_VISITS: [day: number, name: string][] = [
  [2, "الاثنين"],
  [4, "الأربعاء"],
  [7, "السبت"],
  [9, "الاثنين"],
  [11, "الأربعاء"],
  [14, "السبت"],
  [16, "الاثنين"],
  [18, "الأربعاء"],
  [21, "السبت"],
  [23, "الاثنين"],
  [25, "الأربعاء"],
  [28, "السبت"],
  [30, "الاثنين"],
];
const MISSED_DAY = 18;
const PARTIAL_DAY = 9;

function novemberRows(withMissed: boolean): VisitStatementRow[] {
  return NOVEMBER_VISITS.map(([day, dayName], index) => {
    const missed = withMissed && day === MISSED_DAY;
    const partial = day === PARTIAL_DAY;
    return {
      seq: index + 1,
      visitDate: `2026-11-${String(day).padStart(2, "0")}`,
      dayName,
      arrival: missed ? null : "08:00",
      departure: missed ? null : partial ? "11:15" : "12:00",
      workersCount: missed ? 0 : 1,
      workedMin: missed ? null : partial ? 195 : 240,
      completion: missed ? "لم تكتمل" : partial ? "مكتملة جزئياً" : "مكتملة بالكامل",
      signOff: missed ? null : partial ? "تم قبولها مع ملاحظات" : "تم قبول الخدمة",
      signedBy: missed ? null : "رشيد بوزيد",
      billable: !missed,
      remark: missed ? "غياب دون استبدال" : partial ? "المصعد معطل" : null,
    };
  });
}

function monthlyLines(amount: number, missed: number): InvoiceSheetLine[] {
  const planned = NOVEMBER_VISITS.length;
  const lines: InvoiceSheetLine[] = [
    {
      seq: 1,
      kind: "SERVICE",
      description: `خدمة التنظيف، نوفمبر 2026 (${planned} زيارة مبرمجة)`,
      quantity: 1000,
      unitLabel: "شهر",
      unitPrice: amount,
      amount,
    },
  ];
  if (missed > 0) {
    lines.push({
      seq: 2,
      kind: "MISSED_VISIT",
      description: `زيارة غير منجزة (${missed})`,
      quantity: missed * 1000,
      unitLabel: "زيارة",
      unitPrice: visitPrice(amount, planned),
      amount: missedVisitDeduction({
        rule: "BILL_DONE_ONLY",
        periodAmount: amount,
        plannedVisits: planned,
        missedVisits: missed,
      }),
    });
  }
  return lines;
}

const NOVEMBER = { periodStart: "2026-11-01", periodEnd: "2026-11-30", issueDate: "2026-11-30" };

/** A building contract under IFU, paid in cash, with one visit missed: 42 162,46 to pay. */
const BUILDING_IFU_CASH = invoice(
  {
    number: "000012/2026",
    ...NOVEMBER,
    fileNumber: "0007/BLC",
    division: "BUILDING",
    serviceType: "CONTRACT",
    buyer: BUILDING,
    lines: monthlyLines(da(45_000), 1),
    dueDate: "2026-12-05",
    paymentPlace: "بمقر المركز",
  },
  { taxMode: "IFU", pricesIncludeVat: true, paymentMethod: "CASH" },
);

/** An organisation contract under VAT, the amount tax included, paid by transfer: no stamp duty. */
const ORGANISATION_VAT_TRANSFER = invoice(
  {
    number: "000013/2026",
    ...NOVEMBER,
    fileNumber: "0004/2026",
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    buyer: ORGANISATION,
    lines: monthlyLines(da(45_000), 0),
    dueDate: "2026-12-30",
    paymentPlace: null,
  },
  { taxMode: "VAT", pricesIncludeVat: true, paymentMethod: "BANK_TRANSFER" },
);

/** The same organisation, prices before tax, paid in cash: 48 314,00 to pay. */
const ORGANISATION_VAT_CASH = invoice(
  {
    number: "000014/2026",
    ...NOVEMBER,
    fileNumber: "0004/2026",
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    buyer: ORGANISATION,
    lines: monthlyLines(da(40_000), 0),
    dueDate: "2026-12-05",
    paymentPlace: "بمقر المؤسسة",
  },
  { taxMode: "VAT", pricesIncludeVat: false, paymentMethod: "CASH" },
);

/** A household's one-off job under IFU, paid in cash: name and address are all the buyer shows. */
const HOUSEHOLD_ON_DEMAND = invoice(
  {
    number: "000015/2026",
    issueDate: "2026-11-12",
    periodStart: null,
    periodEnd: null,
    fileNumber: "0021/2026",
    division: "HOUSING",
    serviceType: "ON_DEMAND",
    buyer: HOUSEHOLD,
    lines: [
      {
        seq: 1,
        kind: "SERVICE",
        description: "تنظيف بعد البناء (شقة F4)",
        quantity: 1000,
        unitLabel: "خدمة",
        unitPrice: da(48_000),
        amount: da(48_000),
      },
      {
        seq: 2,
        kind: "DISCOUNT",
        description: "خصم متفق عليه (شكوى رقم 0003/2026)",
        quantity: 1000,
        unitLabel: "خدمة",
        unitPrice: da(-2_000),
        amount: da(-2_000),
      },
    ],
    dueDate: "2026-11-12",
    paymentPlace: "بالموقع",
    note: "يُسلَّم سند قبض عن كل مبلغ يُدفع نقدًا.",
  },
  { taxMode: "IFU", pricesIncludeVat: true, paymentMethod: "CASH" },
);

const INVOICES: Record<string, InvoiceSheetData> = {
  "sample-ifu": BUILDING_IFU_CASH,
  "sample-vat": ORGANISATION_VAT_TRANSFER,
  "sample-vat-cash": ORGANISATION_VAT_CASH,
  "sample-home": HOUSEHOLD_ON_DEMAND,
  "sample-void": {
    ...BUILDING_IFU_CASH,
    voided: { date: "2026-12-02", reason: "خطأ في عدد الزيارات المحتسبة؛ عُوِّضت بالفاتورة رقم 000016/2026" },
  },
};

/** The ids the invoice print pages answer to until invoices exist. */
export const SAMPLE_INVOICE_IDS = Object.keys(INVOICES);

export function sampleInvoice(id: string): InvoiceSheetData {
  return INVOICES[id] ?? BUILDING_IFU_CASH;
}

/** The visit statement of a sample invoice; none for a one-off job. */
export function sampleStatement(id: string): VisitStatementData | null {
  const data = sampleInvoice(id);
  if (data.serviceType !== "CONTRACT") return null;
  return {
    invoiceNumber: data.number,
    issueDate: data.issueDate,
    fileNumber: data.fileNumber,
    clientName: data.buyer.name,
    siteAddress: [data.buyer.address, data.buyer.commune].filter(Boolean).join("، "),
    division: data.division,
    serviceType: data.serviceType,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    place: data.place,
    rows: novemberRows(data.lines.some((line) => line.kind === "MISSED_VISIT")),
    voided: data.voided,
  };
}

// ── Cash receipts ───────────────────────────────────────────────────────────

const RECEIPT_BASE = {
  seller: SAMPLE_SELLER,
  stampScaleNote: stampScaleNote(DEFAULT_STAMP_SETTINGS),
  voided: null,
};

function cashPayment(payerName: string, amount: number, reason: string): CashReceiptData["payment"] {
  const duty = stampDuty(amount, DEFAULT_STAMP_SETTINGS);
  return {
    payerName,
    amount,
    stampDuty: duty,
    total: amount + duty,
    amountWordsAr: amountInWordsAr(amount + duty),
    amountWordsFr: amountInWordsFr(amount + duty),
    reason,
  };
}

const RECEIPTS: Record<string, CashReceiptData> = {
  // Made out at the office for the building's invoice.
  sample: {
    ...RECEIPT_BASE,
    number: "000045/2026",
    issueDate: "2026-12-03",
    fileNumber: BUILDING_IFU_CASH.fileNumber,
    clientName: BUILDING.name,
    collectorKind: "OFFICE",
    collectorName: "سميرة حداد",
    collectorNumber: null,
    payment: cashPayment(
      "رشيد بوزيد",
      BUILDING_IFU_CASH.totalTTC,
      `تسديد الفاتورة رقم ${BUILDING_IFU_CASH.number} (خدمة التنظيف، نوفمبر 2026)`,
    ),
  },
  // A numbered blank handed to an authorised worker before her round.
  "sample-blank": {
    ...RECEIPT_BASE,
    number: "000046/2026",
    issueDate: null,
    fileNumber: null,
    clientName: null,
    collectorKind: "WORKER",
    collectorName: "فاطمة الزهراء مرابط",
    collectorNumber: "0012/F",
    payment: null,
  },
  // Taken at the client's door by an authorised employee, for a household's one-off job.
  "sample-site": {
    ...RECEIPT_BASE,
    number: "000047/2026",
    issueDate: "2026-11-12",
    fileNumber: HOUSEHOLD_ON_DEMAND.fileNumber,
    clientName: HOUSEHOLD.name,
    collectorKind: "EMPLOYEE",
    collectorName: "نور الدين قاسمي",
    collectorNumber: "0003/H",
    payment: cashPayment(
      HOUSEHOLD.name,
      HOUSEHOLD_ON_DEMAND.totalTTC,
      `تسديد الفاتورة رقم ${HOUSEHOLD_ON_DEMAND.number} (تنظيف بعد البناء)`,
    ),
  },
  // A blank that came back unused: voided, never thrown away.
  "sample-void": {
    ...RECEIPT_BASE,
    number: "000048/2026",
    issueDate: null,
    fileNumber: null,
    clientName: null,
    collectorKind: "WORKER",
    collectorName: "فاطمة الزهراء مرابط",
    collectorNumber: "0012/F",
    payment: null,
    voided: { date: "2026-11-12", reason: "لم يُستعمل" },
  },
};

export const SAMPLE_RECEIPT_IDS = Object.keys(RECEIPTS);

export function sampleReceipt(id: string): CashReceiptData {
  return RECEIPTS[id] ?? RECEIPTS.sample;
}

// ── Payment reminder ────────────────────────────────────────────────────────

/** The organisation owes the rest of October and all of November, on 12 December. */
export function sampleReminder(): PaymentReminderData {
  const items: ReminderItem[] = [
    {
      invoiceNumber: "000009/2026",
      description: "خدمة التنظيف، أكتوبر 2026",
      dueDate: "2026-11-05",
      amount: da(45_000),
      paid: da(20_000),
      remaining: da(25_000),
      daysLate: 37,
    },
    {
      invoiceNumber: "000013/2026",
      description: "خدمة التنظيف، نوفمبر 2026",
      dueDate: "2026-12-05",
      amount: da(45_000),
      paid: 0,
      remaining: da(45_000),
      daysLate: 7,
    },
  ];
  const totalRemaining = items.reduce((sum, item) => sum + item.remaining, 0);
  return {
    date: "2026-12-12",
    place: DEFAULT_PLACE,
    seller: SAMPLE_SELLER,
    payerName: ORGANISATION.payerName ?? "",
    payerPhone: ORGANISATION.payerPhone,
    clientName: ORGANISATION.name,
    fileNumber: "0004/2026",
    division: "ORGANISATION",
    items,
    totalRemaining,
    totalRemainingWordsAr: amountInWordsAr(totalRemaining),
    paymentMethods: ["BANK_TRANSFER", "POSTAL_TRANSFER"],
    paymentPlace: "بمقر المركز أو بالتحويل",
  };
}
