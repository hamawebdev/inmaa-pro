import { sql } from "kysely";

import { getSetting } from "@/lib/settings";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { deviceOf, numberingDeviceOf, requireCaughtUp } from "@/lib/sync/books/guard";

/**
 * Number blocks (DECISION section 5): how two laptops number the documents
 * that are not legal sequences (registration numbers, files, quotes, mission
 * orders, complaints, pay runs…) without ever giving one number twice.
 *
 * Each key and year is cut into blocks on a fixed grid: block `b` holds the
 * numbers `b·size + 1` to `(b + 1)·size`, ten numbers a block, fifty for
 * mission orders. A laptop numbers only inside a block that is its own
 * (`NumberBlock`, shared):
 *
 *  - START: at set-up, every counter's current value becomes the director's
 *    laptop's first block, so its next number is the one it would have given;
 *  - CLAIM: while in touch, a laptop asks ahead for the next free block; the
 *    other laptop answers at its next sync, ACCEPTED, or REFUSED when it
 *    already has a row on that block (two claims on one block: slot 0 keeps
 *    it). A claim is used only once ACCEPTED;
 *  - FALLBACK: when it has no usable block left, a laptop takes one from its
 *    own half, slot 0 the even blocks and slot 1 the odd ones, above every
 *    block it knows of. The halves never meet.
 *
 * Every block is above every block known when it was made and above the
 * numbers given before sync (`Sequence`, which numbering no longer moves for
 * these keys once sync is set up: it stays the pre-sync top on both laptops).
 * Numbers are never changed after they are given; a block's unused rest stays
 * unused.
 *
 * A block's `used` is written by its owner in the transaction that numbers,
 * so a rolled-back document gives its numbers back. Its `answer` is written
 * by the other laptop.
 */

export type BlockKind = "START" | "CLAIM" | "FALLBACK";

/** How many numbers a block holds. */
export const blockSize = (key: string): number => (key === "VISIT" ? 50 : 10);

/** The block a number is in. */
export const blockOf = (value: number, size: number): number => Math.floor((value - 1) / size);

export const blockId = (key: string, year: number, blockIndex: number, deviceId: string) =>
  `${key}-${year}-${blockIndex}-${deviceId}`;

/** A typed number that is neither one given before sync nor inside one of this laptop's blocks. */
export const CLAIM_OUTSIDE_BLOCKS =
  "This number is not among those given before the two laptops were joined, nor among this laptop's own numbers: it cannot be typed here.";

/** How long a key counts as "used recently" for the claims kept ahead. */
const RECENT_DAYS = 30;

interface BlockRow {
  id: string;
  key: string;
  year: number;
  blockIndex: number;
  size: number;
  deviceId: string;
  kind: string;
  answer: string | null;
  used: number;
  updatedAt: string;
}

const isUsable = (block: Pick<BlockRow, "kind" | "answer">) =>
  block.kind === "START" || block.kind === "FALLBACK" || (block.kind === "CLAIM" && block.answer === "ACCEPTED");

async function blocksOf(ex: Executor, key: string, year: number): Promise<BlockRow[]> {
  return ex
    .selectFrom("NumberBlock")
    .select(["id", "key", "year", "blockIndex", "size", "deviceId", "kind", "answer", "used", "updatedAt"])
    .where("key", "=", key)
    .where("year", "=", year)
    .orderBy("blockIndex")
    .orderBy("id")
    .execute();
}

/** This laptop's slot: 0 numbers in the even blocks when apart, 1 in the odd. */
async function slotOf(ex: Executor, deviceId: string): Promise<0 | 1> {
  const row = await ex.selectFrom("SyncDevice").select("slot").where("id", "=", deviceId).executeTakeFirst();
  if (!row) throw new Error(`ledger: laptop ${deviceId} is not in SyncDevice`);
  return row.slot === 1 ? 1 : 0;
}

/** The numbers given before sync for a key and year: the counter as set-up left it. */
async function preSyncTop(ex: Executor, key: string, year: number): Promise<number> {
  const row = await ex
    .selectFrom("Sequence")
    .select("lastValue")
    .where("key", "=", key)
    .where("year", "=", year)
    .executeTakeFirst();
  return row?.lastValue ?? 0;
}

/**
 * The lowest number a new block may give: after the pre-sync numbers, and at
 * `numbering.startAt` for a key that has given nothing in any year (the
 * centre going on from its paper registers, as before sync).
 */
async function lowestNumber(ex: Executor, key: string, year: number): Promise<number> {
  const pre = await preSyncTop(ex, key, year);
  if (pre > 0) return pre + 1;
  const startAt = (await getSetting(ex, "numbering.startAt"))[key];
  if (!startAt || startAt <= 1) return 1;
  const usedElsewhere = await ex
    .selectFrom("Sequence")
    .select("id")
    .where("key", "=", key)
    .where("year", "<>", year)
    .where("lastValue", ">", 0)
    .executeTakeFirst();
  const blocksElsewhere = await ex
    .selectFrom("NumberBlock")
    .select("id")
    .where("key", "=", key)
    .where("year", "<>", year)
    .executeTakeFirst();
  return usedElsewhere || blocksElsewhere ? 1 : startAt;
}

