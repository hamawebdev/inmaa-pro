import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { claimNumber, nextNumber, nextNumbers } from "@/lib/numbering";
import { setSetting } from "@/lib/settings";
import { localDate } from "@/lib/units";
import { createTestDatabase, openTestDatabase, type TestDatabase } from "@/testing/database";

import { answerBlockClaims, blockOf, retireBlocks, startBlocks, topUpBlockClaims } from "./index";

/**
 * Number blocks between two laptops (DECISION section 5), on two databases
 * that exchange their `NumberBlock` rows by hand: each field comes from the
 * laptop that writes it (`used` and the rest from the block's owner, `answer`
 * from the other), which is what the engine's field-by-field merge gives.
 * The engine's own two-laptop tests (src/testing/sync/pair.ts) run the same
 * functions through the real mailbox; here thousands of interleavings run in
 * seconds.
 */

const A = "laptop-a";
const B = "laptop-b";
const d = localDate;

interface Laptop {
  test: TestDatabase;
  id: string;
}

let a: Laptop;
let b: Laptop;
const opened: TestDatabase[] = [];

function sql(test: TestDatabase, statement: string, ...params: Array<string | number | null>) {
  return test.raw.prepare(statement).run(...params.map((value) => (typeof value === "number" ? BigInt(value) : value)));
}

/** Makes a database laptop `id` of the centre: both laptops' rows, and its identity (capture stays off here). */
function becomeLaptop(test: TestDatabase, id: string, slot: 0 | 1) {
  for (const [device, place] of [
    [A, 0],
    [B, 1],
  ] as const) {
    sql(
      test,
      `INSERT OR IGNORE INTO "SyncDevice" ("id","name","slot","joinedAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?)`,
      device,
      device,
      place,
      "2026-10-12T08:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
    );
  }
  sql(
    test,
    `INSERT INTO "SyncState" ("key","value") VALUES ('device', ?) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`,
    JSON.stringify({ id, slot, centreId: "centre", name: id }),
  );
}

/** The director's laptop with some numbers given before sync, set up; the assistant's joined from its copy. */
async function twoLaptops(before?: (test: TestDatabase) => Promise<void>): Promise<void> {
  const first = await createTestDatabase();
  opened.push(first);
  await before?.(first);
  becomeLaptop(first, A, 0);
  await first.transact((ex, ctx) => startBlocks(ex, ctx, A));
  const copy = await openTestDatabase(first.snapshot(), { clock: first.clock });
  opened.push(copy);
  becomeLaptop(copy, B, 1);
  a = { test: first, id: A };
  b = { test: copy, id: B };
}

type BlockRow = Record<string, unknown> & { id: string; deviceId: string };

/** Sends `from`'s blocks to `to`: new rows whole; on rows both hold, the fields `from` writes. */
function send(from: Laptop, to: Laptop) {
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
    } else if (row.deviceId === from.id) {
      sql(to.test, `UPDATE "NumberBlock" SET "used" = ? WHERE "id" = ?`, Number(row.used), row.id);
    } else if (row.answer !== null) {
      sql(
        to.test,
        `UPDATE "NumberBlock" SET "answer" = ?, "answeredAt" = ? WHERE "id" = ?`,
        row.answer as string,
        row.answeredAt as string,
        row.id,
      );
    }
  }
}

function syncBoth() {
  send(a, b);
  send(b, a);
}

beforeEach(() => {
  opened.length = 0;
});
afterEach(() => {
  for (const test of opened) test.close();
});

const take = (laptop: Laptop, key: "QUOTE" | "VISIT" | "STAFF_WORKER", count = 1, date = "2026-10-12") =>
  laptop.test.transact(async (ex, ctx) =>
    (await nextNumbers(ex, ctx, key, { date: d(date), count })).map((number) => number.seq),
  );

