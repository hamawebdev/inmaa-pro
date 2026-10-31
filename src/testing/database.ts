import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Kysely } from "kysely";

import { firstRun, FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import type { RoleCode } from "@/lib/access/catalogue";
import { loadSession } from "@/lib/access/session";
import { memoryByteStore } from "@/lib/attachments";
import { memoryAnchorStore, writeAnchor, type AnchorStore } from "@/lib/chain/anchor";
import { fixedClock, type FixedClock } from "@/lib/clock";
import type { DB } from "@/lib/db/schema";
import { loadFeatureAlerts } from "@/lib/alerts";
import { loadFeatureDaily } from "@/lib/daily";
import { loadFeatureEvents } from "@/lib/events";
import { loadFeatureSeeds } from "@/lib/seeds";
import { buildContext, SYSTEM_SESSION, type Executor, type ServiceContext, type Session } from "@/lib/service/context";
import { createRunner, type Runner } from "@/lib/service/runner";
import { withStampedTransaction } from "@/lib/sync/session";

import { runDemo, type DemoNames } from "./demo";
import { NodeSqliteDialect } from "./node-sqlite-dialect";
import { createRows, type Rows } from "./rows";

/**
 * A fresh database for a test: the real migrations, the real seeds, first run
 * done, a clock that stands still, an anchor in memory.
 *
 *     const test = await createTestDatabase();
 *     const id = await test.transact((ex, ctx) => saveSite(ex, ctx, input));       // as the manager
 *     const result = await test.run.action(saveSite)(input);                       // as a screen calls it
 *     await expect(test.transact((ex, ctx) => saveSite(ex, ctx, input), clerk)).rejects.toThrow("permission");
 *     test.close();
 *
 * It is in memory, so a test file may make one per test. Nothing here is in
 * the program: `src/testing` is imported by tests only.
 */

/** Monday 12 October 2026, 09:00 at the centre. */
export const TEST_NOW = "2026-10-12T08:00:00.000Z";
export const TEST_DATABASE_ID = "00000000-0000-4000-8000-000000000001";

const MIGRATIONS = import.meta.glob<string>("../../src-tauri/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The migration files, in the order the program applies them. */
export function migrationFiles(): Array<{ name: string; sql: string }> {
  return Object.entries(MIGRATIONS)
    .map(([file, sql]) => ({ name: file.slice(file.lastIndexOf("/") + 1), sql }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

export interface TestDatabaseOptions {
  /** False makes first run leave out the owners' seed steps (src/lib/seeds): an empty database. */
  seeds?: boolean;
  /** The instant the clock starts at. */
  now?: string;
  /** False leaves the database as the migrations make it: no id, no chain heads, no manager. */
  firstRun?: boolean;
  /** An anchor store to share with another database: a copy "restored" over the first one. */
  anchor?: AnchorStore;
  clock?: FixedClock;
  /** Register the handlers of every feature folder's events.ts, as the program does. Default true. */
  events?: boolean;
  /**
   * Write the demo data after first run, as `npm run demo` does: every folder's
   * `demo.ts` (true), or these folders' only (core's always comes first).
   * `test.demo` then holds what each folder named.
   */
  demo?: boolean | readonly string[];
  /** Build the database in this file instead of in memory; the file is emptied first. For `npm run demo`. */
  file?: string;
}

export interface TestDatabase {
  db: Kysely<DB>;
  /** The connection itself, for what no service may do: dropping a trigger to tamper with a row. */
  raw: DatabaseSync;
  clock: FixedClock;
  anchor: AnchorStore;
  /** Where files "stored" by a test go. */
  files: ReturnType<typeof memoryByteStore>;
  /** The manager account's session. */
  manager: Session;
  /** A context at the clock's present instant. The manager's, unless a session is given. */
  ctx(session?: Session): ServiceContext;
  /** Runs services in one transaction and returns what they return. Throws what they throw; then nothing was saved. */
  transact<T>(work: (ex: Executor, ctx: ServiceContext) => Promise<T>, session?: Session): Promise<T>;
  /** The same wrapper the program's screens use, bound to this database. It acts as `signIn` last said (the manager at first). */
  run: Runner;
  signIn(session: Session): void;
  /** Creates an account with a role and returns its session, as sign-in would load it. */
  sessionFor(role: RoleCode, options?: { staffMemberId?: string | null }): Promise<Session>;
  /** Writes rows by hand, with every required column filled. */
  rows: Rows;
  /** A copy of the database as it is now, in a temporary file: a backup. Open it with `openTestDatabase`. */
  snapshot(): string;
  /** Paths that `revalidate` was called with, in order. */
  revalidated: string[];
  /** With `demo`: what each folder's demo data named, `test.demo.clients.housingFile`. Empty otherwise. */
  demo: Record<string, DemoNames>;
  close(): void;
}

function openSqlite(file: string): DatabaseSync {
  const sqlite = new DatabaseSync(file);
  // The two connect-time settings of src-tauri/src/db.rs. The rules of the model do not hold without them.
  sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;");
  return sqlite;
}

async function wrap(sqlite: DatabaseSync, options: TestDatabaseOptions, didFirstRun: boolean): Promise<TestDatabase> {
  const db = new Kysely<DB>({ dialect: new NodeSqliteDialect(sqlite) });
  const clock = options.clock ?? fixedClock(options.now ?? TEST_NOW);
  const anchor = options.anchor ?? memoryAnchorStore();
  const temporary: string[] = [];
  const revalidated: string[] = [];

  if (options.events !== false) {
    loadFeatureEvents();
    loadFeatureAlerts();
    loadFeatureDaily();
    loadFeatureSeeds();
  }

  if (options.firstRun !== false && !didFirstRun) {
    const ctx = buildContext(SYSTEM_SESSION, clock);
    await withStampedTransaction(db, ctx, (trx) =>
      firstRun(trx, ctx, {
        databaseId: TEST_DATABASE_ID,
        seeds: options.seeds !== false && options.events !== false,
      }),
    );
    await writeAnchor(db, anchor, ctx.now, { accept: "FIRST_RUN" });
  }

  const hasManager = options.firstRun !== false || didFirstRun;
  const manager = hasManager ? await loadSession(db, FIRST_MANAGER_ID) : SYSTEM_SESSION;

  let demo: Record<string, DemoNames> = {};
  if (options.demo && hasManager) {
    demo = await runDemo(db, { clock, folders: options.demo === true ? undefined : options.demo });
    await writeAnchor(db, anchor, clock.now().toISOString());
  }
  let current = manager;
  let accounts = 0;

  const test: TestDatabase = {
    db,
    raw: sqlite,
    clock,
    anchor,
    files: memoryByteStore(),
    manager,
    revalidated,
    demo,
    ctx: (session = manager) => buildContext(session, clock),
    async transact(work, session = manager) {
      return withStampedTransaction(db, buildContext(session, clock), work);
    },
    run: createRunner({
      db,
      session: () => current,
      clock: () => clock,
      anchor: () => anchor,
      revalidate: (path) => revalidated.push(path),
    }),
    signIn(session) {
      current = session;
    },
    async sessionFor(role, sessionOptions = {}) {
      accounts += 1;
      const id = `user-${role.toLowerCase()}-${accounts}`;
      const now = clock.now().toISOString();
      await withStampedTransaction(db, buildContext(SYSTEM_SESSION, clock), (ex) =>
        ex
          .insertInto("User")
          .values({
            id,
            username: id,
            displayName: `${role} ${accounts}`,
            passwordHash: "",
            roleId: role,
            staffMemberId: sessionOptions.staffMemberId ?? null,
            branchId: "branch-main",
            createdAt: now,
            updatedAt: now,
          })
          .execute(),
      );
      return loadSession(db, id);
    },
    rows: undefined as unknown as Rows,
    snapshot() {
      const file = join(mkdtempSync(join(tmpdir(), "inmaa-test-")), "copy.db");
      sqlite.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
      temporary.push(file);
      return file;
    },
    close() {
      void db.destroy();
      sqlite.close();
      for (const file of temporary) rmSync(join(file, ".."), { recursive: true, force: true });
    },
  };
  test.rows = createRows(test);
  return test;
}

export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDatabase> {
  if (options.file) {
    for (const leftover of [options.file, `${options.file}-journal`, `${options.file}-wal`, `${options.file}-shm`]) {
      rmSync(leftover, { force: true });
    }
  }
  const sqlite = openSqlite(options.file ?? ":memory:");
  for (const migration of migrationFiles()) {
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(migration.sql);
      sqlite.exec("COMMIT");
    } catch (error) {
      throw new Error(`migration ${migration.name} failed: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
  return wrap(sqlite, options, false);
}

/**
 * Opens a copy made by `snapshot()`: the database as it was then, as if that
 * backup had been restored. Give it the first database's `anchor` and `clock`
 * to see what the program sees after a restore.
 */
export async function openTestDatabase(file: string, options: TestDatabaseOptions = {}): Promise<TestDatabase> {
  return wrap(openSqlite(file), options, true);
}
