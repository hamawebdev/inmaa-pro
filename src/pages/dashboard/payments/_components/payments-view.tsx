import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { Ban, Banknote, Printer, Stamp, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import { PeriodFilter } from "@/features/money/components/period-filter";
import { ReasonDialog } from "@/features/money/components/reason-dialog";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import type { IsoDate } from "@/features/money/rules/dates";
import { readPeriod } from "@/features/money/rules/period";
import { PAYMENTS_PATH } from "@/features/money/services/paths";
import { listPaymentsQuery, voidPaymentAction, type PaymentListRow } from "@/features/money/services/payments";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";
import { localDate } from "@/lib/units";

/**
 * The payments received over the period: what came in, the stamp duty taken
 * on cash, and each payment with its receipt. A wrong payment is voided by the
 * manager with a reason, never edited: its allocations are reversed and its
 * receipt is marked void.
 */
export function PaymentsView({ today }: { today: IsoDate }) {
  const t = useTranslations("Payments");
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();
  const methodLabel = usePaymentMethodLabel();
  const errorMessage = useErrorMessage();
  const period = readPeriod(useSearchParams(), today);
  const level = useSectionLevel("MONEY");
  const voids = useCan("payment.void");
  const mayVoid = level === "WRITE" && voids;

  const { data: payments } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), period.from, period.to],
    queryFn: () => listPaymentsQuery({ from: localDate(period.from), to: localDate(period.to) }),
  });

  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [voiding, setVoiding] = React.useState<PaymentListRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function confirmVoid(reason: string) {
    if (!voiding) return;
    setBusy(true);
    const result = await voidPaymentAction({ paymentId: voiding.id, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("VoidFailed")));
      return;
    }
    toast.success(t("Voided"));
    setVoiding(null);
  }

  const columns = React.useMemo<ColumnDef<PaymentListRow>[]>(
    () => [
      {
        id: "date",
        header: t("Table.Date"),
        cell: ({ row }) => <span className="whitespace-nowrap">{dates.long(row.original.receivedDate)}</span>,
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
        id: "payer",
        header: t("Table.Payer"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-0 xl:max-w-56">
            <p className="truncate leading-tight">{row.original.payerName}</p>
            <p className="truncate text-sm leading-tight text-muted-foreground">
              {methodLabel(row.original.method)}
              {row.original.reference && (
                <>
                  {" · "}
                  <Ltr>{row.original.reference}</Ltr>
                </>
              )}
            </p>
          </div>
        ),
      },
      {
        id: "amount",
        header: t("Table.Amount"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-0 xl:max-w-56">
            <p
              className={
                row.original.voided
                  ? "leading-tight font-bold whitespace-nowrap text-muted-foreground tabular-nums line-through"
                  : "leading-tight font-bold whitespace-nowrap tabular-nums"
              }
            >
              {money(row.original.amount)}
            </p>
            {row.original.stampDuty > 0 && (
              <p className="truncate text-sm leading-tight text-muted-foreground">
                {t("WithStamp", { stamp: money(row.original.stampDuty) })}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "receipt",
        header: t("Table.Receipt"),
        cell: ({ row }) =>
          row.original.voided ? (
            <StatusChip tone="neutral" label={t("VoidedChip")} />
          ) : row.original.receiptNumber ? (
            <span className="font-bold tabular-nums">
              <Ltr>{row.original.receiptNumber}</Ltr>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("Table.Actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {row.original.receiptId && (
              <Button asChild variant="outline" size="sm" title={t("PrintReceipt")}>
                <Link
                  to={`/dashboard/payments/receipts/${row.original.receiptId}/print`}
                  aria-label={t("PrintReceipt")}
                >
                  <Printer />
                  <span className="hidden xl:inline">{t("PrintReceipt")}</span>
                </Link>
              </Button>
            )}
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

  const rows = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return (payments ?? []).filter(
      (row) =>
        !query ||
        [row.clientName, row.fileNumber, row.payerName, row.receiptNumber ?? "", row.reference ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        ),
    );
  }, [payments, search]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const live = (payments ?? []).filter((row) => !row.voided);
  const received = live.reduce((sum, row) => sum + row.amount, 0);
  const stamps = live.reduce((sum, row) => sum + row.stampDuty, 0);
  const cash = live.filter((row) => row.method === "CASH").reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-6 tall:space-y-8">
      <PeriodFilter period={period} today={today} />
      {!payments ? (
        <ScreenSkeleton />
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 tall:gap-6">
            <StatCard tone="money" icon={Wallet} label={t("Figures.Received")} value={money(received)} />
            <StatCard tone="money" icon={Banknote} label={t("Figures.Cash")} value={money(cash)} />
            <StatCard tone="money" icon={Stamp} label={t("Figures.Stamp")} value={money(stamps)} />
          </div>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="me-auto text-lg font-bold tall:text-xl">{t("PaymentCount", { count: rows.length })}</h3>
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
            <DataTable table={table} columnCount={columns.length} emptyMessage={t("NoPayments")} />
            <TablePager table={table} />
          </div>
        </>
      )}

      <ReasonDialog
        open={voiding !== null}
        title={t("VoidTitle")}
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
