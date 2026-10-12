/**
 * Smoke-tests the database layer outside the Tauri runtime.
 *
 * Applies the real migrations to a throwaway file and runs real Kysely queries
 * against them via node:sqlite, so the SQL Kysely generates, the schema, and the
 * date/boolean storage conventions are all exercised together. What it cannot
 * cover is the IPC bridge itself (src/lib/db/dialect.ts) — that needs the app.
 *
 *   node scripts/verify-db.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CompiledQuery, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from "kysely";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(join(tmpdir(), "inmaa-verify-"));
const dbPath = join(workDir, "inmaa.db");

const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA foreign_keys = ON;");

// Every migration, in name order: the order sqlx applies them in.
const migrationsDir = resolve(root, "src-tauri/migrations");
for (const migration of readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  sqlite.exec(readFileSync(resolve(migrationsDir, migration), "utf8"));
}

/** Mirrors src/lib/db/dialect.ts, but talking to node:sqlite instead of IPC. */
function isMutation(sql) {
  const head = sql.trimStart().slice(0, 12).toLowerCase();
  return ["insert", "update", "delete", "replace", "begin", "commit", "rollback", "pragma"].some((verb) =>
    head.startsWith(verb),
  );
}

const connection = {
  async executeQuery(compiled) {
    const { sql, parameters } = compiled;
    const params = parameters.map((value) => (typeof value === "boolean" ? Number(value) : value));

    if (isMutation(sql) && !/\breturning\b/i.test(sql)) {
      const result = sqlite.prepare(sql).run(...params);
      return {
        rows: [],
        numAffectedRows: BigInt(result.changes ?? 0),
        insertId: BigInt(result.lastInsertRowid ?? 0),
      };
    }
    return { rows: sqlite.prepare(sql).all(...params) };
  },
  async *streamQuery() {
    throw new Error("not supported");
  },
};

const driver = {
  async init() {},
  async acquireConnection() {
    return connection;
  },
  async releaseConnection() {},
  async beginTransaction(conn) {
    await conn.executeQuery(CompiledQuery.raw("BEGIN"));
  },
  async commitTransaction(conn) {
    await conn.executeQuery(CompiledQuery.raw("COMMIT"));
  },
  async rollbackTransaction(conn) {
    await conn.executeQuery(CompiledQuery.raw("ROLLBACK"));
  },
  async destroy() {},
};

const db = new Kysely({
  dialect: {
    createDriver: () => driver,
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createAdapter: () => new SqliteAdapter(),
    createIntrospector: (instance) => new SqliteIntrospector(instance),
  },
});

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${detail}`}`);
  }
}

const ADMIN = "local-admin";
const now = new Date().toISOString();

// PROVISIONAL, like the schema: these checks cover the two tables the shell
// reads. The data model brings its own tests, run by vitest against the same
// migrations.

console.log("\nseed");
{
  const user = await db.selectFrom("User").select(["id", "academyName"]).where("id", "=", ADMIN).executeTakeFirst();
  check("the local user is seeded", user?.id === ADMIN);
  check("the centre's name is seeded", user?.academyName === "مركز إنماء برو", user?.academyName);
}

console.log("\ninsert, upsert and read back");
{
  const row = { id: "s1", adminId: ADMIN, key: "locked_pages", value: "[]", updatedAt: now };
  await db.insertInto("Setting").values(row).execute();
  await db
    .insertInto("Setting")
    .values({ ...row, id: "s2", value: '["money"]' })
    .onConflict((oc) => oc.columns(["adminId", "key"]).doUpdateSet({ value: '["money"]', updatedAt: now }))
    .execute();
  const settings = await db.selectFrom("Setting").selectAll().where("adminId", "=", ADMIN).execute();
  check("an upsert on (adminId, key) keeps one row", settings.length === 1, `got ${settings.length}`);
  check("and carries the new value", settings[0]?.value === '["money"]', settings[0]?.value);
}

console.log("\ntransaction rollback (the reason tauri-plugin-sql was dropped)");
{
  try {
    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto("Setting")
        .values({ id: "s3", adminId: ADMIN, key: "k3", value: "v", updatedAt: now })
        .execute();
      throw new Error("abort");
    });
  } catch {
    // Expected.
  }
  const row = await db.selectFrom("Setting").select("id").where("id", "=", "s3").executeTakeFirst();
  check("a failed transaction leaves nothing behind", row === undefined);
}

console.log("\ntransaction commit");
{
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto("Setting")
      .values({ id: "s4", adminId: ADMIN, key: "k4", value: "v", updatedAt: now })
      .execute();
  });
  const row = await db.selectFrom("Setting").select("id").where("id", "=", "s4").executeTakeFirst();
  check("a committed transaction is kept", row?.id === "s4");
}

console.log("\nforeign keys");
{
  let refused = false;
  try {
    await db
      .insertInto("Setting")
      .values({ id: "s5", adminId: "nobody", key: "k5", value: "v", updatedAt: now })
      .execute();
  } catch {
    refused = true;
  }
  check("a setting for a user that does not exist is refused", refused);
}

await db.destroy();
sqlite.close();
rmSync(workDir, { recursive: true, force: true });

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
