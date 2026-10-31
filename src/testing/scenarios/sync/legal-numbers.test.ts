import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { removeOtherLaptop } from "@/lib/sync/centre";
import { BOOKS_ALREADY_HERE, BOOKS_ELSEWHERE, booksState, requestBooks } from "@/lib/sync/books";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import {
  assistantOn,
  booksHolder,
  deviceIdOf,
  expectChainsVerify,
  expectLegalNumbersUnique,
  getReceiptSheet,
  issueReceipts,
  legalNumbersOf,
  LONG,
  moveBooksTo,
  openConflicts,
  openHeld,
  recordReceiptPrinted,
} from "./helpers";

/**
 * DECISION section 5 and BUILD section 4: no invoice or receipt number is issued twice. One laptop holds the books;
 * only it writes the legal chains; the books move back and forth on request; a lost laptop's books are taken by the
 * manager with a LOST_DEVICE gap. Every number across both databases is one document, and every number is covered.
 *
 * Receipts are the legal sequence these scenarios issue (a block of blank receipts: `issueReceiptBatch`); invoices
 * go through the same counter, the same `peekLegalNumber`, the same `appendChained` and the same books guard.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const seqsOn = async (p: SyncPair, side: "a" | "b") =>
  (await legalNumbersOf(p[side].test))
    .filter((n) => n.key === "RECEIPT")
    .map((n) => n.seq)
    .sort((x, y) => x - y);

describe("the books", () => {
  it(
    "the laptop without the books is refused with the books' sentence, and its database refuses too",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      await p.syncAll();
      await expect(issueReceipts(p.b, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
      await expect(issueReceipts(p.b, 1, await assistantOn(p))).rejects.toThrow(BOOKS_ELSEWHERE);
      expect(await legalNumbersOf(p.b.test)).toEqual([]);
      await expectChainsVerify(p);
    },
  );

  it("numbers stay one unbroken sequence while the books move back and forth", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await issueReceipts(p.a, 3);
    await p.syncAll();
    await moveBooksTo(p, p.b);
    await issueReceipts(p.b, 2);
    await expect(issueReceipts(p.a, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
    await moveBooksTo(p, p.a);
    await issueReceipts(p.a, 1);
    // Apart: the holder goes on alone; the other asks and waits.
    p.relay.offline = true;
    await issueReceipts(p.a, 2);
    await p.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await expect(issueReceipts(p.b, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
    p.relay.offline = false;
    await p.syncAll();
    expect(await booksHolder(p.b)).toBe(deviceIdOf(p.b));
    await issueReceipts(p.b, 1);
    await p.syncAll();
    p.expectSame();

    expect(await seqsOn(p, "a")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(await seqsOn(p, "b")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await expectLegalNumbersUnique(p.a.test, p.b.test);
    await expectChainsVerify(p);
  });

  it("the hand-over reaches the asker only after every receipt issued before it", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await p.b.sync();
    // The holder issues, then syncs: its round sends the receipts, then the hand-over, in that order.
    await issueReceipts(p.a, 4);
    await p.a.sync();
    await p.b.sync();
    expect(await booksHolder(p.b)).toBe(deviceIdOf(p.b));
    expect(await seqsOn(p, "b")).toEqual([1, 2, 3, 4]);
    const issued = await issueReceipts(p.b, 1);
    expect(issued.firstNumber).toContain("5");
    await p.syncAll();
    p.expectSame();
    await expectLegalNumbersUnique(p.a.test, p.b.test);
    await expectChainsVerify(p);
  });
});

describe("case 11: both laptops ask for the books, or the holder is offline", () => {
  it("only the holder can hand over; the holder asking is told the books are here", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await expect(p.a.transact((ex, ctx) => requestBooks(ex, ctx))).rejects.toThrow(BOOKS_ALREADY_HERE);
    await p.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await p.syncAll();
    expect(await booksHolder(p.a)).toBe(deviceIdOf(p.b));
    expect(await booksHolder(p.b)).toBe(deviceIdOf(p.b));
    // Now both ask at once: the director asks back while the assistant (the holder) cannot ask for what she holds.
    await p.a.transact((ex, ctx) => requestBooks(ex, ctx));
    await expect(p.b.transact((ex, ctx) => requestBooks(ex, ctx))).rejects.toThrow(BOOKS_ALREADY_HERE);
    await p.syncAll();
    expect(await booksHolder(p.a)).toBe(deviceIdOf(p.a));
    p.expectSame();
    await expectChainsVerify(p);
  });

  it(
    "while the holder is offline the asker waits, and its screen says where the books are and since when",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      await p.syncAll();
      const handedAt = (await booksState(p.a.test.db))!.handedAt;
      // The director's laptop is closed: only the assistant's laptop runs rounds.
      await p.b.transact((ex, ctx) => requestBooks(ex, ctx));
      for (let round = 0; round < 3; round++) {
        p.advance({ minutes: 5 });
        await p.b.sync();
      }
      const state = await booksState(p.b.test.db, p.b.test.ctx());
      expect(state).toMatchObject({
        holderDeviceId: deviceIdOf(p.a),
        heldHere: false,
        handedAt,
        requestedByDeviceId: deviceIdOf(p.b),
      });
      expect(state!.holderName).toBeTruthy();
      await expect(issueReceipts(p.b, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
      // The director's laptop comes back: the books move.
      await p.syncAll();
      expect(await booksHolder(p.b)).toBe(deviceIdOf(p.b));
      await expectChainsVerify(p);
    },
  );
});

describe("printing on the laptop without the books (DECISION 5)", () => {
  it("prints a copy: no LegalEvent, and the print in that laptop's own log", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    const issued = await issueReceipts(p.a, 1);
    await p.syncAll();
    const receiptId = issued.receiptIds[0];
    const events = () => p.b.test.db.selectFrom("LegalEvent").select("id").where("receiptId", "=", receiptId).execute();

    const sheet = await p.b.transact((ex, ctx) => getReceiptSheet(ex, ctx, { receiptId }));
    expect(sheet.receipt.copy, "the sheet says «نسخة»").toBe(true);
    const printed = await p.b.transact((ex, ctx) => recordReceiptPrinted(ex, ctx, { receiptId }));
    expect(printed.copy).toBe(true);
    expect(await events()).toEqual([]);
    const logged = await p.b.test.db
      .selectFrom("AuditLog")
      .select(["chain", "operation"])
      .where("entity", "=", "Receipt")
      .where("entityId", "=", receiptId)
      .execute();
    expect(logged).toContainEqual({ chain: `AuditLog:${deviceIdOf(p.b)}`, operation: "DISCLOSE" });

    // An original asked for where the books are not is refused: two originals never come from two laptops.
    await expect(
      p.b.transact((ex, ctx) => recordReceiptPrinted(ex, ctx, { receiptId, asCopy: false })),
    ).rejects.toThrow(BOOKS_ELSEWHERE);
    // On the holder it prints as the original, with its event.
    const original = await p.a.transact((ex, ctx) => recordReceiptPrinted(ex, ctx, { receiptId }));
    expect(original.copy).toBe(false);
    await p.syncAll();
    p.expectSame();
    expect((await events()).length).toBe(1);
    await expectChainsVerify(p);
  });
});

describe("a lost laptop's books (case 9, DECISION 5)", () => {
  it(
    "the manager takes them, declaring the last number on paper: a LOST_DEVICE gap, and no number given twice",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      await issueReceipts(p.a, 2);
      await p.syncAll();
      await moveBooksTo(p, p.b);
      // The assistant's laptop issues three receipts (3, 4, 5) and is lost before it could send them.
      p.relay.offline = true;
      await issueReceipts(p.b, 3);
      p.relay.offline = false;

      // The director saw receipt 5 on paper.
      await removeOtherLaptop(p.a.centre(), buildContext(p.a.manager, p.a.clock), {
        deviceId: deviceIdOf(p.b),
        reason: "الحاسوب سُرق من المكتب",
        lastInvoice: null,
        lastReceipt: 5,
      });
      expect(await booksHolder(p.a)).toBe(deviceIdOf(p.a));
      const gaps = await p.a.test.db.selectFrom("SequenceGap").selectAll().where("kind", "=", "LOST_DEVICE").execute();
      expect(gaps).toMatchObject([{ key: "RECEIPT", fromValue: 3, toValue: 5 }]);
      const next = await issueReceipts(p.a, 1);
      expect(next.firstNumber).toContain("6");

      // The removed laptop's token is refused at once.
      await expect(p.b.sync()).rejects.toThrow();
      await expectLegalNumbersUnique(p.a.test, p.b.test);
      for (const laptop of [p.a, p.b]) {
        const { verifyChains } = await import("@/lib/chain");
        expect((await verifyChains(laptop.test.db)).ok, `chains on ${laptop.name}`).toBe(true);
      }
    },
  );

  it(
    "a lost laptop whose documents reached the mailbox after the declared number: kept whole as a legal incident",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      await moveBooksTo(p, p.b);
      // The assistant's laptop issues 1, 2, 3 and sends them; the director's laptop has not fetched them yet.
      await issueReceipts(p.b, 3);
      await p.b.sync();
      // The director saw only receipt 2 on paper.
      await removeOtherLaptop(p.a.centre(), buildContext(p.a.manager, p.a.clock), {
        deviceId: deviceIdOf(p.b),
        reason: "الحاسوب تعطل",
        lastInvoice: null,
        lastReceipt: 2,
      });
      await p.a.sync();
      const incidents = [...(await openConflicts(p.a)), ...(await openHeld(p.a))].filter(
        (row) => "tbl" in row && row.tbl === "Receipt",
      );
      expect(incidents.length, "the lost laptop's receipts that cannot join the chain are listed").toBeGreaterThan(0);
      const { verifyChains } = await import("@/lib/chain");
      expect((await verifyChains(p.a.test.db)).ok).toBe(true);
      // Its own next number is past the declared one, and its chain holds only one document per number.
      await issueReceipts(p.a, 1);
      const onA = (await legalNumbersOf(p.a.test)).filter((n) => n.key === "RECEIPT");
      expect(new Set(onA.map((n) => n.seq)).size).toBe(onA.length);
    },
  );
});
