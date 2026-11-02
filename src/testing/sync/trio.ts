/**
 * The centre's three devices, for tests (docs/phone/DECISION.md): the director's laptop, the assistant's laptop and
 * the director's phone, on three databases, three clocks and three data folders, one mailbox in memory (relay's real
 * Worker code), and the real engine between them. Nothing here is in the program. It is `pair.ts` with a third
 * device; every device is a `SyncLaptop` (the phone too: `trio.phone.vault.data.kind === "PHONE"`).
 *
 *     const trio = await createSyncTrio();                   // a set up; b and the phone joined from full copies
 *     await trio.phone.transact((ex, ctx) => approveQuote(ex, ctx, input));   // the director, on his phone
 *     await trio.syncAll();                                  // rounds on a, b, phone until nothing moves
 *     trio.expectSame();                                     // every shared table, row by row, on the three
 *
 * What a scenario needs, beyond what `pair.ts` describes for one device:
 * - `trio.a`, `trio.b`, `trio.phone`; `trio.devices()` is the three, in that order.
 * - `trio.advance(by)`: the mailbox's clock and the three devices' together.
 * - `trio.syncAll({ only })`: rounds on the devices (all three, or `only` those, e.g. two while the third is "off")
 *   until a round moves nothing.
 * - `trio.code(kind)`: a pairing code made on laptop a for a LAPTOP or the PHONE (`pairDevice`), for tests of the
 *   refusals; `trio.fresh(name)`: a freshly installed device, not in the centre; `trio.joinWith(device, code, kind)`:
 *   it joins with that code as that kind (`redeemAndDownload`, then the copy installed as native does).
 * - `trio.replace(device)`: after `removeDevice`, a fresh device of the same kind joins in its place (case 9).
 * - A device that joins runs its first round at once, as the program does; `{ firstRound: false }` on `joinWith`,
 *   `joinB`, `joinPhone` or `replace` leaves it out (a test of what a device does before it).
 * - `trio.reinstall`, `trio.restore`: as in `pair.ts`, for any of the three.
 * - `createSyncTrio({ joined: { b: false, phone: false } })`: leave b or the phone unjoined (`trio.joinB()`,
 *   `trio.joinPhone()`).
 * - `trio.close()` in `afterEach`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { loadSession } from "@/lib/access/session";
import { writeAnchor } from "@/lib/chain/anchor";
import { fixedClock, type FixedClock } from "@/lib/clock";
import { buildContext } from "@/lib/service/context";
import { downloadForRejoin, pairDevice, redeemAndDownload, setUpCentre } from "@/lib/sync/centre";
import type { RoundResult } from "@/lib/sync/round";
import type { DeviceKind, PairingCodeAnswer } from "@/lib/sync/services/types";
import { createTestDatabase, openTestDatabase, TEST_NOW, type TestDatabase } from "@/testing/database";
import { fileAnchorStore } from "@/testing/anchor-file";
import { upgradedFixtureCopy } from "@/testing/fixtures/1.0.0";
import { createMemoryRelay, type MemoryRelay } from "@/testing/sync/memory-relay";

import { compareShared, firstRound, installCopy, makeLaptop, memoryVault, type SyncLaptop } from "./pair";

export type TrioName = "a" | "b" | "phone";

export interface SyncTrioOptions {
  /** Where the four clocks start. */
  now?: string;
  /** How far each device's clock is from the mailbox's (ms; positive: ahead). */
  skewMs?: Partial<Record<TrioName, number>>;
  /** Laptop a starts from the 1.0.0 fixture, upgraded in place. */
  fixture?: boolean;
  /** Core's and these folders' demo data on laptop a before set-up (`true`: every folder). */
  demo?: boolean | readonly string[];
  /** Keep a copy of a's database from just before sync was set up (`trio.preSetUpBackup`), for case 8. */
  keepPreSetUpBackup?: boolean;
  /** False for a device leaves it fresh, not joined (`trio.joinB()`, `trio.joinPhone()`). Both joined by default. */
  joined?: { b?: boolean; phone?: boolean };
  /** The assistant's account made when pairing b (default: an ACCOUNTANT "assistant"). */
  assistant?: { username?: string; roleId?: string; password?: string };
}

/** A device that joins runs its first round at once, as in the program (`pair.ts`, `firstRound`), unless false. */
export interface JoinOptions {
  firstRound?: boolean;
}

