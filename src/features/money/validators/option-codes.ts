/**
 * Every option list Money's rules, services and sheets use.
 *
 * Two kinds of list live here:
 *
 *  - Lists more than one owner uses: written once by Foundation in
 *    `src/lib/options` (codes, his words for paper, screen labels under
 *    `Options.*`) and re-exported below, so nothing else in this folder
 *    imports them from two places.
 *  - Money's own lists (kinds of due, kinds of invoice line, tax mode…).
 *
 * Arabic wording for paper is in ../sheets/print-labels.ts.
 */

import { DIVISIONS, type Division } from "@/lib/options";

// ── Shared (src/lib/options) ────────────────────────────────────────────────

export {
  AMOUNT_BASES,
  DIVISIONS,
  FILE_STAGES,
  PAYMENT_FREQUENCIES,
  PAYMENT_METHODS,
  SERVICE_TYPES,
  type AmountBasis,
  type Division,
  type FileStage,
  type PaymentFrequency,
  type PaymentMethod,
  type ServiceType,
} from "@/lib/options";

// ── Money's own ─────────────────────────────────────────────────────────────

/** Where an expense belongs: his four lines, and one of ours for what the centre spends as a whole. */
export const EXPENSE_DIVISIONS = [...DIVISIONS, "COMMON"] as const;
export type ExpenseDivision = (typeof EXPENSE_DIVISIONS)[number];

/** What a due is for. Only the first three are built by the schedule rule. */
export const DUE_KINDS = ["SCHEDULE", "VISIT", "SINGLE", "INITIAL_JOB", "EXTRA", "DEPOSIT", "MANUAL"] as const;
export type DueKind = (typeof DUE_KINDS)[number];

/** A due's state, derived from its amounts and dates. Shown as a chip, never stored. */
export const DUE_STATES = ["UPCOMING", "DUE_SOON", "OVERDUE", "PARTIAL", "PAID", "CANCELLED"] as const;
export type DueState = (typeof DUE_STATES)[number];

/** «حالة الدفع» of his homes file (item 23). Derived. */
export const PAYMENT_STATES = ["PAID", "PARTIAL", "UNPAID"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** A line of an invoice. The last three carry negative amounts. */
export const INVOICE_LINE_KINDS = [
  "SERVICE",
  "VISIT",
  "MATERIALS",
  "TRANSPORT",
  "EXTRA",
  "MISSED_VISIT",
  "DISCOUNT",
  "DEPOSIT",
] as const;
export type InvoiceLineKind = (typeof INVOICE_LINE_KINDS)[number];

/** How the centre is taxed: 19% VAT, or the single flat tax with no VAT shown (question 16). */
export const TAX_MODES = ["VAT", "IFU"] as const;
export type TaxMode = (typeof TAX_MODES)[number];

/** Stamp duty on cash: the band's rate on the whole amount, or band by band. */
export const STAMP_MODES = ["WHOLE", "PROGRESSIVE"] as const;
export type StampMode = (typeof STAMP_MODES)[number];

/** What a visit that was neither done nor replaced costs the client (question 15). */
export const MISSED_VISIT_RULES = ["BILL_DONE_ONLY", "FIXED_AMOUNT"] as const;
export type MissedVisitRule = (typeof MISSED_VISIT_RULES)[number];

/** Who took the money. A worker only when authorised (his regulations, article 12). */
export const COLLECTOR_KINDS = ["OFFICE", "EMPLOYEE", "WORKER"] as const;
export type CollectorKind = (typeof COLLECTOR_KINDS)[number];

/** The lines of his monthly profitability model, in his order, and one of ours. */
export const EXPENSE_CATEGORIES = [
  "WAGES",
  "CONTRIBUTIONS",
  "TRANSPORT",
  "MATERIALS",
  "RENT",
  "PHONE",
  "ACCOUNTING",
  "MARKETING",
  "EQUIPMENT",
  "MAINTENANCE",
  "COMPENSATION",
  "TAXES",
  "LOSSES",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Whether an expense comes back every month: the forecast counts it in each coming month. */
export const RECURRENCES = ["NONE", "MONTHLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/** Where an expense row comes from. Only `MANUAL` rows are typed, edited and removed on screen. */
export const EXPENSE_SOURCES = ["MANUAL", "PURCHASE", "MAINTENANCE", "PAYROLL"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

/** Narrows a stored code to one of his four divisions. */
export function isDivision(code: string): code is Division {
  return (DIVISIONS as readonly string[]).includes(code);
}

/** Narrows a stored code to an expense line: a division or «عام». */
export function isExpenseDivision(code: string): code is ExpenseDivision {
  return (EXPENSE_DIVISIONS as readonly string[]).includes(code);
}
