import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { Ban, CircleCheckBig, Play } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  cancelCorrectiveTaskAction,
  CORRECTIVE_TASKS_PATH,
  listCorrectiveTasksQuery,
  type CorrectiveTaskLine,
} from "@/features/operations/services/corrective-tasks";
import {
  CORRECTIVE_FILTERS,
  OPEN_TASK_STATUSES,
  type CorrectiveFilter,
  type TaskStatus,
} from "@/features/operations/validators/inspection";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useSearchParams } from "@/lib/compat/navigation";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";
import { normaliseName } from "@/lib/text/normalise";
import { cn } from "@/lib/utils";

import { inspectionHref, isolate, useQualityDates } from "../inspections/quality-format";
import { useReasonDialog } from "../inspections/reason-dialog";
import { qualityHref } from "../quality-views";

import { CorrectiveTaskDialogs, type TaskDialog } from "./corrective-dialogs";

function readFilter(search: URLSearchParams): CorrectiveFilter {
  const state = search.get("state");
  return (CORRECTIVE_FILTERS as readonly string[]).includes(state ?? "") ? (state as CorrectiveFilter) : "open";
}

/** What each filter asks of the list: the work to do earliest due first, the record latest first. */
const FILTER_QUERY: Record<CorrectiveFilter, Parameters<typeof listCorrectiveTasksQuery>[0]> = {
  open: { status: OPEN_TASK_STATUSES },
  overdue: { overdue: true },
  done: { status: "DONE", latestFirst: true },
  all: { latestFirst: true },
};

const STATUS_TONE: Record<TaskStatus, StatusTone> = {
  OPEN: "pending",
  IN_PROGRESS: "progress",
  DONE: "success",
  CANCELLED: "neutral",
};

const isOpen = (status: TaskStatus) => OPEN_TASK_STATUSES.includes(status);

/** The view has no button of its own in the heading row: a task comes from an inspection, a complaint or a report. */
export function CorrectiveActions() {
  return null;
}

/**
 * «المهام التصحيحية»: what must be put right, by when and by whom (#17), from
 * the inspections under the threshold, the complaints, the problem reports and
 * the sign-offs. Still to be do first, earliest due first; `?state=overdue` is
 * what the alert tile opens. A row is started, completed or cancelled in a
 * small dialog.
 *
 * Closest academy screen: the attendance overviews
 * (attendance/_components/staff-absence-overview.tsx).
 */