export interface SyncTrio {
  a: SyncLaptop;
  b: SyncLaptop;
  phone: SyncLaptop;
  relay: MemoryRelay;
  /** The mailbox's clock. */
  clock: FixedClock;
  preSetUpBackup: string | null;
  /** The assistant's account id (made when pairing b). */
  assistantId: string | null;
  /** The three, in the order a, b, phone. */
  devices(): SyncLaptop[];
  advance(by: { minutes?: number; hours?: number; days?: number }): void;
  /** b joins as the second laptop (a new assistant's account, or the one given). */
  joinB(using?: { accountId: string }, options?: JoinOptions): Promise<void>;
  /** The phone joins on a phone's code made on laptop a. */
  joinPhone(options?: JoinOptions): Promise<void>;
  /** A pairing code made on `from` (default laptop a) for a device of `kind`. */
  code(kind: DeviceKind, from?: SyncLaptop): Promise<PairingCodeAnswer>;
  /** A freshly installed device, not in the centre, on its own database, clock and folder (closed with the trio). */
  fresh(name: string): Promise<SyncLaptop>;
  /** `device` joins with `code` as `kind`: the code redeemed, the full copy downloaded and installed. */
  joinWith(device: SyncLaptop, code: string, kind: DeviceKind, options?: JoinOptions): Promise<void>;
  /** Case 9's second half: a fresh device of the same kind joins in place of b or the phone. Returns it. */
  replace(device: SyncLaptop, options?: JoinOptions): Promise<SyncLaptop>;
  reinstall(device: SyncLaptop, mode: "REJOIN" | "CATCH_UP"): Promise<void>;
  /** Rounds on every device (or `only` those) in turn until a round on each moves nothing. Returns the rounds run. */
  syncAll(options?: { maxRounds?: number; only?: SyncLaptop[] }): Promise<number>;
  /** The first difference between a and b, or a and the phone (or among `only`), or null. */
  differences(only?: SyncLaptop[]): string | null;
  expectSame(only?: SyncLaptop[]): void;
  restore(device: SyncLaptop, backup: string): Promise<void>;
  close(): void;
}

const moved = (r: RoundResult) => r.sent > 0 || r.received > 0 || r.filesReceived > 0 || r.filesSent > 0 || r.caughtUp;

