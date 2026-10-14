import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { AlarmClock, CircleAlert, HandCoins, Mail, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDivisionLabel } from "@/features/money/components/labels";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { DueStateChip } from "@/features/money/components/state-chips";
import { MoneyValue } from "@/features/money/components/money-value";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import { listOpenDuesQuery, type OpenDueRow } from "@/features/money/services/debts";
import { PAYMENTS_PATH } from "@/features/money/services/paths";
import { pathKey } from "@/lib/compat/revalidate";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";

const STATE_FILTERS = ["ALL", "OVERDUE", "DUE_SOON", "UPCOMING", "PARTIAL"] as const;
type StateFilter = (typeof STATE_FILTERS)[number];

/**
 * «الديون»: every amount still owed, the oldest date first, with what was paid
 * on it and how late it is. The state filter is kept in the address, so the
 * two payment tiles of the home screen open the overdue ones or those due
 * soon. Each row prints the file's reminder letter (the office form of the
 * plan's WhatsApp reminder) and, for whoever takes payments, records one.
 */
export function DuesView({ onRecord }: { onRecord?: (fileId: string) => void }) {
  const t = useTranslations("Dues");
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();
  const params = useSearchParams();
  const router = useRouter();
  const stateParam = params.get("state") ?? "ALL";
  const state: StateFilter = (STATE_FILTERS as readonly string[]).includes(stateParam)
    ? (stateParam as StateFilter)
    : "ALL";

  const { data: dues } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "dues"],
    queryFn: () => listOpenDuesQuery(undefined),
  });

  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  function setState(next: string) {
    const rest = new URLSearchParams(params);
    if (next === "ALL") rest.delete("state");
    else rest.set("state", next);
    router.replace(`?${rest.toString()}`);
    firstPage();
  }

  const what = React.useCallback(
    (row: OpenDueRow) => {
      if (row.periodStart && row.periodEnd && row.kind === "SCHEDULE") {
        return t("Period", { from: dates.short(row.periodStart), to: dates.long(row.periodEnd) });
      }
      if (row.kind === "VISIT" && row.periodStart) return t("Visit", { date: dates.long(row.periodStart) });
      return t("Job");
    },
    [dates, t],
  );

  const columns = React.useMemo<ColumnDef<OpenDueRow>[]>(
    () => [
      {
        id: "client",
        header: t("Table.Client"),
        cell: ({ row }) => (
          <div className="max-w-32 min-w-0 xl:max-w-56">
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
          <div className="max-w-32 min-w-0 xl:max-w-56">
            <p className="truncate leading-tight">{row.original.payerName ?? row.original.clientName}</p>
            {row.original.payerPhone && (
              <p className="truncate text-sm leading-tight text-muted-foreground">
                <Ltr>{row.original.payerPhone}</Ltr>
              </p>
            )}
          </div>
        ),
      },
      {
        id: "what",
        header: t("Table.What"),
        cell: ({ row }) => (
          <div className="max-w-32 min-w-0 xl:max-w-56">
            <p className="truncate leading-tight">{what(row.original)}</p>
            <p className="truncate text-sm leading-tight text-muted-foreground">
              {t("DueOn", { date: dates.long(row.original.dueDate) })}
              {row.original.invoiceNumber && (
                <>
                  {" · "}
                  <Ltr>{row.original.invoiceNumber}</Ltr>
                </>
              )}
            </p>
          </div>
        ),
      },
      {
        id: "remaining",
        header: t("Table.Remaining"),
        cell: ({ row }) => (
          <div className="max-w-32 min-w-0 xl:max-w-56">
            <p className="leading-tight font-bold whitespace-nowrap tabular-nums">{money(row.original.remaining)}</p>
            {row.original.paidAmount > 0 && (
              <p className="truncate text-sm leading-tight text-muted-foreground">
                {t("PaidOf", { paid: money(row.original.paidAmount), amount: money(row.original.amount) })}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "state",
        header: t("Table.State"),
        cell: ({ row }) => <DueStateChip state={row.original.state} daysLate={row.original.daysLate} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("Table.Actions")}</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm" title={t("Reminder")}>
              <Link to={`/dashboard/payments/reminders/${row.original.fileId}/print`} aria-label={t("Reminder")}>
                <Mail />
                <span className="hidden xl:inline">{t("Reminder")}</span>
              </Link>
            </Button>
            {onRecord && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("RecordFor", { client: row.original.clientName })}
                title={t("RecordFor", { client: row.original.clientName })}
                onClick={() => onRecord(row.original.fileId)}
              >
                <HandCoins />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [dates, divisionLabel, money, onRecord, t, what],
  );

  const rows = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return (dues ?? []).filter((row) => {
      if (state !== "ALL" && row.state !== state) return false;
      if (!query) return true;
      return [row.clientName, row.fileNumber, row.payerName ?? "", row.payerPhone ?? "", row.invoiceNumber ?? ""].some(
        (value) => value.toLowerCase().includes(query),
      );
    });
  }, [dues, search, state]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!dues) return <ScreenSkeleton />;

  const owed = dues.reduce((sum, row) => sum + row.remaining, 0);
  const overdue = dues.filter((row) => row.state === "OVERDUE").reduce((sum, row) => sum + row.remaining, 0);
  const soon = dues.filter((row) => row.state === "DUE_SOON").reduce((sum, row) => sum + row.remaining, 0);
  const files = new Set(dues.map((row) => row.fileId)).size;

  return (
    <div className="space-y-6 tall:space-y-8">
      <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 tall:gap-6">
        <StatCard
          tone="money"
          icon={Wallet}
          label={t("Figures.Owed")}
          value={<MoneyValue amount={owed} compact />}
          hint={t("Figures.Files", { count: files })}
        />
        <StatCard
          tone="money"
          icon={CircleAlert}
          label={t("Figures.Overdue")}
          value={<MoneyValue amount={overdue} compact />}
          href="/dashboard/payments?view=dues&state=OVERDUE"
        />
        <StatCard
          tone="money"
          icon={AlarmClock}
          label={t("Figures.DueSoon")}
          value={<MoneyValue amount={soon} compact />}
          href="/dashboard/payments?view=dues&state=DUE_SOON"
        />
      </div>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="me-auto text-lg font-bold tall:text-xl">{t("DueCount", { count: rows.length })}</h3>
          <TableSearch
            className="w-full sm:w-80"
            placeholder={t("SearchPlaceholder")}
            value={search}
            onChange={(value) => {
              setSearch(value);
              firstPage();
            }}
          />
          <Select value={state} onValueChange={setState}>
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
        <DataTable table={table} columnCount={columns.length} emptyMessage={t("NoDues")} />
        <TablePager table={table} />
      </div>
    </div>
  );
}
