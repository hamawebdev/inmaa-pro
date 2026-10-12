import type { AmountBasis, DueKind, PaymentFrequency, ServiceType } from "../validators/option-codes";

import { assertInteger, mulDivRound, shareByWeights, type Centimes } from "./centimes";
import { addDays, addMonths, diffDays, type IsoDate } from "./dates";

/**
 * The amounts a file's client is expected to pay, and when (scope A7).
 *
 * His contract forms give one «المبلغ إجمالي», one «تاريخ تسديد» and a
 * «دورية السداد». From them:
 *
 *  1. **Periods** start at «تاريخ البداية» and step by the frequency: seven
 *     days, fourteen days, a calendar month, or one planned visit. The last
 *     period is cut at «تاريخ النهاية».
 *  2. **Weight.** A whole period weighs 1. A cut last period weighs its planned
 *     visits against those of a whole period, never more than 1; with no
 *     planned visit in it, it has no due. (Before any visit is planned, days
 *     stand in for visits.)
 *  3. **Amount.** Per payment period: «المبلغ إجمالي» × weight. Whole contract:
 *     «المبلغ إجمالي» shared by weight, the last due taking the remainder.
 *  4. **Due date.** The first is «تاريخ تسديد»; the next ones are that date
 *     moved by the same step. Left empty, each due falls on the last day of its
 *     period. So the date he writes decides advance or arrears.
 *
 * A request (on demand) has no frequency on its form: it gives one due. A
 * contract whose frequency or end date is still empty gives none.
 *
 * This builds what the file's terms say and nothing else: it does not know what
 * was invoiced or paid. Keeping settled dues as they are when the terms change
 * is the work of the service that calls it.
 */

export interface DueTerms {
  serviceType: ServiceType;
  /** «تاريخ البداية». */
  startDate: IsoDate;
  /** «تاريخ النهاية». Required for a contract. */
  endDate: IsoDate | null;
  /** «دورية السداد». Contracts only. */
  frequency: PaymentFrequency | null;
  /** «المبلغ إجمالي», in centimes. */
  totalAmount: Centimes;
  amountBasis: AmountBasis;
  /** «تاريخ تسديد» / «تاريخ التسديد». */
  firstDueDate: IsoDate | null;
}

/** A planned visit of the file, from Operations. Only its day matters here. */
export interface PlannedVisit {
  id: string;
  date: IsoDate;
}

export interface ScheduledDue {
  /** 1, 2, 3… in the order of the periods. */
  seq: number;
  kind: Extract<DueKind, "SCHEDULE" | "VISIT" | "SINGLE">;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** The visit a `VISIT` due is for. */
  visitId: string | null;
  dueDate: IsoDate;
  plannedVisits: number;
  expectedAmount: Centimes;
}

interface Period {
  start: IsoDate;
  end: IsoDate;
  /** Where the period would end if the contract did not. */
  naturalEnd: IsoDate;
  visits: number;
}

