/**
 * The live test's laptop copies: the program's own migrations, first run, services and sync engine, on a database
 * file in a folder of their own, with a real-time clock, reaching the real mailbox over HTTPS through
 * `httpsTransport` (what native's `sync_request` does). Not the desktop window: the window's part of a laptop is
 * covered by the harness and the desktop comparison; the Rust HTTP command by its own tests.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { loadSession } from "@/lib/access/session";
import type { FixedClock } from "@/lib/clock";
import { createRelayClient } from "@/lib/sync/relay";
import { createTestDatabase } from "@/testing/database";
import { makeLaptop, memoryVault, type SyncLaptop } from "@/testing/sync/pair";
import type { MemoryRelay } from "@/testing/sync/memory-relay";

import { httpsTransport } from "./node-transport";

/** The PC's own clock, as the program reads it. `set` and `advance` are never used by the live test. */
export function realClock(): FixedClock {
  let offset = 0;
  return {
    utcOffsetMin: 60,
    now: () => new Date(Date.now() + offset),
    set(instant) {
      offset = Date.parse(instant) - Date.now();
    },
    advance({ minutes = 0, hours = 0, days = 0 }) {
      offset += ((days * 24 + hours) * 60 + minutes) * 60_000;
    },
  };
}

/** A freshly installed laptop copy at `root`: first run done, nobody signed in yet, sync not set up. */
export async function freshLaptop(
  name: string,
  root: string,
  origin: string,
  log: (line: string) => void,
): Promise<SyncLaptop> {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const clock = realClock();
  const test = await createTestDatabase({ clock, file: join(root, "inmaa.db") });
  recordMigrations(test.raw);
  const transport = httpsTransport(origin, (line) => log(`[${name}] ${line}`));
  // `makeLaptop` asks its relay only for a client; this one is the real mailbox over HTTPS.
  const relay = {
    client: (credentials = null, options = {}) =>
      createRelayClient(transport, credentials, { now: () => clock.now().getTime(), ...options }),
  } as unknown as MemoryRelay;
  return makeLaptop(name, test, clock, root, relay, memoryVault(), await loadSession(test.db, FIRST_MANAGER_ID));
}

const MIGRATIONS = join(import.meta.dirname, "../../../src-tauri/migrations");

/**
 * What the program's migrator (sqlx 0.8) writes when it builds a database, which the test database leaves out: one
 * row per migration, its checksum the SHA-384 of the file's text. A real laptop's full copy carries them, and the
 * phone refuses to install a copy without them («This file is not a backup of this program's data»), as it should.
 */
function recordMigrations(db: {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): unknown };
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
  )`);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) VALUES (?, ?, CURRENT_TIMESTAMP, 1, ?, 0)",
  );
  for (const name of readdirSync(MIGRATIONS)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()) {
    const [, version, words] = /^(\d+)_(.+)\.sql$/.exec(name) ?? [];
    if (!version || !words) throw new Error(`live: ${name} is not a migration name`);
    insert.run(
      Number(version),
      words.replace(/_/g, " "),
      createHash("sha384")
        .update(readFileSync(join(MIGRATIONS, name)))
        .digest(),
    );
  }
}
