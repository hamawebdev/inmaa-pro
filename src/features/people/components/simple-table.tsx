import * as React from "react";

import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface SimpleColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  /** A figure: aligned to the end of its column. */
  numeric?: boolean;
  className?: string;
}

/**
 * A short table inside a record's page (the lines of a payslip, the weeks of
 * a month, a ledger): the same table the lists use, without search or pages.
 */
export function SimpleTable<T>({
  rows,
  columns,
  rowKey,
  emptyMessage,
  footer,
}: {
  rows: readonly T[];
  columns: readonly SimpleColumn<T>[];
  rowKey: (row: T, index: number) => string;
  emptyMessage: string;
  /** A last row: a total. One node per column. */
  footer?: readonly React.ReactNode[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => (
            <TableHead key={index} numeric={column.numeric}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={columns.length}>{emptyMessage}</TableEmpty>
        ) : (
          rows.map((row, index) => (
            <TableRow key={rowKey(row, index)}>
              {columns.map((column, at) => (
                <TableCell key={at} numeric={column.numeric} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
        {footer && rows.length > 0 && (
          <TableRow className="bg-muted/40 font-bold">
            {footer.map((node, index) => (
              <TableCell key={index} numeric={columns[index]?.numeric}>
                {node}
              </TableCell>
            ))}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
