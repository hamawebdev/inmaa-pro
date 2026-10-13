import * as React from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Check, History, PencilLine, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { DayDate, Days, Duration, Nothing } from "@/features/people/components/figures";
import { ListTable } from "@/features/people/components/list-table";
import { LEAVE_TONE } from "@/features/people/components/status-tones";
import type { EmployeeAttendance } from "@/features/people/services/employee-attendance";
import { useCodeLabel } from "@/i18n/use-code-label";

import type { useAttendanceEntries } from "./use-attendance-entries";
import { staffName } from "@/lib/text/names";

type Entries = ReturnType<typeof useAttendanceEntries>;
type Absence = EmployeeAttendance["absences"][number] & { staffId: string; name: string };
type Leave = EmployeeAttendance["leaves"][number] & { staffId: string; name: string };

const nameOf = (person: EmployeeAttendance) => staffName(person);
const historyHref = (staffId: string, month: string) => `/dashboard/employee-attendance/${staffId}?month=${month}`;

/**
 * Who came in and how long, in the month: one line per employee.
 *
 * Closest academy screen: the staff attendance overview (a table to search,
 * "history" on each row).
 */
export function RecordsView({
  people,
  month,
  loading,
}: {
  people: EmployeeAttendance[];
  month: string;
  loading: boolean;
}) {
  const t = useTranslations("EmployeeAttendance");
  const columns = React.useMemo<ColumnDef<EmployeeAttendance>[]>(
    () => [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => <Ltr className="font-bold whitespace-nowrap tabular-nums">{row.original.number}</Ltr>,
      },
      {
        id: "name",
        header: t("Table.Employee"),
        cell: ({ row }) => (
          <Link to={historyHref(row.original.staffId, month)} className="font-bold hover:underline">
            {nameOf(row.original)}
          </Link>
        ),
      },
      { id: "days", header: t("Table.DaysPresent"), cell: ({ row }) => <Ltr>{row.original.totals.daysPresent}</Ltr> },
      {
        id: "hours",
        header: t("Table.Hours"),
        cell: ({ row }) => <Duration minutes={row.original.totals.workedMin} />,
      },
      {
        id: "absence",
        header: t("Table.Absence"),
        cell: ({ row }) =>
          row.original.totals.absenceMin > 0 ? <Duration minutes={row.original.totals.absenceMin} /> : <Nothing />,
      },
      {
        id: "state",
        header: t("Table.State"),
        cell: ({ row }) =>
          row.original.totals.incompleteDays > 0 ? (
            <StatusChip tone="warning" label={t("Table.Incomplete", { count: row.original.totals.incompleteDays })} />
          ) : row.original.totals.daysPresent > 0 ? (
            <StatusChip tone="success" label={t("Table.Complete")} />
          ) : (
            <StatusChip tone="neutral" label={t("Table.NoRecord")} />
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={historyHref(row.original.staffId, month)}>
                <History />
                {t("Table.History")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, month],
  );
  return (
    <ListTable
      rows={people}
      columns={columns}
      text={(row) => `${nameOf(row)} ${row.number}`}
      searchPlaceholder={t("Search")}
      emptyMessage={t(loading ? "Loading" : "None")}
    />
  );
}

/**
 * The absences of the month, each changed or taken off with its reason.
 *
 * Closest academy screen: the staff absence overview.
 */
export function AbsencesView({
  people,
  loading,
  entries,
  edits,
}: {
  people: EmployeeAttendance[];
  loading: boolean;
  entries: Entries;
  edits: boolean;
}) {
  const t = useTranslations("EmployeeAttendance");
  const typeLabel = useCodeLabel("Options.AbsenceType");
  const rows = React.useMemo<Absence[]>(
    () =>
      people
        .flatMap((person) =>
          person.absences.map((absence) => ({ ...absence, staffId: person.staffId, name: nameOf(person) })),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [people],
  );
  const { editAbsence, deleteAbsence } = entries;
  const columns = React.useMemo<ColumnDef<Absence>[]>(
    () => [
      { id: "date", header: t("Table.Date"), cell: ({ row }) => <DayDate date={row.original.date} /> },
      {
        id: "name",
        header: t("Table.Employee"),
        cell: ({ row }) => <span className="font-bold">{row.original.name}</span>,
      },
      {
        id: "type",
        header: t("Table.Kind"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {typeLabel(row.original.type)} · <Duration minutes={row.original.absenceMin} />
          </span>
        ),
      },
      {
        id: "justified",
        header: t("Table.Justified"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <StatusChip
              tone={row.original.justified ? "success" : "warning"}
              label={t(row.original.justified ? "Table.IsJustified" : "Table.NotJustified")}
            />
            {row.original.paid && <StatusChip tone="info" label={t("Table.IsPaid")} />}
          </div>
        ),
      },
      {
        id: "reason",
        header: t("Table.Reason"),
        cell: ({ row }) =>
          row.original.reason ? (
            <span className="block max-w-56 truncate" title={row.original.reason}>
              {row.original.reason}
            </span>
          ) : (
            <Nothing />
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          edits ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Table.Edit")}
                title={t("Table.Edit")}
                onClick={() => void editAbsence(row.original)}
              >
                <PencilLine />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Table.Delete")}
                title={t("Table.Delete")}
                onClick={() => void deleteAbsence(row.original.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, typeLabel, edits, editAbsence, deleteAbsence],
  );
  return (
    <ListTable
      rows={rows}
      columns={columns}
      text={(row) => row.name}
      searchPlaceholder={t("Search")}
      emptyMessage={t(loading ? "Loading" : "Absences.None")}
    />
  );
}

/**
 * Leave asked for, decided, taken; with what each employee has left.
 *
 * Closest academy screen: the staff absence overview, with the decision the
 * academy does not have.
 */
export function LeaveView({
  people,
  loading,
  entries,
  decides,
}: {
  people: EmployeeAttendance[];
  loading: boolean;
  entries: Entries;
  decides: boolean;
}) {
  const t = useTranslations("EmployeeAttendance");
  const typeLabel = useCodeLabel("Options.LeaveType");
  const rows = React.useMemo<Leave[]>(
    () =>
      people
        .flatMap((person) =>
          person.leaves.map((leave) => ({
            ...leave,
            staffId: person.staffId,
            name: nameOf(person),
          })),
        )
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [people],
  );
  const { approveLeave, refuseLeave, cancelLeave } = entries;
  const columns = React.useMemo<ColumnDef<Leave>[]>(
    () => [
      {
        id: "name",
        header: t("Table.Employee"),
        cell: ({ row }) => <span className="font-bold">{row.original.name}</span>,
      },
      { id: "type", header: t("Table.Kind"), cell: ({ row }) => typeLabel(row.original.type) },
      {
        id: "dates",
        header: t("Table.Dates"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            <DayDate date={row.original.startDate} /> – <DayDate date={row.original.endDate} />
          </span>
        ),
      },
      { id: "days", header: t("Table.Days"), cell: ({ row }) => <Days thousandths={row.original.days} /> },
      {
        id: "status",
        header: t("Table.Status"),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              tone={LEAVE_TONE[row.original.status] ?? "neutral"}
              label={t(`LeaveStatuses.${row.original.status}`)}
            />
            {!row.original.paid && <StatusChip tone="neutral" label={t("Table.NotPaid")} />}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          decides ? (
            <div className="flex items-center justify-end gap-2">
              {row.original.status === "REQUESTED" && (
                <>
                  <Button variant="success" size="sm" onClick={() => void approveLeave(row.original.id)}>
                    <Check />
                    {t("Table.Approve")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void refuseLeave(row.original.id)}>
                    <X />
                    {t("Table.Refuse")}
                  </Button>
                </>
              )}
              {row.original.status === "APPROVED" && (
                <Button variant="outline" size="sm" onClick={() => void cancelLeave(row.original.id)}>
                  <Ban />
                  {t("Table.CancelLeave")}
                </Button>
              )}
            </div>
          ) : null,
      },
    ],
    [t, typeLabel, decides, approveLeave, refuseLeave, cancelLeave],
  );
  return (
    <ListTable
      rows={rows}
      columns={columns}
      text={(row) => row.name}
      searchPlaceholder={t("Search")}
      emptyMessage={t(loading ? "Loading" : "Leave.None")}
    />
  );
}
