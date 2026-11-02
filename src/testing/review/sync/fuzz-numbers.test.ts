import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { yearOf } from "@/lib/clock";
import { buildContext } from "@/lib/service/context";
import { requestBooks } from "@/lib/sync/books";
import { removeDevice } from "@/lib/sync/centre";
import { readState, writeState } from "@/lib/sync/state";
import { localDate } from "@/lib/units";
import { LONG } from "@/testing/scenarios/phone/helpers";
import {
  booksHolder,
  deviceIdOf,
  expectLegalNumbersUnique,
  issueReceipts,
  registerAWorker,
} from "@/testing/scenarios/sync/helpers";
import type { SyncLaptop } from "@/testing/sync/pair";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync): a seeded fuzz through the real engine and the in-memory mailbox, three devices. Random
 * interleavings of: receipts issued (legal numbers), «طلب الدفاتر», one sync round on one device, a worker registered
 * (ordinary numbers from blocks), the clock moving, and a laptop restored from its own backup (after it sent
 * everything, so nothing it gave is lost; the start-up's "restore pending" is emulated by the catchUp state).
 * Whatever happens, once every device has synced: no legal number twice, every receipt issued is on every device,
 * the chains verify, no worker number twice, and the three hold the same data.
 *
 * fix-sync added removals and replacements (case 9), now that a removal and a pairing receive before deciding: the
 * second laptop or the phone is "lost" (whatever it had not sent is lost with it), removed from laptop a with the
 * last numbers it issued declared as seen on paper, and a fresh device of its kind joins in its place.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

const SEEDS = Number(process.env.REVIEW_FUZZ_SEEDS ?? 6);
const STEPS = Number(process.env.REVIEW_FUZZ_STEPS ?? 60);

function generator(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const expected = (error: unknown) =>
  error instanceof Error &&
  /books are|on their way|taking back|already on this device|cannot be reached|caught up|just joined|not yet received everything|stay on the laptops|held on this device/i.test(
    error.message,
  );

/** The last number of a legal key this year as a device's database holds it: what the manager reads on paper. */
async function lastNumber(device: SyncLaptop, key: "INVOICE" | "RECEIPT"): Promise<number> {
  const row = await device.test.db
    .selectFrom("Sequence")
    .select("lastValue")
    .where("key", "=", key)
    .where("year", "=", yearOf(localDate(device.clock.now().toISOString().slice(0, 10))))
    .executeTakeFirst();
  return row?.lastValue ?? 0;
}

describe("review: fuzz of legal and ordinary numbers over three devices", () => {
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    it(`seed ${seed}`, LONG, async () => {
      const t = (trio = await createSyncTrio());
      const next = generator(seed);
      const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
      const issued = new Set<string>();
      const backups = new Map<SyncLaptop, string>();
      const log: string[] = [];
      let nin = 0;

      // The mailbox lets five devices join a day (relay's JOINS_PER_DAY): b and the phone took two at the start.
      const replaced = () => log.filter((line) => line.endsWith("replaced")).length;
      const mayReplace = async () => replaced() < 3 && !(await readState(t.a.test.db, "catchUp"));

      /** `lost` is lost (what it never sent is lost with it), removed from laptop a with its last numbers, replaced. */
      async function loseAndReplace(lost: SyncLaptop, step: number) {
        const before = (await lost.test.db.selectFrom("Receipt").select("id").execute()).map((row) => row.id);
        await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
          deviceId: deviceIdOf(lost),
          reason: "ضاع الجهاز",
          lastInvoice: await lastNumber(lost, "INVOICE"),
          lastReceipt: await lastNumber(lost, "RECEIPT"),
        });
        const kept = new Set((await t.a.test.db.selectFrom("Receipt").select("id").execute()).map((row) => row.id));
        for (const id of before) if (!kept.has(id)) issued.delete(id);
        backups.delete(lost);
        const name = lost === t.b ? "b" : "phone";
        log.push(`${step} ${name} removed`);
        // Pairing receives first and may ask to sync first (an envelope not listed yet): a syncs and pairs again.
        for (let attempt = 0; ; attempt += 1) {
          try {
            if (attempt === 0) await t.replace(lost);
            else if (name === "b") await t.joinB(t.assistantId ? { accountId: t.assistantId } : undefined);
            else await t.joinPhone();
            break;
          } catch (error) {
            if (attempt >= 3 || !expected(error)) throw error;
            await t.a.sync();
          }
        }
        log.push(`${step} ${name} replaced`);
      }

      for (let step = 0; step < STEPS; step += 1) {
        // Halfway, once per seed: the assistant's laptop takes the books, issues receipts it never sends, and is lost:
        // laptop a removes it declaring its last numbers on paper (a LOST_DEVICE gap), and a new laptop joins.
        // (The phone never holds the books: docs/phone/DECISION.md section 6, 2026-11-02.)
        if (step === Math.floor(STEPS / 2) && (await mayReplace())) {
          try {
            await t.b
              .transact((ex, ctx) => requestBooks(ex, ctx))
              .catch((error: unknown) => {
                if (!expected(error)) throw error;
              });
            for (let round = 0; round < 3 && (await booksHolder(t.b)) !== deviceIdOf(t.b); round += 1) {
              for (const device of [t.b, t.a, t.b]) await device.sync();
            }
            if ((await booksHolder(t.b)) === deviceIdOf(t.b)) {
              t.relay.offline = true;
              await issueReceipts(t.b, 2).finally(() => {
                t.relay.offline = false;
              });
              for (const row of await t.b.test.db.selectFrom("Receipt").select("id").execute()) issued.add(row.id);
              log.push(`${step} b holds the books, issues 2 unsent`);
              await loseAndReplace(t.b, step);
              log.push(`${step} lost holder`);
            }
          } catch (error) {
            if (!expected(error))
              throw new Error(`seed ${seed} step ${step}: ${String(error)}\n${log.join("\n")}`, { cause: error });
          }
        }
        const device = pick(t.devices());
        const roll = next();
        try {
          if (roll < 0.22) {
            const before = new Set(
              (await device.test.db.selectFrom("Receipt").select("id").execute()).map((row) => row.id),
            );
            await issueReceipts(device, 1 + Math.floor(next() * 2));
            for (const row of await device.test.db.selectFrom("Receipt").select("id").execute())
              if (!before.has(row.id)) issued.add(row.id);
            log.push(`${step} ${device.name} receipts`);
          } else if (roll < 0.34) {
            await device.transact((ex, ctx) => requestBooks(ex, ctx));
            log.push(`${step} ${device.name} asks for the books`);
          } else if (roll < 0.7) {
            await device.sync();
            log.push(`${step} ${device.name} syncs`);
          } else if (roll < 0.88) {
            nin += 1;
            await registerAWorker(device, {
              nationalIdNumber: `1098${String(seed).padStart(3, "0")}${String(nin).padStart(11, "0")}`,
            });
            log.push(`${step} ${device.name} worker`);
          } else if (roll < 0.91) {
            t.advance({ minutes: 1 + Math.floor(next() * 90) });
          } else if (roll < 0.95) {
            // Case 9: b or the phone is lost; the director removes it from laptop a and a new one joins in its place.
            if (await mayReplace()) await loseAndReplace(next() < 0.5 ? t.b : t.phone, step);
          } else if (device !== t.phone) {
            if (!backups.has(device) || next() < 0.5) {
              backups.set(device, device.test.snapshot());
              log.push(`${step} ${device.name} backup`);
            } else {
              // A restore: everything this laptop did was sent first, then its backup comes back.
              await device.sync();
              await t.restore(device, backups.get(device)!);
              await writeState(device.test.db, "catchUp", {
                reason: "RESTORED",
                since: device.clock.now().toISOString(),
                done: 0,
                total: null,
              });
              backups.delete(device);
              log.push(`${step} ${device.name} restored`);
            }
          }
        } catch (error) {
          if (!expected(error))
            throw new Error(`seed ${seed} step ${step}: ${String(error)}\n${log.join("\n")}`, { cause: error });
        }
      }

      await t.syncAll({ maxRounds: 40 });
      const context = `seed ${seed}\n${log.join("\n")}`;
      await expectLegalNumbersUnique(...t.devices().map((device) => device.test));
      for (const device of t.devices()) {
        const here = new Set((await device.test.db.selectFrom("Receipt").select("id").execute()).map((row) => row.id));
        expect(
          [...issued].filter((id) => !here.has(id)),
          `receipts missing on ${device.name}: ${context}`,
        ).toEqual([]);
        const report = await verifyChains(device.test.db);
        expect(report.ok, `chains on ${device.name}: ${context}`).toBe(true);
        const numbers = await device.test.db
          .selectFrom("StaffMember")
          .select("number")
          .where("kind", "=", "WORKER")
          .execute();
        expect(new Set(numbers.map((row) => row.number)).size, `worker numbers on ${device.name}: ${context}`).toBe(
          numbers.length,
        );
        const held = await device.test.db
          .selectFrom("SyncHeld")
          .select(["tbl", "reason"])
          .where("resolvedAt", "is", null)
          .execute();
        expect(held, `held on ${device.name}: ${context}`).toEqual([]);
      }
      const count = (word: string) => log.filter((line) => line.includes(word)).length;
      const lostGaps = await t.a.test.db
        .selectFrom("SequenceGap")
        .select("id")
        .where("kind", "=", "LOST_DEVICE")
        .execute();
      process.stderr.write(
        `seed ${seed}: ${issued.size} receipts, ${count("asks")} requests, ${count("restored")} restores, ${count("replaced")} replacements, ${count("lost holder")} lost holders, ${lostGaps.length} LOST_DEVICE gaps, ${count("worker")} workers\n`,
      );
      const difference = t.differences();
      expect(difference, context).toBeNull();
    });
  }
});
