import * as React from "react";

import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { BellRing, ChevronLeft, ChevronRight, ClipboardPen, Printer } from "lucide-react";
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
import { staffName } from "@/lib/text/names";

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
  showCounts = true,
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
  /** False when the page shows `DayBoardCounts` in its heading row instead (the visits tab, to keep four visits in view). */
  showCounts?: boolean;
}) {
  const t = useTranslations("DayBoard");
  const tNotes = useTranslations("VisitEntry.Notes");
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
          const { site, visit, zone } = row.original.visit;
          const name = site.commonName ?? site.address;
          return (
            <div className="max-w-36 min-w-0 xl:max-w-56">
              <span className="block truncate font-bold" title={name}>
                <bdi>{name}</bdi>
              </span>
              <span className="block truncate text-xs leading-4 text-muted-foreground">
                <Ltr>{visit.number}</Ltr>
                {zone && (
                  <>
                    {" · "}
                    <bdi>{zone.name}</bdi>
                  </>
                )}
              </span>
            </div>
          );
        },
      },
      {
        id: "team",
        header: t("Team"),
        cell: ({ row }) => {
          const names = row.original.visit.team.map((worker) => staffName(worker));
          return (
            <div className="max-w-36 min-w-0 xl:max-w-48">
              <span className="block truncate" title={names.join(listSeparator)}>
                {names.length === 0
                  ? "—"
                  : names.map((name, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && listSeparator}
                        <bdi>{name}</bdi>
                      </React.Fragment>
                    ))}
              </span>
              {row.original.openSeats > 0 && (
                <span className="block truncate text-xs leading-4 font-semibold text-warning-ink">
                  {t("OpenSeats", { count: row.original.openSeats })}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "service",
        header: t("Service"),
        cell: ({ row }) => {
          const services = row.original.visit.services.map(serviceText).filter(Boolean).join(listSeparator);
          return services ? (
            <span className="block max-w-28 truncate xl:max-w-40" title={services}>
              <bdi>{services}</bdi>
            </span>
          ) : (
            "—"
          );
        },
      },
      {
        id: "status",
        header: t("Status"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <VisitStatusChip status={row.original.visit.visit.status as VisitStatus} />
            {row.original.noArrival &&
              (onReportArrival ? (
                // The flag is also the way to clear it: the arrival, as the office heard it.
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="text-destructive"
                      title={tNotes("NO_ARRIVAL_REPORTED")}
                    >
                      <BellRing />
                      <span className="sr-only">{tNotes("NO_ARRIVAL_REPORTED")}</span>
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
              ) : (
                <BellRing className="size-5 text-destructive" aria-label={tNotes("NO_ARRIVAL_REPORTED")} />
              ))}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild title={t("Open")}>
              <Link to={`/dashboard/visits/${row.original.visit.visit.id}`}>
                <ClipboardPen />
                <span className="sr-only 2xl:not-sr-only">{t("Open")}</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild title={t("Order")}>
              <Link to={`/dashboard/visits/${row.original.visit.visit.id}/print`}>
                <Printer />
                <span className="sr-only 2xl:not-sr-only">{t("Order")}</span>
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, tNotes, listSeparator, serviceText, onReportArrival],
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
    <div className="space-y-3 tall:space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goTo(addDays(date, -1))} title={t("PreviousDay")}>
            {/* "Previous" points left in English and right in Arabic. */}
            <ChevronLeft className="rtl:rotate-180" />
            <span className="sr-only xl:not-sr-only">{t("PreviousDay")}</span>
          </Button>
          <span className="min-w-48 text-center text-base font-bold xl:min-w-56">{dayLabel}</span>
          <Button variant="outline" size="sm" onClick={() => goTo(addDays(date, 1))} title={t("NextDay")}>
            <span className="sr-only xl:not-sr-only">{t("NextDay")}</span>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
          {date !== clock.today && (
            <Button variant="outline" size="sm" onClick={() => goTo(clock.today)}>
              {t("Today")}
            </Button>
          )}
        </div>
        <TableSearch
          className="min-w-48 flex-1 sm:max-w-sm"
          placeholder={t("Search")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
      </div>

      {showCounts && <Counts counts={counts} />}

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={t(loading ? "Loading" : rows.length === 0 ? "NoVisits" : "NoMatch")}
      />
      <TablePager table={table} />
    </div>
  );
}

/** The day's visits counted by status, and the flag: under the controls, or in a page's heading row. */
export function DayBoardCounts({
  visits,
  clock,
  graceMin,
}: {
  visits: readonly DayBoardVisit[];
  clock: { today: string; nowTime: string };
  graceMin?: number;
}) {
  const counts = boardCounts(boardRows(visits, clock, graceMin));
  return <Counts counts={counts} />;
}

function Counts({ counts }: { counts: ReturnType<typeof boardCounts> }) {
  const t = useTranslations("DayBoard");
  return (
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
  );
}
