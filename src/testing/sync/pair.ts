/**
 * Two laptops of one centre, for tests: two databases, two clocks, two data
 * folders on disk, one mailbox in memory (relay's real Worker code), and the
 * real engine between them. Nothing here is in the program.
 *
 *     const pair = await createSyncPair();                 // a: the director's laptop, sync set up; b: joined from its full copy
 *     await pair.a.transact((ex, ctx) => saveClient(ex, ctx, input));   // work on one laptop (stamped, captured)
 *     await pair.syncAll();                                 // rounds on both until nothing moves
 *     pair.expectSame();                                    // every shared table, row by row: throws naming the first difference
 *
 * What a scenario needs:
 * - `pair.a`, `pair.b` (`SyncLaptop`): `test` (the `TestDatabase`: `db`, `run`, `rows`, `sessionFor`…), `clock`
 *   (each laptop's own; set them apart to make the PCs disagree), `transact(work, session?)`, `sync()` (one round),
 *   `status()`, `store` (a `ByteStore` on the laptop's disk, for `saveUpload`), `root` (its data folder),
 *   `vault`, `env()` (the engine's view, for calling the engine's functions directly).
 * - `pair.relay`: the mailbox and its switches (`offline`, `down`, `limitUntil`, `full`, `cutNext()`, `revoke()`…).
 * - `pair.advance({ minutes })`: moves the mailbox's clock and both laptops' together.
 * - `pair.syncAll()`: a, then b, again and again until a round moves nothing (at most `maxRounds`).
 * - `pair.differences()` / `pair.expectSame()`: compares every shared table (everything but each laptop's own
 *   tables, settings and fields, DECISION section 3).
 * - `pair.restore(laptop, backupFile)`: the laptop's database replaced by a backup (`laptop.test.snapshot()`), as a
 *   restore does; the next round catches up (case 7).
 * - `createSyncPair({ fixture: true })`: laptop a starts from the 1.0.0 fixture, upgraded in place.
 * - `createSyncPair({ joined: false })`: a set up, b fresh and not joined yet (`pair.join()` joins it).
 * - `pair.replace(pair.b)`: after `removeOtherLaptop`, a new laptop joins in b's place (case 9).
 * - `pair.close()` in `afterEach`.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { loadSession } from "@/lib/access/session";
import type { ByteStore } from "@/lib/attachments";
import { writeAnchor } from "@/lib/chain/anchor";
import { fixedClock, type FixedClock } from "@/lib/clock";
import { buildContext, type Executor, type ServiceContext, type Session } from "@/lib/service/context";
import {
  downloadForRejoin,
  envFor,
  finishInstall,
  pairSecondLaptop,
  redeemAndDownload,
  setUpCentre,
  type CentreEnv,
  type InstallNote,
  type SyncVault,
  type SyncVaultData,
} from "@/lib/sync/centre";
import type { FilesEnv, SyncFiles } from "@/lib/sync/files";
import { recordOutcome, runOnce } from "@/lib/sync/loop";
import type { RoundResult } from "@/lib/sync/round";
import { withStampedTransaction } from "@/lib/sync/session";
import { createTestDatabase, openTestDatabase, TEST_NOW, type TestDatabase } from "@/testing/database";
import { fileAnchorStore } from "@/testing/anchor-file";
import { upgradedFixtureCopy } from "@/testing/fixtures/1.0.0";
import { createMemoryRelay, type MemoryRelay } from "@/testing/sync/memory-relay";

// ─── A laptop's disk ─────────────────────────────────────────────────────────

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Native's file commands (BUILD 2.5) on a folder: paths relative to it, `uploads/…` and `sync-tmp/…`. */
export function diskFiles(root: string, snapshotOf: (file: string) => void): SyncFiles {
  const at = (path: string) => {
    if (!/^(uploads|sync-tmp)\//.test(path) || path.split("/").some((part) => part === ".." || part === "")) {
      throw new Error(`REFUSED: ${path}`);
    }
    return join(root, path);
  };
  return {
    async info(path) {
      const file = at(path);
      if (!existsSync(file)) return null;
      const bytes = readFileSync(file);
      return { size: bytes.byteLength, sha256: sha256Hex(bytes) };
    },
    async readPart(path, offset, length) {
      const fd = openSync(at(path), "r");
      try {
        const buffer = Buffer.alloc(length);
        const read = readSync(fd, buffer, 0, length, offset);
        return new Uint8Array(buffer.subarray(0, read));
      } finally {
        closeSync(fd);
      }
    },
    async writePart(path, offset, bytes) {
      const file = at(path);
      mkdirSync(dirname(file), { recursive: true });
      const size = existsSync(file) ? statSync(file).size : 0;
      if (offset > size) throw new Error(`REFUSED: offset ${offset} beyond ${size}`);
      const fd = openSync(file, existsSync(file) ? "r+" : "w");
      try {
        writeSync(fd, bytes, 0, bytes.byteLength, offset);
      } finally {
        closeSync(fd);
      }
    },
    async commit(tmp, final, sha256) {
      const from = at(tmp);
      const bytes = readFileSync(from);
      if (sha256Hex(bytes) !== sha256) {
        rmSync(from, { force: true });
        throw new Error(`MISMATCH: ${tmp}`);
      }
      const to = at(final);
      if (existsSync(to)) {
        if (sha256Hex(readFileSync(to)) === sha256) {
          rmSync(from, { force: true });
          return;
        }
        throw new Error(`CONFLICT: ${final}`);
      }
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
    },
    async remove(path) {
      rmSync(at(path), { force: true });
    },
    async snapshot(name) {
      const path = `sync-tmp/${name}`;
      const file = at(path);
      mkdirSync(dirname(file), { recursive: true });
      rmSync(file, { force: true });
      snapshotOf(file);
      const bytes = readFileSync(file);
      return { path, size: bytes.byteLength, sha256: sha256Hex(bytes) };
    },
  };
}

