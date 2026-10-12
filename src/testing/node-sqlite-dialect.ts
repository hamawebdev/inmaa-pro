import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import {
  CompiledQuery,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
} from "kysely";

/**
 * A Kysely dialect over Node's own SQLite, for tests.
 *
 * It behaves as the program's bridge does (src/lib/db/dialect.ts and
 * src-tauri/src/db.rs), so a service that passes here does the same there:
 *
 *  - one connection, handed out through a queue. A service that reaches for
 *    the root database handle inside a transaction waits for itself for ever,
 *    here as in the program: the test times out instead of passing by luck;
 *  - a whole number is bound as an integer and a yes/no as 0 or 1, as sqlx
 *    binds them. Anything else that is not text, a number or null is refused.
 */
function bind(value: unknown): SQLInputValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1n : 0n;
  if (typeof value === "number") return Number.isInteger(value) ? BigInt(value) : value;
  if (typeof value === "string" || typeof value === "bigint") return value;
  throw new Error(
    `a ${value instanceof Date ? "Date" : typeof value} cannot be bound: convert it to what the database stores first`,
  );
}

class NodeSqliteConnection implements DatabaseConnection {
  constructor(private readonly sqlite: DatabaseSync) {}

  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const statement = this.sqlite.prepare(compiled.sql);
    const params = compiled.parameters.map(bind);
    if (statement.columns().length > 0) {
      // Plain objects: Node returns rows without a prototype, which reads oddly in a failed assertion.
      return { rows: statement.all(...params).map((row) => ({ ...row })) as R[] };
    }
    const result = statement.run(...params);
    return { rows: [], numAffectedRows: BigInt(result.changes), insertId: BigInt(result.lastInsertRowid) };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Streaming is not supported.");
  }
}

class NodeSqliteDriver implements Driver {
  readonly #connection: NodeSqliteConnection;
  #queue: Promise<void> = Promise.resolve();
  #release: (() => void) | null = null;

  constructor(sqlite: DatabaseSync) {
    this.#connection = new NodeSqliteConnection(sqlite);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ahead = this.#queue;
    this.#queue = ahead.then(() => held);
    await ahead;
    this.#release = release;
    return this.#connection;
  }

  async releaseConnection(): Promise<void> {
    const release = this.#release;
    this.#release = null;
    release?.();
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
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

export class NodeSqliteDialect implements Dialect {
  constructor(private readonly sqlite: DatabaseSync) {}

  createDriver(): Driver {
    return new NodeSqliteDriver(this.sqlite);
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
