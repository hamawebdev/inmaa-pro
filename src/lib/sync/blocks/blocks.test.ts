import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { claimNumber, nextNumber, nextNumbers } from "@/lib/numbering";
import { setSetting } from "@/lib/settings";
import { localDate } from "@/lib/units";
import { createTestDatabase, openTestDatabase, type TestDatabase } from "@/testing/database";

import { answerBlockClaims, blockOf, retireBlocks, startBlocks, thirdOf, topUpBlockClaims } from "./index";

/**
 * Number blocks among the centre's three devices (DECISION section 5;
 * docs/phone/DECISION.md section 2), on three databases that exchange their
 * `NumberBlock` rows by hand: each field comes from the device that writes it
 * (`used` and the rest from the block's owner; `answer` from the block's
 * warden, or from the owner for a claim on its own third or one it gives up),
 * which is what the engine's field-by-field merge gives. The engine's own
 * tests (src/testing/sync/trio.ts) run the same functions through the real
 * mailbox; here thousands of interleavings run in seconds.
 */

const A = "laptop-a";
const B = "laptop-b";
const P = "phone-p";
const DEVICES = [
  [A, 0, "LAPTOP"],
  [B, 1, "LAPTOP"],
  [P, 2, "PHONE"],
] as const;
const d = localDate;

interface Device {
  test: TestDatabase;
  id: string;
}

let a: Device;
let b: Device;
let phone: Device;
const opened: TestDatabase[] = [];

function sql(test: TestDatabase, statement: string, ...params: Array<string | number | null>) {
  return test.raw.prepare(statement).run(...params.map((value) => (typeof value === "number" ? BigInt(value) : value)));
}

/** Makes a database device `id` of the centre: the three devices' rows, and its identity (capture stays off here). */
function become(test: TestDatabase, id: string) {
  for (const [device, slot, kind] of DEVICES) {
    sql(
      test,
      `INSERT OR IGNORE INTO "SyncDevice" ("id","name","slot","kind","joinedAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)`,
      device,
      device,
      slot,
      kind,
      "2026-10-12T08:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
    );
  }
  const [, slot, kind] = DEVICES.find(([device]) => device === id)!;
  sql(
    test,
    `INSERT INTO "SyncState" ("key","value") VALUES ('device', ?) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`,
    JSON.stringify({ id, slot, centreId: "centre", name: id, kind }),
  );
}

/** The director's laptop with some numbers given before sync, set up; the assistant's laptop and the phone joined from its copy. */
async function threeDevices(before?: (test: TestDatabase) => Promise<void>): Promise<void> {
  const first = await createTestDatabase();
  opened.push(first);
  await before?.(first);
  become(first, A);
  await first.transact((ex, ctx) => startBlocks(ex, ctx, A));
  const copy = async (id: string) => {
    const test = await openTestDatabase(first.snapshot(), { clock: first.clock });
    opened.push(test);
    become(test, id);
    return { test, id };
  };
  a = { test: first, id: A };
  b = await copy(B);
  phone = await copy(P);
}

type BlockRow = Record<string, unknown> & { id: string; deviceId: string; answer: string | null };

