import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowLeft, Ban, CalendarCheck, CalendarX, Clock, Plus, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { SectionHeading } from "@/components/screen";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VisitStatusChip } from "@/features/operations/components/visit-status-chip";
import { hoursAndMinutes } from "@/features/operations/components/visit-entry/visit-entry-notes";
import type { AbsenceLine, AttendanceSeat } from "@/features/operations/services/worker-attendance";

import {
  AbsenceKind,
  AbsencePay,
  AbsenceStatusChip,
  AbsenceWhen,
  LateChip,
  PeriodSwitch,
  PresenceProofNote,
  SeatStatusChip,
} from "./attendance-bits";
import { CANCELLABLE, useDates, workerName } from "./attendance-helpers";
import { monthRange, shiftMonth } from "./attendance-params";
import { historyQuery } from "./attendance-queries";

/**
 * One worker's month: every seat with the four times of «سجل حضور العاملة»
 * (وقت الوصول، وقت بدء العمل، وقت الانتهاء، وقت المغادرة), the lateness and the
 * time worked, the order and what became of the visit; then her absences.
 *
 * Closest academy screens: the person's check history and absences
 * (attendance/_components/staff-check-history.tsx, staff-absence-detail.tsx):
 * the period switch, the add button, the table. A month of seats is a list
 * here, not the academy's week calendar: each seat carries four times, not a
 * check-in and a check-out.
 */
export function WorkerHistory({
  workerId,
  month,
  thisMonth,
  onMonthChange,
  backHref,
  onRecordAbsence,
  onCancel,
}: {
  workerId: string;
  month: string;
  thisMonth: string;
  onMonthChange: (month: string) => void;
  backHref: string;
  onRecordAbsence?: (workerId: string) => void;
  onCancel?: (line: AbsenceLine) => void;
}) {
  const t = useTranslations("WorkerAttendance");
  const dates = useDates();
  const { from, to } = monthRange(month);
  const history = useQuery(historyQuery(workerId, from, to));
  const data = history.data;

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ms-3 text-muted-foreground">
      <Link to={backHref}>
        {/* "Back" points left in English and right in Arabic. */}
        <ArrowLeft className="rtl:rotate-180" />
        {t("History.Back")}
      </Link>
    </Button>
  );

  if (history.isError) {
    return (
      <div className="space-y-5">
        {back}
        <ErrorState onRetry={() => void history.refetch()} />
      </div>
    );
  }

  const inForce = (data?.absences ?? []).filter((line) => line.status === "RECORDED" || line.status === "APPROVED");
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {back}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
          {data ? (
            <div className="min-w-0 flex-1 basis-64">
              <h2 className="min-w-0 truncate text-xl font-bold tracking-tight tall:text-3xl short:text-2xl">
                <bdi>{workerName(data.worker)}</bdi>
              </h2>
              <Ltr className="text-base text-muted-foreground">{data.worker.number}</Ltr>
            </div>
          ) : (
            <Skeleton className="h-10 w-64" />
          )}
          {onRecordAbsence && data?.worker.schedulable && (
            <Button variant="add" size="sm" onClick={() => onRecordAbsence(workerId)}>
              <Plus />
              {t("RecordAbsence")}
            </Button>
          )}
        </div>
      </div>

      <PeriodSwitch
        label={dates.month(month)}
        previousLabel={t("Month.Previous")}
        nextLabel={t("Month.Next")}
        onPrevious={() => onMonthChange(shiftMonth(month, -1))}
        onNext={() => onMonthChange(shiftMonth(month, 1))}
        presentLabel={month !== thisMonth ? t("Month.Current") : undefined}
        onPresent={() => onMonthChange(thisMonth)}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="workers"
          icon={CalendarCheck}
          label={t("History.Totals.Visits")}
          value={data ? data.totals.expected : "—"}
          hint={
            data
              ? t("History.Totals.VisitsHint", { present: data.totals.present, absent: data.totals.absent })
              : undefined
          }
        />
        <StatCard
          icon={Timer}
          label={t("History.Totals.Worked")}
          value={data ? <Ltr>{hoursAndMinutes(data.totals.workedMin)}</Ltr> : "—"}
          hint={t("History.Totals.WorkedHint")}
        />
        <StatCard
          icon={Clock}
          label={t("History.Totals.Late")}
          value={data ? data.totals.lateCount : "—"}
          hint={data ? t("History.Totals.LateHint", { grace: data.graceMin, minutes: data.totals.lateMin }) : undefined}
        />
        <StatCard
          icon={CalendarX}
          label={t("History.Totals.Absences")}
          value={data ? inForce.length : "—"}
          hint={t("History.Totals.AbsencesHint")}
        />
      </div>

      <section className="space-y-4">
        <SectionHeading>{t("History.Visits")}</SectionHeading>
        <SeatsTable seats={data?.seats ?? []} graceMin={data?.graceMin ?? 0} loading={history.isPending} />
      </section>

      <section className="space-y-4">
        <SectionHeading>{t("History.Absences")}</SectionHeading>
        <HistoryAbsences lines={data?.absences ?? []} loading={history.isPending} onCancel={onCancel} />
      </section>
    </div>
  );
}