/** The program's store of uploaded bytes (src/server/uploads.ts) on a folder. */
export function diskByteStore(root: string): ByteStore {
  return {
    async write(path, bytes) {
      const file = join(root, path);
      mkdirSync(dirname(file), { recursive: true });
      const fd = openSync(file, "w");
      try {
        writeSync(fd, bytes);
      } finally {
        closeSync(fd);
      }
    },
    async read(path) {
      return new Uint8Array(readFileSync(join(root, path)));
    },
  };
}

export function memoryVault(): SyncVault & { data: SyncVaultData | null } {
  const vault = {
    data: null as SyncVaultData | null,
    async read() {
      return vault.data ? structuredClone(vault.data) : null;
    },
    async write(data: SyncVaultData) {
      vault.data = structuredClone(data);
    },
    async clear() {
      vault.data = null;
    },
  };
  return vault;
}

// ─── A laptop ────────────────────────────────────────────────────────────────

export interface SyncLaptop {
  name: "a" | "b";
  test: TestDatabase;
  clock: FixedClock;
  /** The laptop's data folder: `uploads/` and `sync-tmp/` inside. */
  root: string;
  files: SyncFiles;
  /** Where `saveUpload` writes on this laptop. */
  store: ByteStore;
  vault: SyncVault & { data: SyncVaultData | null };
  /** The manager's session on this laptop's database. */
  manager: Session;
  /** One stamped transaction, as the manager unless a session is given: what a screen's action does. */
  transact<T>(work: (ex: Executor, ctx: ServiceContext) => Promise<T>, session?: Session): Promise<T>;
  /** The engine's view of this laptop. */
  env(): FilesEnv;
  centre(): CentreEnv;
  /** One round of the loop. */
  sync(): Promise<RoundResult>;
}

