import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Printer, UserCog } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import {
  listZonesWithSupervisorsQuery,
  SUPERVISORS_PATH,
  type ZoneLine,
} from "@/features/operations/services/supervisors";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useSectionLevel } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";

import { AssignSupervisorDialog } from "./assign-supervisor-dialog";

/**
 * The zones, each with its supervisor today, its communes, its workers and
 * today's visits. A writer names a zone's supervisor; the supervisor's day
 * sheet opens from his row.
 */
export function ZonesView({ tabs }: { tabs: React.ReactNode }) {
  const t = useTranslations("SupervisorZones");
  const { today } = useCentreClock();
  const writes = useSectionLevel("EMPLOYEES") === "WRITE";
  const [assigning, setAssigning] = React.useState<ZoneLine | null>(null);
  const zones = useQuery({
    queryKey: [...pathKey(SUPERVISORS_PATH), "zones", today],
    queryFn: () => listZonesWithSupervisorsQuery({}),
  });

  const columns = React.useMemo<ColumnDef<ZoneLine>[]>(
    () => [
      {
        id: "zone",
        header: t("Columns.Zone"),
        cell: ({ row }) => {
          const communes = row.original.communes.join("، ");
          return (
            <div className="max-w-56 min-w-0 xl:max-w-96">
              <span className="block truncate font-bold">{row.original.name}</span>
              <span className="block truncate text-xs leading-4 text-muted-foreground" title={communes}>
                {communes || t("NoCommune")}
              </span>
            </div>
          );
        },
      },
      {
        id: "supervisor",
        header: t("Columns.Supervisor"),
        cell: ({ row }) => {
          const supervisor = row.original.supervisor;
          if (!supervisor) return <span className="font-semibold text-warning-ink">{t("NoSupervisor")}</span>;
          return (
            <div className="max-w-48 min-w-0 xl:max-w-72">
              <span className="block truncate font-bold" title={supervisor.name}>
                <bdi>{supervisor.name}</bdi>
              </span>
              {supervisor.phone && (
                <span className="block truncate text-xs leading-4 text-muted-foreground">
                  <Ltr>{supervisor.phone}</Ltr>
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "workers",
        header: t("Columns.Workers"),
        cell: ({ row }) => (
          <Link
            to={`${SUPERVISORS_PATH}?view=workers&zone=${row.original.id}`}
            className="font-bold tabular-nums underline-offset-4 hover:underline"
            title={t("Views.workers")}
          >
            <Ltr>{row.original.workers}</Ltr>
          </Link>
        ),
      },
      {
        id: "visits",
        header: t("Columns.VisitsToday"),
        cell: ({ row }) => (
          <span className="font-bold tabular-nums">
            <Ltr>{row.original.visitsToday}</Ltr>
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {row.original.supervisor && (
              <Button variant="outline" size="sm" asChild title={t("DaySheet")}>
                <Link to={`${SUPERVISORS_PATH}/${row.original.supervisor.id}/day/${today}/print`}>
                  <Printer />
                  <span className="sr-only 2xl:not-sr-only">{t("DaySheet")}</span>
                </Link>
              </Button>
            )}
            {writes && (
              <Button variant="outline" size="sm" title={t("Assign")} onClick={() => setAssigning(row.original)}>
                <UserCog />
                <span className="sr-only 2xl:not-sr-only">{t("Assign")}</span>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, today, writes],
  );

  const table = useReactTable({ data: zones.data ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-3 tall:space-y-5">
      {tabs}
      {zones.isError ? (
        <ErrorState onRetry={() => void zones.refetch()} />
      ) : (
        <DataTable
          table={table}
          columnCount={columns.length}
          emptyMessage={t(zones.isPending ? "Loading" : "Empty.zones")}
        />
      )}
      <AssignSupervisorDialog zone={assigning} today={today} onClose={() => setAssigning(null)} />
    </div>
  );
}
