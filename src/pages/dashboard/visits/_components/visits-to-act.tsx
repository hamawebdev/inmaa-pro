import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowRight, ClipboardPen } from "lucide-react";
import { Link } from "react-router-dom";
import { useLocale, useTranslations } from "use-intl";

import { DataTable, TablePager } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { VisitStatusChip } from "@/features/operations/components/visit-status-chip";
import { endTimeOf } from "@/features/operations/rules/visit-dates";
import { listVisitsToActQuery, type VisitToAct } from "@/features/operations/services/board";
import { VISITS_PATH } from "@/features/operations/services/programme";
import type { VisitStatus } from "@/features/operations/validators/option-codes";
import { intlLocaleFor } from "@/i18n/config";
import { pathKey } from "@/lib/compat/revalidate";

export type VisitList = "not-returned" | "awaiting";

/**
 * The list an alert tile opens on the visits tab: past visits whose order is not
 * typed in, or visits still to come that wait for confirmation. Each row opens
 * the visit, where the order is typed or the team named.
 */
export function VisitsToAct({ kind }: { kind: VisitList }) {
  const t = useTranslations("VisitsToAct");
  const locale = useLocale();
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const list = useQuery({
    queryKey: [...pathKey(VISITS_PATH), "to-act", kind],
    queryFn: () => listVisitsToActQuery({ kind }),
  });
  const dateFormat = new Intl.DateTimeFormat(intlLocaleFor(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  const columns = React.useMemo<ColumnDef<VisitToAct>[]>(
    () => [
      {
        id: "date",
        header: t("Date"),
        cell: ({ row }) => (
          <span className="font-bold whitespace-nowrap">
            {dateFormat.format(new Date(`${row.original.visitDate}T00:00:00Z`))}
          </span>
        ),
      },
      {
        id: "time",
        header: t("Time"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            <Ltr>
              {row.original.plannedStartTime} –{" "}
              {endTimeOf({ startTime: row.original.plannedStartTime, durationMin: row.original.plannedDurationMin })}
            </Ltr>
          </span>
        ),
      },
      {
        id: "site",
        header: t("Site"),
        cell: ({ row }) => (
          <div className="max-w-40 min-w-0 xl:max-w-64">
            <span className="block truncate font-bold" title={row.original.siteName}>
              <bdi>{row.original.siteName}</bdi>
            </span>
            <span className="block truncate text-xs leading-4 text-muted-foreground">
              <Ltr>{row.original.number}</Ltr>
            </span>
          </div>
        ),
      },
      {
        id: "team",
        header: t("Team"),
        cell: ({ row }) => (
          <span className={row.original.seated < row.original.workersNeeded ? "font-semibold text-warning-ink" : ""}>
            <Ltr>
              {row.original.seated} / {row.original.workersNeeded}
            </Ltr>
          </span>
        ),
      },
      {
        id: "status",
        header: t("Status"),
        cell: ({ row }) => <VisitStatusChip status={row.original.status as VisitStatus} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild title={t("Open")}>
              <Link to={`${VISITS_PATH}/${row.original.id}`}>
                <ClipboardPen />
                <span className="sr-only 2xl:not-sr-only">{t("Open")}</span>
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the date format follows the locale, which `t` follows
    [t],
  );

  const table = useReactTable({
    data: list.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t(`Title.${kind}`)}</h2>
        <Button variant="outline" size="sm" asChild>
          <Link to={VISITS_PATH}>
            <ArrowRight className="ltr:rotate-180" />
            {t("BackToBoard")}
          </Link>
        </Button>
      </div>
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={t(list.isPending ? "Loading" : `Empty.${kind}`)}
      />
      <TablePager table={table} />
    </div>
  );
}
