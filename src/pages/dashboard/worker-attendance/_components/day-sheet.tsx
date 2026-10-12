import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { CalendarX, History } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { addDays } from "@/features/operations/rules/calendar";
import {
  ATTENDANCE_DAY_STATES,
  type AttendanceDayRow,
  type AttendanceSeat,
} from "@/features/operations/services/worker-attendance";
import { useCodeLabel } from "@/i18n/use-code-label";
import { normaliseName } from "@/lib/text/normalise";

import { DayStateChip, LateChip, PeriodSwitch, PresenceProofNote, SeatStatusChip, WorkerCell } from "./attendance-bits";
import { useDates, workerName } from "./attendance-helpers";
import { dayQuery } from "./attendance-queries";

/**
 * «تسجيلات الحضور»: one day, every worker who may be given visits, her seats
 * of the day with the times typed from the returned orders, the absence that
 * covers her day, and her last typed arrival and departure.
 *
 * Closest academy screen: the attendance overview
 * (attendance/_components/staff-attendance-overview.tsx): a search, the table,
 * the last check-in and check-out, a row button to the person's history. The
 * day switch and the counts are the day board's (Operations' visits tab).
 */
export function DaySheet({
  day,
  today,
  onDayChange,
  historyHref,
  onRecordAbsence,
}: {
  day: string;
  today: string;
  onDayChange: (day: string) => void;
  historyHref: (workerId: string) => string;
  /** Left out when the reader may not record an absence. */
  onRecordAbsence?: (workerId: string) => void;
}) {
  const t = useTranslations("WorkerAttendance");
  const dates = useDates();
  const sheet = useQuery(dayQuery(day));
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  const rows = React.useMemo(() => sheet.data?.rows ?? [], [sheet.data]);
  const graceMin = sheet.data?.graceMin ?? 0;
  const shown = React.useMemo(() => {
    const words = normaliseName(search);
    const typed = search.trim();
    if (!words && !typed) return rows;
    return rows.filter((row) => {
      const name = normaliseName(workerName(row.worker));
      return (
        (words !== "" && words.split(" ").every((word) => name.includes(word))) ||
        (typed !== "" && row.worker.number.includes(typed))
      );
    });
  }, [rows, search]);
  const counts = ATTENDANCE_DAY_STATES.map((state) => ({
    state,
    count: rows.filter((row) => row.state === state).length,
  })).filter(({ count }) => count > 0);

  const columns = React.useMemo<ColumnDef<AttendanceDayRow>[]>(
    () => [
      { id: "worker", header: t("Worker"), cell: ({ row }) => <WorkerCell worker={row.original.worker} /> },
      { id: "state", header: t("Day.Columns.State"), cell: ({ row }) => <DayState row={row.original} /> },
      {
        id: "visits",
        header: t("Day.Columns.Visits"),
        cell: ({ row }) =>
          row.original.seats.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <ul className="min-w-72 space-y-3">
              {row.original.seats.map((seat) => (
                <li key={seat.seatId}>
                  <SeatLine seat={seat} graceMin={graceMin} />
                </li>
              ))}
            </ul>
          ),
      },
      {
        id: "last",
        header: t("Day.Columns.Last"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm whitespace-nowrap">
            {/* The academy's colours: green the arrival, amber the departure. */}
            <span className="block">
              {t("Arrival")}{" "}
              {row.original.lastArrival ? (
                <Ltr className="font-semibold text-success">
                  {dates.short(row.original.lastArrival.date)} {row.original.lastArrival.time}
                </Ltr>
              ) : (
                "—"
              )}
            </span>
            <span className="block">
              {t("Departure")}{" "}
              {row.original.lastDeparture ? (
                <Ltr className="font-semibold text-warning-ink">
                  {dates.short(row.original.lastDeparture.date)} {row.original.lastDeparture.time}
                </Ltr>
              ) : (
                "—"
              )}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={historyHref(row.original.worker.id)}>
                <History />
                {t("OpenHistory")}
              </Link>
            </Button>
            {onRecordAbsence && row.original.worker.schedulable && (
              <Button variant="outline" size="sm" onClick={() => onRecordAbsence(row.original.worker.id)}>
                <CalendarX />
                {t("Day.Absence")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, dates, graceMin, historyHref, onRecordAbsence],
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
    onDayChange(next);
    firstPage();
  };

  return (
    <div className="space-y-5">
      <PeriodSwitch
        label={dates.long(day)}
        previousLabel={t("Day.PreviousDay")}
        nextLabel={t("Day.NextDay")}
        onPrevious={() => goTo(addDays(day, -1))}
        onNext={() => goTo(addDays(day, 1))}
        presentLabel={day !== today ? t("Day.Today") : undefined}
        onPresent={() => goTo(today)}
      />

      {sheet.isError ? (
        <ErrorState onRetry={() => void sheet.refetch()} />
      ) : (
        <>
          {rows.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label={t("Day.Counts")}>
              <span className="me-1 text-base font-bold">{t("Day.Total", { count: rows.length })}</span>
              {counts.map(({ state, count }) => (
                <span key={state} className="inline-flex items-center gap-1.5">
                  <DayStateChip state={state} />
                  <span className="font-bold tabular-nums">{count}</span>
                </span>
              ))}
            </div>
          )}
          <TableSearch
            className="max-w-sm"
            placeholder={t("Search")}
            value={search}
            onChange={(value) => {
              setSearch(value);
              firstPage();
            }}
          />
          <DataTable
            table={table}
            columnCount={columns.length}
            emptyMessage={t(sheet.isPending ? "Loading" : rows.length === 0 ? "Day.NoWorkers" : "Day.NoMatch")}
          />
          <TablePager table={table} />
        </>
      )}
    </div>
  );
}

/** Her day in one chip; the absence that covers it, and a leave asked for, under it. */
function DayState({ row }: { row: AttendanceDayRow }) {
  const t = useTranslations("WorkerAttendance");
  const categoryLabel = useCodeLabel("WorkerAttendance.Categories");
  const typeLabel = useCodeLabel("Options.AbsenceType");
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <DayStateChip state={row.state} />
      {row.absence && (
        <span className="text-sm text-muted-foreground">
          {categoryLabel(row.absence.category)} · {typeLabel(row.absence.type)}
          {row.absence.startTime && row.absence.endTime && (
            <>
              {" "}
              <Ltr>
                {row.absence.startTime} – {row.absence.endTime}
              </Ltr>
            </>
          )}
        </span>
      )}
      {row.leaveRequested && <StatusChip tone="pending" label={t("LeaveRequested")} />}
    </div>
  );
}

/** One seat: when and where, then what the returned order says of her, or why she is not there. */
function SeatLine({ seat, graceMin }: { seat: AttendanceSeat; graceMin: number }) {
  const t = useTranslations("WorkerAttendance");
  const typed = seat.arrivedTime !== null || seat.leftTime !== null;
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <Ltr className="font-bold whitespace-nowrap">
          {seat.plannedStartTime} – {seat.plannedEndTime}
        </Ltr>
        <bdi className="font-semibold">{seat.siteName}</bdi>
        <Link to={`/dashboard/visits/${seat.visitId}`} className="text-sm text-muted-foreground hover:underline">
          <Ltr>{seat.visitNumber}</Ltr>
        </Link>
      </div>
      {seat.seatStatus !== "ASSIGNED" ? (
        <SeatStatusChip status={seat.seatStatus} />
      ) : typed ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="whitespace-nowrap">
            {t("Arrival")} <Ltr className="font-semibold">{seat.arrivedTime ?? "—"}</Ltr>
          </span>
          <span className="whitespace-nowrap">
            {t("Departure")} <Ltr className="font-semibold">{seat.leftTime ?? "—"}</Ltr>
          </span>
          <LateChip lateMin={seat.lateMin} graceMin={graceMin} />
          <PresenceProofNote proof={seat.presenceProof} />
        </div>
      ) : (
        <span className="block text-sm text-muted-foreground">{t("NotTyped")}</span>
      )}
    </div>
  );
}
