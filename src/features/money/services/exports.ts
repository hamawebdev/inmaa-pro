import { requireCapability, requireSection } from "@/lib/access/session";
import { sha256Hex } from "@/lib/chain";
import { newId } from "@/lib/db/rows";
import { logDisclose } from "@/lib/log";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate } from "@/lib/units";

import { formatDate, isIsoDate } from "../rules/dates";
import type { BuyerSnapshot } from "../sheets/invoice-sheet";
import { DIVISION_LABEL, PAYMENT_METHOD_LABEL } from "../sheets/print-labels";

/**
 * The accountant's files (feature 48). His program is not named yet, so the
 * ruling is a file he can import anywhere: CSV, UTF-8 with a byte-order mark,
 * semicolons between the columns, one file each for the sales journal, the
 * cash receipts, the payments and the expenses of a period. Amounts are in
 * dinars with a comma before the two decimals and no thousands mark; dates are
 * written `DD/MM/YYYY`, as on his forms; codes are written in his words.
 *
 * Every export is recorded (`ExportBatch`: what, which period, how many rows,
 * the file's SHA-256) and logged as a disclosure. The columns are listed in
 * src/features/money/HANDOVER.md, for the accountant to map them.
 */

export const ACCOUNTANT_FILES = ["INVOICES", "RECEIPTS", "PAYMENTS", "EXPENSES"] as const;
export type AccountantFile = (typeof ACCOUNTANT_FILES)[number];

/** Each file's columns, in order, as their header row writes them. */
export const EXPORT_COLUMNS: Readonly<Record<AccountantFile, readonly string[]>> = {
  INVOICES: [
    "رقم الفاتورة",
    "تاريخ الفاتورة",
    "العميل",
    "NIF العميل",
    "RC العميل",
    "رقم الملف",
    "القسم",
    "طريقة السداد",
    "المجموع خارج الرسم",
    "الرسم على القيمة المضافة",
    "المبلغ المستحق",
    "حق الطابع",
    "الصافي للدفع",
    "الحالة",
    "تاريخ الإلغاء",
    "سبب الإلغاء",
  ],
  RECEIPTS: [
    "رقم السند",
    "تاريخ السند",
    "المحصِّل",
    "رقم الملف",
    "العميل",
    "مسدد أتعاب",
    "المبلغ",
    "حق الطابع",
    "المجموع المقبوض",
    "الحالة",
    "السبب",
  ],
  PAYMENTS: [
    "تاريخ الدفع",
    "رقم الملف",
    "العميل",
    "القسم",
    "طريقة الدفع",
    "رقم المرجع",
    "المبلغ",
    "حق الطابع",
    "المجموع المقبوض",
    "رقم السند",
    "الفواتير",
    "الحالة",
  ],
  EXPENSES: ["التاريخ", "القسم", "البند", "المبلغ", "طريقة الدفع", "المستفيد", "المصدر", "ملاحظة"],
};

const FILE_NAME: Readonly<Record<AccountantFile, string>> = {
  INVOICES: "journal-ventes",
  RECEIPTS: "recus",
  PAYMENTS: "paiements",
  EXPENSES: "depenses",
};

/** His words for the codes a file carries. */
const EXPENSE_CATEGORY_AR: Readonly<Record<string, string>> = {
  WAGES: "الأجور",
  CONTRIBUTIONS: "الاشتراكات الاجتماعية",
  TRANSPORT: "النقل",
  MATERIALS: "المواد",
  RENT: "الإيجار",
  PHONE: "الهاتف",
  ACCOUNTING: "المحاسبة",
  MARKETING: "التسويق",
  EQUIPMENT: "المعدات",
  MAINTENANCE: "الصيانة",
  COMPENSATION: "التعويضات",
  TAXES: "الضرائب",
  // His list ends with these two (MON-15): never the raw code in the accountant's file.
  LOSSES: "الخسائر/الإلغاءات",
  OTHER: "أخرى",
};
const SOURCE_AR: Readonly<Record<string, string>> = {
  MANUAL: "يدوي",
  PURCHASE: "شراء",
  MAINTENANCE: "صيانة",
  PAYROLL: "أجور",
};
const COLLECTOR_AR: Readonly<Record<string, string>> = { OFFICE: "المكتب", EMPLOYEE: "موظف", WORKER: "عامل" };
const divisionAr = (code: string) =>
  code === "COMMON" ? "عام" : ((DIVISION_LABEL as Record<string, string>)[code] ?? code);
const methodAr = (code: string | null) =>
  code === null ? "" : ((PAYMENT_METHOD_LABEL as Record<string, string>)[code] ?? code);