/** Sends `from`'s blocks to `to`: new rows whole; on rows both hold, the fields `from` writes. */
function send(from: Device, to: Device) {
  const rows = from.test.raw.prepare(`SELECT * FROM "NumberBlock"`).all() as BlockRow[];
  for (const row of rows) {
    const here = to.test.raw.prepare(`SELECT * FROM "NumberBlock" WHERE "id" = ?`).get(row.id) as BlockRow | undefined;
    if (!here) {
      const columns = Object.keys(row);
      sql(
        to.test,
        `INSERT INTO "NumberBlock" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        ...(columns.map((column) => (typeof row[column] === "bigint" ? Number(row[column]) : row[column])) as Array<
          string | number | null
        >),
      );
      continue;
    }
    if (row.deviceId === from.id)
      sql(to.test, `UPDATE "NumberBlock" SET "used" = ? WHERE "id" = ?`, Number(row.used), row.id);
    // One writer answers a claim (its warden, or its owner on its own third or when it gives it up): a first answer.
    if (row.answer !== null && here.answer === null) {
      sql(
        to.test,
        `UPDATE "NumberBlock" SET "answer" = ?, "answeredAt" = ? WHERE "id" = ?`,
        row.answer,
        row.answeredAt as string,
        row.id,
      );
    }
  }
}

const all = () => [a, b, phone];

function syncAll() {
  for (const from of all()) for (const to of all()) if (from !== to) send(from, to);
}

async function answerAll() {
  for (const device of all()) await device.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
}

beforeEach(() => {
  opened.length = 0;
});
afterEach(() => {
  for (const test of opened) test.close();
});

const take = (device: Device, key: "QUOTE" | "VISIT" | "STAFF_WORKER", count = 1, date = "2026-10-12") =>
  device.test.transact(async (ex, ctx) =>
    (await nextNumbers(ex, ctx, key, { date: d(date), count })).map((number) => number.seq),
  );

const topUp = (device: Device) => device.test.transact((ex, ctx) => topUpBlockClaims(ex, ctx));

const claimsOf = (device: Device) =>
  device.test.db
    .selectFrom("NumberBlock")
    .select(["deviceId", "blockIndex", "kind", "answer"])
    .where("kind", "=", "CLAIM")
    .orderBy("blockIndex")
    .orderBy("deviceId")
    .execute();

describe("number blocks", () => {
  it("start the director's laptop where its counters stood: its next number is the one it would have given", async () => {
    await threeDevices(async (test) => {
      for (let i = 0; i < 37; i += 1)
        await test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }));
      for (let i = 0; i < 40; i += 1)
        await test.transact((ex, ctx) => nextNumber(ex, ctx, "STAFF_WORKER", { date: d("2026-10-12") }));
    });
    const blocks = await a.test.db.selectFrom("NumberBlock").selectAll().orderBy("key").execute();
    expect(blocks.map((block) => [block.key, block.year, block.blockIndex, block.kind, block.used])).toEqual([
      ["QUOTE", 2026, 3, "START", 7],
      ["STAFF_WORKER", 0, 4, "START", 0],
    ]);
    expect(await take(a, "QUOTE", 3)).toEqual([38, 39, 40]);
    expect(await take(a, "STAFF_WORKER")).toEqual([41]);
    // Idempotent.
    await a.test.transact((ex, ctx) => startBlocks(ex, ctx, A));
    expect(await a.test.db.selectFrom("NumberBlock").select("id").execute()).toHaveLength(2);
  });

  it("take a fallback block of the device's own third, above every block it knows, when none is agreed", async () => {
    await threeDevices(async (test) => {
      for (let i = 0; i < 37; i += 1)
        await test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }));
    });
    // Every device knows the director's START block 3 (31–40). The second laptop's first block above in its third
    // (index mod 3 = 1) is 4; the phone's (mod 3 = 2) is 5.
    expect(await take(b, "QUOTE", 2)).toEqual([41, 42]);
    expect(await take(phone, "QUOTE", 1)).toEqual([51]);
    // The director's laptop uses its START block up, then its next block in its own third above what it knows (6).
    expect(await take(a, "QUOTE", 5)).toEqual([38, 39, 40, 61, 62]);
    expect([thirdOf(4), thirdOf(5), thirdOf(6)]).toEqual([1, 2, 0]);
    expect(blockOf(61, 10)).toBe(6);
  });

  it("numbers a large request across blocks, and gives the numbers back when the transaction is rolled back", async () => {
    await threeDevices();
    const visits = await take(b, "VISIT", 120);
    // The second laptop's third, blocks of fifty: 1 (51–100), 4 (201–250), 7 (351–370).
    expect(visits.slice(0, 2)).toEqual([51, 52]);
    expect(visits.at(49)).toBe(100);
    expect(visits.at(50)).toBe(201);
    expect(visits.at(-1)).toBe(370);
    expect(new Set(visits).size).toBe(120);

    await expect(
      b.test.transact(async (ex, ctx) => {
        await nextNumbers(ex, ctx, "VISIT", { date: d("2026-10-12"), count: 40 });
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");
    expect(await take(b, "VISIT", 1)).toEqual([371]);
  });

  it("accept a claim on a device's own third as it is made, and never let a laptop claim in the phone's", async () => {
    await threeDevices();
    await take(a, "QUOTE"); // a: fallback block 0
    await take(b, "QUOTE"); // b: fallback block 1
    syncAll();
    await topUp(a);
    await topUp(b);
    // Next free above 0 and 1: block 2 is the phone's third, so neither laptop claims it. Block 3 is a's own third:
    // a's claim is accepted at once; b's waits for a, its warden.
    expect(await claimsOf(a)).toEqual([{ deviceId: A, blockIndex: 3, kind: "CLAIM", answer: "ACCEPTED" }]);
    expect(await claimsOf(b)).toEqual([{ deviceId: B, blockIndex: 3, kind: "CLAIM", answer: null }]);
    syncAll();
    await answerAll();
    syncAll();
    expect(await claimsOf(b)).toEqual([
      { deviceId: A, blockIndex: 3, kind: "CLAIM", answer: "ACCEPTED" },
      { deviceId: B, blockIndex: 3, kind: "CLAIM", answer: "REFUSED" },
    ]);
    // a uses block 0, then its claim 3.
    expect(await take(a, "QUOTE", 10)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 31]);
  });

  it("let only a block's warden answer a claim; two claims waiting on one block: the lower slot keeps it", async () => {
    await threeDevices();
    await take(b, "QUOTE"); // b: block 1
    await take(phone, "QUOTE"); // phone: block 2
    syncAll();
    await topUp(b);
    await topUp(phone);
    // Both claim block 3, in the director's laptop's third.
    expect((await claimsOf(b)).map((row) => [row.deviceId, row.blockIndex, row.answer])).toEqual([[B, 3, null]]);
    expect((await claimsOf(phone)).map((row) => [row.deviceId, row.blockIndex, row.answer])).toEqual([[P, 3, null]]);
    send(b, phone);
    send(phone, b);
    // Neither answers the other: block 3 is not in their third.
    await b.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
    await phone.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
    expect((await claimsOf(b)).every((row) => row.answer === null)).toBe(true);
    send(b, a);
    send(phone, a);
    expect(await a.test.transact((ex, ctx) => answerBlockClaims(ex, ctx))).toEqual({ accepted: 1, refused: 1 });
    syncAll();
    expect(await claimsOf(phone)).toEqual([
      { deviceId: B, blockIndex: 3, kind: "CLAIM", answer: "ACCEPTED" },
      { deviceId: P, blockIndex: 3, kind: "CLAIM", answer: "REFUSED" },
    ]);
    expect(await take(b, "QUOTE", 10)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 31]);
  });

  it("refuse a claim on a block its warden already numbers in", async () => {
    await threeDevices();
    await take(b, "QUOTE"); // b: fallback block 1
    await topUp(b); // b knows only block 1: claims 3 (2 is the phone's third)
    // a, not knowing b's claim, numbers past block 0 into its next own block, 3.
    expect((await take(a, "QUOTE", 11)).at(-1)).toBe(31);
    send(b, a);
    await a.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
    send(a, b);
    expect((await claimsOf(b)).map((row) => [row.blockIndex, row.answer])).toEqual([[3, "REFUSED"]]);
  });

  it("give up a claim whose warden was removed", async () => {
    await threeDevices();
    await take(phone, "QUOTE"); // phone: block 2
    await topUp(phone); // claims block 3, the director's laptop's third
    expect((await claimsOf(phone)).map((row) => row.answer)).toEqual([null]);
    // The director's laptop is lost: the phone learns it, and gives its claim up at its next round.
    sql(
      phone.test,
      `UPDATE "SyncDevice" SET "removedAt" = ?, "removedReason" = 'lost' WHERE "id" = ?`,
      "2026-10-12T09:00:00.000Z",
      A,
    );
    await topUp(phone);
    const claims = await claimsOf(phone);
    expect(claims[0]).toEqual({ deviceId: P, blockIndex: 3, kind: "CLAIM", answer: "REFUSED" });
    // Its next claim goes to b's third (4) or its own (5), never the removed laptop's.
    expect(
      claims
        .slice(1)
        .map((row) => thirdOf(row.blockIndex))
        .every((third) => third !== 0),
    ).toBe(true);
  });

  it("accept a typed number only before sync or inside the device's own block", async () => {
    await threeDevices(async (test) => {
      for (let i = 0; i < 12; i += 1)
        await test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }));
    });
    const claim = (laptop: Device, value: number) =>
      laptop.test.transact((ex, ctx) =>
        claimNumber(ex, ctx, "QUOTE", { value, date: d("2026-10-12"), reason: "رقم من الورق" }),
      );
    // Given before sync: on either laptop.
    expect((await claim(b, 5)).display).toBe("0005/2026");
    // In a's START block (11–20): a's own; b may not type it.
    expect((await claim(a, 18)).seq).toBe(18);
    await expect(claim(b, 15)).rejects.toThrow("cannot be typed here");
    await expect(claim(phone, 15)).rejects.toThrow("cannot be typed here");
    // a's block now covers 18: its next number follows it.
    expect(await take(a, "QUOTE")).toEqual([19]);
    // Far above: nobody's yet.
    await expect(claim(a, 95)).rejects.toThrow("cannot be typed here");
  });

  it("go on from the paper register (numbering.startAt) for a key never used", async () => {
    await threeDevices(async (test) => {
      await test.transact((ex, ctx) => setSetting(ex, ctx, "numbering.startAt", { COMPLAINT: 245 }));
    });
    const first = await a.test.transact((ex, ctx) => nextNumber(ex, ctx, "COMPLAINT", { date: d("2026-10-12") }));
    expect(first.seq).toBe(245);
    const other = await b.test.transact((ex, ctx) => nextNumber(ex, ctx, "COMPLAINT", { date: d("2026-10-12") }));
    // b has not heard of a's block 24 yet: its own third, from the same place, is block 25; the phone's, 26.
    expect(other.seq).toBe(251);
    const third = await phone.test.transact((ex, ctx) => nextNumber(ex, ctx, "COMPLAINT", { date: d("2026-10-12") }));
    expect(third.seq).toBe(261);
  });

  it("refuse the waiting claims of a device that was removed", async () => {
    await threeDevices();
    await take(phone, "QUOTE");
    await topUp(phone);
    send(phone, a);
    expect(await a.test.transact((ex, ctx) => retireBlocks(ex, ctx, P))).toEqual({ refused: 1 });
  });

  it("never give one number twice, in any interleaving of numbering, claims, answers and exchanges", async () => {
    // A small deterministic generator, so that a failure can be replayed by its seed.
    const random = (seed: number) => () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const KEYS = ["QUOTE", "VISIT", "STAFF_WORKER"] as const;
    for (let seed = 1; seed <= 12; seed += 1) {
      opened.splice(0).forEach((test) => test.close());
      await threeDevices(async (test) => {
        for (let i = 0; i < 23; i += 1)
          await test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }));
      });
      const next = random(seed);
      const pick = () => all()[Math.floor(next() * 3)];
      const given = new Map<string, string>();
      const give = (device: Device, key: string, seqs: number[]) => {
        for (const seq of seqs) {
          const at = `${key}-${seq}`;
          if (given.has(at)) throw new Error(`seed ${seed}: ${at} given by ${given.get(at)} and again by ${device.id}`);
          given.set(at, device.id);
        }
      };
      for (let step = 0; step < 90; step += 1) {
        const device = pick();
        const roll = next();
        const key = KEYS[Math.floor(next() * KEYS.length)];
        if (roll < 0.4) {
          const count = key === "VISIT" ? 1 + Math.floor(next() * 70) : 1 + Math.floor(next() * 4);
          give(device, key, await take(device, key, count));
        } else if (roll < 0.5) {
          // A save that numbers and fails: its numbers are given back.
          await device.test
            .transact(async (ex, ctx) => {
              await nextNumbers(ex, ctx, key, { date: d("2026-10-12"), count: 3 });
              throw new Error("refused");
            })
            .catch(() => undefined);
        } else if (roll < 0.67) {
          await topUp(device);
        } else if (roll < 0.82) {
          await device.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
        } else {
          // In touch for a moment, one way, with one other device: the rest may be cut.
          const other = pick();
          if (other !== device) send(device, other);
        }
      }
      // Whatever happened, once they meet every device agrees on every block.
      syncAll();
      await answerAll();
      syncAll();
      const blocks = (test: TestDatabase) =>
        test.db.selectFrom("NumberBlock").select(["id", "used", "answer"]).orderBy("id").execute();
      expect(await blocks(b.test)).toEqual(await blocks(a.test));
      expect(await blocks(phone.test)).toEqual(await blocks(a.test));
      // And no block is numbered in by two devices.
      const usable = await a.test.db
        .selectFrom("NumberBlock")
        .select(["key", "year", "blockIndex", "deviceId"])
        .where((eb) =>
          eb.or([
            eb("kind", "in", ["START", "FALLBACK"]),
            eb.and([eb("kind", "=", "CLAIM"), eb("answer", "=", "ACCEPTED")]),
          ]),
        )
        .execute();
      const owners = new Map<string, string>();
      for (const block of usable) {
        const at = `${block.key}-${block.year}-${block.blockIndex}`;
        expect(owners.get(at) ?? block.deviceId, `seed ${seed}: block ${at}`).toBe(block.deviceId);
        owners.set(at, block.deviceId);
      }
      // And nothing given before sync (QUOTE 1–23) was given again.
      for (let seq = 1; seq <= 23; seq += 1) expect(given.has(`QUOTE-${seq}`)).toBe(false);
    }
  }, 300_000);

  it("leave numbering exactly as before when sync is not set up", async () => {
    const test = await createTestDatabase();
    opened.push(test);
    const seqs = await test.transact(async (ex, ctx) =>
      (await nextNumbers(ex, ctx, "VISIT", { date: d("2026-10-12"), count: 3 })).map((number) => number.seq),
    );
    expect(seqs).toEqual([1, 2, 3]);
    expect(await test.db.selectFrom("NumberBlock").select("id").execute()).toEqual([]);
  });
});
