import { RATE_COST_LINES, type CostLineCode, type QuoteLineKind, type QuoteStatus } from "../validators/pricing";

/**
 * The arithmetic of the cost study and of the quote. Amounts are whole
 * centimes, rates basis points, quantities and weeks thousandths, durations
 * minutes: what the database holds.
 */

export interface CostLine {
  code: CostLineCode;
  label: string | null;
  amount: number;
  /** The typed percentage of RESERVE, ADMIN_SHARE and TAX_INSURANCE; null on the other lines, or when the amount is typed. */
  rateBp: number | null;
}

export interface CostStudyTerms {
  workers: number | null;
  perVisitMin: number | null;
  visitsPerWeek: number | null;
  weeks: number | null;
  hourlyRate: number | null;
  lines: readonly CostLine[];
  marginPercent: number | null;
  discount: number | null;
}

export interface CostStudyTotals {
  /** The visits the study covers: per week times weeks, or one job. */
  visits: number;
  /** Hours of work over the whole study, in minutes. */
  labourMin: number;
  /** The lines as they are stored: labour worked out, the three rates applied. */
  lines: CostLine[];
  totalCost: number;
  profitValue: number;
  priceBeforeDiscount: number;
  finalPrice: number;
  pricePerVisit: number | null;
  pricePerWeek: number | null;
  pricePerMonth: number | null;
}

const WEEKS_PER_MONTH = 52 / 12;

/**
 * Works a cost study out. The labour line is workers × time per visit × visits
 * × the hourly cost whenever those four are known; the reserve, the share of
 * administration and tax and insurance are percentages of the direct costs
 * when a percentage is typed; the margin is a percentage of the whole cost.
 */
export function computeCostStudy(terms: CostStudyTerms): CostStudyTotals {
  const weeks = terms.weeks !== null && terms.weeks > 0 ? terms.weeks / 1000 : null;
  const visits =
    terms.visitsPerWeek !== null && terms.visitsPerWeek > 0 && weeks !== null
      ? Math.max(1, Math.round(terms.visitsPerWeek * weeks))
      : 1;
  const labourMin = (terms.workers ?? 0) * (terms.perVisitMin ?? 0) * visits;
  const labour = terms.hourlyRate !== null && labourMin > 0 ? Math.round((labourMin * terms.hourlyRate) / 60) : null;

  const worked = terms.lines.map((line) =>
    line.code === "LABOUR" && labour !== null ? { ...line, amount: labour, rateBp: null } : { ...line },
  );
  if (labour !== null && !worked.some((line) => line.code === "LABOUR")) {
    worked.unshift({ code: "LABOUR", label: null, amount: labour, rateBp: null });
  }
  const direct = worked
    .filter((line) => !RATE_COST_LINES.includes(line.code))
    .reduce((sum, line) => sum + line.amount, 0);
  const lines = worked.map((line) =>
    RATE_COST_LINES.includes(line.code) && line.rateBp !== null
      ? { ...line, amount: Math.round((direct * line.rateBp) / 10000) }
      : RATE_COST_LINES.includes(line.code)
        ? line
        : { ...line, rateBp: null },
  );

  const totalCost = lines.reduce((sum, line) => sum + line.amount, 0);
  const profitValue = Math.round((totalCost * (terms.marginPercent ?? 0)) / 10000);
  const priceBeforeDiscount = totalCost + profitValue;
  const finalPrice = Math.max(0, priceBeforeDiscount - (terms.discount ?? 0));
  return {
    visits,
    labourMin,
    lines,
    totalCost,
    profitValue,
    priceBeforeDiscount,
    finalPrice,
    pricePerVisit: Math.round(finalPrice / visits),
    pricePerWeek: weeks !== null ? Math.round(finalPrice / weeks) : null,
    pricePerMonth:
      weeks !== null && weeks >= WEEKS_PER_MONTH ? Math.round(finalPrice / (weeks / WEEKS_PER_MONTH)) : null,
  };
}

export interface PricedLine {
  kind: QuoteLineKind;
  /** Thousandths. */
  quantity: number;
  unitPrice: number;
}

/** A line's amount: quantity × unit price. */
export const quoteLineAmount = (line: Pick<PricedLine, "quantity" | "unitPrice">) =>
  Math.round((line.quantity * line.unitPrice) / 1000);

export interface QuoteTotals {
  subtotal: number;
  discount: number;
  total: number;
  /** The total of each kind of line, before the discount. */
  byKind: Record<QuoteLineKind, number>;
}

export function quoteTotals(lines: readonly PricedLine[], discount: number): QuoteTotals {
  const byKind: Record<QuoteLineKind, number> = { INITIAL_JOB: 0, PERIODIC: 0, EXTRA: 0 };
  for (const line of lines) byKind[line.kind] += quoteLineAmount(line);
  const subtotal = byKind.INITIAL_JOB + byKind.PERIODIC + byKind.EXTRA;
  const taken = Math.min(discount, subtotal);
  return { subtotal, discount: taken, total: subtotal - taken, byKind };
}

/**
 * What the file takes as «المبلغ إجمالي» when its quote is accepted. A job on
 * demand is the whole quote. A contract is the quote without its first deep
 * clean, which is billed once on its own (RULINGS.md 3); the discount comes
 * off the periodic part.
 */
export function fileAmountOf(totals: QuoteTotals, serviceType: "ON_DEMAND" | "CONTRACT"): number {
  const periodic = totals.byKind.PERIODIC + totals.byKind.EXTRA;
  if (serviceType === "ON_DEMAND" || periodic === 0) return totals.total;
  return Math.max(0, periodic - totals.discount);
}

/** The margin the price leaves over the cost, in basis points of the cost; null without a cost. */
export const marginOver = (cost: number | null, price: number): number | null =>
  cost !== null && cost > 0 ? Math.round(((price - cost) * 10000) / cost) : null;

/** What may be done to a quote in each status. */
export const QUOTE_STEPS: Readonly<
  Record<QuoteStatus, readonly ("EDIT" | "SUBMIT" | "DECIDE" | "ISSUE" | "CANCEL")[]>
> = {
  DRAFT: ["EDIT", "SUBMIT", "CANCEL"],
  NEEDS_REVIEW: ["EDIT", "SUBMIT", "CANCEL"],
  AWAITING_APPROVAL: ["DECIDE", "CANCEL"],
  APPROVED: ["ISSUE", "CANCEL"],
  ISSUED: [],
  SUPERSEDED: [],
  CANCELLED: [],
};
