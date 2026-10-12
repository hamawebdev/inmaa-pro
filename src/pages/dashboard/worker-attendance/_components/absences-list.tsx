import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { Ban, History } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ABSENCE_STATUSES } from "@/features/operations/services/absences";
import type { AbsenceLine } from "@/features/operations/services/worker-attendance";
import { useCodeLabel } from "@/i18n/use-code-label";
import { normaliseName } from "@/lib/text/normalise";

import { AbsenceKind, AbsencePay, AbsenceStatusChip, AbsenceWhen, PeriodSwitch, WorkerCell } from "./attendance-bits";
import { CANCELLABLE, useDates, workerName } from "./attendance-helpers";
import { monthRange, shiftMonth } from "./attendance-params";
import { absencesQuery } from "./attendance-queries";

const ALL = "ALL";

/**
 * «الغيابات»: the absences that touch a month, everybody's, each one whole.
 * A leave asked for shows as asked for: HR decides on it on People's screens.
 *
 * Closest academy screen: the absence overview and the person's absences
 * (attendance/_components/staff-absence-overview.tsx, staff-absence-detail.tsx):
 * a search, the table with the type as a badge and the status as a chip, the
 * row button to the person; the month switch is the history's week switch.
 */
export function AbsencesList({
  month,
  thisMonth,
  onMonthChange,
  historyHref,
  onCancel,
}: {
  month: string;
  thisMonth: string;
  onMonthChange: (month: string) => void;
  historyHref: (workerId: string) => string;
  /** Left out when the reader may not cancel an absence. */
  onCancel?: (line: AbsenceLine) => void;
}) {
  const t = useTranslations("WorkerAttendance");
  const statusLabel = useCodeLabel("WorkerAttendance.AbsenceStatuses");
  const dates = useDates();
  const { from, to } = monthRange(month);
  const list = useQuery(absencesQuery(from, to));
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<string>(ALL);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  const lines = React.useMemo(() => list.data ?? [], [list.data]);
  const shown = React.useMemo(() => {
    const words = normaliseName(search);
    const typed = search.trim();
    return lines.filter((line) => {
      if (status !== ALL && line.status !== status) return false;
      if (!words && !typed) return true;
      if (!line.worker) return false;
      const name = normaliseName(workerName(line.worker));
      return (
        (words !== "" && words.split(" ").every((word) => name.includes(word))) ||
        (typed !== "" && line.worker.number.includes(typed))
      );
    });
  }, [lines, search, status]);

  const columns = React.useMemo<ColumnDef<AbsenceLine>[]>(
    () => [
      { id: "worker", header: t("Worker"), cell: ({ row }) => <WorkerCell worker={row.original.worker} /> },
      { id: "when", header: t("Absences.Columns.When"), cell: ({ row }) => <AbsenceWhen line={row.original} /> },
      { id: "kind", header: t("Absences.Columns.Kind"), cell: ({ row }) => <AbsenceKind line={row.original} /> },
      {
        id: "status",
        header: t("Absences.Columns.Status"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <AbsenceStatusChip status={row.original.status} />
            {row.original.status === "REQUESTED" && (
              <span className="text-sm text-muted-foreground">{t("Absences.HrDecides")}</span>
            )}
          </div>
        ),
      },
      { id: "pay", header: t("Absences.Columns.Pay"), cell: ({ row }) => <AbsencePay line={row.original} /> },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={historyHref(row.original.workerId)}>
                <History />
                {t("OpenHistory")}
              </Link>
            </Button>
            {onCancel && CANCELLABLE.includes(row.original.status) && (
              <Button variant="outline" size="sm" onClick={() => onCancel(row.original)}>
                <Ban />
                {t("Absences.Cancel")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, historyHref, onCancel],
  );

  const table = useReactTable({
    data: shown,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const goTo = (next: string) => {
    onMonthChange(next);
    firstPage();
  };

  return (
    <div className="space-y-5">
      <PeriodSwitch
        label={dates.month(month)}
        previousLabel={t("Month.Previous")}
        nextLabel={t("Month.Next")}
        onPrevious={() => goTo(shiftMonth(month, -1))}
        onNext={() => goTo(shiftMonth(month, 1))}
        presentLabel={month !== thisMonth ? t("Month.Current") : undefined}
        onPresent={() => goTo(thisMonth)}
      />

      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <TableSearch
              className="w-full lg:max-w-sm lg:flex-1"
              placeholder={t("Search")}
              value={search}
              onChange={(value) => {
                setSearch(value);
                firstPage();
              }}
            />
            <Select
              value={status}
              onValueChange={(next) => {
                setStatus(next);
                firstPage();
              }}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label={t("Absences.Columns.Status")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("Absences.AllStatuses")}</SelectItem>
                {ABSENCE_STATUSES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {statusLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DataTable
            table={table}
            columnCount={columns.length}
            emptyMessage={t(list.isPending ? "Loading" : lines.length === 0 ? "Absences.None" : "Absences.NoMatch")}
          />
          <TablePager table={table} />
        </>
      )}
    </div>
  );
}
