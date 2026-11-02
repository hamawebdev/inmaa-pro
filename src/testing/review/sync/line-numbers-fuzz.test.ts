import { afterEach, describe, expect, it } from "vitest";

import { LONG } from "@/testing/scenarios/phone/helpers";
import type { SyncLaptop } from "@/testing/sync/pair";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync, second pass): the new line rule (every device places the lines of a document itself, by
 * createdAt then id, nothing sent). Three devices add lines to one file as `syncDues` does (the next number above
 * the highest the device holds), in random order with random one-device rounds. Whatever the order, once all have
 * synced: no held change, the same number for every line on every device, and the numbers of a document distinct.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

const SEEDS = Number(process.env.REVIEW_LINE_SEEDS ?? 5);

function generator(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe("review: line numbers placed by every device", () => {
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    it(`seed ${seed}`, LONG, async () => {
      const t = (trio = await createSyncTrio());
      const file = await t.a.test.rows.insert("File", {});
      await t.syncAll();
      const fileId = file.id as string;
      const next = generator(seed);
      const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
      const addLine = async (device: SyncLaptop) => {
        const top = await device.test.db
          .selectFrom("PaymentDue")
          .select((eb) => eb.fn.max("seq").as("top"))
          .where("fileId", "=", fileId)
          .executeTakeFirst();
        const seq = Number(top?.top ?? 0) + 1;
        await device.test.rows.insert("PaymentDue", {
          fileId,
          seq,
          kind: "EXTRA",
          dueDate: "2026-10-30",
          expectedAmount: 100,
          amount: 100,
        } as never);
      };
      for (let step = 0; step < 30; step += 1) {
        const device = pick(t.devices());
        if (next() < 0.5) await addLine(device);
        else await device.sync();
        if (next() < 0.3) t.advance({ minutes: 1 + Math.floor(next() * 5) });
      }
      await t.syncAll({ maxRounds: 40 });
      for (const device of t.devices()) {
        const held = await device.test.db
          .selectFrom("SyncHeld")
          .select("reason")
          .where("resolvedAt", "is", null)
          .execute();
        expect(held, `held on ${device.name}`).toEqual([]);
      }
      const lines = (device: SyncLaptop) =>
        device.test.db
          .selectFrom("PaymentDue")
          .select(["id", "seq"])
          .where("fileId", "=", fileId)
          .orderBy("id")
          .execute();
      const onA = await lines(t.a);
      expect(await lines(t.b)).toEqual(onA);
      expect(await lines(t.phone)).toEqual(onA);
      expect(new Set(onA.map((line) => line.seq)).size).toBe(onA.length);
      expect(t.differences()).toBeNull();
    });
  }
});
