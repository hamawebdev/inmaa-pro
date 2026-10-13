import type { ExpenseRow, InvoiceRow, PaymentDueRow, PaymentRow } from "@/lib/db/models";

/**
 * What Money's screens show, typed against the generated rows.
 *
 * A screen lists a row with the names it points at (a payment's client and
 * file), so each view is the row's own columns plus those names. The services
 * that read the database return these shapes.
 */

/** A payment as «المداخيل حسب القسم» lists it. Voided payments are not income and are not listed. */
export type IncomePaymentView = Pick<
  PaymentRow,
  "id" | "receivedDate" | "division" | "method" | "amount" | "stampDuty" | "payerName"
> & {
  clientName: string;
  fileNumber: string;
  /** The cash receipt's number; none for a transfer. */
  receiptNumber: string | null;
};

/** An issued invoice, for «المفوتر». */
export type IncomeInvoiceView = Pick<InvoiceRow, "id" | "division" | "issueDate" | "totalHT" | "totalTTC"> & {
  voided: boolean;
};

/** A due, for «غير المحصّل»: the division is its file's. */
export type IncomeDueView = Pick<PaymentDueRow, "id" | "amount" | "paidAmount"> & {
  division: string;
  cancelled: boolean;
};

/** An expense as «المصاريف حسب القسم» lists it. Removed expenses are not listed. */
export type ExpenseView = Pick<
  ExpenseRow,
  | "id"
  | "date"
  | "division"
  | "category"
  | "amount"
  | "method"
  | "paidTo"
  | "spentByName"
  | "recurrence"
  | "source"
  | "receiptUrl"
  | "note"
>;
