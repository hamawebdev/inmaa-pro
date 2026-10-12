import * as React from "react";

import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ClipboardPen, MapPinCheck, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useLocale, useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { intlLocaleFor } from "@/i18n/config";
import { useCodeLabel } from "@/i18n/use-code-label";

import { addDays } from "../../rules/calendar";
import type { VisitStatus } from "../../validators/option-codes";
import { NoArrivalFlag, VisitStatusChip } from "../visit-status-chip";

import {
  ARRIVAL_VIAS,
  boardCounts,
  boardRows,
  rowMatches,
  type ArrivalVia,
  type BoardService,
  type DayBoardRow,
  type DayBoardVisit,
} from "./day-board-data";

/**
 * The day board: the visits of one day, by colour, with the "no arrival
 * reported" flag. His study's «جدول العمليات اليومية» and «نظام الألوان».
 *
 * It renders on its own, from the visits and the clock it is given, so that
 * the home screen can mount it and the visits tab can show it alike.
 *
 * Nearest academy screens: the attendance overview (`DataTable` with
 * `TableSearch` and `TablePager`, row buttons) and the weekly history's
 * previous/next switch.
 */
export function DayBoard({
  date,
  onDateChange,
  visits,
  clock,
  graceMin,
  loading = false,
  onReportArrival,
}: {
  /** The day shown, "YYYY-MM-DD". */
  date: string;
  onDateChange: (date: string) => void;
  visits: readonly DayBoardVisit[];
  /** The centre's own date and time, for the flag. */
  clock: { today: string; nowTime: string };
  /** `work.arrivalGraceMin`; 15 when left out. */
  graceMin?: number;
  /** While the day is read: the table says so instead of "no visit". */
  loading?: boolean;
  /** The team's arrival phoned in (#27). Left out, the board offers no such button. */
  onReportArrival?: (visitId: string, via: ArrivalVia) => void;
}) {
  const t = useTranslations("DayBoard");
  const locale = useLocale();
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const providedLabel = useCodeLabel("Options.ProvidedService");
  const programmedLabel = useCodeLabel("Options.ProgrammedService");
  const serviceText = React.useCallback(
    (service: BoardService) =>
      service.code
        ? (service.list === "PROGRAMMED" ? programmedLabel : providedLabel)(service.code)
        : service.customLabel,
    [providedLabel, programmedLabel],
  );

  const rows = React.useMemo(() => boardRows(visits, clock, graceMin), [visits, clock, graceMin]);
  const shown = React.useMemo(
    () => rows.filter((row) => rowMatches(row, search, serviceText)),
    [rows, search, serviceText],
  );
  const counts = boardCounts(rows);

  const dayLabel = new Intl.DateTimeFormat(intlLocaleFor(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  // Names keep their own direction (<bdi>): an Arabic name in a French row, or the reverse.
  const listSeparator = locale === "ar" ? "، " : ", ";
  const columns = React.useMemo<ColumnDef<DayBoardRow>[]>(
    () => [
      {
        id: "time",
        header: t("Time"),
        cell: ({ row }) => (
          <span className="font-bold whitespace-nowrap tabular-nums">
            <Ltr>
              {row.original.visit.visit.plannedStartTime} – {row.original.endTime}
            </Ltr>
          </span>
        ),
      },
      {
        id: "site",
        header: t("Site"),
        cell: ({ row }) => {
          const { site, visit } = row.original.visit;
          return (
            <div className="min-w-0">
              <span className="block font-bold">
                <bdi>{site.commonName ?? site.address}</bdi>
              </span>
              <span className="block text-sm text-muted-foreground">
                <Ltr>{visit.number}</Ltr>
              </span>
            </div>
          );
        },
      },
      {
        id: "zone",
        header: t("Zone"),
        cell: ({ row }) => {
          const zone = row.original.visit.zone;
          return zone ? <bdi className="whitespace-nowrap">{zone.name}</bdi> : "—";
        },
      },
      {
        id: "team",
        header: t("Team"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block">
              {row.original.visit.team.length === 0
                ? "—"
                : row.original.visit.team.map((worker, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && listSeparator}
                      <bdi>{`${worker.firstName} ${worker.lastName}`}</bdi>
                    </React.Fragment>
                  ))}
            </span>
            {row.original.openSeats > 0 && (
              <span className="block text-sm font-semibold text-warning-ink">
                {t("OpenSeats", { count: row.original.openSeats })}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "service",
        header: t("Service"),
        cell: ({ row }) => {
          const services = row.original.visit.services.map(serviceText).filter(Boolean);
          return services.length > 0 ? <bdi>{services.join(listSeparator)}</bdi> : "—";
        },
      },
      {
        id: "status",
        header: t("Status"),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <VisitStatusChip status={row.original.visit.visit.status as VisitStatus} />
            {row.original.noArrival && <NoArrivalFlag />}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {onReportArrival && row.original.noArrival && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MapPinCheck />
                    {t("Arrived")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t("ArrivedVia")}</DropdownMenuLabel>
                  {ARRIVAL_VIAS.map((via) => (
                    <DropdownMenuItem key={via} onSelect={() => onReportArrival(row.original.visit.visit.id, via)}>
                      {t(`Via.${via}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/visits/${row.original.visit.visit.id}`}>
                <ClipboardPen />
                {t("Open")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/visits/${row.original.visit.visit.id}/print`}>
                <Printer />
                {t("Order")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, listSeparator, serviceText, onReportArrival],
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
    onDateChange(next);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goTo(addDays(date, -1))}>
            {/* "Previous" points left in English and right in Arabic. */}
            <ChevronLeft className="rtl:rotate-180" />
            {t("PreviousDay")}
          </Button>
          <span className="min-w-56 text-center text-base font-bold">{dayLabel}</span>
          <Button variant="outline" size="sm" onClick={() => goTo(addDays(date, 1))}>
            {t("NextDay")}
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
        {date !== clock.today && (
          <Button variant="outline" size="sm" onClick={() => goTo(clock.today)}>
            {t("Today")}
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label={t("Counts")}>
        <span className="me-1 text-base font-bold">{t("Total", { count: counts.total })}</span>
        {counts.byStatus.map(({ status, count }) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <VisitStatusChip status={status} />
            <span className="font-bold tabular-nums">{count}</span>
          </span>
        ))}
        {counts.noArrival > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <NoArrivalFlag />
            <span className="font-bold tabular-nums">{counts.noArrival}</span>
          </span>
        )}
      </div>

      <TableSearch
        className="max-w-sm"
        placeholder={t("Search")}
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
        }}
      />
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={t(loading ? "Loading" : rows.length === 0 ? "NoVisits" : "NoMatch")}
      />
      <TablePager table={table} />
    </div>
  );
}
