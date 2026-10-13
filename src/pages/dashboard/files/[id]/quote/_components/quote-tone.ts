import type { StatusTone } from "@/components/status-chip";
import type { QuoteResult, QuoteStatus } from "@/features/clients/validators/pricing";

/** The chip of a quote's status and of the client's answer, in the academy's seven tones. */
export const QUOTE_STATUS_TONE: Readonly<Record<QuoteStatus, StatusTone>> = {
  DRAFT: "neutral",
  AWAITING_APPROVAL: "pending",
  APPROVED: "info",
  NEEDS_REVIEW: "warning",
  ISSUED: "success",
  SUPERSEDED: "neutral",
  CANCELLED: "danger",
};

export const QUOTE_RESULT_TONE: Readonly<Record<QuoteResult, StatusTone>> = {
  PENDING: "pending",
  ACCEPTED: "success",
  REFUSED: "danger",
  DISCOUNT_REQUESTED: "warning",
  CHANGE_REQUESTED: "warning",
  POSTPONED: "info",
  NO_ANSWER: "neutral",
};

/** The quote number, with its version when it has been revised. */
export function quoteLabel(quote: { number: string; version: number }): string {
  return quote.version > 1 ? `${quote.number} (${quote.version})` : quote.number;
}
