import { DIVISIONS, type Division, type ExpenseDivision, type TaxMode } from "../validators/option-codes";

import { mulDivRound, shareByWeights, type BasisPoints, type Centimes } from "./centimes";
import { isWithin, type IsoDate } from "./dates";

/**
 * What counts as a division's income, and in which period.
 *
 * **Income «المداخيل» is money collected.** A payment belongs to the division
 * of its file and to the period of the day it was received, whatever the date
 * of the invoice it pays. A voided payment counts nowhere.
 *
 *  - Stamp duty is never income: it is collected for the State and shown as its
 *    own figure.
 *  - Under VAT, income is shown before tax. The part of a payment that settles
 *    an invoice is split by that invoice's own ratio of total before tax to
 *    total with tax; a part not yet matched to an invoice (an advance) is split
 *    at the rate in force. The tax is the rest, so the two always add up to
 *    the payment.
 *
 * Beside it stand two other figures, kept separate so they are never mistaken
 * for income: what was **invoiced** in the period (by issue date, voided
 * invoices left out) and what is still **outstanding** on dues.
 *
 * The month's profit uses the same basis on both sides: money in, money out.
 */

export interface IncomePayment {
  id: string;
  division: Division;
  /** «تاريخ الدفع»: the day the money was received. */
  receivedDate: IsoDate;
  /** The part applied to dues. Stamp duty is not in it. */
  amount: Centimes;
  stampDuty: Centimes;
  voided: boolean;
}

/** The part of a payment that settles one invoice. */
export interface InvoiceMatch {
  paymentId: string;
  amount: Centimes;
  invoiceTotalHT: Centimes;
  invoiceTotalTTC: Centimes;
}

export interface IncomeFigures {
  /** «المداخيل»: collected, before tax. */
  collected: Centimes;
  /** «الرسم على القيمة المضافة المحصّل». */
  vatCollected: Centimes;
  /** «حق الطابع المحصّل». */
  stampCollected: Centimes;
  /** Everything that came in: collected + tax + stamp duty. */
  received: Centimes;
}

export interface IncomeReport {
  byDivision: Record<Division, IncomeFigures>;
  total: IncomeFigures;
}

function emptyFigures(): IncomeFigures {
  return { collected: 0, vatCollected: 0, stampCollected: 0, received: 0 };
}

function perDivision<T>(make: () => T): Record<Division, T> {
  return Object.fromEntries(DIVISIONS.map((division) => [division, make()])) as Record<Division, T>;
}

/**
 * The part of one payment that is income before tax.
 *
 * The part that settles an invoice is split by that invoice's own ratio of
 * total before tax to total with tax; the rest (an advance) at the rate in
 * force under VAT, and not at all under IFU. The tax is `amount − beforeTax`.
 */
export function beforeTaxOf(
  payment: Pick<IncomePayment, "amount">,
  matches: readonly InvoiceMatch[],
  taxMode: TaxMode,
  vatRate: BasisPoints,
): Centimes {
  let beforeTax = 0;
  let matched = 0;
  for (const match of matches) {
    const part = Math.min(match.amount, payment.amount - matched);
    if (part <= 0) continue;
    matched += part;
    beforeTax += match.invoiceTotalTTC === 0 ? 0 : mulDivRound(part, match.invoiceTotalHT, match.invoiceTotalTTC);
  }
  const advance = payment.amount - matched;
  return beforeTax + (taxMode === "VAT" ? mulDivRound(advance, 10_000, 10_000 + vatRate) : advance);
}

/** How payments settle invoices, by payment. */
export function matchesByPayment(matches: readonly InvoiceMatch[]): Map<string, InvoiceMatch[]> {
  const byPayment = new Map<string, InvoiceMatch[]>();
  for (const match of matches) byPayment.set(match.paymentId, [...(byPayment.get(match.paymentId) ?? []), match]);
  return byPayment;
}

export function divisionIncome(input: {
  payments: readonly IncomePayment[];
  /** How payments settle invoices. A payment with no match is an advance. */
  matches: readonly InvoiceMatch[];
  from: IsoDate;
  to: IsoDate;
  taxMode: TaxMode;
  vatRate: BasisPoints;
}): IncomeReport {
  const byPayment = matchesByPayment(input.matches);
  const byDivision = perDivision(emptyFigures);
  const total = emptyFigures();

  for (const payment of input.payments) {
    if (payment.voided || !isWithin(payment.receivedDate, input.from, input.to)) continue;
    const beforeTax = beforeTaxOf(payment, byPayment.get(payment.id) ?? [], input.taxMode, input.vatRate);

    for (const figures of [byDivision[payment.division], total]) {
      figures.collected += beforeTax;
      figures.vatCollected += payment.amount - beforeTax;
      figures.stampCollected += payment.stampDuty;
      figures.received += payment.amount + payment.stampDuty;
    }
  }

  return { byDivision, total };
}

