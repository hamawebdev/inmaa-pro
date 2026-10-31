/**
 * The few Cloudflare Workers and Durable Objects APIs the mailbox uses, declared here because
 * `@cloudflare/workers-types` is not installed in this repository. They follow Cloudflare's own declarations
 * (SQLite-backed Durable Objects, `ctx.storage.sql`); the tests give the same shape over `node:sqlite`.
 */

/** What a SQLite cell holds in a Durable Object: a BLOB comes back as an ArrayBuffer. */
export type SqlValue = ArrayBuffer | string | number | null;

export type SqlRow = Record<string, SqlValue>;

export interface SqlCursor<T extends SqlRow> extends Iterable<T> {
  toArray(): T[];
  readonly rowsRead: number;
  readonly rowsWritten: number;
}

export interface SqlStorage {
  exec<T extends SqlRow = SqlRow>(query: string, ...bindings: SqlValue[]): SqlCursor<T>;
  /** The object's database size in bytes. */
  readonly databaseSize: number;
}

export interface DurableObjectStorage {
  readonly sql: SqlStorage;
  /** Runs `fn` as one SQLite transaction: everything it wrote is undone if it throws. */
  transactionSync<T>(fn: () => T): T;
}

export interface DurableObjectState {
  readonly storage: DurableObjectStorage;
}

export interface DurableObjectId {
  toString(): string;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface Env {
  /** One per centre: devices, tickets' owner, envelopes, acknowledgements, full copies, key rotations. */
  MAILBOX: DurableObjectNamespace;
  /** File parts, eight shards per centre. */
  PARTS: DurableObjectNamespace;
  /** One for the whole Worker: the pairing tickets, filed by ticket id. */
  DIRECTORY: DurableObjectNamespace;
  /** The secret that creating a centre needs (`wrangler secret put SETUP_KEY`). */
  SETUP_KEY?: string;
  /** Writes are refused (507) when the mailbox's stored bytes would pass this. A string: a Worker variable. */
  FULL_AT_BYTES?: string;
  /** Tests only: the mailbox's clock. Cloudflare never sets it. */
  NOW?: () => number;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