export function CorrectiveView() {
  const t = useTranslations("CorrectiveTasks");
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const dates = useQualityDates();
  const statusLabel = useCodeLabel("CorrectiveTasks.Statuses");
  const sourceLabel = useCodeLabel("CorrectiveTasks.Sources");
  const actionLabel = useCodeLabel("Options.CorrectiveAction");
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const filter = readFilter(useSearchParams());
  const list = useQuery({
    queryKey: [...pathKey(CORRECTIVE_TASKS_PATH), "corrective", filter],
    queryFn: () => listCorrectiveTasksQuery(FILTER_QUERY[filter]),
  });
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));
  const [dialog, setDialog] = React.useState<TaskDialog>(null);
  const [askReason, reasonDialog] = useReasonDialog();

  const cancelTask = React.useCallback(
    async (task: CorrectiveTaskLine) => {
      const reason = await askReason({
        title: t("Dialog.CancelTitle"),
        description: t("Dialog.CancelDescription", { site: isolate(task.site) }),
        reasonLabel: t("Dialog.CancelReason"),
        confirmLabel: t("Dialog.CancelConfirm"),
        cancelLabel: t("Dialog.Keep"),
      });
      if (reason === null) return;
      const result = await cancelCorrectiveTaskAction({ taskId: task.id, reason });
      if (!result.success) toast.error(errorMessage(result.error, t("Dialog.Failed")));
      else toast.success(t("Dialog.Cancelled"));
    },
    [askReason, errorMessage, t],
  );

  const lines = React.useMemo(() => list.data ?? [], [list.data]);
  const shown = React.useMemo(() => {
    const words = normaliseName(search);
    const typed = search.trim();
    if (!words && !typed) return lines;
    return lines.filter((line) => {
      const text = normaliseName(
        [line.site, line.clientName, line.description, line.assignee ? staffName(line.assignee) : ""].join(" "),
      );
      return (
        (words !== "" && words.split(" ").every((word) => text.includes(word))) ||
        (typed !== "" && (line.file.number.includes(typed) || (line.inspection?.number.includes(typed) ?? false)))
      );
    });
  }, [lines, search]);

  const columns = React.useMemo<ColumnDef<CorrectiveTaskLine>[]>(
    () => [
      {
        id: "site",
        header: t("List.Columns.Site"),
        cell: ({ row }) => {
          const line = row.original;
          return (
            <span
              className="block max-w-[8rem] truncate font-semibold xl:max-w-[13rem]"
              title={`${line.site} — ${line.clientName} (${line.file.number})`}
            >
              <bdi>{line.site}</bdi>
            </span>
          );
        },
      },
      {
        id: "task",
        header: t("List.Columns.Task"),
        cell: ({ row }) => {
          const line = row.original;
          const source = line.inspection ?? line.complaint;
          const from = source ? `${sourceLabel(line.source)} ${source.number}` : sourceLabel(line.source);
          const text = (
            <>
              <span className="font-bold">{actionLabel(line.action)}</span> · <bdi>{line.description}</bdi>
            </>
          );
          const title = `${actionLabel(line.action)} — ${line.description} (${from})${line.resultNote ? ` — ${line.resultNote}` : ""}`;
          return line.inspection ? (
            <Link
              to={inspectionHref(line.inspection.id)}
              className="block max-w-[13rem] truncate hover:underline xl:max-w-[22rem]"
              title={title}
            >
              {text}
            </Link>
          ) : (
            <span className="block max-w-[13rem] truncate xl:max-w-[22rem]" title={title}>
              {text}
            </span>
          );
        },
      },
      {
        id: "responsible",
        header: t("List.Columns.Responsible"),
        cell: ({ row }) => {
          const assignee = row.original.assignee;
          if (!assignee) return <span className="text-muted-foreground">{t("List.Nobody")}</span>;
          const name = staffName(assignee);
          return (
            <span className="block max-w-[7rem] truncate xl:max-w-[11rem]" title={name}>
              <bdi>{name}</bdi>
            </span>
          );
        },
      },
      {
        id: "due",
        header: t("List.Columns.Due"),
        cell: ({ row }) => (
          <Ltr
            className={cn("whitespace-nowrap", row.original.overdue && "font-bold text-destructive")}
            title={dates.long(row.original.dueDate)}
          >
            {dates.short(row.original.dueDate)}
          </Ltr>
        ),
      },
      {
        id: "status",
        header: t("List.Columns.Status"),
        cell: ({ row }) =>
          row.original.overdue ? (
            <StatusChip tone="danger" label={t("List.Overdue")} />
          ) : (
            <StatusChip tone={STATUS_TONE[row.original.status]} label={statusLabel(row.original.status)} />
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const task = row.original;
          if (!mayWrite || !isOpen(task.status)) return null;
          return (
            <div className="flex items-center justify-end gap-2">
              {task.status === "OPEN" && (
                <Button
                  variant="outline"
                  size="sm"
                  title={t("List.Start")}
                  onClick={() => setDialog({ kind: "start", task })}
                >
                  <Play />
                  <span className="sr-only 2xl:not-sr-only">{t("List.Start")}</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                title={t("List.Complete")}
                onClick={() => setDialog({ kind: "complete", task })}
              >
                <CircleCheckBig />
                <span className="sr-only 2xl:not-sr-only">{t("List.Complete")}</span>
              </Button>
              <Button variant="outline" size="sm" title={t("List.Cancel")} onClick={() => void cancelTask(task)}>
                <Ban />
                <span className="sr-only 2xl:not-sr-only">{t("List.Cancel")}</span>
              </Button>
            </div>
          );
        },
      },
    ],
    [t, dates, statusLabel, sourceLabel, actionLabel, mayWrite, cancelTask],
  );

  const table = useReactTable({
    data: shown,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const setFilter = (next: CorrectiveFilter) => {
    navigate(qualityHref("corrective", { state: next === "open" ? null : next }), { replace: true });
    firstPage();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <TableSearch
          className="w-full lg:max-w-sm lg:flex-1"
          placeholder={t("List.Search")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            firstPage();
          }}
        />
        <Select value={filter} onValueChange={(next) => setFilter(next as CorrectiveFilter)}>
          <SelectTrigger className="w-full sm:w-56" aria-label={t("List.StateLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CORRECTIVE_FILTERS.map((code) => (
              <SelectItem key={code} value={code}>
                {t(`List.States.${code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <>
          <DataTable
            table={table}
            columnCount={columns.length}
            emptyMessage={t(
              list.isPending ? "List.Loading" : lines.length === 0 ? `List.None.${filter}` : "List.NoMatch",
            )}
          />
          <TablePager table={table} />
        </>
      )}
      <CorrectiveTaskDialogs dialog={dialog} onClose={() => setDialog(null)} />
      {reasonDialog}
    </div>
  );
}
