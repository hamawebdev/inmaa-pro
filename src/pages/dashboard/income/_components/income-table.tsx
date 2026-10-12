import * as React from "react";

import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import type { IncomePaymentView } from "@/features/money/views";

/**
 * The payments counted as income in the period and division chosen.
 *
 * The newer generation's table (attendance: `TableSearch`, `DataTable`,
 * `TablePager`), with the columns of the academy's finance tables.
 */
export function IncomeTable({ rows, showDivision }: { rows: readonly IncomePaymentView[]; showDivision: boolean }) {
  const t = useTranslations("Income");
  const divisionLabel = useDivisionLabel();
  const methodLabel = usePaymentMethodLabel();
  const money = useMoneyText();
  const dates = useDateText();
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const columns = React.useMemo<ColumnDef<IncomePaymentView>[]>(
    () => [
      {
        id: "date",
        header: t("Table.Date"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">{dates.long(row.original.receivedDate)}</span>
        ),
      },
      {
        id: "client",
        header: t("Table.Client"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-bold">{row.original.clientName}</p>
            {row.original.payerName !== row.original.clientName && (
              <p className="text-sm text-muted-foreground">{t("Table.PaidBy", { payer: row.original.payerName })}</p>
            )}
          </div>
        ),
      },
      {
        id: "file",
        header: t("Table.File"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="whitespace-nowrap">
              <Ltr>{row.original.fileNumber}</Ltr>
            </p>
            {/* On «الكل» the file's division is said under its number: a file belongs to one. */}
            {showDivision && <p className="text-sm text-muted-foreground">{divisionLabel(row.original.division)}</p>}
          </div>
        ),
      },
      {
        id: "method",
        header: t("Table.Method"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p>{methodLabel(row.original.method)}</p>
            {row.original.receiptNumber && (
              <p className="text-sm whitespace-nowrap text-muted-foreground">
                {t("Table.ReceiptNumber")} <Ltr>{row.original.receiptNumber}</Ltr>
              </p>
            )}
          </div>
        ),
      },
      {
        id: "amount",
        header: t("Table.Amount"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-bold whitespace-nowrap text-success tabular-nums">{money(row.original.amount)}</p>
            {/* Stamp duty is collected with a cash payment but is not income: said apart, never added. */}
            {row.original.stampDuty > 0 && (
              <p className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                {t("Table.PlusStamp", { amount: money(row.original.stampDuty) })}
              </p>
            )}
          </div>
        ),
      },
    ],
    [dates, divisionLabel, methodLabel, money, showDivision, t],
  );

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [...rows];
    return rows.filter((row) =>
      [row.clientName, row.payerName, row.fileNumber, row.receiptNumber ?? ""].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [rows, search]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto text-lg font-bold tall:text-xl">{t("PaymentCount", { count: filtered.length })}</h3>
        <TableSearch
          className="w-full sm:w-96"
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
  );
}
