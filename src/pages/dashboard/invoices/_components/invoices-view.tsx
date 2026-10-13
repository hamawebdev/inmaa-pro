import * as React from "react";

import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { Ban, CircleDollarSign, FileText, ListChecks, Printer, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import { ReasonDialog } from "@/features/money/components/reason-dialog";
import { PaymentStateChip } from "@/features/money/components/state-chips";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import { voidInvoiceAction, type InvoiceListRow } from "@/features/money/services/invoices";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";

const STATE_FILTERS = ["ALL", "UNPAID", "PARTIAL", "PAID", "VOIDED"] as const;
type StateFilter = (typeof STATE_FILTERS)[number];

function matches(row: InvoiceListRow, filter: StateFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "VOIDED") return row.voided;
  return !row.voided && row.paymentState === filter;
}

/**
 * The invoices of the period: four figures, then the list with its search and
 * a state filter. Each row prints its invoice and its visit statement; the
 * manager voids one with a reason typed (the invoice, its lines and its number
 * stay, its dues go back to «غير مفوترة»).
 */
export function InvoicesView({ invoices }: { invoices: readonly InvoiceListRow[] }) {
  const t = useTranslations("Invoices");
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();
  const methodLabel = usePaymentMethodLabel();
  const errorMessage = useErrorMessage();
  const level = useSectionLevel("MONEY");
  const voids = useCan("invoice.void");
  const mayVoid = level === "WRITE" && voids;

  const [search, setSearch] = React.useState("");
  const [state, setState] = React.useState<StateFilter>("ALL");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [voiding, setVoiding] = React.useState<InvoiceListRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  const live = invoices.filter((row) => !row.voided);
  const invoiced = live.reduce((sum, row) => sum + row.totalTTC, 0);
  const paid = live.reduce((sum, row) => sum + row.paid, 0);
  const remaining = live.reduce((sum, row) => sum + row.remaining, 0);

  async function confirmVoid(reason: string) {
    if (!voiding) return;
    setBusy(true);
    const result = await voidInvoiceAction({ invoiceId: voiding.id, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("VoidFailed")));
      return;
    }
    toast.success(t("Voided", { number: voiding.number }));
    setVoiding(null);
  }

  const columns = React.useMemo<ColumnDef<InvoiceListRow>[]>(
    () => [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-0 xl:max-w-56">
            <p className="truncate leading-tight font-bold tabular-nums">
              <Ltr>{row.original.number}</Ltr>
            </p>
            <p className="truncate text-sm leading-tight text-muted-foreground">{dates.long(row.original.issueDate)}</p>
          </div>
        ),
      },
      {
        id: "client",
        header: t("Table.Client"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-0 xl:max-w-56">
            <p className="truncate leading-tight font-bold">{row.original.clientName}</p>
            <p className="truncate text-sm leading-tight text-muted-foreground">
              {divisionLabel(row.original.division)} · <Ltr>{row.original.fileNumber}</Ltr>
            </p>
          </div>
        ),
      },
      {
        id: "amount",
        header: t("Table.Amount"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-0 xl:max-w-56">
            <p className="leading-tight font-bold whitespace-nowrap tabular-nums">{money(row.original.totalTTC)}</p>
            <p className="truncate text-sm leading-tight text-muted-foreground">
              {methodLabel(row.original.paymentMethod)}
            </p>
          </div>
        ),
      },
      {
        id: "paid",
        header: t("Table.Remaining"),
        cell: ({ row }) =>
          row.original.voided ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="max-w-36 min-w-0 xl:max-w-56">
              <p className="leading-tight font-bold whitespace-nowrap tabular-nums">{money(row.original.remaining)}</p>
              <p className="truncate text-sm leading-tight text-muted-foreground">
                {t("DueOn", { date: dates.long(row.original.dueDate) })}
              </p>
            </div>
          ),
      },
      {
        id: "state",
        header: t("Table.State"),
        cell: ({ row }) => <PaymentStateChip state={row.original.voided ? null : row.original.paymentState} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("Table.Actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm" title={t("Print")}>
              <Link to={`/dashboard/invoices/${row.original.id}/print`} aria-label={t("Print")}>
                <Printer />
                <span className="hidden xl:inline">{t("Print")}</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="icon-sm" title={t("PrintStatement")}>
              <Link to={`/dashboard/invoices/${row.original.id}/print-statement`} aria-label={t("PrintStatement")}>
                <ListChecks />
              </Link>
            </Button>
            {mayVoid && !row.original.voided && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Void")}
                title={t("Void")}
                onClick={() => setVoiding(row.original)}
              >
                <Ban />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [dates, divisionLabel, mayVoid, methodLabel, money, t],
  );

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((row) => {
      if (!matches(row, state)) return false;
      if (!query) return true;
      return [row.number, row.clientName, row.fileNumber].some((value) => value.toLowerCase().includes(query));
    });
  }, [invoices, search, state]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-6 tall:space-y-8">
      {/* A money figure is long: three to a row, as on the income screen. The count is over the list. */}
      <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 tall:gap-6">
        <StatCard tone="money" icon={CircleDollarSign} label={t("Figures.Invoiced")} value={money(invoiced)} />
        <StatCard tone="money" icon={Wallet} label={t("Figures.Paid")} value={money(paid)} />
        <StatCard tone="money" icon={FileText} label={t("Figures.Remaining")} value={money(remaining)} />
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="me-auto text-lg font-bold tall:text-xl">{t("InvoiceCount", { count: filtered.length })}</h3>
          <TableSearch
            className="w-full sm:w-80"
            placeholder={t("SearchPlaceholder")}
            value={search}
            onChange={(value) => {
              setSearch(value);
              firstPage();
            }}
          />
          <Select
            value={state}
            onValueChange={(value) => {
              setState(value as StateFilter);
              firstPage();
            }}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label={t("Table.State")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_FILTERS.map((filter) => (
                <SelectItem key={filter} value={filter}>
                  {t(`StateFilters.${filter}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DataTable table={table} columnCount={columns.length} emptyMessage={t("NoInvoices")} />
        <TablePager table={table} />
      </div>

      <ReasonDialog
        open={voiding !== null}
        title={t("VoidTitle", { number: voiding?.number ?? "" })}
        description={t("VoidDescription")}
        confirmLabel={t("Void")}
        destructive
        busy={busy}
        onConfirm={confirmVoid}
        onCancel={() => setVoiding(null)}
      />
    </div>
  );
}
