import * as React from "react";

import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { Ban, Printer, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/features/money/components/reason-dialog";
import { useDateText } from "@/features/money/components/use-money-text";
import { cancelHandOutAction, type HandOutListRow } from "@/features/stock/services/handouts";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { ReturnDialog } from "./return-dialog";

/**
 * The hand-outs, the latest first. A row says who received, for which job,
 * and whether equipment is still out; it prints its slip, takes back what
 * returns, and is cancelled with a reason when it was typed by mistake
 * (`stock.manage`), never edited.
 */
export function HandoutsTable({
  handouts,
  showJob = true,
}: {
  handouts: readonly HandOutListRow[];
  /** Left out on a file's own part: every row is that file's. */
  showJob?: boolean;
}) {
  const t = useTranslations("Handouts");
  const dates = useDateText();
  const errorMessage = useErrorMessage();
  const divisionLabel = useCodeLabel("Options.Division");
  const purposeLabel = useCodeLabel("StockCodes.Purposes");
  const level = useSectionLevel("STOCK");
  const manages = useCan("stock.manage");
  const mayWrite = level === "WRITE";
  const mayCancel = mayWrite && manages;

  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [cancelling, setCancelling] = React.useState<HandOutListRow | null>(null);
  const [returning, setReturning] = React.useState<HandOutListRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function confirmCancel(reason: string) {
    if (!cancelling) return;
    setBusy(true);
    const result = await cancelHandOutAction({ handOutId: cancelling.id, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("CancelFailed")));
      return;
    }
    toast.success(t("Cancelled", { number: cancelling.number }));
    setCancelling(null);
  }

  const columns = React.useMemo<ColumnDef<HandOutListRow>[]>(() => {
    const all: ColumnDef<HandOutListRow>[] = [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-0 xl:max-w-56">
            <p className="truncate leading-tight font-bold tabular-nums">
              <Ltr>{row.original.number}</Ltr>
            </p>
            <p className="truncate text-sm leading-tight text-muted-foreground">{dates.long(row.original.date)}</p>
          </div>
        ),
      },
      {
        id: "worker",
        header: t("Table.Worker"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-0 xl:max-w-56">
            <p className="truncate leading-tight font-bold">{row.original.workerName}</p>
            <p className="truncate text-sm leading-tight text-muted-foreground">
              <Ltr>{row.original.workerNumber}</Ltr>
            </p>
          </div>
        ),
      },
      {
        id: "job",
        header: t("Table.Job"),
        cell: ({ row }) =>
          row.original.clientName ? (
            <div className="max-w-36 min-w-0 xl:max-w-56">
              <p className="truncate leading-tight">{row.original.clientName}</p>
              <p className="truncate text-sm leading-tight text-muted-foreground">
                {row.original.division ? divisionLabel(row.original.division) : null} ·{" "}
                <Ltr>{row.original.fileNumber}</Ltr>
              </p>
            </div>
          ) : (
            <span className="text-muted-foreground">{purposeLabel(row.original.purpose)}</span>
          ),
      },
      {
        id: "lines",
        header: t("Table.Lines"),
        cell: ({ row }) => <span className="tabular-nums">{t("LineCount", { count: row.original.lines })}</span>,
      },
      {
        id: "state",
        header: t("Table.State"),
        cell: ({ row }) =>
          row.original.cancelled ? (
            <StatusChip tone="neutral" label={t("States.Cancelled")} />
          ) : row.original.stillOut > 0 ? (
            <StatusChip tone="warning" label={t("States.StillOut", { count: row.original.stillOut })} />
          ) : (
            <StatusChip tone="success" label={t("States.Settled")} />
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("Table.Actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm" title={t("Print")}>
              <Link to={`/dashboard/handouts/${row.original.id}/print`} aria-label={t("Print")}>
                <Printer />
                <span className="hidden xl:inline">{t("Print")}</span>
              </Link>
            </Button>
            {mayWrite && !row.original.cancelled && row.original.stillOut > 0 && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Return")}
                title={t("Return")}
                onClick={() => setReturning(row.original)}
              >
                <Undo2 />
              </Button>
            )}
            {mayCancel && !row.original.cancelled && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Cancel")}
                title={t("Cancel")}
                onClick={() => setCancelling(row.original)}
              >
                <Ban />
              </Button>
            )}
          </div>
        ),
      },
    ];
    return showJob ? all : all.filter((column) => column.id !== "job");
  }, [dates, divisionLabel, mayCancel, mayWrite, purposeLabel, showJob, t]);

  const rows = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return handouts.filter(
      (row) =>
        !query ||
        [row.number, row.workerName, row.workerNumber, row.clientName ?? "", row.fileNumber ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        ),
    );
  }, [handouts, search]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto text-lg font-bold tall:text-xl">{t("HandoutCount", { count: rows.length })}</h3>
        <TableSearch
          className="w-full sm:w-80"
          placeholder={t("SearchPlaceholder")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage={t("NoHandouts")} />
      <TablePager table={table} />

      <ReasonDialog
        open={cancelling !== null}
        title={t("CancelTitle", { number: cancelling?.number ?? "" })}
        description={t("CancelDescription")}
        confirmLabel={t("Cancel")}
        destructive
        busy={busy}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      />
      <ReturnDialog handOutId={returning?.id ?? null} onClose={() => setReturning(null)} />
    </div>
  );
}
