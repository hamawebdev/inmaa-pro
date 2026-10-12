import { BOOLEAN_COLUMNS, DATE_COLUMNS, type TableName } from "./column-meta";

/**
 * SQLite has no date or boolean type. The schema stores dates as ISO-8601 UTC
 * text and booleans as 0/1 integers, so rows have to be converted at the edge
 * of the data layer — otherwise every ported component that does
 * `format(row.createdAt)` or `if (row.isActive)` would be subtly wrong.
 *
 * hydrate() runs on the way out of a query, dehydrate() on the way in.
 */

export function toDbDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function fromDbDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDbBoolean(value: boolean | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

/** Convert one raw row into its application shape. */
export function hydrate<T>(table: TableName, row: Record<string, unknown> | undefined): T | null {
  if (!row) return null;

  const dateColumns = DATE_COLUMNS[table] as readonly string[];
  const booleanColumns = BOOLEAN_COLUMNS[table] as readonly string[];
  const result: Record<string, unknown> = { ...row };

  for (const column of dateColumns) {
    if (column in result) result[column] = fromDbDate(result[column] as string | null);
  }
  for (const column of booleanColumns) {
    const value = result[column];
    if (column in result) result[column] = value === null || value === undefined ? null : Boolean(value);
  }

  return result as T;
}

/** Convert a list of raw rows into their application shape. */
export function hydrateAll<T>(table: TableName, rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => hydrate<T>(table, row) as T);
}

/**
 * Convert an application-shaped object into column values for insert/update.
 * Only touches the date and boolean columns of the table; everything else — and
 * any key that is not a column — passes through untouched.
 */
export function dehydrate(table: TableName, values: Record<string, unknown>): Record<string, unknown> {
  const dateColumns = DATE_COLUMNS[table] as readonly string[];
  const booleanColumns = BOOLEAN_COLUMNS[table] as readonly string[];
  const result: Record<string, unknown> = { ...values };

  for (const column of dateColumns) {
    if (column in result) result[column] = toDbDate(result[column] as Date | string | null);
  }
  for (const column of booleanColumns) {
    if (column in result) result[column] = toDbBoolean(result[column] as boolean | null);
  }

  return result;
}

/**
 * Row ids. Prisma used cuid(); any collision-free string works, and the
 * WebView2/WKWebView runtimes both provide randomUUID over the tauri:// origin.
 */
export function newId(): string {
  return stableIds ? stableIds() : crypto.randomUUID();
}

let stableIds: (() => string) | null = null;

/**
 * Runs `work` with ids that are the same on every run: `demo-clients-0001`,
 * `demo-clients-0002`… For the demo data only (src/testing/demo.ts), so that a
 * screenshot can name a record in its address and two builds can be compared.
 */
export async function withStableIds<T>(prefix: string, work: () => Promise<T>): Promise<T> {
  const previous = stableIds;
  let counter = 0;
  stableIds = () => `${prefix}-${String(++counter).padStart(4, "0")}`;
  try {
    return await work();
  } finally {
    stableIds = previous;
  }
}

/** `new Date()` as the string the database stores. */
export function nowIso(): string {
  return new Date().toISOString();
}