function SeatsTable({ seats, graceMin, loading }: { seats: AttendanceSeat[]; graceMin: number; loading: boolean }) {
  const t = useTranslations("WorkerAttendance");
  const dates = useDates();
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const columns = React.useMemo<ColumnDef<AttendanceSeat>[]>(
    () => [
      {
        id: "date",
        header: t("History.Columns.Date"),
        cell: ({ row }) => (
          <span className="font-bold whitespace-nowrap">
            {dates.weekday(row.original.visitDate)} <Ltr>{dates.dayMonth(row.original.visitDate)}</Ltr>
          </span>
        ),
      },
      {
        id: "visit",
        header: t("History.Columns.Visit"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <bdi className="block font-semibold">{row.original.siteName}</bdi>
            <Link
              to={`/dashboard/visits/${row.original.visitId}`}
              className="block text-sm text-muted-foreground hover:underline"
            >
              <Ltr>{row.original.visitNumber}</Ltr>
            </Link>
          </div>
        ),
      },
      {
        id: "planned",
        header: t("History.Columns.Planned"),
        cell: ({ row }) => (
          <Ltr className="whitespace-nowrap">
            {row.original.plannedStartTime} – {row.original.plannedEndTime}
          </Ltr>
        ),
      },
      {
        id: "arrival",
        header: t("Arrival"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Ltr className="font-semibold">{row.original.arrivedTime ?? "—"}</Ltr>
            <LateChip lateMin={row.original.lateMin} graceMin={graceMin} />
          </div>
        ),
      },
      {
        id: "work",
        header: t("History.Columns.Work"),
        cell: ({ row }) =>
          row.original.workStartTime || row.original.workEndTime ? (
            <Ltr className="whitespace-nowrap">
              {row.original.workStartTime ?? "—"} – {row.original.workEndTime ?? "—"}
            </Ltr>
          ) : (
            "—"
          ),
      },
      {
        id: "departure",
        header: t("Departure"),
        cell: ({ row }) => <Ltr className="font-semibold">{row.original.leftTime ?? "—"}</Ltr>,
      },
      {
        id: "worked",
        header: t("History.Columns.Worked"),
        cell: ({ row }) =>
          row.original.workedMin === null ? "—" : <Ltr>{hoursAndMinutes(row.original.workedMin)}</Ltr>,
      },
      {
        id: "status",
        header: t("History.Columns.Status"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <VisitStatusChip status={row.original.visitStatus} />
            <SeatStatusChip status={row.original.seatStatus} />
            {row.original.presenceProof && row.original.presenceProof !== "BOTH" && (
              <PresenceProofNote proof={row.original.presenceProof} />
            )}
          </div>
        ),
      },
    ],
    [t, dates, graceMin],
  );
  const table = useReactTable({
    data: seats,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });
  return (
    <>
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={t(loading ? "Loading" : "History.NoVisits")}
      />
      <TablePager table={table} />
    </>
  );
}

function HistoryAbsences({
  lines,
  loading,
  onCancel,
}: {
  lines: AbsenceLine[];
  loading: boolean;
  onCancel?: (line: AbsenceLine) => void;
}) {
  const t = useTranslations("WorkerAttendance");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const columns = React.useMemo<ColumnDef<AbsenceLine>[]>(
    () => [
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
        cell: ({ row }) =>
          onCancel && CANCELLABLE.includes(row.original.status) ? (
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={() => onCancel(row.original)}>
                <Ban />
                {t("Absences.Cancel")}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, onCancel],
  );
  const table = useReactTable({
    data: lines,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });
  return (
    <>
      <DataTable table={table} columnCount={columns.length} emptyMessage={t(loading ? "Loading" : "Absences.None")} />
      <TablePager table={table} />
    </>
  );
}
