import { flexRender, type Table as TanStackTable } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { directionFor } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * The search box, the table and the pager that every list page in this app
 * repeats.
 *
 * Extracted because it was copied — not shared — into a dozen table components,
 * and the copies had drifted. Only the teachers table had RTL-aware pagination
 * chevrons; the rest showed a "next page" arrow pointing backwards in Arabic.
 * Making the arrows a property of *this* component means that class of bug can
 * only be fixed once, and can only be reintroduced once.
 */

/** Search input with a leading icon, sized like the rest of the form controls. */
export function TableSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      {/* `start-4`, not `left-2.5`: the icon belongs at the reading start, which
          is the right-hand edge in Arabic. `ps-12` clears it on the same side. */}
      <SearchIcon className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="ps-12"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="search"
      />
    </div>
  );
}

/** Whether a column says it is the one to keep in view on a phone: `meta: { sticky: true }`. */
function isSticky(meta: unknown): boolean {
  return typeof meta === "object" && meta !== null && (meta as { sticky?: unknown }).sticky === true;
}

/**
 * The rendered table body for a TanStack table, including its empty state.
 *
 * On a phone the table scrolls sideways inside its card with one column kept in view: the
 * first, or the one whose definition says `meta: { sticky: true }` (the name, where the first
 * column is a photo or a tick box).
 */
export function DataTable<T>({
  table,
  columnCount,
  emptyMessage,
}: {
  table: TanStackTable<T>;
  columnCount: number;
  emptyMessage: string;
}) {
  const marked = table.getAllLeafColumns().some((column) => isSticky(column.columnDef.meta));
  return (
    <Table stickyColumn={marked ? "marked" : "first"}>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id} data-sticky={isSticky(h.column.columnDef.meta) || undefined}>
                {flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableEmpty colSpan={columnCount}>{emptyMessage}</TableEmpty>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} data-sticky={isSticky(cell.column.columnDef.meta) || undefined}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/**
 * First / previous / next / last, with the arrows mirrored in Arabic.
 *
 * The mirroring is not cosmetic: "next" is rightwards in English and leftwards
 * in Arabic, and an unmirrored arrow tells an Arabic reader that the button
 * goes backwards. Hides itself entirely when there is only one page.
 */
export function TablePager<T>({ table }: { table: TanStackTable<T> }) {
  const t = useTranslations("Table");
  const locale = useLocale();
  const rtl = directionFor(locale) === "rtl";

  const FirstIcon = rtl ? ChevronsRightIcon : ChevronsLeftIcon;
  const PrevIcon = rtl ? ChevronRightIcon : ChevronLeftIcon;
  const NextIcon = rtl ? ChevronLeftIcon : ChevronRightIcon;
  const LastIcon = rtl ? ChevronsLeftIcon : ChevronsRightIcon;

  const pageCount = Math.max(1, table.getPageCount());
  if (pageCount <= 1) return null;

  const page = table.getState().pagination.pageIndex + 1;

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <span className="text-base text-muted-foreground tabular-nums">{t("PageOf", { page, total: pageCount })}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("FirstPage")}
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          <FirstIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("PreviousPage")}
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <PrevIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("NextPage")}
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <NextIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("LastPage")}
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          <LastIcon />
        </Button>
      </div>
    </div>
  );
}
