import { afterEach, describe, expect, it } from "vitest";

import { claimNumber } from "@/lib/numbering";
import { CLAIM_OUTSIDE_BLOCKS } from "@/lib/sync/blocks";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import { deviceIdOf, expectChainsVerify, LONG, registerAFile, registerAWorker } from "./helpers";

/**
 * DECISION section 5, "the other numbers": workers', clients' and files' numbers are cut in blocks agreed between the
 * laptops; apart, each takes from its own half (the director's laptop the even blocks, the assistant's the odd). A
 * number is never given twice, while apart or in touch, and never changes after it is given.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

async function numbersOf(p: SyncPair, side: "a" | "b") {
  const rows = await p[side].test.db
    .selectFrom("StaffMember")
    .select(["id", "number", "numberSeq"])
    .where("kind", "=", "WORKER")
    .execute();
  return new Map(rows.map((row) => [row.id, row.number]));
}

function expectNoNumberTwice(numbers: Map<string, string>) {
  const byNumber = new Map<string, string>();
  for (const [id, number] of numbers) {
    const other = byNumber.get(number);
    expect(other === undefined || other === id, `worker number ${number} given twice`).toBe(true);
    byNumber.set(number, id);
  }
}

describe("ordinary numbers (blocks)", () => {
  it("are never given twice while apart, nor in touch, and never change after they are given", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    const given = new Map<string, string>();
    const register = async (side: "a" | "b") => {
      const worker = await registerAWorker(p[side]);
      const row = await p[side].test.db
        .selectFrom("StaffMember")
        .select("number")
        .where("id", "=", worker.id)
        .executeTakeFirstOrThrow();
      given.set(worker.id, row.number);
    };

    // In touch: a few on each side, syncing between.
    for (let i = 0; i < 4; i++) {
      await register("a");
      await register("b");
      await p.syncAll();
    }
    // Apart for long enough to use up the agreed blocks on both sides (blocks of 10).
    p.relay.offline = true;
    for (let i = 0; i < 23; i++) {
      await register("a");
      await register("b");
    }
    p.relay.offline = false;
    await p.syncAll();
    // In touch again.
    for (let i = 0; i < 6; i++) {
      await register(i % 2 ? "a" : "b");
      if (i % 3 === 0) await p.syncAll();
    }
    await p.syncAll();
    p.expectSame();

    for (const side of ["a", "b"] as const) {
      const numbers = await numbersOf(p, side);
      expectNoNumberTwice(numbers);
      for (const [id, number] of given) expect(numbers.get(id), `the number of ${id} never changed`).toBe(number);
    }
    // Apart, each laptop took fallback blocks from its own half only.
    const fallback = await p.a.test.db
      .selectFrom("NumberBlock")
      .select(["deviceId", "blockIndex", "kind"])
      .where("key", "=", "STAFF_WORKER")
      .where("kind", "=", "FALLBACK")
      .execute();
    expect(fallback.length, "apart, the agreed blocks ran out and each laptop took from its half").toBeGreaterThan(0);
    expect(new Set(fallback.map((block) => block.deviceId)).size).toBe(2);
    for (const block of fallback) {
      const slot = block.deviceId === deviceIdOf(p.a) ? 0 : 1;
      expect(block.blockIndex % 2, `fallback block ${block.blockIndex} is in its laptop's half`).toBe(slot);
    }
    await expectChainsVerify(p);
  });

  it("files registered on both laptops while apart get distinct numbers", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    p.relay.offline = true;
    const made: string[] = [];
    for (let i = 0; i < 12; i++) {
      made.push((await registerAFile(p.a)).fileId);
      made.push((await registerAFile(p.b)).fileId);
    }
    const before = new Map<string, string>();
    for (const side of ["a", "b"] as const) {
      for (const row of await p[side].test.db.selectFrom("File").select(["id", "number"]).execute())
        before.set(row.id, row.number);
    }
    p.relay.offline = false;
    await p.syncAll();
    p.expectSame();
    const files = await p.a.test.db.selectFrom("File").select(["id", "number", "formKind"]).execute();
    expect(files.length).toBe(made.length);
    const seen = new Set<string>();
    for (const file of files) {
      const key = `${file.formKind} ${file.number}`;
      expect(seen.has(key), `file number ${key} given twice`).toBe(false);
      seen.add(key);
      expect(file.number).toBe(before.get(file.id));
    }
    const clients = await p.a.test.db.selectFrom("Client").select(["number"]).execute();
    expect(new Set(clients.map((c) => c.number)).size).toBe(clients.length);
    await expectChainsVerify(p);
  });
});

describe("a number typed from paper (claimNumber) once the laptops are joined", () => {
  it("is accepted inside this laptop's own block, refused inside the other's or beyond every block", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await registerAWorker(p.a);
    await registerAWorker(p.b);
    await p.syncAll();
    const blocks = await p.b.test.db
      .selectFrom("NumberBlock")
      .select(["deviceId", "blockIndex", "size", "answer", "kind"])
      .where("key", "=", "STAFF_WORKER")
      .execute();
    const own = blocks.find((block) => block.deviceId === deviceIdOf(p.b) && block.answer !== "REFUSED");
    const theirs = blocks.find((block) => block.deviceId === deviceIdOf(p.a));
    expect(own, "the assistant's laptop numbers inside a block of its own").toBeDefined();
    expect(theirs).toBeDefined();
    const claim = (side: "a" | "b", value: number) =>
      p[side].transact((ex, ctx) =>
        claimNumber(ex, ctx, "STAFF_WORKER", { value, date: ctx.today, reason: "رقم على استمارة ورقية" }),
      );

    await expect(claim("b", theirs!.blockIndex * theirs!.size + 9)).rejects.toThrow(CLAIM_OUTSIDE_BLOCKS);
    await expect(claim("b", 990)).rejects.toThrow(CLAIM_OUTSIDE_BLOCKS);
    await expect(claim("a", own!.blockIndex * own!.size + 9)).rejects.toThrow(CLAIM_OUTSIDE_BLOCKS);
    const typed = await claim("b", own!.blockIndex * own!.size + 9);
    expect(typed.seq).toBe(own!.blockIndex * own!.size + 9);
    // The automatic numbers of that laptop go on past the one typed; nothing is given twice.
    for (let i = 0; i < 3; i++) await registerAWorker(p.b);
    await p.syncAll();
    p.expectSame();
    const numbers = await numbersOf(p, "a");
    expectNoNumberTwice(numbers);
    await expectChainsVerify(p);
  });
});
