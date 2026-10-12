import { sql, type Expression, type SqlBool } from "kysely";

/**
 * Replaces src/server/prisma-filters.ts.
 *
 * SQLite's LIKE is case-insensitive for ASCII only, which is not good enough
 * here: the academy's student and teacher names are largely Arabic, where LIKE
 * would become case-sensitive-by-accident and, worse, inconsistent with the
 * ASCII columns. Lower-casing both sides is not a fix either — SQLite's built-in
 * lower() is also ASCII-only.
 *
 * So: fold ASCII case explicitly and compare with LIKE. For Arabic text this
 * degrades to a plain substring match, which is the correct behaviour for a
 * script that has no letter case.
 */
export function containsInsensitive(column: Expression<string | null>, search: string): Expression<SqlBool> {
  const needle = `%${escapeLike(search.toLowerCase())}%`;
  return sql<SqlBool>`lower(${column}) LIKE ${needle} ESCAPE '\\'`;
}

/** LIKE wildcards inside user input must not act as wildcards. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
