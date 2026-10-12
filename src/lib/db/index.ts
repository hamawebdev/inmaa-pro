import { Kysely } from "kysely";

import { TauriSqliteDialect } from "./dialect";
import type { DB } from "./schema";

/**
 * The application database.
 *
 * Schema, migrations and the single owning connection all live on the Rust side
 * (src-tauri/src/db.rs, src-tauri/migrations/). By the time the webview loads,
 * migrations have already run.
 */
export const db = new Kysely<DB>({
  dialect: new TauriSqliteDialect(),
});

export type { DB } from "./schema";
export * from "./models";
export { dehydrate, fromDbDate, hydrate, hydrateAll, newId, nowIso, toDbBoolean, toDbDate } from "./rows";
