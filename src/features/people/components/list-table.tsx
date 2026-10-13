import * as React from "react";

import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { normaliseName } from "@/lib/text/normalise";

/**
 * A list to search and page through: the academy's newer table (`DataTable`
 * with `TableSearch` and `TablePager`, as its attendance overview draws it),
 * for the lists of hours, pay and attendance, which differ only in their
 * columns.
 *
 * `text` is what a row is found by (a name, a number); `filters` are the
 * selects beside the search box; a list of a few lines leaves the search out.
 */
export function ListTable<T>({
  rows,
  columns,
  text,
  searchPlaceholder,
  emptyMessage,
  filters,
  pageSize = 25,
}: {
  rows: readonly T[];
  columns: ColumnDef<T>[];
  text?: (row: T) => string;
  searchPlaceholder?: string;
  emptyMessage: string;
  filters?: React.ReactNode;
  pageSize?: number;
}) {
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize });
  const [search, setSearch] = React.useState("");

  const found = React.useMemo(() => {
    const words = normaliseName(search);
    if (!text || words === "") return [...rows];
    return rows.filter((row) => {
      const haystack = normaliseName(text(row));
      return words.split(" ").every((word) => haystack.includes(word));
    });
  }, [rows, search, text]);

  const table = useReactTable({
    data: found,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <div className="space-y-5">
      {(text || filters) && (
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          {text && (
            <TableSearch
              className="w-full lg:max-w-sm lg:flex-1"
              placeholder={searchPlaceholder ?? ""}
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPagination((current) => ({ ...current, pageIndex: 0 }));
              }}
            />
          )}
          {filters}
        </div>
      )}
      <DataTable table={table} columnCount={columns.length} emptyMessage={emptyMessage} />
      <TablePager table={table} />
    </div>
  );
}