export interface InvoicedRow {
  division: Division;
  /** «تاريخ الفاتورة». */
  issueDate: IsoDate;
  totalHT: Centimes;
  totalTTC: Centimes;
  voided: boolean;
}

/** «المفوتر»: invoices issued in the period, before tax and with tax. Voided ones are left out. */
export function invoicedByDivision(
  invoices: readonly InvoicedRow[],
  from: IsoDate,
  to: IsoDate,
): Record<Division, { beforeTax: Centimes; withTax: Centimes }> {
  const result = perDivision(() => ({ beforeTax: 0, withTax: 0 }));
  for (const invoice of invoices) {
    if (invoice.voided || !isWithin(invoice.issueDate, from, to)) continue;
    result[invoice.division].beforeTax += invoice.totalHT;
    result[invoice.division].withTax += invoice.totalTTC;
  }
  return result;
}

export interface OutstandingRow {
  division: Division;
  /** The receivable: never the stamp duty. */
  amount: Centimes;
  paidAmount: Centimes;
  cancelled: boolean;
}

/** «غير المحصّل»: what remains on dues that are not cancelled. */
export function outstandingByDivision(dues: readonly OutstandingRow[]): Record<Division, Centimes> {
  const result = perDivision(() => 0);
  for (const due of dues) {
    if (due.cancelled) continue;
    result[due.division] += Math.max(0, due.amount - due.paidAmount);
  }
  return result;
}

export interface ExpenseRow {
  division: ExpenseDivision;
  date: IsoDate;
  amount: Centimes;
  /** A removed expense (removed with a reason, never erased). */
  deleted: boolean;
}

/** «المصاريف»: what was spent in the period, on each of his four lines and on «عام». */
export function expensesByDivision(
  expenses: readonly ExpenseRow[],
  from: IsoDate,
  to: IsoDate,
): Record<ExpenseDivision, Centimes> {
  const result: Record<ExpenseDivision, Centimes> = { ...perDivision(() => 0), COMMON: 0 };
  for (const expense of expenses) {
    if (expense.deleted || !isWithin(expense.date, from, to)) continue;
    result[expense.division] += expense.amount;
  }
  return result;
}

export interface DivisionResult {
  income: Centimes;
  /** The division's own expenses. */
  expenses: Centimes;
  /** Its share of the common expenses, when they are spread; else 0. */
  commonShare: Centimes;
  /** income − expenses − commonShare. */
  result: Centimes;
}

export interface PeriodResult {
  byDivision: Record<Division, DivisionResult>;
  /** The common expenses left as one line of their own (0 when spread). */
  commonExpenses: Centimes;
  totalIncome: Centimes;
  totalExpenses: Centimes;
  /** «الربح»: total income − total expenses. The same whether the common line is spread or not. */
  profit: Centimes;
}

/**
 * The result of a period: income less expenses, per division and in total.
 *
 * Common expenses (rent, telephone, the office) have no line among his four.
 * By default they stay one line of their own. `spreadCommon` shares them
 * between the divisions in proportion to income; with no income at all there
 * is nothing to go by, and they stay where they are.
 */
export function periodResult(input: {
  income: Record<Division, Centimes>;
  expenses: Record<ExpenseDivision, Centimes>;
  spreadCommon: boolean;
}): PeriodResult {
  const totalIncome = DIVISIONS.reduce((sum, division) => sum + input.income[division], 0);
  const common = input.expenses.COMMON;
  const spread = input.spreadCommon && totalIncome > 0;
  const shares = spread
    ? shareByWeights(
        common,
        DIVISIONS.map((division) => Math.max(0, input.income[division])),
      )
    : DIVISIONS.map(() => 0);

  const byDivision = Object.fromEntries(
    DIVISIONS.map((division, index) => {
      const income = input.income[division];
      const expenses = input.expenses[division];
      const commonShare = shares[index];
      return [division, { income, expenses, commonShare, result: income - expenses - commonShare }];
    }),
  ) as Record<Division, DivisionResult>;

  const totalExpenses = DIVISIONS.reduce((sum, division) => sum + input.expenses[division], 0) + common;
  return {
    byDivision,
    commonExpenses: spread ? 0 : common,
    totalIncome,
    totalExpenses,
    profit: totalIncome - totalExpenses,
  };
}
