/**
 * The Worker's `env` in process: Durable Object namespaces whose objects are the real classes, each on its own
 * in-memory `node:sqlite` database behind the same small `ctx.storage.sql` interface Cloudflare gives
 * (src/cf.ts). Used by the Worker's tests and by the program's in-memory relay
 * (src/testing/sync/memory-relay.ts).
 *
 * What it does not reproduce: Cloudflare's input gates (the mailbox is written so that it does not rely on them),
 * its billing, and its limits, which the tests reach with `fault` (an error the next calls to a namespace throw,
 * as Cloudflare's runtime does past a free allowance).
 */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type {
  DurableObjectId,
  DurableObjectNamespace,
  DurableObjectState,
  DurableObjectStub,
  Env,
  SqlCursor,
  SqlRow,
  SqlStorage,
  SqlValue,
} from "../src/cf";
import { Directory, Mailbox, PartStore } from "../src/index";

function toInput(value: SqlValue): SQLInputValue {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

function toValue(value: unknown): SqlValue {
  if (value instanceof Uint8Array) return value.slice().buffer as ArrayBuffer;
  if (typeof value === "bigint") return Number(value);
  return value as SqlValue;
}

class NodeSqlStorage implements SqlStorage {
  constructor(readonly db: DatabaseSync) {}

  exec<T extends SqlRow = SqlRow>(query: string, ...bindings: SqlValue[]): SqlCursor<T> {
    const statement = this.db.prepare(query);
    const inputs = bindings.map(toInput);
    let rows: T[] = [];
    let rowsWritten = 0;
    if (statement.columns().length > 0) {
      rows = statement.all(...inputs).map((row) => {
        const out: SqlRow = {};
        for (const [key, value] of Object.entries(row)) out[key] = toValue(value);
        return out as T;
      });
    } else {
      rowsWritten = Number(statement.run(...inputs).changes);
    }
    return {
      toArray: () => rows,
      rowsRead: rows.length,
      rowsWritten,
      [Symbol.iterator]: () => rows[Symbol.iterator](),
    };
  }

  get databaseSize(): number {
    const pages = this.db.prepare("PRAGMA page_count").get() as { page_count: number };
    const size = this.db.prepare("PRAGMA page_size").get() as { page_size: number };
    return pages.page_count * size.page_size;
  }
}

export interface FakeObject<T> {
  name: string;
  instance: T;
  sql: NodeSqlStorage;
}

export interface FakeNamespace<T> extends DurableObjectNamespace {
  /** The objects made so far, by name. */
  readonly objects: Map<string, FakeObject<T>>;
  /** When set, every call to an object of this namespace throws it (Cloudflare refusing past an allowance). */
  fault: Error | null;
}

type DurableClass<T> = new (state: DurableObjectState, env: Env) => T & { fetch(request: Request): Promise<Response> };

function namespace<T>(Class: DurableClass<T>, env: () => Env): FakeNamespace<T> {
  const objects = new Map<string, FakeObject<T & { fetch(request: Request): Promise<Response> }>>();
  const ns: FakeNamespace<T> = {
    objects,
    fault: null,
    idFromName(name: string): DurableObjectId {
      return { toString: () => name };
    },
    get(id: DurableObjectId): DurableObjectStub {
      const name = id.toString();
      return {
        fetch: async (request: Request) => {
          if (ns.fault) throw ns.fault;
          let object = objects.get(name);
          if (!object) {
            const db = new DatabaseSync(":memory:");
            const sql = new NodeSqlStorage(db);
            const state: DurableObjectState = {
              storage: {
                sql,
                transactionSync<R>(fn: () => R): R {
                  db.exec("BEGIN");
                  try {
                    const result = fn();
                    db.exec("COMMIT");
                    return result;
                  } catch (error) {
                    db.exec("ROLLBACK");
                    throw error;
                  }
                },
              },
            };
            object = { name, instance: new Class(state, env()), sql };
            objects.set(name, object);
          }
          return object.instance.fetch(request);
        },
      };
    },
  };
  return ns;
}

export interface FakeEnv extends Env {
  MAILBOX: FakeNamespace<Mailbox>;
  PARTS: FakeNamespace<PartStore>;
  DIRECTORY: FakeNamespace<Directory>;
}

export function fakeEnv(options: { setupKey?: string; now?: () => number; fullAtBytes?: number } = {}): FakeEnv {
  const env = {
    SETUP_KEY: options.setupKey ?? "test-setup-key",
    NOW: options.now,
    FULL_AT_BYTES: options.fullAtBytes === undefined ? undefined : String(options.fullAtBytes),
  } as FakeEnv;
  env.MAILBOX = namespace(Mailbox, () => env);
  env.PARTS = namespace(PartStore, () => env);
  env.DIRECTORY = namespace(Directory, () => env);
  return env;
}
