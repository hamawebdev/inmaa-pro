import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { BadgeCheck, CalendarX, Clock, History, LogIn, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { addDays, type LocalMoment } from "@/features/operations/rules/calendar";
import {
  ATTENDANCE_DAY_STATES,
  type AttendanceDayRow,
  type AttendanceSeat,
} from "@/features/operations/services/worker-attendance";
import type { PresenceProof } from "@/features/operations/validators/option-codes";
import { useCodeLabel } from "@/i18n/use-code-label";
import { normaliseName } from "@/lib/text/normalise";
import { cn } from "@/lib/utils";

import { DayStateChip, PeriodSwitch, WorkerCell } from "./attendance-bits";
import { useDates, workerName } from "./attendance-helpers";
import { dayQuery } from "./attendance-queries";

/**
 * «تسجيلات الحضور»: one day, every worker who may be given visits, her seats
 * of the day with the times typed from the returned orders, the absence that
 * covers her day, and her last typed arrival and departure.
 *
 * Closest academy screen: the attendance overview
 * (attendance/_components/staff-attendance-overview.tsx): a search, the table,
 * the last check-in in green and the last check-out in amber, the row buttons
 * to the person's history and absences. As on the day board (Operations'
 * visits tab), the day switch shares the search's row and the day's counts
 * stand in the page's heading row (`DayCounts`), so that the first worker
 * shows where the academy's first person does; each cell is one line, with a
 * second small one at most, and the row buttons lose their words below `2xl`.
 */
export function DaySheet({
  day,
  today,
  onDayChange,
  historyHref,
  onRecordAbsence,
  tabs,
}: {
  day: string;
  today: string;
  onDayChange: (day: string) => void;
  historyHref: (workerId: string) => string;
  /** Left out when the reader may not record an absence. */
  onRecordAbsence?: (workerId: string) => void;
  /** The tab's view switch, first in the controls' row. */
  tabs?: React.ReactNode;
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

  const columns = React.useMemo<ColumnDef<AttendanceDayRow>[]>(
    () => [
      { id: "worker", header: t("Worker"), cell: ({ row }) => <WorkerCell worker={row.original.worker} /> },
      { id: "state", header: t("Day.Columns.State"), cell: ({ row }) => <DayState row={row.original} /> },
      {
        id: "visits",
        header: t("Day.Columns.Visits"),
        cell: ({ row }) => <DaySeats seats={row.original.seats} graceMin={graceMin} />,
      },
      {
        id: "last",
        header: t("Day.Columns.Last"),
        cell: ({ row }) => <LastTimes arrival={row.original.lastArrival} departure={row.original.lastDeparture} day={day} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild title={t("OpenHistory")}>
              <Link to={historyHref(row.original.worker.id)}>
                <History />
                <span className="sr-only 2xl:not-sr-only">{t("OpenHistory")}</span>
              </Link>
            </Button>
            {onRecordAbsence && row.original.worker.schedulable && (
              <Button
                variant="outline"
                size="sm"
                title={t("Day.Absence")}
                onClick={() => onRecordAbsence(row.original.worker.id)}
              >
                <CalendarX />
                <span className="sr-only 2xl:not-sr-only">{t("Day.Absence")}</span>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, day, graceMin, historyHref, onRecordAbsence],
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
    <div className="space-y-3 tall:space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        {tabs}
        <PeriodSwitch
          label={dates.long(day)}
          previousLabel={t("Day.PreviousDay")}
          nextLabel={t("Day.NextDay")}
          onPrevious={() => goTo(addDays(day, -1))}
          onNext={() => goTo(addDays(day, 1))}
          presentLabel={day !== today ? t("Day.Today") : undefined}
          onPresent={() => goTo(today)}
        />
        <TableSearch
          className="min-w-48 flex-1 sm:max-w-sm"
          placeholder={t("Search")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            firstPage();
          }}
        />
      </div>

      {sheet.isError ? (
        <ErrorState onRetry={() => void sheet.refetch()} />
      ) : (
        <>
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

/** The day's workers counted by state: in the page's heading row, as the day board's counts. */
export function DayCounts({ rows }: { rows: readonly AttendanceDayRow[] }) {
  const t = useTranslations("WorkerAttendance");
  if (rows.length === 0) return null;
  const counts = ATTENDANCE_DAY_STATES.map((state) => ({
    state,
    count: rows.filter((row) => row.state === state).length,
  })).filter(({ count }) => count > 0);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label={t("Day.Counts")}>
      <span className="me-1 text-base font-bold">{t("Day.Total", { count: rows.length })}</span>
      {counts.map(({ state, count }) => (
        <span key={state} className="inline-flex items-center gap-1.5">
          <DayStateChip state={state} />
          <span className="font-bold tabular-nums">{count}</span>
        </span>
      ))}
    </div>
  );
}

/** A value read left to right inside a plain string (a tooltip cannot hold `<Ltr>`): Unicode's isolate marks. */
const ltrText = (text: string) => `⁦${text}⁩`;

/** Her day in one chip; under it, small, the absence that covers it or a leave asked for. */
function DayState({ row }: { row: AttendanceDayRow }) {
  const t = useTranslations("WorkerAttendance");
  const categoryLabel = useCodeLabel("WorkerAttendance.Categories");
  const typeLabel = useCodeLabel("Options.AbsenceType");
  const absence = row.absence
    ? [
        categoryLabel(row.absence.category),
        typeLabel(row.absence.type),
        row.absence.startTime && row.absence.endTime
          ? ltrText(`${row.absence.startTime} – ${row.absence.endTime}`)
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <DayStateChip state={row.state} />
      {absence ? (
        <span className="block max-w-48 truncate text-xs leading-4 text-muted-foreground xl:max-w-64" title={absence}>
          {absence}
        </span>
      ) : row.leaveRequested ? (
        <span className="inline-flex max-w-48 items-center gap-1 text-xs leading-4 font-semibold text-foreground/75">
          <Clock aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{t("LeaveRequested")}</span>
        </span>
      ) : null}
    </div>
  );
}

const PROOF_INK: Record<PresenceProof, string> = {
  BOTH: "text-success",
  ARRIVAL_ONLY: "text-warning-ink",
  DEPARTURE_ONLY: "text-warning-ink",
  NONE: "text-destructive",
};

const SEAT_INK: Partial<Record<AttendanceSeat["seatStatus"], string>> = {
  ABSENT: "text-destructive",
  RESTING: "text-muted-foreground",
  REPLACED: "text-muted-foreground",
};

/**
 * Her seats of the day, each a link to its visit: when and where on the first
 * line, what the returned order says of her (or why she is not there) on the
 * second. Several seats follow one another on each line; the tooltip has them
 * one to a line, with the order numbers.
 */
function DaySeats({ seats, graceMin }: { seats: readonly AttendanceSeat[]; graceMin: number }) {
  const t = useTranslations("WorkerAttendance");
  const seatLabel = useCodeLabel("WorkerAttendance.SeatStatuses");
  const proofLabel = useCodeLabel("WorkerAttendance.PresenceProofs");
  if (seats.length === 0) return <span className="text-muted-foreground">—</span>;

  const noteOf = (seat: AttendanceSeat): string[] => {
    if (seat.seatStatus !== "ASSIGNED") return [seatLabel(seat.seatStatus)];
    if (seat.arrivedTime === null && seat.leftTime === null) return [t("NotTyped")];
    return [
      `${t("Arrival")} ${ltrText(seat.arrivedTime ?? "—")}`,
      `${t("Departure")} ${ltrText(seat.leftTime ?? "—")}`,
      ...(seat.lateMin !== null && seat.lateMin > graceMin ? [t("Late", { minutes: seat.lateMin })] : []),
      ...(seat.presenceProof ? [proofLabel(seat.presenceProof)] : []),
    ];
  };
  const title = seats
    .map((seat) =>
      [
        ltrText(`${seat.plannedStartTime} – ${seat.plannedEndTime}`),
        seat.siteName,
        ltrText(seat.visitNumber),
        ...noteOf(seat),
      ].join(" · "),
    )
    .join("\n");

  return (
    <div className="max-w-52 min-w-0 xl:max-w-80" title={title}>
      <span className="block truncate">
        {seats.map((seat, index) => (
          <React.Fragment key={seat.seatId}>
            {index > 0 && <span className="text-muted-foreground"> · </span>}
            <Link to={`/dashboard/visits/${seat.visitId}`} className="hover:underline">
              <Ltr className="font-bold">
                {seat.plannedStartTime} – {seat.plannedEndTime}
              </Ltr>{" "}
              <bdi className="font-semibold">{seat.siteName}</bdi>
            </Link>
          </React.Fragment>
        ))}
      </span>
      <span className="block truncate text-xs leading-4">
        {seats.map((seat, index) => (
          <React.Fragment key={seat.seatId}>
            {index > 0 && <span className="text-muted-foreground"> · </span>}
            <SeatNote seat={seat} graceMin={graceMin} />
          </React.Fragment>
        ))}
      </span>
    </div>
  );
}

/** One seat's second line: lost (absent, resting, handed over), not typed yet, or her two times and what goes with them. */
function SeatNote({ seat, graceMin }: { seat: AttendanceSeat; graceMin: number }) {
  const t = useTranslations("WorkerAttendance");
  const seatLabel = useCodeLabel("WorkerAttendance.SeatStatuses");
  const proofLabel = useCodeLabel("WorkerAttendance.PresenceProofs");
  if (seat.seatStatus !== "ASSIGNED") {
    return <span className={cn("font-semibold", SEAT_INK[seat.seatStatus])}>{seatLabel(seat.seatStatus)}</span>;
  }
  if (seat.arrivedTime === null && seat.leftTime === null) {
    return <span className="text-muted-foreground">{t("NotTyped")}</span>;
  }
  const late = seat.lateMin !== null && seat.lateMin > graceMin;
  return (
    <>
      {t("Arrival")} <Ltr className="font-semibold">{seat.arrivedTime ?? "—"}</Ltr>
      <span className="text-muted-foreground"> · </span>
      {t("Departure")} <Ltr className="font-semibold">{seat.leftTime ?? "—"}</Ltr>
      {late && (
        <>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold text-warning-ink">{t("Late", { minutes: seat.lateMin ?? 0 })}</span>
        </>
      )}
      {seat.presenceProof && (
        <>
          <span className="text-muted-foreground"> · </span>
          <span className={cn("font-semibold", PROOF_INK[seat.presenceProof])}>
            <BadgeCheck aria-hidden className="me-0.5 inline size-3 align-[-0.125em]" />
            {proofLabel(seat.presenceProof)}
          </span>
        </>
      )}
    </>
  );
}

/**
 * Her last typed arrival (green) and departure (amber), the academy's two
 * colours: the arrival on the line, the departure under it, each with its
 * date in digits (the year only when it is not the day's) and the whole date
 * in the tooltip.
 */
function LastTimes({
  arrival,
  departure,
  day,
}: {
  arrival: LocalMoment | null;
  departure: LocalMoment | null;
  day: string;
}) {
  const t = useTranslations("WorkerAttendance");
  const dates = useDates();
  const when = (moment: LocalMoment) =>
    `${moment.date.slice(0, 4) === day.slice(0, 4) ? dates.dayMonth(moment.date) : dates.short(moment.date)} ${moment.time}`;
  const whole = (label: string, moment: LocalMoment) => `${label} ${ltrText(`${dates.short(moment.date)} ${moment.time}`)}`;
  return (
    <div className="min-w-0 whitespace-nowrap">
      <span
        className="flex items-center gap-1.5 text-sm font-semibold text-success"
        title={arrival ? whole(t("Arrival"), arrival) : undefined}
      >
        <LogIn aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only">{t("Arrival")}</span>
        {arrival ? <Ltr>{when(arrival)}</Ltr> : <span className="text-muted-foreground">—</span>}
      </span>
      <span
        className="flex items-center gap-1.5 text-xs leading-4 font-semibold text-warning-ink"
        title={departure ? whole(t("Departure"), departure) : undefined}
      >
        <LogOut aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only">{t("Departure")}</span>
        {departure ? <Ltr>{when(departure)}</Ltr> : <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}
