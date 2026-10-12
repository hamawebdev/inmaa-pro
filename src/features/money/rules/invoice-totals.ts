import type { MissedVisitRule, PaymentMethod, TaxMode } from "../validators/option-codes";

import { assertInteger, mulDivRound, percentOf, type BasisPoints, type Centimes } from "./centimes";
import { DEFAULT_STAMP_SETTINGS, stampDuty, type StampSettings } from "./stamp-duty";

/**
 * The totals of an invoice.
 *
 * One function, used when a draft is shown, when an invoice is issued and when
 * a sheet is printed from a sample, so the three can never disagree.
 *
 * What the law asks of the figures (Decree 05-468, through the build notes):
 * the total before tax, the tax with its rate, the total with tax; or, for a
 * centre under the single flat tax (IFU), one total and no VAT at all. A cash
 * settlement adds stamp duty.
 *
 * The figures satisfy, by construction, the checks the database makes on an
 * invoice:
 *
 *     totalTTC = totalHT + vatAmount
 *     netToPay = totalTTC + stampDuty
 *     under IFU: vatAmount = 0 and vatRate = 0
 *     not cash: stampDuty = 0
 *     grossAmount − discountAmount = totalHT (VAT, prices before tax) or totalTTC (otherwise)
 */

export interface InvoiceTotalsInput {
  /** The amount of each line. Negative for a missed visit, a discount, a deposit. */
  lineAmounts: readonly Centimes[];
  taxMode: TaxMode;
  /** The VAT rate in basis points (1900). Ignored under IFU. */
  vatRate: BasisPoints;
  /** Whether the lines are written with tax in them («المبلغ إجمالي» as the client agreed to pay it). */
  pricesIncludeVat: boolean;
  /** The one method chosen for this invoice. Stamp duty is shown when it is cash. */
  paymentMethod: PaymentMethod;
  stamp?: StampSettings;
}

export interface InvoiceTotals {
  /** «قيمة الخدمة»: the sum of the positive lines. */
  grossAmount: Centimes;
  /** «الخصم»: the sum of the negative lines, as a positive number. */
  discountAmount: Centimes;
  /** «المجموع خارج الرسم». Under IFU, the one total. */
  totalHT: Centimes;
  /** The rate that was applied: the setting under VAT, 0 under IFU. */
  vatRate: BasisPoints;
  /** «الرسم على القيمة المضافة». 0 under IFU. */
  vatAmount: Centimes;
  /** «المبلغ المستحق»: the total with tax. This, and never the stamp duty, is what the client owes. */
  totalTTC: Centimes;
  /** «حق الطابع»: on the total with tax, when the invoice is to be paid in cash. */
  stampDuty: Centimes;
  /** «الصافي للدفع» = total with tax + stamp duty. The amount written in words. */
  netToPay: Centimes;
}

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  let grossAmount = 0;
  let discountAmount = 0;
  for (const amount of input.lineAmounts) {
    assertInteger(amount, "line amount");
    if (amount >= 0) grossAmount += amount;
    else discountAmount -= amount;
  }

  const base = grossAmount - discountAmount;
  if (base < 0) throw new RangeError("the deductions of an invoice cannot exceed its lines");

  let totalHT: Centimes;
  let vatAmount: Centimes;
  let totalTTC: Centimes;
  let vatRate: BasisPoints;

  if (input.taxMode === "IFU") {
    vatRate = 0;
    vatAmount = 0;
    totalHT = base;
    totalTTC = base;
  } else {
    vatRate = input.vatRate;
    assertInteger(vatRate, "VAT rate");
    if (vatRate < 0) throw new RangeError("the VAT rate cannot be negative");
    if (input.pricesIncludeVat) {
      totalTTC = base;
      totalHT = mulDivRound(base, 10_000, 10_000 + vatRate);
      vatAmount = totalTTC - totalHT;
    } else {
      totalHT = base;
      // On the invoice's total, not line by line: one rounding.
      vatAmount = percentOf(totalHT, vatRate);
      totalTTC = totalHT + vatAmount;
    }
  }

  const duty = input.paymentMethod === "CASH" ? stampDuty(totalTTC, input.stamp ?? DEFAULT_STAMP_SETTINGS) : 0;

  return {
    grossAmount,
    discountAmount,
    totalHT,
    vatRate,
    vatAmount,
    totalTTC,
    stampDuty: duty,
    netToPay: totalTTC + duty,
  };
}

/** The price of one visit of a payment period: the period's amount shared by its planned visits. */
export function visitPrice(periodAmount: Centimes, plannedVisits: number): Centimes {
  assertInteger(plannedVisits, "planned visits");
  if (plannedVisits <= 0) throw new RangeError("a period needs at least one planned visit");
  return mulDivRound(periodAmount, 1, plannedVisits);
}

/**
 * What is taken off a period's invoice for visits that were neither done nor
 * replaced. Returned as a negative amount, ready to be a line; 0 when nothing
 * was missed.
 *
 *  - `BILL_DONE_ONLY` (the default, "invoices for visits done"): each missed
 *    visit costs its share of the period. The deduction is rounded once, so
 *    12 visits done of 13 at 45 000,00 leave exactly 41 538,46.
 *  - `FIXED_AMOUNT`: each missed visit costs the amount in settings. An amount
 *    of 0 bills the period whole.
 */
export function missedVisitDeduction(input: {
  rule: MissedVisitRule;
  periodAmount: Centimes;
  plannedVisits: number;
  missedVisits: number;
  /** Setting `invoice.missedVisitAmount`, for `FIXED_AMOUNT`. */
  fixedAmount?: Centimes;
}): Centimes {
  const { rule, periodAmount, plannedVisits, missedVisits } = input;
  assertInteger(periodAmount, "period amount");
  assertInteger(plannedVisits, "planned visits");
  assertInteger(missedVisits, "missed visits");
  if (missedVisits < 0 || missedVisits > plannedVisits) {
    throw new RangeError("missed visits must be between 0 and the planned visits");
  }
  if (missedVisits === 0) return 0;

  const deduction =
    rule === "BILL_DONE_ONLY"
      ? mulDivRound(periodAmount, missedVisits, plannedVisits)
      : Math.min(periodAmount, missedVisits * (input.fixedAmount ?? 0));
  return deduction === 0 ? 0 : -deduction;
}