/** An amount in centimes as the file writes it: `12000,00`, `-200,50`. */
export function csvAmount(centimes: number): string {
  const sign = centimes < 0 ? "-" : "";
  const abs = Math.abs(centimes);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** A value as one CSV cell: quoted when it holds a semicolon, a quote or a line break. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file: the byte-order mark, the header, one line per row, Windows line ends. */
export function csvText(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

async function invoiceRows(ex: Executor, ctx: ServiceContext, from: string, to: string) {
  const invoices = await ex
    .selectFrom("Invoice")
    .innerJoin("File", "File.id", "Invoice.fileId")
    .select([
      "Invoice.id",
      "Invoice.number",
      "Invoice.issueDate",
      "Invoice.buyerSnapshot",
      "File.number as fileNumber",
      "Invoice.division",
      "Invoice.paymentMethod",
      "Invoice.totalHT",
      "Invoice.vatAmount",
      "Invoice.totalTTC",
      "Invoice.stampDuty",
      "Invoice.netToPay",
    ])
    .where("Invoice.issueDate", ">=", localDate(from))
    .where("Invoice.issueDate", "<=", localDate(to))
    .orderBy("Invoice.numberYear")
    .orderBy("Invoice.numberSeq")
    .execute();
  const voids = invoices.length
    ? await ex
        .selectFrom("LegalEvent")
        .select(["invoiceId", "reason", "createdAt"])
        .where("type", "=", "VOIDED")
        .where(
          "invoiceId",
          "in",
          invoices.map((invoice) => invoice.id),
        )
        .execute()
    : [];
  return invoices.map((invoice) => {
    const buyer = JSON.parse(invoice.buyerSnapshot) as BuyerSnapshot;
    const voided = voids.find((event) => event.invoiceId === invoice.id);
    return [
      invoice.number,
      formatDate(invoice.issueDate),
      buyer.name,
      buyer.nif ?? "",
      buyer.rc ?? "",
      invoice.fileNumber,
      divisionAr(invoice.division),
      methodAr(invoice.paymentMethod),
      csvAmount(invoice.totalHT),
      csvAmount(invoice.vatAmount),
      csvAmount(invoice.totalTTC),
      csvAmount(invoice.stampDuty),
      csvAmount(invoice.netToPay),
      voided ? "ملغاة" : "صادرة",
      // The day of the void at the centre, not in UTC (MON-15): a void at 00:30 in Algeria is that day's.
      voided ? formatDate(ctx.toLocal(voided.createdAt).date) : "",
      voided?.reason ?? "",
    ];
  });
}

async function receiptRows(ex: Executor, from: string, to: string) {
  const receipts = await ex
    .selectFrom("Receipt")
    .leftJoin("Payment", "Payment.receiptId", "Receipt.id")
    .leftJoin("File", "File.id", "Payment.fileId")
    .leftJoin("Client", "Client.id", "File.clientId")
    .leftJoin("StaffMember", "StaffMember.id", "Receipt.collectorStaffId")
    .select([
      "Receipt.id",
      "Receipt.number",
      "Receipt.issueDate",
      "Receipt.collectorKind",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "File.number as fileNumber",
      "Client.name as clientName",
      "Payment.payerName",
      "Payment.amount",
      "Payment.stampDuty",
      "Payment.totalReceived",
    ])
    .where("Receipt.issueDate", ">=", localDate(from))
    .where("Receipt.issueDate", "<=", localDate(to))
    .orderBy("Receipt.numberYear")
    .orderBy("Receipt.numberSeq")
    .execute();
  const events = receipts.length
    ? await ex
        .selectFrom("LegalEvent")
        .select(["receiptId", "type", "reason"])
        .where("type", "in", ["VOIDED", "MISSING"])
        .where(
          "receiptId",
          "in",
          receipts.map((receipt) => receipt.id),
        )
        .execute()
    : [];
  return receipts.map((receipt) => {
    const event = events.find((each) => each.receiptId === receipt.id);
    const state = event
      ? event.type === "MISSING"
        ? "مفقود"
        : "ملغى"
      : receipt.totalReceived !== null
        ? "مستعمل"
        : "فارغ";
    const collector =
      receipt.collectorKind === "OFFICE" || !receipt.lastName
        ? (COLLECTOR_AR[receipt.collectorKind] ?? receipt.collectorKind)
        : `${COLLECTOR_AR[receipt.collectorKind] ?? ""} ${receipt.lastName} ${receipt.firstName ?? ""}`.trim();
    return [
      receipt.number,
      formatDate(receipt.issueDate),
      collector,
      receipt.fileNumber ?? "",
      receipt.clientName ?? "",
      receipt.payerName ?? "",
      receipt.amount === null ? "" : csvAmount(receipt.amount),
      receipt.stampDuty === null ? "" : csvAmount(receipt.stampDuty),
      receipt.totalReceived === null ? "" : csvAmount(receipt.totalReceived),
      state,
      event?.reason ?? "",
    ];
  });
}

async function paymentRows(ex: Executor, from: string, to: string) {
  const payments = await ex
    .selectFrom("Payment")
    .innerJoin("File", "File.id", "Payment.fileId")
    .innerJoin("Client", "Client.id", "Payment.clientId")
    .leftJoin("Receipt", "Receipt.id", "Payment.receiptId")
    .select([
      "Payment.id",
      "Payment.receivedDate",
      "File.number as fileNumber",
      "Client.name as clientName",
      "Payment.division",
      "Payment.method",
      "Payment.reference",
      "Payment.amount",
      "Payment.stampDuty",
      "Payment.totalReceived",
      "Receipt.number as receiptNumber",
    ])
    .where("Payment.receivedDate", ">=", localDate(from))
    .where("Payment.receivedDate", "<=", localDate(to))
    .orderBy("Payment.receivedDate")
    .orderBy("Payment.chainSeq")
    .execute();
  const ids = payments.map((payment) => payment.id);
  const voids = ids.length
    ? await ex
        .selectFrom("LegalEvent")
        .select("paymentId")
        .where("type", "=", "VOIDED")
        .where("paymentId", "in", ids)
        .execute()
    : [];
  const invoices = ids.length
    ? await ex
        .selectFrom("PaymentAllocation")
        .innerJoin("PaymentDue", "PaymentDue.id", "PaymentAllocation.dueId")
        .innerJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
        .select(["PaymentAllocation.paymentId", "Invoice.number"])
        .where("PaymentAllocation.paymentId", "in", ids)
        .execute()
    : [];
  return payments.map((payment) => [
    formatDate(payment.receivedDate),
    payment.fileNumber,
    payment.clientName,
    divisionAr(payment.division),
    methodAr(payment.method),
    payment.reference ?? "",
    csvAmount(payment.amount),
    csvAmount(payment.stampDuty),
    csvAmount(payment.totalReceived),
    payment.receiptNumber ?? "",
    [...new Set(invoices.filter((row) => row.paymentId === payment.id).map((row) => row.number))].join(" "),
    voids.some((row) => row.paymentId === payment.id) ? "ملغى" : "صحيح",
  ]);
}

async function expenseRows(ex: Executor, from: string, to: string) {
  const expenses = await ex
    .selectFrom("Expense")
    .select(["date", "division", "category", "amount", "method", "paidTo", "source", "note"])
    .where("deletedAt", "is", null)
    .where("date", ">=", localDate(from))
    .where("date", "<=", localDate(to))
    .orderBy("date")
    .orderBy("createdAt")
    .execute();
  return expenses.map((expense) => [
    formatDate(expense.date),
    divisionAr(expense.division),
    EXPENSE_CATEGORY_AR[expense.category] ?? expense.category,
    csvAmount(expense.amount),
    methodAr(expense.method),
    expense.paidTo ?? "",
    SOURCE_AR[expense.source] ?? expense.source,
    expense.note ?? "",
  ]);
}

export interface AccountantExport {
  fileName: string;
  text: string;
  rowCount: number;
}

/** Builds one of the accountant's files, records the export and logs it. */
export async function buildAccountantExport(
  ex: Executor,
  ctx: ServiceContext,
  input: { kind: AccountantFile; from: string; to: string },
): Promise<AccountantExport> {
  requireSection(ctx, "MONEY", "READ");
  requireCapability(ctx, "export.run");
  if (ctx.userId === null) throw new Error("money: an export is made by somebody");
  if (!(ACCOUNTANT_FILES as readonly string[]).includes(input.kind))
    throw new Error(`money: unknown export ${input.kind}`);
  if (!isIsoDate(input.from) || !isIsoDate(input.to)) throw new ServiceError("Enter a valid date.");
  if (input.from > input.to) throw new ServiceError("The start of the period cannot be after its end.");

  const rows =
    input.kind === "INVOICES"
      ? await invoiceRows(ex, ctx, input.from, input.to)
      : input.kind === "RECEIPTS"
        ? await receiptRows(ex, input.from, input.to)
        : input.kind === "PAYMENTS"
          ? await paymentRows(ex, input.from, input.to)
          : await expenseRows(ex, input.from, input.to);
  const text = csvText(EXPORT_COLUMNS[input.kind], rows);
  const fileName = `inmaa-${FILE_NAME[input.kind]}-${input.from}-${input.to}.csv`;
  const id = newId();
  await ex
    .insertInto("ExportBatch")
    .values({
      id,
      kind: input.kind,
      periodFrom: localDate(input.from),
      periodTo: localDate(input.to),
      format: "CSV",
      fileName,
      rowCount: rows.length,
      fileHash: await sha256Hex(text),
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    })
    .execute();
  await logDisclose(ex, ctx, {
    owner: "MONEY",
    action: "EXPORT",
    entity: "ExportBatch",
    entityId: id,
    entityLabel: fileName,
    disclosure: "EXPORT",
    context: { kind: input.kind, from: input.from, to: input.to, rows: rows.length },
  });
  return { fileName, text, rowCount: rows.length };
}

export const buildAccountantExportAction = action(buildAccountantExport);
