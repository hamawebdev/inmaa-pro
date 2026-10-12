import * as React from "react";

import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { useLocale, useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatQuantity } from "@/features/money/rules/quantities";
import { needsPurchase, stockState, type StockState } from "@/features/stock/rules/stock-state";
import { STOCK_CATEGORIES, STOCK_KINDS, isStockKind, type StockKind } from "@/features/stock/validators/option-codes";
import type { StockItemView } from "@/features/stock/views";
import type { Locale } from "@/i18n/config";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";
import { cn } from "@/lib/utils";
import { SECTION_ACCENT } from "@/navigation/sections";

/** The state filter: every state, the ones to buy (out or at the minimum), or one state. */
const STATE_FILTERS = ["ALL", "TO_BUY", "OK", "UNWATCHED"] as const;
type StateFilter = (typeof STATE_FILTERS)[number];
const ALL_CATEGORIES = "all";

const STATE_TONE: Record<StockState, StatusTone> = {
  OUT: "danger",
  LOW: "warning",
  OK: "success",
  UNWATCHED: "neutral",
};

function matchesState(state: StockState, filter: StateFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "TO_BUY") return needsPurchase(state);
  return state === filter;
}

/** The item's name in the reader's language; Arabic when it has none. */
function nameOf(item: StockItemView, locale: Locale): string {
  if (locale === "fr") return item.nameFr ?? item.nameAr;
  if (locale === "en") return item.nameEn ?? item.nameAr;
  return item.nameAr;
}

/**
 * «جرد المخزون»: what is in the store, against the minimum of each item.
 *
 * His note draws the stock in two kinds, «المعدات» and «المواد»: a switch, as
 * the academy's groups list switches levels (groups/_components/groups-tabs.tsx:
 * outline pills in the section's hue). The list is the newer generation's
 * table. The kind and the state filter are kept in the address, so the alert
 * tile on the home screen can open the items to buy.
 *
 * Quantities are written as he writes them in his store table: the number, its
 * unit beside it, the minimum in its own column. Costs are not shown: the
 * count is what the store holds, what it cost belongs to the purchases.
 */
export function InventoryView({ items }: { items: readonly StockItemView[] }) {
  const t = useTranslations("Inventory");
  const kindLabel = useCodeLabel("StockCodes.Kinds");
  const categoryLabel = useCodeLabel("StockCodes.Categories");
  const unitLabel = useCodeLabel("StockCodes.Units");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const params = useSearchParams();
  const accent = SECTION_ACCENT.stock;

  const kindParam = params.get("kind");
  const kind: StockKind = kindParam !== null && isStockKind(kindParam) ? kindParam : STOCK_KINDS[0];
  const stateParam = params.get("state");
  const stateFilter: StateFilter = (STATE_FILTERS as readonly string[]).includes(stateParam ?? "")
    ? (stateParam as StateFilter)
    : "ALL";

  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  function setParam(name: string, value: string, fallback: string) {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name);
    else next.set(name, value);
    router.replace(`?${next.toString()}`);
    firstPage();
  }

  const ofKind = React.useMemo(() => items.filter((item) => item.isActive && item.kind === kind), [items, kind]);
  const toBuy = ofKind.filter((item) => needsPurchase(stockState(item))).length;

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return ofKind.filter((item) => {
      if (category !== ALL_CATEGORIES && item.category !== category) return false;
      if (!matchesState(stockState(item), stateFilter)) return false;
      if (!query) return true;
      return [item.nameAr, item.nameFr, item.nameEn, item.code].some((value) => value?.toLowerCase().includes(query));
    });
  }, [category, ofKind, search, stateFilter]);

  const columns = React.useMemo<ColumnDef<StockItemView>[]>(
    () => [
      {
        id: "item",
        header: t("Table.Item"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-bold">{nameOf(row.original, locale)}</p>
            {/* A machine followed one by one says so; its units are listed under maintenance. */}
            {row.original.tracking === "UNIT" && <p className="text-sm text-muted-foreground">{t("TrackedByUnit")}</p>}
          </div>
        ),
      },
      {
        id: "category",
        header: t("Table.Category"),
        cell: ({ row }) =>
          row.original.category ? <Badge variant="secondary">{categoryLabel(row.original.category)}</Badge> : "—",
      },
      {
        id: "onHand",
        header: t("Table.OnHand"),
        cell: ({ row }) => (
          <span className="text-lg font-bold whitespace-nowrap tabular-nums">
            <Ltr>{formatQuantity(row.original.onHandQty)}</Ltr>
          </span>
        ),
      },
      {
        id: "minimum",
        header: t("Table.Minimum"),
        cell: ({ row }) =>
          row.original.minLevel === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="whitespace-nowrap tabular-nums">
              <Ltr>{formatQuantity(row.original.minLevel)}</Ltr>
            </span>
          ),
      },
      {
        id: "unit",
        header: t("Table.Unit"),
        cell: ({ row }) => unitLabel(row.original.unit),
      },
      {
        id: "state",
        header: t("Table.State"),
        cell: ({ row }) => {
          const state = stockState(row.original);
          return <StatusChip tone={STATE_TONE[state]} label={t(`States.${state}`)} />;
        },
      },
    ],
    [categoryLabel, locale, t, unitLabel],
  );

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
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={2}
        value={kind}
        // Radix reports "" when the pressed pill was already on: the kind stays.
        onValueChange={(next) => {
          if (next) setParam("kind", next, STOCK_KINDS[0]);
        }}
        aria-label={t("KindSwitch")}
        className="max-w-full min-w-0 flex-wrap"
      >
        {STOCK_KINDS.map((code) => (
          <ToggleGroupItem
            key={code}
            value={code}
            className={cn("min-w-0 px-5 font-semibold data-[state=on]:font-bold tall:px-7", accent.segment)}
          >
            <span className="min-w-0 truncate">{kindLabel(code)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-bold tall:text-xl">{t("ItemCount", { count: filtered.length })}</h3>
          {toBuy > 0 && <StatusChip tone="warning" label={t("ToBuyCount", { count: toBuy })} />}
        </div>
        <TableSearch
          className="w-full sm:w-72"
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
          <SelectTrigger className="w-full sm:w-52" aria-label={t("Table.Category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>{t("AllCategories")}</SelectItem>
            {STOCK_CATEGORIES.map((code) => (
              <SelectItem key={code} value={code}>
                {categoryLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={(value) => setParam("state", value, "ALL")}>
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

      <DataTable table={table} columnCount={columns.length} emptyMessage={t("NoItems")} />
      <TablePager table={table} />
    </div>
  );
}