function sortedVisits(visits: readonly PlannedVisit[]): PlannedVisit[] {
  return [...visits].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

function periodsOf(start: IsoDate, end: IsoDate, frequency: Exclude<PaymentFrequency, "PER_VISIT">): Period[] {
  const periods: Period[] = [];
  for (let index = 0; ; index += 1) {
    const from = frequency === "MONTHLY" ? addMonths(start, index) : addDays(start, index * stepDays(frequency));
    if (from > end) break;
    const naturalEnd =
      frequency === "MONTHLY" ? addDays(addMonths(start, index + 1), -1) : addDays(from, stepDays(frequency) - 1);
    periods.push({ start: from, end: naturalEnd < end ? naturalEnd : end, naturalEnd, visits: 0 });
  }
  return periods;
}

function stepDays(frequency: "WEEKLY" | "BIWEEKLY"): number {
  return frequency === "WEEKLY" ? 7 : 14;
}

/** The k-th due date (k from 0), from the first one. */
function dueDateAt(first: IsoDate, index: number, frequency: Exclude<PaymentFrequency, "PER_VISIT">): IsoDate {
  return frequency === "MONTHLY" ? addMonths(first, index) : addDays(first, index * stepDays(frequency));
}

export function buildDueSchedule(terms: DueTerms, plannedVisits: readonly PlannedVisit[]): ScheduledDue[] {
  assertInteger(terms.totalAmount, "total amount");
  if (terms.totalAmount < 0) throw new RangeError("the total amount cannot be negative");
  if (terms.endDate !== null && terms.endDate < terms.startDate) {
    throw new RangeError("the end date is before the start date");
  }

  const visits = sortedVisits(plannedVisits).filter(
    (visit) => visit.date >= terms.startDate && (terms.endDate === null || visit.date <= terms.endDate),
  );

  if (terms.serviceType === "ON_DEMAND") return singleDue(terms, visits);
  // A contract whose terms are not all written yet expects nothing yet.
  if (terms.frequency === null || terms.endDate === null) return [];
  if (terms.frequency === "PER_VISIT") return perVisitDues(terms, visits);
  return periodDues(terms, terms.endDate, terms.frequency, visits);
}

/** What a contract still lacks before its dues can be built. Empty for a request. */
export function missingDueTerms(terms: DueTerms): ("frequency" | "endDate")[] {
  if (terms.serviceType === "ON_DEMAND") return [];
  const missing: ("frequency" | "endDate")[] = [];
  if (terms.frequency === null) missing.push("frequency");
  if (terms.endDate === null) missing.push("endDate");
  return missing;
}

/** One due for the whole job. */
function singleDue(terms: DueTerms, visits: readonly PlannedVisit[]): ScheduledDue[] {
  const lastVisit = visits.length > 0 ? visits[visits.length - 1].date : null;
  const periodEnd = terms.endDate ?? lastVisit ?? terms.startDate;
  return [
    {
      seq: 1,
      kind: "SINGLE",
      periodStart: terms.startDate,
      periodEnd,
      visitId: null,
      dueDate: terms.firstDueDate ?? periodEnd,
      plannedVisits: visits.length,
      expectedAmount: terms.totalAmount,
    },
  ];
}

/** «بعد كل زيارة»: one due per planned visit. */
function perVisitDues(terms: DueTerms, visits: readonly PlannedVisit[]): ScheduledDue[] {
  if (visits.length === 0) return [];
  // The first due date against the first visit gives the delay every visit keeps.
  const delay = terms.firstDueDate === null ? 0 : diffDays(visits[0].date, terms.firstDueDate);
  const amounts =
    terms.amountBasis === "PER_PAYMENT_PERIOD"
      ? visits.map(() => terms.totalAmount)
      : shareByWeights(
          terms.totalAmount,
          visits.map(() => 1),
        );

  return visits.map((visit, index) => ({
    seq: index + 1,
    kind: "VISIT",
    periodStart: visit.date,
    periodEnd: visit.date,
    visitId: visit.id,
    dueDate: addDays(visit.date, delay),
    plannedVisits: 1,
    expectedAmount: amounts[index],
  }));
}

/** «أسبوعيا», «كل أسبوعين», «كل شهر»: one due per period. */
function periodDues(
  terms: DueTerms,
  endDate: IsoDate,
  frequency: Exclude<PaymentFrequency, "PER_VISIT">,
  visits: readonly PlannedVisit[],
): ScheduledDue[] {
  const periods = periodsOf(terms.startDate, endDate, frequency);
  for (const visit of visits) {
    const period = periods.find((candidate) => visit.date >= candidate.start && visit.date <= candidate.end);
    if (period) period.visits += 1;
  }

  // Weights as whole numbers over one denominator, so nothing is rounded before the amounts are.
  const whole = periods.filter((period) => period.end === period.naturalEnd);
  const visitsInWhole = whole.reduce((sum, period) => sum + period.visits, 0);
  const visitsKnown = visits.length > 0;

  let denominator: number;
  let weightOf: (period: Period) => number;
  if (whole.length === 0) {
    // The contract is shorter than one period: its one period is the whole of it.
    denominator = 1;
    weightOf = () => 1;
  } else if (visitsKnown && visitsInWhole > 0) {
    denominator = visitsInWhole;
    weightOf = (period) =>
      period.end === period.naturalEnd ? denominator : Math.min(period.visits * whole.length, denominator);
  } else {
    // No visit planned yet: a cut period weighs its days.
    const cut = periods.find((period) => period.end !== period.naturalEnd);
    denominator = cut ? diffDays(cut.start, cut.naturalEnd) + 1 : 1;
    weightOf = (period) => (period.end === period.naturalEnd ? denominator : diffDays(period.start, period.end) + 1);
  }

  const weights = periods.map(weightOf);
  const amounts =
    terms.amountBasis === "PER_PAYMENT_PERIOD"
      ? weights.map((weight) => mulDivRound(terms.totalAmount, weight, denominator))
      : shareByWeights(terms.totalAmount, weights);

  const dues: ScheduledDue[] = [];
  periods.forEach((period, index) => {
    if (weights[index] === 0) return;
    dues.push({
      seq: dues.length + 1,
      kind: "SCHEDULE",
      periodStart: period.start,
      periodEnd: period.end,
      visitId: null,
      // The index of the period, not of the due: a skipped period still moves the calendar on.
      dueDate: terms.firstDueDate === null ? period.end : dueDateAt(terms.firstDueDate, index, frequency),
      plannedVisits: period.visits,
      expectedAmount: amounts[index],
    });
  });
  return dues;
}
