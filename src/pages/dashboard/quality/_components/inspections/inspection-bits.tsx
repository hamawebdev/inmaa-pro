import { useTranslations } from "use-intl";

import { StatusChip, type StatusTone } from "@/components/status-chip";
import type { InspectionStatus } from "@/features/operations/validators/inspection";
import { useCodeLabel } from "@/i18n/use-code-label";

const STATUS_TONE: Record<InspectionStatus, StatusTone> = {
  PLANNED: "pending",
  DONE: "success",
  MISSED: "danger",
  CANCELLED: "neutral",
};

/**
 * An inspection's state: planned, done, missed, cancelled; a planned one
 * whose day has come says so («اليوم»), and one whose day has passed is late.
 */
export function InspectionStatusChip({
  status,
  plannedDate,
  today,
}: {
  status: InspectionStatus;
  plannedDate: string;
  today: string;
}) {
  const t = useTranslations("Inspections");
  const statusLabel = useCodeLabel("Inspections.Statuses");
  if (status === "PLANNED" && plannedDate < today) return <StatusChip tone="warning" label={t("List.Late")} />;
  if (status === "PLANNED" && plannedDate === today) return <StatusChip tone="info" label={t("List.Today")} />;
  return <StatusChip tone={STATUS_TONE[status]} label={statusLabel(status)} />;
}