describe("number blocks", () => {
  it("start the director's laptop where its counters stood: its next number is the one it would have given", async () => {
    await twoLaptops(async (test) => {
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

  it("take a fallback block of the laptop's own half, above every block it knows, when none is agreed", async () => {
    await twoLaptops(async (test) => {
      for (let i = 0; i < 37; i += 1)
        await test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }));
    });
    // The assistant's laptop knows the director's START block 3 (31–40): its first odd block above is 5.
    expect(await take(b, "QUOTE", 2)).toEqual([51, 52]);
    // The director's laptop uses its START block up, then its next even block above everything it knows (4).
    expect(await take(a, "QUOTE", 5)).toEqual([38, 39, 40, 41, 42]);
    expect(blockOf(41, 10)).toBe(4);
  });

  it("numbers a large request across blocks, and gives the numbers back when the transaction is rolled back", async () => {
    await twoLaptops();
    const visits = await take(b, "VISIT", 120);
    // Odd blocks of fifty: 51–100, 151–200, 251–270.
    expect(visits.slice(0, 2)).toEqual([51, 52]);
    expect(visits.at(49)).toBe(100);
    expect(visits.at(50)).toBe(151);
    expect(visits.at(-1)).toBe(270);
    expect(new Set(visits).size).toBe(120);

    await expect(
      b.test.transact(async (ex, ctx) => {
        await nextNumbers(ex, ctx, "VISIT", { date: d("2026-10-12"), count: 40 });
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");
    expect(await take(b, "VISIT", 1)).toEqual([271]);
  });

  it("use a claim only once the other laptop accepted it; two claims on one block: slot 0 keeps it", async () => {
    await twoLaptops();
    await take(a, "QUOTE");
    await take(b, "QUOTE");
    // a holds block 0 (fallback, even), b block 1 (odd). Both claim the next block (2) before hearing of the other.
    syncBoth();
    await a.test.transact((ex, ctx) => topUpBlockClaims(ex, ctx));
    await b.test.transact((ex, ctx) => topUpBlockClaims(ex, ctx));
    const claims = async (laptop: Laptop) =>
      laptop.test.db
        .selectFrom("NumberBlock")
        .select(["deviceId", "blockIndex", "kind", "answer"])
        .where("kind", "=", "CLAIM")
        .orderBy("deviceId")
        .execute();
    expect((await claims(a)).map((row) => row.blockIndex)).toEqual([2]);
    expect((await claims(b)).map((row) => row.blockIndex)).toEqual([2]);

    syncBoth();
    await a.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
    await b.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
    syncBoth();
    expect(await claims(a)).toEqual([
      { deviceId: A, blockIndex: 2, kind: "CLAIM", answer: "ACCEPTED" },
      { deviceId: B, blockIndex: 2, kind: "CLAIM", answer: "REFUSED" },
    ]);
    expect(await claims(b)).toEqual(await claims(a));

    // a uses block 0, then its accepted claim 2.
    expect(await take(a, "QUOTE", 10)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 21]);
  });

  it("refuse a claim on a block the answering laptop already numbers in", async () => {
    await twoLaptops();
    await take(b, "QUOTE"); // b: fallback block 1
    await a.test.transact((ex, ctx) => topUpBlockClaims(ex, ctx)); // nothing used by a yet: no claim
    await take(a, "QUOTE"); // a: fallback block 0
    await a.test.transact((ex, ctx) => topUpBlockClaims(ex, ctx)); // a knows only block 0: claims 1
    send(a, b);
    await b.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
    send(b, a);
    const claim = await a.test.db
      .selectFrom("NumberBlock")
      .select(["blockIndex", "answer"])
      .where("kind", "=", "CLAIM")
      .executeTakeFirstOrThrow();
    expect(claim).toEqual({ blockIndex: 1, answer: "REFUSED" });
  });

  it("accept a typed number only before sync or inside the laptop's own block", async () => {
    await twoLaptops(async (test) => {
      for (let i = 0; i < 12; i += 1)
        await test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }));
    });
    const claim = (laptop: Laptop, value: number) =>
      laptop.test.transact((ex, ctx) =>
        claimNumber(ex, ctx, "QUOTE", { value, date: d("2026-10-12"), reason: "رقم من الورق" }),
      );
    // Given before sync: on either laptop.
    expect((await claim(b, 5)).display).toBe("0005/2026");
    // In a's START block (11–20): a's own; b may not type it.
    expect((await claim(a, 18)).seq).toBe(18);
    await expect(claim(b, 15)).rejects.toThrow("cannot be typed here");
    // a's block now covers 18: its next number follows it.
    expect(await take(a, "QUOTE")).toEqual([19]);
    // Far above: nobody's yet.
    await expect(claim(a, 95)).rejects.toThrow("cannot be typed here");
  });

  it("go on from the paper register (numbering.startAt) for a key never used", async () => {
    await twoLaptops(async (test) => {
      await test.transact((ex, ctx) => setSetting(ex, ctx, "numbering.startAt", { COMPLAINT: 245 }));
    });
    const first = await a.test.transact((ex, ctx) => nextNumber(ex, ctx, "COMPLAINT", { date: d("2026-10-12") }));
    expect(first.seq).toBe(245);
    const other = await b.test.transact((ex, ctx) => nextNumber(ex, ctx, "COMPLAINT", { date: d("2026-10-12") }));
    // b has not heard of a's block 24 yet: its own half, from the same place, is block 25.
    expect(other.seq).toBe(251);
  });

  it("refuse the waiting claims of a laptop that was removed", async () => {
    await twoLaptops();
    await take(b, "QUOTE");
    await b.test.transact((ex, ctx) => topUpBlockClaims(ex, ctx));
    send(b, a);
    expect(await a.test.transact((ex, ctx) => retireBlocks(ex, ctx, B))).toEqual({ refused: 1 });
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
      await twoLaptops(async (test) => {
        for (let i = 0; i < 23; i += 1)
          await test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }));
      });
      const next = random(seed);
      const given = new Map<string, string>();
      const give = (laptop: Laptop, key: string, seqs: number[]) => {
        for (const seq of seqs) {
          const at = `${key}-${seq}`;
          if (given.has(at)) throw new Error(`seed ${seed}: ${at} given by ${given.get(at)} and again by ${laptop.id}`);
          given.set(at, laptop.id);
        }
      };
      for (let step = 0; step < 70; step += 1) {
        const laptop = next() < 0.5 ? a : b;
        const other = laptop === a ? b : a;
        const roll = next();
        const key = KEYS[Math.floor(next() * KEYS.length)];
        if (roll < 0.45) {
          const count = key === "VISIT" ? 1 + Math.floor(next() * 70) : 1 + Math.floor(next() * 4);
          give(laptop, key, await take(laptop, key, count));
        } else if (roll < 0.55) {
          // A save that numbers and fails: its numbers are given back.
          await laptop.test
            .transact(async (ex, ctx) => {
              await nextNumbers(ex, ctx, key, { date: d("2026-10-12"), count: 3 });
              throw new Error("refused");
            })
            .catch(() => undefined);
        } else if (roll < 0.7) {
          await laptop.test.transact((ex, ctx) => topUpBlockClaims(ex, ctx));
        } else if (roll < 0.85) {
          await laptop.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
        } else {
          // In touch for a moment, one way: the other direction may be cut.
          send(laptop, other);
        }
      }
      // Whatever happened, once they meet both sides agree on every block.
      syncBoth();
      await a.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
      await b.test.transact((ex, ctx) => answerBlockClaims(ex, ctx));
      syncBoth();
      const blocks = (test: TestDatabase) =>
        test.db.selectFrom("NumberBlock").select(["id", "used", "answer"]).orderBy("id").execute();
      expect(await blocks(a.test)).toEqual(await blocks(b.test));
      // And no block is numbered in by both laptops.
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
  }, 120_000);

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
