import * as React from "react";

import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { Lock, Pencil, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import type { IsoDate } from "@/features/money/rules/dates";
import { EXPENSE_CATEGORIES, type ExpenseDivision } from "@/features/money/validators/option-codes";
import { ReasonDialog } from "@/features/money/components/reason-dialog";
import { deleteExpenseAction } from "@/features/money/services/expenses";
import type { ExpenseView } from "@/features/money/views";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { ExpenseFormDialog } from "./expense-form-dialog";
import { ReceiptButton } from "./receipt-button";

const ALL_CATEGORIES = "all";

/**
 * The expenses of the period and division chosen.
 *
 * The academy's expenses table (expenses/_components/expenses-table.tsx: a
 * search, a category filter, the receipt, a row action), drawn with the newer
 * generation's `TableSearch`, `DataTable` and `TablePager`.
 *
 * Only an expense typed by hand is changed here. One the program wrote from a
 * purchase, a maintenance record or a pay run says where it came from, and is
 * changed there, so that the two can never disagree.
 */
export function ExpensesTable({
  rows,
  showDivision,
  today,
  defaultDivision,
}: {
  rows: readonly ExpenseView[];
  showDivision: boolean;
  today: IsoDate;
  defaultDivision?: ExpenseDivision;
}) {
  const t = useTranslations("Expenses");
  const categoryLabel = useCodeLabel("MoneyCodes.ExpenseCategories");
  const divisionLabel = useDivisionLabel();
  const methodLabel = usePaymentMethodLabel();
  const sourceLabel = useCodeLabel("MoneyCodes.ExpenseSources");
  const recurrenceLabel = useCodeLabel("MoneyCodes.Recurrences");
  const money = useMoneyText();
  const dates = useDateText();
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [removing, setRemoving] = React.useState<ExpenseView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const errorMessage = useErrorMessage();

  async function remove(reason: string) {
    if (!removing) return;
    setBusy(true);
    const result = await deleteExpenseAction({ id: removing.id, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("RemoveFailed")));
      return;
    }
    toast.success(t("Removed"));
    setRemoving(null);
  }

  const columns = React.useMemo<ColumnDef<ExpenseView>[]>(
    () => [
      {
        id: "date",
        header: t("Table.Date"),
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{dates.long(row.original.date)}</span>,
      },
      {
        id: "category",
        header: t("Table.Category"),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="secondary">{categoryLabel(row.original.category)}</Badge>
            {/* On «الكل» the line it was spent on is said under it, and a monthly expense says so. */}
            {(showDivision || row.original.recurrence === "MONTHLY") && (
              <span className="inline-flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {showDivision && <span>{divisionLabel(row.original.division)}</span>}
                {row.original.recurrence === "MONTHLY" && (
                  <span className="inline-flex items-center gap-1">
                    <Repeat aria-hidden className="size-[1em]" />
                    {recurrenceLabel(row.original.recurrence)}
                  </span>
                )}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "paidTo",
        header: t("Table.PaidTo"),
        cell: ({ row }) => (
          <div className="min-w-0">
            {row.original.paidTo ? (
              <p className="font-bold">{row.original.paidTo}</p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {row.original.spentByName && (
              <p className="text-sm text-muted-foreground">{t("Table.SpentBy", { name: row.original.spentByName })}</p>
            )}
            {row.original.note && (
              <p className="max-w-64 truncate text-sm text-muted-foreground" title={row.original.note}>
                {row.original.note}
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
            <p className="font-bold whitespace-nowrap tabular-nums">{money(row.original.amount)}</p>
            {row.original.method && <p className="text-sm text-muted-foreground">{methodLabel(row.original.method)}</p>}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("Table.Actions")}</span>,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReceiptButton url={row.original.receiptUrl} />
            {row.original.source === "MANUAL" ? (
              <>
                <ExpenseFormDialog
                  today={today}
                  expense={row.original}
                  defaultDivision={defaultDivision}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Pencil />
                      {t("Edit")}
                    </Button>
                  }
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("Remove")}
                  title={t("Remove")}
                  onClick={() => setRemoving(row.original)}
                >
                  <Trash2 />
                </Button>
              </>
            ) : (
              <Badge variant="muted" title={t("ChangedAtSource")}>
                <Lock aria-hidden />
                {sourceLabel(row.original.source)}
              </Badge>
            )}
          </div>
        ),
      },
    ],
    [
      categoryLabel,
      dates,
      defaultDivision,
      divisionLabel,
      methodLabel,
      money,
      recurrenceLabel,
      showDivision,
      sourceLabel,
      t,
      today,
    ],
  );

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== ALL_CATEGORIES && row.category !== category) return false;
      if (!query) return true;
      return [row.paidTo, row.spentByName, row.note].some((value) => value?.toLowerCase().includes(query));
    });
  }, [category, rows, search]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto text-lg font-bold tall:text-xl">{t("ExpenseCount", { count: filtered.length })}</h3>
        <TableSearch
          className="w-full sm:w-96"
          placeholder={t("SearchPlaceholder")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            firstPage();
          }}
        />
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value);
            firstPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-60" aria-label={t("Table.Category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>{t("AllCategories")}</SelectItem>
            {EXPENSE_CATEGORIES.map((code) => (
              <SelectItem key={code} value={code}>
                {categoryLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable table={table} columnCount={columns.length} emptyMessage={t("NoExpenses")} />
      <TablePager table={table} />
      <ReasonDialog
        open={removing !== null}
        title={t("RemoveTitle")}
        description={t("RemoveDescription")}
        confirmLabel={t("Remove")}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
