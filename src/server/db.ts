/**
 * Database handle for the ported server actions.
 *
 * In the web app this exported a Prisma client over PostgreSQL. Here it is the
 * Kysely instance over the local SQLite file; the import path is unchanged so
 * action modules keep their `import { db } from "@/server/db"` line.
 */
export { db } from "@/lib/db";
export { dehydrate, hydrate, hydrateAll, newId, nowIso, toDbBoolean, toDbDate } from "@/lib/db";
export type * from "@/lib/db/models";
