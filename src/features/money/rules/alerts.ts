import type { DueState, FileStage, PaymentState, ServiceType } from "../validators/option-codes";

import type { Centimes } from "./centimes";
import { diffDays, type IsoDate } from "./dates";

/**
 * The conditions of Money's two alerts, as predicates over plain rows.
 *
 * His note: «عند اقتراب فترة انتهاء العقد يرسل لنا رسالة لإعلامنا» and
 * «عند اقتراب التسديد … يرسل رسالة». Nothing is sent: each is a tile on the
 * home screen, a list, and a desktop notification. Lead times are settings
 * (30 days and 7 days, scope A3). "Today" is always passed in.
 *
 * A query will later select the candidate rows; these functions are the
 * definition it must agree with, and what the tests pin down.
 */

// ── A contract coming to its end ────────────────────────────────────────────

export interface ContractRow {
  serviceType: ServiceType;
  stage: FileStage;
  /** «تاريخ النهاية». */
  endDate: IsoDate | null;
  /** The file was closed by the office. */
  closed: boolean;
  /** A renewal of this contract exists and is itself at «متعاقد». A «قديم» copy is not one. */
  renewed: boolean;
  /** At «انتهاء التعاقد» because its end date passed, not because someone ended it. */
  endedByExpiry: boolean;
  /** The office recorded that the client will not renew. */
  willNotRenew: boolean;
}

export type ContractEndState =
  /** Still running, and its end is within the lead time. */
  | "ENDING"
  /** Its end has passed with no renewal: listed in red until renewed or closed. */
  | "ENDED_NOT_RENEWED";

export interface ContractEndAlert {
  state: ContractEndState;
  /** Days from today to the end date: 0 on the last day, negative once passed. */
  daysLeft: number;
}

export function contractEndAlert(row: ContractRow, today: IsoDate, leadDays: number): ContractEndAlert | null {
  if (row.serviceType !== "CONTRACT" || row.endDate === null || row.closed || row.renewed) return null;
  const daysLeft = diffDays(today, row.endDate);

  if (daysLeft >= 0) {
    return row.stage === "CONTRACTED" && daysLeft <= leadDays ? { state: "ENDING", daysLeft } : null;
  }

  // Past its end. Still at «متعاقد» (nobody moved it yet), or moved by the calendar alone.
  const lapsed = row.stage === "CONTRACTED" || (row.stage === "CONTRACT_ENDED" && row.endedByExpiry);
  return lapsed && !row.willNotRenew ? { state: "ENDED_NOT_RENEWED", daysLeft } : null;
}

// ── A payment coming due ────────────────────────────────────────────────────

export interface DueRow {
  dueDate: IsoDate;
  /** The receivable: never the stamp duty. */
  amount: Centimes;
  paidAmount: Centimes;
  cancelled: boolean;
}

export type PaymentAlertState =
  /** Not settled, and due within the lead time (today included). */
  | "DUE_SOON"
  /** Not settled, and due before today. */
  | "OVERDUE";

export interface PaymentAlert {
  state: PaymentAlertState;
  remaining: Centimes;
  /** Days from today to the due date: negative once late. */
  daysLeft: number;
}

/**
 * Whether the file is closed does not matter: the due of a finished job stays
 * until it is paid.
 */
export function paymentAlert(row: DueRow, today: IsoDate, leadDays: number): PaymentAlert | null {
  const remaining = row.amount - row.paidAmount;
  if (row.cancelled || remaining <= 0) return null;
  const daysLeft = diffDays(today, row.dueDate);
  if (daysLeft < 0) return { state: "OVERDUE", remaining, daysLeft };
  return daysLeft <= leadDays ? { state: "DUE_SOON", remaining, daysLeft } : null;
}

/** The chip a due wears. Lateness outranks a part payment: a late due is late, however much was paid. */
export function dueState(row: DueRow, today: IsoDate, leadDays: number): DueState {
  if (row.cancelled) return "CANCELLED";
  if (row.amount - row.paidAmount <= 0) return "PAID";
  const alert = paymentAlert(row, today, leadDays);
  if (alert) return alert.state;
  return row.paidAmount > 0 ? "PARTIAL" : "UPCOMING";
}

/** «حالة الدفع» of a file, a client or an invoice: «مدفوع بالكامل», «مدفوع جزئيًا», «غير مدفوع». */
export function paymentState(amount: Centimes, paidAmount: Centimes): PaymentState {
  if (paidAmount >= amount) return "PAID";
  return paidAmount > 0 ? "PARTIAL" : "UNPAID";
}

/** How late an overdue due is, in the bands the debt list shows. */
export function ageBand(daysLate: number): "1-30" | "31-60" | "61-90" | "90+" {
  if (daysLate <= 30) return "1-30";
  if (daysLate <= 60) return "31-60";
  return daysLate <= 90 ? "61-90" : "90+";
}

/**
 * What the payment tile shows: files, not dues. A contract paid after each
 * visit has several dues inside the lead time and is still one call to make.
 */
export function summarisePaymentAlerts(
  rows: readonly (DueRow & { fileId: string })[],
  today: IsoDate,
  leadDays: number,
): Record<PaymentAlertState, { files: number; dues: number; total: Centimes }> {
  const summary = {
    DUE_SOON: { files: new Set<string>(), dues: 0, total: 0 },
    OVERDUE: { files: new Set<string>(), dues: 0, total: 0 },
  };
  for (const row of rows) {
    const alert = paymentAlert(row, today, leadDays);
    if (!alert) continue;
    summary[alert.state].files.add(row.fileId);
    summary[alert.state].dues += 1;
    summary[alert.state].total += alert.remaining;
  }
  return {
    DUE_SOON: { files: summary.DUE_SOON.files.size, dues: summary.DUE_SOON.dues, total: summary.DUE_SOON.total },
    OVERDUE: { files: summary.OVERDUE.files.size, dues: summary.OVERDUE.dues, total: summary.OVERDUE.total },
  };
}