/** Where a new block of this key and year may go, and how many of its numbers fall below what may be given. */
async function nextPlace(ex: Executor, key: string, year: number, known: readonly BlockRow[]) {
  const size = blockSize(key);
  const lowest = await lowestNumber(ex, key, year);
  const above = known.reduce((top, block) => Math.max(top, block.blockIndex + 1), 0);
  const from = Math.max(blockOf(lowest, size), above);
  const skipped = (index: number) => Math.max(0, Math.min(size, lowest - 1 - index * size));
  return { size, from, skipped };
}

async function insertBlock(
  ex: Executor,
  ctx: ServiceContext,
  block: {
    key: string;
    year: number;
    blockIndex: number;
    size: number;
    deviceId: string;
    kind: BlockKind;
    used: number;
  },
): Promise<BlockRow> {
  const row = {
    id: blockId(block.key, block.year, block.blockIndex, block.deviceId),
    key: block.key,
    year: block.year,
    blockIndex: block.blockIndex,
    size: block.size,
    deviceId: block.deviceId,
    kind: block.kind,
    answer: null,
    answeredAt: null,
    used: block.used,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await ex.insertInto("NumberBlock").values(row).execute();
  return row;
}

/**
 * At sync set-up, on the director's laptop: each counter that has given
 * numbers becomes its START block, the block that holds its next number, so
 * numbering goes on exactly where it was. Idempotent.
 */
export async function startBlocks(ex: Executor, ctx: ServiceContext, deviceId: string): Promise<{ blocks: number }> {
  const counters = await ex
    .selectFrom("Sequence")
    .select(["key", "year", "lastValue"])
    .where("key", "not in", ["INVOICE", "RECEIPT"])
    .where("lastValue", ">", 0)
    .execute();
  let blocks = 0;
  for (const counter of counters) {
    const size = blockSize(counter.key);
    const index = blockOf(counter.lastValue + 1, size);
    const result = await ex
      .insertInto("NumberBlock")
      .values({
        id: blockId(counter.key, counter.year, index, deviceId),
        key: counter.key,
        year: counter.year,
        blockIndex: index,
        size,
        deviceId,
        kind: "START",
        answer: null,
        answeredAt: null,
        used: counter.lastValue - index * size,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .onConflict((conflict) => conflict.column("id").doNothing())
      .executeTakeFirst();
    blocks += Number(result.numInsertedOrUpdatedRows ?? 0);
  }
  return { blocks };
}

/**
 * `count` numbers of a key and year from this laptop's blocks, in the
 * caller's transaction: its usable blocks first, lowest first, then fallback
 * blocks of its own half. Called by `nextNumbers` once sync is set up.
 */
export async function takeFromBlocks(
  ex: Executor,
  ctx: ServiceContext,
  key: string,
  year: number,
  count: number,
): Promise<number[]> {
  const device = await numberingDeviceOf(ex, ctx);
  if (!device) throw new Error("ledger: numbering from blocks needs this laptop's id");
  // A restored laptop's blocks went back with it: nothing is numbered before it has taken back what it gave.
  await requireCaughtUp(ex);
  const numbers: number[] = [];
  let known = await blocksOf(ex, key, year);
  let slot: 0 | 1 | null = null;

  while (numbers.length < count) {
    let block = known.find(
      (candidate) => candidate.deviceId === device && isUsable(candidate) && candidate.used < candidate.size,
    );
    if (!block) {
      slot ??= await slotOf(ex, device);
      const place = await nextPlace(ex, key, year, known);
      let index = place.from;
      while (index % 2 !== slot || place.skipped(index) >= place.size) index += 1;
      block = await insertBlock(ex, ctx, {
        key,
        year,
        blockIndex: index,
        size: place.size,
        deviceId: device,
        kind: "FALLBACK",
        used: place.skipped(index),
      });
      known = [...known, block].sort((a, b) => a.blockIndex - b.blockIndex);
    }
    const take = Math.min(count - numbers.length, block.size - block.used);
    for (let offset = 1; offset <= take; offset += 1) numbers.push(block.blockIndex * block.size + block.used + offset);
    const used = block.used + take;
    await ex.updateTable("NumberBlock").set({ used, updatedAt: ctx.now }).where("id", "=", block.id).execute();
    block.used = used;
    block.updatedAt = ctx.now;
  }
  return numbers;
}

/**
 * Whether a number typed from paper may be given on this laptop once sync is
 * set up: one given before sync, or one inside a usable block of its own (the
 * block's `used` then covers it, as the counter was raised before sync).
 * Refused otherwise: it may be the other laptop's.
 */
export async function claimInBlocks(
  ex: Executor,
  ctx: ServiceContext,
  key: string,
  year: number,
  value: number,
): Promise<{ blockId: string | null; used: [number, number] | null }> {
  const device = await numberingDeviceOf(ex, ctx);
  if (!device) throw new Error("ledger: numbering from blocks needs this laptop's id");
  await requireCaughtUp(ex);
  if (value <= (await preSyncTop(ex, key, year))) return { blockId: null, used: null };
  const size = blockSize(key);
  const index = blockOf(value, size);
  const block = (await blocksOf(ex, key, year)).find(
    (candidate) => candidate.deviceId === device && candidate.blockIndex === index && isUsable(candidate),
  );
  if (!block) throw new ServiceError(CLAIM_OUTSIDE_BLOCKS);
  const offset = value - index * block.size;
  if (offset <= block.used) return { blockId: block.id, used: null };
  await ex.updateTable("NumberBlock").set({ used: offset, updatedAt: ctx.now }).where("id", "=", block.id).execute();
  return { blockId: block.id, used: [block.used, offset] };
}

/**
 * Run by the sync loop after each round of applying: this laptop answers the
 * other laptop's claims. Refused when this laptop has a row on that block (a
 * START, a FALLBACK, an accepted claim); two claims that are both waiting:
 * slot 0 keeps the block. Accepted otherwise. Idempotent.
 */
export async function answerBlockClaims(
  ex: Executor,
  ctx: ServiceContext,
): Promise<{ accepted: number; refused: number }> {
  const device = deviceOf(ctx);
  if (!device) return { accepted: 0, refused: 0 };
  const waiting = await ex
    .selectFrom("NumberBlock as c")
    .innerJoin("SyncDevice as d", "d.id", "c.deviceId")
    .select(["c.id", "c.key", "c.year", "c.blockIndex", "d.slot", "d.removedAt"])
    .where("c.deviceId", "<>", device)
    .where("c.kind", "=", "CLAIM")
    .where("c.answer", "is", null)
    .orderBy("c.key")
    .orderBy("c.year")
    .orderBy("c.blockIndex")
    .execute();
  let accepted = 0;
  let refused = 0;
  for (const claim of waiting) {
    const mine = await ex
      .selectFrom("NumberBlock")
      .select(["kind", "answer"])
      .where("key", "=", claim.key)
      .where("year", "=", claim.year)
      .where("blockIndex", "=", claim.blockIndex)
      .where("deviceId", "=", device)
      .execute();
    const holds = mine.some((block) => isUsable(block));
    const waitingToo = mine.some((block) => block.kind === "CLAIM" && block.answer === null);
    const accept = claim.removedAt === null && !holds && (!waitingToo || claim.slot === 0);
    await ex
      .updateTable("NumberBlock")
      .set({ answer: accept ? "ACCEPTED" : "REFUSED", answeredAt: ctx.now, updatedAt: ctx.now })
      .where("id", "=", claim.id)
      .execute();
    if (accept) accepted += 1;
    else refused += 1;
  }
  return { accepted, refused };
}

/**
 * Run by the sync loop while the laptops are in touch: for each key and year
 * this laptop numbered in recently, keeps one block claimed ahead of the one
 * it is using, so that numbers stay close to the order of time and a laptop
 * rarely needs a fallback. A claim goes to the next block above every block
 * known. Idempotent: it claims only where no spare is left or waiting.
 */
export async function topUpBlockClaims(ex: Executor, ctx: ServiceContext): Promise<{ claimed: number }> {
  const device = deviceOf(ctx);
  if (!device) return { claimed: 0 };
  const since = new Date(Date.parse(ctx.now) - RECENT_DAYS * 86_400_000).toISOString();
  const recent = await ex
    .selectFrom("NumberBlock")
    .select(["key", "year"])
    .distinct()
    .where("deviceId", "=", device)
    .where("updatedAt", ">=", since)
    .where(sql<boolean>`"used" > 0`)
    .execute();
  let claimed = 0;
  for (const { key, year } of recent) {
    const known = await blocksOf(ex, key, year);
    const mine = known.filter((block) => block.deviceId === device);
    const withRoom = mine.filter((block) => isUsable(block) && block.used < block.size).length;
    const waiting = mine.filter((block) => block.kind === "CLAIM" && block.answer === null).length;
    // The block in use is not a spare: one more beyond it.
    if (Math.max(0, withRoom - 1) + waiting >= 1) continue;
    const place = await nextPlace(ex, key, year, known);
    let index = place.from;
    while (place.skipped(index) >= place.size) index += 1;
    await insertBlock(ex, ctx, {
      key,
      year,
      blockIndex: index,
      size: place.size,
      deviceId: device,
      kind: "CLAIM",
      used: place.skipped(index),
    });
    claimed += 1;
  }
  return { claimed };
}

/**
 * A laptop removed (engine's `removeLaptop`): its claims still waiting are
 * refused, so it can never number in them. Its other blocks stay, known, so
 * nobody numbers there again.
 */
export async function retireBlocks(ex: Executor, ctx: ServiceContext, deviceId: string): Promise<{ refused: number }> {
  const result = await ex
    .updateTable("NumberBlock")
    .set({ answer: "REFUSED", answeredAt: ctx.now, updatedAt: ctx.now })
    .where("deviceId", "=", deviceId)
    .where("kind", "=", "CLAIM")
    .where("answer", "is", null)
    .executeTakeFirst();
  return { refused: Number(result.numUpdatedRows ?? 0) };
}