export interface SyncPairOptions {
  /** Where the three clocks start. */
  now?: string;
  /** How far each PC's clock is from the mailbox's (ms; positive: ahead). */
  skewMs?: { a?: number; b?: number };
  /** Laptop a starts from the 1.0.0 fixture, upgraded in place. */
  fixture?: boolean;
  /** Core's and these folders' demo data on laptop a before set-up (`true`: every folder). */
  demo?: boolean | readonly string[];
  /** Keep a copy of a's database from just before sync was set up (`pair.preSetUpBackup`), for case 8. */
  keepPreSetUpBackup?: boolean;
  /** False: b is left fresh, not joined (`pair.join()`). */
  joined?: boolean;
  /** The assistant's account made when pairing (default: an ACCOUNTANT "assistant"). */
  assistant?: { username?: string; roleId?: string; password?: string };
}

export interface SyncPair {
  a: SyncLaptop;
  b: SyncLaptop;
  relay: MemoryRelay;
  /** The mailbox's clock. */
  clock: FixedClock;
  /** With `keepPreSetUpBackup`: a's database just before set-up, for `pair.restore(pair.a, …)`. */
  preSetUpBackup: string | null;
  /** The assistant's account id (made when pairing). */
  assistantId: string | null;
  advance(by: { minutes?: number; hours?: number; days?: number }): void;
  /** Joins b: a new assistant's account, or the one given. */
  join(using?: { accountId: string }): Promise<void>;
  /**
   * Case 9's second half: b replaced by a freshly installed laptop (new database, disk and vault) that joins with
   * a new code and a full copy, under a new laptop id and a new log chain. Remove the old one first
   * (`removeOtherLaptop`). Returns the new `pair.b`.
   */
  replace(laptop: SyncLaptop): Promise<SyncLaptop>;
  /**
   * The laptop starts again from the full copy under its own identity: case 8 ("REJOIN": its database predates
   * set-up) and case 7 when the mailbox no longer holds what it needs ("CATCH_UP"). Its next round takes back its
   * own envelopes the copy lacks.
   */
  reinstall(laptop: SyncLaptop, mode: "REJOIN" | "CATCH_UP"): Promise<void>;
  /** Rounds on a then b until a round on both moves nothing. Returns how many rounds ran. */
  syncAll(options?: { maxRounds?: number }): Promise<number>;
  differences(): string | null;
  expectSame(): void;
  /** Replaces a laptop's database with a backup file, as a restore does (same disk, vault and clock). */
  restore(laptop: SyncLaptop, backup: string): Promise<void>;
  close(): void;
}

const LOCAL_TABLES = new Set([
  "Sequence",
  "ChainHead",
  "BackupRun",
  "SyncSession",
  "SyncOutbox",
  "SyncCell",
  "SyncState",
  "SyncHeld",
  "SyncConflict",
  "_license",
  "_sqlx_migrations",
]);
const LOCAL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  User: ["failedSignInCount", "lastSignInAt"],
};
const isLocalSetting = (key: unknown) =>
  typeof key === "string" && (key.startsWith("backup.") || (key.startsWith("system.") && key !== "system.databaseId"));

/** Every shared table's rows, as text, for comparison. */
function sharedRows(test: TestDatabase): Map<string, Map<string, string>> {
  const tables = test.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  const out = new Map<string, Map<string, string>>();
  for (const { name } of tables) {
    if (LOCAL_TABLES.has(name) || name.startsWith("_")) continue;
    const rows = test.raw.prepare(`SELECT * FROM "${name}" ORDER BY "id"`).all() as Array<Record<string, unknown>>;
    const byId = new Map<string, string>();
    for (const row of rows) {
      if (name === "Setting" && isLocalSetting(row.key)) continue;
      const copy: Record<string, unknown> = {};
      for (const [col, value] of Object.entries(row)) {
        if (LOCAL_FIELDS[name]?.includes(col)) continue;
        copy[col] =
          typeof value === "bigint"
            ? Number(value)
            : value instanceof Uint8Array
              ? Buffer.from(value).toString("hex")
              : value;
      }
      byId.set(String(row.id), JSON.stringify(copy));
    }
    out.set(name, byId);
  }
  return out;
}

