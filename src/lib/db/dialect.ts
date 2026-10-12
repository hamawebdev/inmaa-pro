import { invoke } from "@tauri-apps/api/core";
import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type TransactionSettings,
} from "kysely";

/**
 * A Kysely dialect over the Rust `db_select` / `db_execute` commands.
 *
 * The Rust side holds exactly one SQLite connection (see src-tauri/src/db.rs),
 * so BEGIN/COMMIT sent as separate IPC calls are guaranteed to hit the same
 * connection. The flip side is that two overlapping transactions would
 * interleave on it, so the driver hands out a single DatabaseConnection through
 * a promise queue: Kysely then serialises everything for us.
 */

type ExecuteResult = { rowsAffected: number; lastInsertId: number };

/**
 * Statements that never return rows, so we can pick the right command.
 *
 * The Rust side accepts one statement whose first word is select, with, insert,
 * update, delete, begin, commit or rollback, and nothing else: the schema
 * changes through migrations only (src-tauri/src/db.rs, `check_statement`).
 */
function isMutation(sql: string): boolean {
  const head = sql.trimStart().slice(0, 8).toLowerCase();
  return (
    head.startsWith("insert") ||
    head.startsWith("update") ||
    head.startsWith("delete") ||
    head.startsWith("begin") ||
    head.startsWith("commit") ||
    head.startsWith("rollback")
  );
}

class TauriConnection implements DatabaseConnection {
  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const sql = compiledQuery.sql;
    const params = compiledQuery.parameters as unknown[];

    // A mutation with RETURNING still produces rows, so route on both.
    if (isMutation(sql) && !/\breturning\b/i.test(sql)) {
      const result = await invoke<ExecuteResult>("db_execute", { sql, params });
      return {
        rows: [],
        numAffectedRows: BigInt(result.rowsAffected),
        insertId: BigInt(result.lastInsertId),
      };
    }

    const rows = await invoke<R[]>("db_select", { sql, params });
    return { rows };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Streaming is not supported over the Tauri SQL bridge.");
  }
}

class TauriDriver implements Driver {
  readonly #connection = new TauriConnection();
  /** Tail of the queue of callers waiting for the single connection. */
  #queue: Promise<void> = Promise.resolve();

  /**
   * The connection outlives the page. If the webview was reloaded in the middle
   * of a transaction, the BEGIN is still open on the Rust side and every later
   * statement would join it, to be lost with it. So the first thing a new page
   * does is close whatever the last one left.
   */
  async init(): Promise<void> {
    try {
      await this.#connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
      if (!message.includes("no transaction is active")) throw error;
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    // Take a ticket: wait for everyone ahead of us, and make everyone behind us
    // wait for our release.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const ahead = this.#queue;
    this.#queue = ahead.then(() => held);
    await ahead;

    this.#releases.set(this.#connection, release);
    return this.#connection;
  }

  readonly #releases = new Map<DatabaseConnection, () => void>();

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    const release = this.#releases.get(connection);
    this.#releases.delete(connection);
    release?.();
  }

  async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
    if (settings.isolationLevel) {
      throw new Error("SQLite does not support setting a transaction isolation level.");
    }
    await connection.executeQuery(CompiledQuery.raw("BEGIN"));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async destroy(): Promise<void> {}
}

export class TauriSqliteDialect implements Dialect {
  createDriver(): Driver {
    return new TauriDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}
