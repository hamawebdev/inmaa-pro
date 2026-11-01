/**
 * The live test's laptop copies: the program's own migrations, first run, services and sync engine, on a database
 * file in a folder of their own, with a real-time clock, reaching the real mailbox over HTTPS through
 * `httpsTransport` (what native's `sync_request` does). Not the desktop window: the window's part of a laptop is
 * covered by the harness and the desktop comparison; the Rust HTTP command by its own tests.
 */
import { mkdirSync, rmSync } from "node:fs";
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
  const transport = httpsTransport(origin, (line) => log(`[${name}] ${line}`));
  // `makeLaptop` asks its relay only for a client; this one is the real mailbox over HTTPS.
  const relay = {
    client: (credentials = null, options = {}) =>
      createRelayClient(transport, credentials, { now: () => clock.now().getTime(), ...options }),
  } as unknown as MemoryRelay;
  return makeLaptop(name, test, clock, root, relay, memoryVault(), await loadSession(test.db, FIRST_MANAGER_ID));
}