export function compareShared(a: TestDatabase, b: TestDatabase): string | null {
  const left = sharedRows(a);
  const right = sharedRows(b);
  for (const table of new Set([...left.keys(), ...right.keys()])) {
    const l = left.get(table);
    const r = right.get(table);
    if (!l || !r) return `${table}: only on ${l ? "a" : "b"}`;
    for (const id of new Set([...l.keys(), ...r.keys()])) {
      const x = l.get(id);
      const y = r.get(id);
      if (x === y) continue;
      if (x === undefined) return `${table} ${id}: only on b ${y}`;
      if (y === undefined) return `${table} ${id}: only on a ${x}`;
      const xo = JSON.parse(x) as Record<string, unknown>;
      const yo = JSON.parse(y) as Record<string, unknown>;
      const cols = Object.keys(xo).filter((col) => JSON.stringify(xo[col]) !== JSON.stringify(yo[col]));
      return `${table} ${id}: ${cols.map((col) => `${col} a=${JSON.stringify(xo[col])} b=${JSON.stringify(yo[col])}`).join(", ")}`;
    }
  }
  return null;
}

function makeLaptop(
  name: "a" | "b",
  test: TestDatabase,
  clock: FixedClock,
  root: string,
  relay: MemoryRelay,
  vault: SyncVault & { data: SyncVaultData | null },
  manager: Session,
): SyncLaptop {
  mkdirSync(join(root, "sync-tmp"), { recursive: true });
  const laptop: SyncLaptop = {
    name,
    test,
    clock,
    root,
    vault,
    manager,
    files: diskFiles(root, (file) => laptop.test.raw.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`)),
    store: diskByteStore(root),
    transact(work, session = laptop.manager) {
      return withStampedTransaction(laptop.test.db, buildContext(session, clock), work);
    },
    centre() {
      return {
        db: laptop.test.db,
        clock,
        vault,
        files: laptop.files,
        mailbox: relay.client(null, { now: () => clock.now().getTime() }),
      };
    },
    env() {
      if (!vault.data) throw new Error(`pair: laptop ${name} is not in the centre`);
      return envFor(laptop.centre(), vault.data, laptop.test.anchor);
    },
    async sync() {
      // As the loop does: the outcome is written where `syncStatus` reads it; a failure is thrown on.
      const outcome = await runOnce(laptop.env());
      await recordOutcome(laptop.test.db, clock, outcome);
      if (outcome.kind !== "OK") throw outcome.error ?? new Error(`pair: round ended ${outcome.kind}`);
      return outcome.result;
    },
  };
  return laptop;
}

/** What native's `sync_install_copy` does with a downloaded copy, then the next start (`finishInstall`). */
async function installCopy(laptop: SyncLaptop, path: string, note: InstallNote): Promise<void> {
  const installed = join(laptop.root, `inmaa-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  copyFileSync(join(laptop.root, path), installed);
  rmSync(join(laptop.root, path), { force: true });
  laptop.test.close();
  const anchor = fileAnchorStore(join(laptop.root, "inmaa.anchor.json"));
  laptop.test = await openTestDatabase(installed, { clock: laptop.clock, anchor });
  await finishInstall(laptop.test.db, laptop.clock, note);
  await writeAnchor(laptop.test.db, anchor, laptop.clock.now().toISOString(), { accept: "ANSWERED" });
  laptop.manager = await loadSession(laptop.test.db, FIRST_MANAGER_ID);
}

export async function createSyncPair(options: SyncPairOptions = {}): Promise<SyncPair> {
  const start = options.now ?? TEST_NOW;
  const mailboxClock = fixedClock(start);
  const skewA = options.skewMs?.a ?? 0;
  const skewB = options.skewMs?.b ?? 0;
  const clockA = fixedClock(new Date(Date.parse(start) + skewA).toISOString());
  const clockB = fixedClock(new Date(Date.parse(start) + skewB).toISOString());
  const relay = createMemoryRelay({ now: () => mailboxClock.now().getTime() });
  const folders: string[] = [];
  const folder = () => {
    const dir = mkdtempSync(join(tmpdir(), "inmaa-sync-"));
    folders.push(dir);
    return dir;
  };

  // Laptop a: the director's.
  let testA: TestDatabase;
  let rootA: string;
  if (options.fixture) {
    const copy = upgradedFixtureCopy();
    folders.push(copy.dataDir);
    rootA = copy.dataDir;
    testA = await openTestDatabase(copy.db, { clock: clockA, anchor: fileAnchorStore(copy.anchor) });
  } else {
    rootA = folder();
    testA = await createTestDatabase({ clock: clockA, demo: options.demo });
  }
  const a = makeLaptop("a", testA, clockA, rootA, relay, memoryVault(), await loadSession(testA.db, FIRST_MANAGER_ID));
  const preSetUpBackup = options.keepPreSetUpBackup ? testA.snapshot() : null;
  await setUpCentre(a.centre(), buildContext(a.manager, clockA), { setupKey: relay.setupKey, deviceName: "director" });

  // Laptop b: freshly installed, then joined.
  const b = makeLaptop(
    "b",
    await createTestDatabase({ clock: clockB }),
    clockB,
    folder(),
    relay,
    memoryVault(),
    a.manager,
  );

  const pair: SyncPair = {
    a,
    b,
    relay,
    clock: mailboxClock,
    preSetUpBackup,
    assistantId: null,
    advance(by) {
      mailboxClock.advance(by);
      clockA.advance(by);
      clockB.advance(by);
    },
    async join(using) {
      const assistant = options.assistant ?? {};
      const a = pair.a;
      const b = pair.b;
      const code = await pairSecondLaptop(
        a.centre(),
        buildContext(a.manager, clockA),
        using ?? {
          newAccount: {
            displayName: "assistant",
            username: assistant.username ?? "assistant",
            roleId: assistant.roleId ?? "ACCOUNTANT",
            password: assistant.password ?? "assistant-password-1",
          },
        },
      );
      pair.assistantId = code.accountId;
      const { path, note } = await redeemAndDownload(b.centre(), { code: code.code, deviceName: "assistant" });
      await installCopy(b, path, note);
    },
    async reinstall(laptop, mode) {
      const { path, note } = await downloadForRejoin(laptop.centre(), mode);
      await installCopy(laptop, path, note);
    },
    async replace(laptop) {
      if (laptop !== pair.b) throw new Error("pair: only the assistant's laptop is replaced");
      pair.b.test.close();
      pair.b = makeLaptop(
        "b",
        await createTestDatabase({ clock: clockB }),
        clockB,
        folder(),
        relay,
        memoryVault(),
        pair.a.manager,
      );
      await pair.join(pair.assistantId ? { accountId: pair.assistantId } : undefined);
      return pair.b;
    },
    async syncAll({ maxRounds = 20 } = {}) {
      for (let round = 1; round <= maxRounds; round++) {
        const first = await pair.a.sync();
        const second = await pair.b.sync();
        const moved = [first, second].some(
          (r) => r.sent > 0 || r.received > 0 || r.filesReceived > 0 || r.filesSent > 0 || r.caughtUp,
        );
        if (!moved) return round;
      }
      throw new Error(`pair: still moving after ${maxRounds} rounds`);
    },
    differences() {
      return compareShared(pair.a.test, pair.b.test);
    },
    expectSame() {
      const difference = pair.differences();
      if (difference) throw new Error(`pair: the laptops differ: ${difference}`);
    },
    async restore(laptop, backup) {
      const anchor = laptop.test.anchor;
      const installed = join(laptop.root, `restored-${Date.now()}.db`);
      copyFileSync(backup, installed);
      laptop.test.close();
      laptop.test = await openTestDatabase(installed, { clock: laptop.clock, anchor });
      await writeAnchor(laptop.test.db, anchor, laptop.clock.now().toISOString(), { accept: "ANSWERED" });
      laptop.manager = await loadSession(laptop.test.db, FIRST_MANAGER_ID);
    },
    close() {
      pair.a.test.close();
      pair.b.test.close();
      for (const dir of folders) rmSync(dir, { recursive: true, force: true });
    },
  };
  if (options.joined !== false) await pair.join();
  return pair;
}
