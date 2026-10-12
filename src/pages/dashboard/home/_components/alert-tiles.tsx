import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { StatCard } from "@/components/stat-card";
import { ALERTS_QUERY_KEY, evaluateAlertsQuery } from "@/features/core/services/alerts";
import { registeredAlerts } from "@/lib/alerts";
import { AGGREGATE_QUERY_OPTIONS } from "@/lib/query-client";

/**
 * The alert tiles: one per alert that concerns at least one record, most
 * serious first. Each is a link to its owner's list, filtered to those records.
 *
 * Nearest academy screen: the overview's payment-status tiles (expired, one
 * session left, debt): the whole tile is the way in, and the urgency is in the
 * words and the destination, not in colour alone. A tile wears the hue of the
 * section it leads to, as the bar does.
 */
export function AlertTiles() {
  const t = useTranslations("Home");
  const tAlert = useTranslations("Alerts");
  const alerts = useQuery({
    ...AGGREGATE_QUERY_OPTIONS,
    queryKey: ALERTS_QUERY_KEY,
    queryFn: () => evaluateAlertsQuery(undefined),
  });
  const icons = useMemo(() => new Map(registeredAlerts().map((alert) => [alert.key, alert.icon])), []);

  if (alerts.isError) return <ErrorState onRetry={() => void alerts.refetch()} />;
  // A count that could not be read is shown, not hidden: a quiet tile would say "all is well".
  const raised = (alerts.data ?? []).filter((alert) => alert.count === null || alert.count > 0);
  if (alerts.isPending) return <div className="h-28 animate-pulse rounded-xl bg-muted tall:h-32" />;
  if (raised.length === 0) return <p className="text-base text-muted-foreground tall:text-lg">{t("NoAlerts")}</p>;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 tall:gap-6">
      {raised.map((alert) => (
        <StatCard
          key={alert.key}
          label={tAlert(`${alert.name}.Title`)}
          value={alert.count ?? "—"}
          hint={alert.count === null ? t("AlertUnread") : tAlert(`${alert.name}.Hint`, { days: alert.leadDays ?? 0 })}
          icon={icons.get(alert.key)}
          tone={alert.section}
          href={alert.route}
        />
      ))}
    </div>
  );
}
