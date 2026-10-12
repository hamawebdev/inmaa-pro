import { requireSection } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { money, type LocalDate } from "@/lib/units";

import type { InvoiceMatch } from "../rules/income";
import type { TaxMode } from "../validators/option-codes";
import type { IncomeDueView, IncomeInvoiceView, IncomePaymentView } from "../views";

import { readTaxSettings } from "./money-settings";

/**
 * What «المداخيل حسب القسم» is drawn from, read from the stored rows.
 *
 * Income is money collected: the payments received in the period, by the
 * division of their file. A voided payment counts nowhere. Beside it, kept
 * apart, what was invoiced in the period and what is still owed today.
 * The figures themselves are computed by the rules (../rules/income.ts), the
 * same ones the screen was drawn with before any row existed.
 */
export interface IncomeData {
  payments: IncomePaymentView[];
  /** How those payments settle invoices: what splits a payment before tax under VAT. */
  matches: InvoiceMatch[];
  invoices: IncomeInvoiceView[];
  /** Every due still open today, whatever the period. */
  dues: IncomeDueView[];
  /** The regime in force. Not chosen yet reads as the flat tax: no VAT is split out. */
  taxMode: TaxMode;
  vatRate: number;
}

export async function getIncomeData(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: LocalDate; to: LocalDate },
): Promise<IncomeData> {
  requireSection(ctx, "MONEY", "READ");
  const tax = await readTaxSettings(ex);

  const paymentRows = await ex
    .selectFrom("Payment")
    .innerJoin("File", "File.id", "Payment.fileId")
    .innerJoin("Client", "Client.id", "Payment.clientId")
    .leftJoin("Receipt", "Receipt.id", "Payment.receiptId")
    .select([
      "Payment.id",
      "Payment.receivedDate",
      "Payment.division",
      "Payment.method",
      "Payment.amount",
      "Payment.stampDuty",
      "Payment.payerName",
      "Client.name as clientName",
      "File.number as fileNumber",
      "Receipt.number as receiptNumber",
    ])
    .where("Payment.receivedDate", ">=", input.from)
    .where("Payment.receivedDate", "<=", input.to)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.paymentId", "=", "Payment.id")
            .where("LegalEvent.type", "=", "VOIDED"),
        ),
      ),
    )
    .orderBy("Payment.receivedDate", "desc")
    .orderBy("Payment.chainSeq", "desc")
    .execute();

  const matches = paymentRows.length
    ? await ex
        .selectFrom("PaymentAllocation")
        .innerJoin("PaymentDue", "PaymentDue.id", "PaymentAllocation.dueId")
        .innerJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
        .select([
          "PaymentAllocation.paymentId",
          "PaymentAllocation.amount",
          "Invoice.totalHT as invoiceTotalHT",
          "Invoice.totalTTC as invoiceTotalTTC",
        ])
        .where(
          "PaymentAllocation.paymentId",
          "in",
          paymentRows.map((payment) => payment.id),
        )
        .where("PaymentAllocation.amount", ">", money(0))
        .orderBy("PaymentAllocation.chainSeq")
        .execute()
    : [];

  const invoices = await ex
    .selectFrom("Invoice")
    .select(["Invoice.id", "Invoice.division", "Invoice.issueDate", "Invoice.totalHT", "Invoice.totalTTC"])
    .select(({ exists, selectFrom }) =>
      exists(
        selectFrom("LegalEvent")
          .select("LegalEvent.id")
          .whereRef("LegalEvent.invoiceId", "=", "Invoice.id")
          .where("LegalEvent.type", "=", "VOIDED"),
      ).as("voided"),
    )
    .where("Invoice.issueDate", ">=", input.from)
    .where("Invoice.issueDate", "<=", input.to)
    .execute();

  const dues = await ex
    .selectFrom("PaymentDue")
    .innerJoin("File", "File.id", "PaymentDue.fileId")
    .select(["PaymentDue.id", "PaymentDue.amount", "PaymentDue.paidAmount", "File.division"])
    .where("PaymentDue.cancelledAt", "is", null)
    .whereRef("PaymentDue.paidAmount", "<", "PaymentDue.amount")
    .execute();

  return {
    payments: paymentRows,
    matches,
    invoices: invoices.map((invoice) => ({ ...invoice, voided: Boolean(invoice.voided) })),
    dues: dues.map((due) => ({ ...due, cancelled: false })),
    taxMode: tax.mode ?? "IFU",
    vatRate: tax.vatRate,
  };
}

// ── What the screens call ────────────────────────────────────────────────────

export const getIncomeDataQuery = query(getIncomeData);
