import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlarmClock, CalendarClock, ClipboardX, Clock, History } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Duration, Nothing } from "@/features/people/components/figures";
import { monthBounds } from "@/features/people/components/format";
import { ListTable } from "@/features/people/components/list-table";
import { MonthSwitch } from "@/features/people/components/month-switch";
import { workerHoursQuery, type WorkerHours } from "@/features/people/services/hours";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

/**
 * Each worker's hours of a month (feature 21): what the typed orders give,
 * with the overtime of the weeks that end in the month, lateness, absences,
 * and the orders not typed in yet, which are hours still missing.
 *
 * Closest academy screen: the attendance overview (a table to search, a
 * button per row to the person's history), under a period switch.
 */
export function HoursView({
  month,
  thisMonth,
  onMonthChange,
}: {
  month: string;
  thisMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const t = useTranslations("Hours");
  const { from, to } = monthBounds(month);
  const { data, isPending } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "hours", month],
    queryFn: () => workerHoursQuery({ from, to }),
  });
  const rows = React.useMemo(() => data ?? [], [data]);

  const sum = (pick: (row: WorkerHours) => number) => rows.reduce((total, row) => total + pick(row), 0);

  const columns = React.useMemo<ColumnDef<WorkerHours>[]>(
    () => [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => <Ltr className="font-bold whitespace-nowrap tabular-nums">{row.original.number}</Ltr>,
      },
      {
        id: "name",
        header: t("Table.Worker"),
        cell: ({ row }) => (
          <Link
            to={`/dashboard/hours-pay/workers/${row.original.workerId}?month=${month}`}
            className="font-bold hover:underline"
          >
            {staffName(row.original)}
          </Link>
        ),
      },
      {
        id: "worked",
        header: t("Table.Worked"),
        cell: ({ row }) => <Duration minutes={row.original.totals.workedMin} />,
      },
      {
        id: "overtime",
        header: t("Table.Overtime"),
        cell: ({ row }) =>
          row.original.totals.overtimeMin > 0 ? (
            <Duration minutes={row.original.totals.overtimeMin} className="font-bold text-warning-ink" />
          ) : (
            <Nothing />
          ),
      },
      {
        id: "late",
        header: t("Table.Late"),
        cell: ({ row }) =>
          row.original.totals.lateCount > 0 ? (
            <span className="whitespace-nowrap">
              {t("Table.LateTimes", { count: row.original.totals.lateCount })} ·{" "}
              <Duration minutes={row.original.totals.lateMin} />
            </span>
          ) : (
            <Nothing />
          ),
      },
      {
        id: "absence",
        header: t("Table.Absence"),
        cell: ({ row }) =>
          row.original.totals.absenceMin > 0 ? <Duration minutes={row.original.totals.absenceMin} /> : <Nothing />,
      },
      {
        id: "notTyped",
        header: t("Table.NotTyped"),
        cell: ({ row }) =>
          row.original.totals.ordersNotTyped > 0 ? (
            <StatusChip
              tone="warning"
              label={t("Table.NotTypedCount", { count: row.original.totals.ordersNotTyped })}
            />
          ) : (
            <StatusChip tone="success" label={t("Table.AllTyped")} />
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/hours-pay/workers/${row.original.workerId}?month=${month}`}>
                <History />
                {t("Table.Details")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, month],
  );

  return (
    <div className="space-y-5">
      <MonthSwitch month={month} thisMonth={thisMonth} onChange={onMonthChange} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Stats.Worked")}
          value={<Duration minutes={sum((row) => row.totals.workedMin)} />}
          icon={Clock}
          tone="workers"
        />
        <StatCard
          label={t("Stats.Overtime")}
          value={<Duration minutes={sum((row) => row.totals.overtimeMin)} />}
          hint={t("Stats.OvertimeHint")}
          icon={CalendarClock}
          tone="workers"
        />
        <StatCard
          label={t("Stats.Late")}
          value={<Ltr className="tabular-nums">{sum((row) => row.totals.lateCount)}</Ltr>}
          hint={t("Stats.LateHint")}
          icon={AlarmClock}
          tone="workers"
        />
        <StatCard
          label={t("Stats.NotTyped")}
          value={<Ltr className="tabular-nums">{sum((row) => row.totals.ordersNotTyped)}</Ltr>}
          hint={t("Stats.NotTypedHint")}
          icon={ClipboardX}
          tone="workers"
        />
      </div>
      <ListTable
        rows={rows}
        columns={columns}
        text={(row) => `${staffName(row)} ${row.number}`}
        searchPlaceholder={t("Search")}
        emptyMessage={t(isPending ? "Loading" : "None")}
      />
    </div>
  );
}
