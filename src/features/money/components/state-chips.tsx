import { useTranslations } from "use-intl";

import { StatusChip, type StatusTone } from "@/components/status-chip";
import { useCodeLabel } from "@/i18n/use-code-label";

import type { DueReadiness } from "../services/invoices";
import type { DueState, PaymentState } from "../validators/option-codes";

/**
 * The money states as chips: a colour, an icon and a word, always the three.
 * His colours: green for what is settled, yellow for what waits, red for a
 * problem, grey for what is cancelled.
 */

const PAYMENT_TONE: Record<PaymentState, StatusTone> = { PAID: "success", PARTIAL: "warning", UNPAID: "pending" };

/** «حالة الدفع» of an invoice or a file, in his words; a voided invoice owes nothing and says so. */
export function PaymentStateChip({ state }: { state: PaymentState | null }) {
  const label = useCodeLabel("MoneyCodes.PaymentStates");
  const t = useTranslations("MoneyCommon");
  if (state === null) return <StatusChip tone="neutral" label={t("VoidedInvoice")} />;
  return <StatusChip tone={PAYMENT_TONE[state]} label={label(state)} />;
}

const DUE_TONE: Record<DueState, StatusTone> = {
  UPCOMING: "pending",
  DUE_SOON: "warning",
  OVERDUE: "danger",
  PARTIAL: "info",
  PAID: "success",
  CANCELLED: "neutral",
};

/** A due's state on today; a late one says by how many days. */
export function DueStateChip({ state, daysLate = 0 }: { state: DueState; daysLate?: number }) {
  const label = useCodeLabel("MoneyCodes.DueStates");
  const t = useTranslations("MoneyCommon");
  const word = state === "OVERDUE" && daysLate > 0 ? t("DaysLate", { state: label(state), days: daysLate }) : label(state);
  return <StatusChip tone={DUE_TONE[state]} label={word} />;
}

const READINESS_TONE: Record<DueReadiness, StatusTone> = {
  READY: "success",
  PERIOD_OPEN: "pending",
  VISITS_OPEN: "progress",
  AWAITING_SIGNOFF: "warning",
  NOTHING_DONE: "neutral",
};

/** Whether a due can be invoiced now, and if not, what it waits for. */
export function ReadinessChip({ readiness }: { readiness: DueReadiness }) {
  const label = useCodeLabel("MoneyCodes.Readiness");
  return <StatusChip tone={READINESS_TONE[readiness]} label={label(readiness)} />;
}