export async function createSyncTrio(options: SyncTrioOptions = {}): Promise<SyncTrio> {
  const start = options.now ?? TEST_NOW;
  const mailboxClock = fixedClock(start);
  const clockOf = (name: TrioName) =>
    fixedClock(new Date(Date.parse(start) + (options.skewMs?.[name] ?? 0)).toISOString());
  const clocks: Record<TrioName, FixedClock> = { a: clockOf("a"), b: clockOf("b"), phone: clockOf("phone") };
  const extraClocks: FixedClock[] = [];
  const relay = createMemoryRelay({ now: () => mailboxClock.now().getTime() });
  const folders: string[] = [];
  const extra: SyncLaptop[] = [];
  const folder = () => {
    const dir = mkdtempSync(join(tmpdir(), "inmaa-trio-"));
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
    testA = await openTestDatabase(copy.db, { clock: clocks.a, anchor: fileAnchorStore(copy.anchor) });
  } else {
    rootA = folder();
    testA = await createTestDatabase({ clock: clocks.a, demo: options.demo });
  }
  const manager = await loadSession(testA.db, FIRST_MANAGER_ID);
  const a = makeLaptop("a", testA, clocks.a, rootA, relay, memoryVault(), manager);
  const preSetUpBackup = options.keepPreSetUpBackup ? testA.snapshot() : null;
  await setUpCentre(a.centre(), buildContext(a.manager, clocks.a), {
    setupKey: relay.setupKey,
    deviceName: "director",
  });

  const freshAs = async (name: TrioName) =>
    makeLaptop(
      name,
      await createTestDatabase({ clock: clocks[name] }),
      clocks[name],
      folder(),
      relay,
      memoryVault(),
      a.manager,
    );

  const trio: SyncTrio = {
    a,
    b: await freshAs("b"),
    phone: await freshAs("phone"),
    relay,
    clock: mailboxClock,
    preSetUpBackup,
    assistantId: null,
    devices: () => [trio.a, trio.b, trio.phone],
    advance(by) {
      mailboxClock.advance(by);
      for (const clock of [...Object.values(clocks), ...extraClocks]) clock.advance(by);
    },
    async code(kind, from = trio.a) {
      const ctx = buildContext(from.manager, from.clock);
      if (kind === "PHONE") return pairDevice(from.centre(), ctx, { kind });
      const assistant = options.assistant ?? {};
      return pairDevice(from.centre(), ctx, {
        kind,
        ...(trio.assistantId
          ? { accountId: trio.assistantId }
          : {
              newAccount: {
                displayName: "assistant",
                username: assistant.username ?? "assistant",
                roleId: assistant.roleId ?? "ACCOUNTANT",
                password: assistant.password ?? "assistant-password-1",
              },
            }),
      });
    },
    async joinWith(device, code, kind, joinOptions = {}) {
      const { path, note } = await redeemAndDownload(device.centre(), {
        code,
        deviceName: device.name === "phone" ? "phone" : device.name === "b" ? "assistant" : device.name,
        kind,
      });
      await installCopy(device, path, note);
      if (joinOptions.firstRound !== false) await firstRound(device);
    },
    async joinB(using, joinOptions) {
      const ctx = buildContext(trio.a.manager, trio.a.clock);
      const code = using
        ? await pairDevice(trio.a.centre(), ctx, { kind: "LAPTOP", ...using })
        : await trio.code("LAPTOP");
      trio.assistantId = code.accountId;
      await trio.joinWith(trio.b, code.code, "LAPTOP", joinOptions);
    },
    async joinPhone(joinOptions) {
      const code = await trio.code("PHONE");
      await trio.joinWith(trio.phone, code.code, "PHONE", joinOptions);
    },
    async fresh(name) {
      const clock = fixedClock(mailboxClock.now().toISOString());
      extraClocks.push(clock);
      const device = makeLaptop(
        name,
        await createTestDatabase({ clock }),
        clock,
        folder(),
        relay,
        memoryVault(),
        trio.a.manager,
      );
      extra.push(device);
      return device;
    },
    async replace(device, joinOptions) {
      if (device !== trio.b && device !== trio.phone) throw new Error("trio: only b or the phone is replaced");
      const name: TrioName = device === trio.b ? "b" : "phone";
      device.test.close();
      trio[name] = await freshAs(name);
      if (name === "b") await trio.joinB(trio.assistantId ? { accountId: trio.assistantId } : undefined, joinOptions);
      else await trio.joinPhone(joinOptions);
      return trio[name];
    },
    async reinstall(device, mode) {
      const { path, note } = await downloadForRejoin(device.centre(), mode);
      await installCopy(device, path, note);
    },
    async syncAll({ maxRounds = 30, only } = {}) {
      const devices = only ?? trio.devices().filter((device) => device.vault.data !== null);
      for (let round = 1; round <= maxRounds; round++) {
        const results: RoundResult[] = [];
        for (const device of devices) results.push(await device.sync());
        if (!results.some(moved)) return round;
      }
      throw new Error(`trio: still moving after ${maxRounds} rounds`);
    },
    differences(only) {
      const devices = only ?? trio.devices().filter((device) => device.vault.data !== null);
      const [first, ...rest] = devices;
      for (const other of rest) {
        const difference = compareShared(first.test, other.test, [first.name, other.name]);
        if (difference) return difference;
      }
      return null;
    },
    expectSame(only) {
      const difference = trio.differences(only);
      if (difference) throw new Error(`trio: the devices differ: ${difference}`);
    },
    async restore(device, backup) {
      const anchor = device.test.anchor;
      const installed = join(device.root, `restored-${Date.now()}.db`);
      const { copyFileSync } = await import("node:fs");
      copyFileSync(backup, installed);
      device.test.close();
      device.test = await openTestDatabase(installed, { clock: device.clock, anchor });
      await writeAnchor(device.test.db, anchor, device.clock.now().toISOString(), { accept: "ANSWERED" });
      device.manager = await loadSession(device.test.db, FIRST_MANAGER_ID);
    },
    close() {
      for (const device of [...trio.devices(), ...extra]) {
        try {
          device.test.close();
        } catch {
          // already closed (replaced)
        }
      }
      for (const dir of folders) rmSync(dir, { recursive: true, force: true });
    },
  };
  if (options.joined?.b !== false) await trio.joinB();
  if (options.joined?.phone !== false) await trio.joinPhone();
  return trio;
}
