import { BellRing, CalendarCheck, CircleCheckBig, Timer, type LucideIcon } from "lucide-react";
import { useTranslations } from "use-intl";

import { StatusChip, type StatusTone } from "@/components/status-chip";
import { useCodeLabel } from "@/i18n/use-code-label";

import type { VisitStatus } from "../validators/option-codes";

/**
 * A visit's status as a chip: his colours from the study (أخضر مؤكدة, أصفر في
 * انتظار التأكيد, أزرق تم التنفيذ, أحمر مشكلة, أسود ملغاة), each with its icon and
 * its word.
 *
 * «جارية» has no colour in his list. Foundation is adding a seventh tone for
 * it; until then it borrows the blue of «منفذة», the nearest state, with its
 * own icon. That is the one line to change when the tone exists.
 */
const STATUS_LOOK: Record<VisitStatus, { tone: StatusTone; icon?: LucideIcon }> = {
  CONFIRMED: { tone: "success", icon: CalendarCheck },
  AWAITING_CONFIRMATION: { tone: "warning" },
  IN_PROGRESS: { tone: "info", icon: Timer },
  DONE: { tone: "info", icon: CircleCheckBig },
  POSTPONED: { tone: "pending" },
  PROBLEM: { tone: "danger" },
  CANCELLED: { tone: "neutral" },
};

export function VisitStatusChip({ status }: { status: VisitStatus }) {
  const label = useCodeLabel("VisitStatuses");
  const look = STATUS_LOOK[status];
  return <StatusChip tone={look.tone} icon={look.icon} label={label(status)} />;
}

/** «لم يُبلَّغ عن الوصول»: the visit should have started and nobody has told the office it did. */
export function NoArrivalFlag() {
  const t = useTranslations("VisitEntry.Notes");
  return <StatusChip tone="danger" icon={BellRing} label={t("NO_ARRIVAL_REPORTED")} />;
}
