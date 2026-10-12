import { localDate, money } from "@/lib/units";

import { addDays, type IsoDate } from "../rules/dates";
import { stampDuty } from "../rules/stamp-duty";
import type { Division, PaymentMethod, TaxMode } from "../validators/option-codes";
import type { IncomeDueView, IncomeInvoiceView, IncomePaymentView } from "../views";

/**
 * Sample rows for «المداخيل حسب القسم», until the services read the database.
 *
 * Dates count back from the centre's today, so the month so far always has
 * something to show. Names are invented. Stamp duty on the cash payments comes
 * from the rule, not typed in. The tax mode is IFU, the simpler of the two:
 * income is then what was received, stamp duty apart.
 */

export const SAMPLE_TAX: { taxMode: TaxMode; vatRate: number } = { taxMode: "IFU", vatRate: 1900 };

const da = (dinars: number) => Math.round(dinars * 100);

interface PaymentSeed {
  daysAgo: number;
  division: Division;
  method: PaymentMethod;
  dinars: number;
  client: string;
  file: string;
  payer?: string;
}

const PAYMENTS: readonly PaymentSeed[] = [
  { daysAgo: 0, division: "HOUSING", method: "CASH", dinars: 6_000, client: "كريم بن عيسى", file: "0021/2026" },
  {
    daysAgo: 1,
    division: "BUILDING",
    method: "CASH",
    dinars: 41_538.46,
    client: "عمارة الياسمين (ممثل السكان)",
    file: "0007/BLC",
    payer: "رشيد بوزيد",
  },
  {
    daysAgo: 2,
    division: "ORGANISATION",
    method: "BANK_TRANSFER",
    dinars: 45_000,
    client: "مؤسسة النور للتجارة",
    file: "0004/2026",
    payer: "مصلحة المحاسبة",
  },
  { daysAgo: 4, division: "HOUSING", method: "CASH", dinars: 3_500, client: "سارة بوشامة", file: "0025/2026" },
  {
    daysAgo: 5,
    division: "COMPLEX",
    method: "POSTAL_TRANSFER",
    dinars: 60_000,
    client: "إقامة الأمل (جمعية السكان)",
    file: "0002/2026",
  },
  { daysAgo: 7, division: "ORGANISATION", method: "CASH", dinars: 12_000, client: "صيدلية الشفاء", file: "0011/2026" },
  {
    daysAgo: 9,
    division: "HOUSING",
    method: "POSTAL_TRANSFER",
    dinars: 48_000,
    client: "يوسف حمدي",
    file: "0019/2026",
  },
  {
    daysAgo: 12,
    division: "BUILDING",
    method: "POSTAL_TRANSFER",
    dinars: 25_000,
    client: "عمارة الزيتون (سانديك)",
    file: "0009/BLC",
  },
  {
    daysAgo: 15,
    division: "ORGANISATION",
    method: "BANK_TRANSFER",
    dinars: 32_000,
    client: "مكتب المحامي بن علي",
    file: "0008/2026",
  },
  { daysAgo: 18, division: "HOUSING", method: "CASH", dinars: 4_200, client: "إيمان شريف", file: "0017/2026" },
  {
    daysAgo: 22,
    division: "BUILDING",
    method: "CASH",
    dinars: 40_000,
    client: "عمارة الياسمين (ممثل السكان)",
    file: "0007/BLC",
    payer: "رشيد بوزيد",
  },
  {
    daysAgo: 26,
    division: "COMPLEX",
    method: "BANK_TRANSFER",
    dinars: 60_000,
    client: "إقامة الأمل (جمعية السكان)",
    file: "0002/2026",
  },
  {
    daysAgo: 33,
    division: "ORGANISATION",
    method: "BANK_TRANSFER",
    dinars: 45_000,
    client: "مؤسسة النور للتجارة",
    file: "0004/2026",
  },
  { daysAgo: 38, division: "HOUSING", method: "CASH", dinars: 9_000, client: "كريم بن عيسى", file: "0014/2026" },
  {
    daysAgo: 45,
    division: "BUILDING",
    method: "CASH",
    dinars: 40_000,
    client: "عمارة الياسمين (ممثل السكان)",
    file: "0007/BLC",
  },
];

const INVOICES: readonly { daysAgo: number; division: Division; dinars: number }[] = [
  { daysAgo: 1, division: "HOUSING", dinars: 6_000 },
  { daysAgo: 3, division: "BUILDING", dinars: 45_000 },
  { daysAgo: 3, division: "ORGANISATION", dinars: 45_000 },
  { daysAgo: 6, division: "COMPLEX", dinars: 60_000 },
  { daysAgo: 10, division: "HOUSING", dinars: 48_000 },
  { daysAgo: 16, division: "ORGANISATION", dinars: 32_000 },
  { daysAgo: 30, division: "BUILDING", dinars: 41_538.46 },
];

const DUES: readonly { division: Division; dinars: number; paid: number }[] = [
  { division: "BUILDING", dinars: 45_000, paid: 0 },
  { division: "ORGANISATION", dinars: 45_000, paid: 20_000 },
  { division: "ORGANISATION", dinars: 12_000, paid: 12_000 },
  { division: "HOUSING", dinars: 6_000, paid: 0 },
  { division: "COMPLEX", dinars: 60_000, paid: 0 },
];

export function sampleIncome(today: IsoDate): {
  payments: IncomePaymentView[];
  invoices: IncomeInvoiceView[];
  dues: IncomeDueView[];
} {
  let receipt = 39;
  const payments = PAYMENTS.map((seed, index): IncomePaymentView => {
    const date = addDays(today, -seed.daysAgo);
    const cash = seed.method === "CASH";
    if (cash) receipt += 1;
    return {
      id: `sample-payment-${index + 1}`,
      receivedDate: localDate(date),
      division: seed.division,
      method: seed.method,
      amount: money(da(seed.dinars)),
      stampDuty: money(cash ? stampDuty(da(seed.dinars)) : 0),
      payerName: seed.payer ?? seed.client,
      clientName: seed.client,
      fileNumber: seed.file,
      receiptNumber: cash ? `${String(receipt).padStart(6, "0")}/${date.slice(0, 4)}` : null,
    };
  });

  const invoices = INVOICES.map(
    (seed, index): IncomeInvoiceView => ({
      id: `sample-invoice-${index + 1}`,
      division: seed.division,
      issueDate: localDate(addDays(today, -seed.daysAgo)),
      totalHT: money(da(seed.dinars)),
      totalTTC: money(da(seed.dinars)),
      voided: false,
    }),
  );

  const dues = DUES.map(
    (seed, index): IncomeDueView => ({
      id: `sample-due-${index + 1}`,
      division: seed.division,
      amount: money(da(seed.dinars)),
      paidAmount: money(da(seed.paid)),
      cancelled: false,
    }),
  );

  return { payments, invoices, dues };
}
