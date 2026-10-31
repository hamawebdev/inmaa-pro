import { afterEach, describe, expect, it } from "vitest";

import { declarePaperNumbers } from "@/features/core/services/paper-numbers";
import { ensureCommune, ensureZoneForCommune } from "@/features/core/services/places";
import { verifyChains } from "@/lib/chain";
import { compareAnchor, memoryAnchorStore, reconcileAnchor, writeAnchor } from "@/lib/chain/anchor";
import { checkClock } from "@/lib/clock/sanity";
import { runDayStart } from "@/lib/daily";
import { logChange, logSecurity } from "@/lib/log";
import { setSetting } from "@/lib/settings";
import type { Executor } from "@/lib/service/context";
import { localDate } from "@/lib/units";
import { nextNumber } from "@/lib/numbering";
import { buildContext } from "@/lib/service/context";
import { leaveCentre } from "@/lib/sync/centre";
import { writeState } from "@/lib/sync/state";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import {
  BOOKS_ELSEWHERE,
  BOOKS_LEFT_BEHIND,
  booksState,
  CATCHING_UP,
  requestBooks,
  requireBooks,
  takeBooksFromLostLaptop,
} from "./index";

/**
 * The books, the log's chain per laptop, the clock and the day-start jobs
 * across two laptops (DECISION sections 4 and 5), on engine's two-laptop
 * harness: two databases, the real mailbox code in memory, the real rounds.
 */

let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const d = localDate;

async function deviceOf(laptop: SyncLaptop): Promise<string> {
  const row = await laptop.test.db
    .selectFrom("SyncState")
    .select("value")
    .where("key", "=", "device")
    .executeTakeFirstOrThrow();
  return (JSON.parse(row.value) as { id: string }).id;
}

/** An invoice through the one writer of the chains, as Money's issue does; `rows` fills its parents. */
const issue = (laptop: SyncLaptop, date = "2026-10-12") => laptop.test.rows.insert("Invoice", { issueDate: d(date) });

const invoiceNumbers = async (ex: Executor) =>
  (await ex.selectFrom("Invoice").select("number").orderBy("chainSeq").execute()).map((row) => row.number);

describe("the books across two laptops", () => {
  it("stay on the director's laptop; asked for, they move once everything issued has arrived", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    await pair.syncAll();

    await issue(a);
    await expect(issue(b)).rejects.toThrow(BOOKS_ELSEWHERE);
    await expect(b.transact((ex, ctx) => requireBooks(ex, ctx))).rejects.toThrow(BOOKS_ELSEWHERE);

    await b.transact((ex, ctx) => requestBooks(ex, ctx));
    // Asked, but not yet answered: the director's laptop still issues.
    await issue(a);
    await pair.syncAll();

    const onB = await b.transact((ex, ctx) => booksState(ex, ctx));
    expect(onB).toMatchObject({
      holderDeviceId: await deviceOf(b),
      heldHere: true,
      epoch: 2,
      requestedByDeviceId: null,
    });
    expect(onB?.lastInvoice).toEqual({ "2026": { seq: 2, date: "2026-10-12" } });
    // The assistant's next invoice follows the director's two, and the director's laptop now refuses.
    await issue(b);
    await expect(issue(a)).rejects.toThrow(BOOKS_ELSEWHERE);
    await pair.syncAll();

    for (const laptop of [a, b]) {
      expect(await invoiceNumbers(laptop.test.db)).toEqual(["000001/2026", "000002/2026", "000003/2026"]);
      expect((await verifyChains(laptop.test.db)).ok).toBe(true);
    }
    pair.expectSame();
  });

  it("are taken from a lost laptop by the manager: the numbers it may have issued are a LOST_DEVICE gap", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    await issue(a);
    await issue(a);
    await pair.syncAll();
    // The director's laptop issues number 3 and is lost before it ever syncs again.
    await issue(a);
    const lost = await deviceOf(a);

    await expect(
      b.transact((ex, ctx) =>
        takeBooksFromLostLaptop(ex, ctx, { deviceId: lost, lastInvoice: 4, lastReceipt: null, reason: " " }),
      ),
    ).rejects.toThrow("A reason is required.");
    expect(
      await b.transact((ex, ctx) =>
        takeBooksFromLostLaptop(ex, ctx, { deviceId: lost, lastInvoice: 4, lastReceipt: null, reason: "سُرق الحاسوب" }),
      ),
    ).toEqual({ gaps: 1 });
    const gap = await b.test.db.selectFrom("SequenceGap").selectAll().executeTakeFirstOrThrow();
    expect(gap).toMatchObject({ key: "INVOICE", year: 2026, kind: "LOST_DEVICE", fromValue: 3, toValue: 4 });

    await issue(b);
    expect(await invoiceNumbers(b.test.db)).toEqual(["000001/2026", "000002/2026", "000005/2026"]);
    const report = await verifyChains(b.test.db);
    expect(report.missingNumbers).toEqual([]);
    expect(report.ok).toBe(true);
    expect(await b.transact((ex, ctx) => booksState(ex, ctx))).toMatchObject({ forced: true, heldHere: true });
  });

  it("carry a legal gap to the other laptop, whose counter follows it with the same date floor", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    await a.transact((ex, ctx) =>
      declarePaperNumbers(ex, ctx, {
        key: "INVOICE",
        lastValue: 40,
        lastDate: "2026-10-01",
        reason: "دفتر الفواتير الورقي",
      }),
    );
    await expect(
      b.transact((ex, ctx) =>
        declarePaperNumbers(ex, ctx, { key: "RECEIPT", lastValue: 9, lastDate: "2026-10-01", reason: "x" }),
      ),
    ).rejects.toThrow(BOOKS_ELSEWHERE);
    await pair.syncAll();

    const counter = await b.test.db
      .selectFrom("Sequence")
      .select(["lastValue", "lastDate"])
      .where("id", "=", "INVOICE-2026")
      .executeTakeFirstOrThrow();
    expect(counter).toEqual({ lastValue: 40, lastDate: "2026-10-01" });

    await b.transact((ex, ctx) => requestBooks(ex, ctx));
    await pair.syncAll();
    await issue(b);
    expect(await invoiceNumbers(b.test.db)).toEqual(["000041/2026"]);
    expect((await verifyChains(b.test.db)).ok).toBe(true);
  });
});

describe("a laptop catching up or taken out of sync", () => {
  it("gives no number, legal or ordinary, while it catches up after a restore", async () => {
    pair = await createSyncPair();
    const { a } = pair;
    await writeState(a.test.db, "catchUp", {
      reason: "RESTORED",
      since: a.clock.now().toISOString(),
      done: 0,
      total: null,
    });
    await expect(issue(a)).rejects.toThrow(CATCHING_UP);
    await expect(a.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") }))).rejects.toThrow(
      CATCHING_UP,
    );
  });

  it("keeps the books state it had: without the books it never issues again; its numbers go on in its own blocks", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    const quote = (laptop: SyncLaptop) =>
      laptop.transact(async (ex, ctx) => (await nextNumber(ex, ctx, "QUOTE", { date: d("2026-10-12") })).seq);
    expect(await quote(a)).toBe(1);
    expect(await quote(b)).toBe(11);
    await pair.syncAll();

    // The assistant's laptop is taken out of sync while the books are on the director's.
    await leaveCentre(b.centre(), buildContext(b.manager, b.clock), { reason: "يغادر المركز" });
    await expect(issue(b)).rejects.toThrow(BOOKS_LEFT_BEHIND);
    // Its quotes go on in its own block, never back to the numbers it knew of.
    expect(await quote(b)).toBe(12);

    // The director's laptop, taken out while it holds the books, goes on issuing.
    await leaveCentre(a.centre(), buildContext(a.manager, a.clock), { reason: "إيقاف المزامنة" });
    await issue(a);
    expect(await quote(a)).toBe(2);
  });
});

describe("the log across two laptops", () => {
  it("is one chain per laptop; both verify on both laptops after every sync, and the anchor follows", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    // What the director's anchor held before the assistant wrote anything.
    const before = memoryAnchorStore(await writeAnchor(a.test.db, a.test.anchor, a.clock.now().toISOString()));

    for (let i = 0; i < 3; i += 1) {
      await a.transact((ex, ctx) => logSecurity(ex, ctx, { owner: "FOUNDATION", action: "SIGN_IN" }));
      await b.transact((ex, ctx) =>
        logChange(ex, ctx, { owner: "FOUNDATION", action: "UPDATE", entity: "Client", entityId: `c${i}` }),
      );
      await pair.syncAll();
      for (const laptop of [a, b]) {
        const report = await verifyChains(laptop.test.db);
        expect(report.ok, JSON.stringify(report.chains.filter((chain) => chain.problem))).toBe(true);
      }
    }
    const chains = (await verifyChains(a.test.db)).chains.filter((chain) => chain.table === "AuditLog");
    expect(chains.map((chain) => chain.chain).sort()).toEqual(
      ["AuditLog", `AuditLog:${await deviceOf(a)}`, `AuditLog:${await deviceOf(b)}`].sort(),
    );
    pair.expectSame();

    // That anchor knew none of the assistant's rows: "ahead", which is normal, and it is brought up to date,
    // every chain's head in it, both laptops' log chains included.
    const now = a.clock.now().toISOString();
    const comparison = await compareAnchor(a.test.db, before, now);
    expect(comparison.state).toBe("ahead");
    const hers = `AuditLog:${await deviceOf(b)}`;
    expect(comparison.chains.find((chain) => chain.table === hers)?.state).toBe("ahead");
    expect((await reconcileAnchor(a.test.db, before, now)).state).toBe("normal");
    const record = await before.read();
    expect(Object.keys(record?.heads ?? {})).toEqual(
      expect.arrayContaining([`AuditLog:${await deviceOf(a)}`, `AuditLog:${await deviceOf(b)}`, "Invoice"]),
    );
    expect((await compareAnchor(a.test.db, before, now)).state).toBe("normal");
  });

  it("judges each laptop's clock by its own work only, never by the other laptop's", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    // The assistant's PC is ten days ahead: her work is logged at that date.
    b.clock.advance({ days: 10 });
    await b.transact((ex, ctx) =>
      logChange(ex, ctx, { owner: "FOUNDATION", action: "UPDATE", entity: "Client", entityId: "c" }),
    );
    await pair.syncAll();
    // The director's clock is right: not "behind" the assistant's entries.
    const onA = await a.transact((ex, ctx) => checkClock(ex, ctx));
    expect(onA.state).toBe("ok");
    // On her own laptop, a clock put back to the true date is behind her own work.
    b.clock.advance({ days: -10 });
    expect((await b.transact((ex, ctx) => checkClock(ex, ctx))).state).toBe("behind");
  });
});

describe("the day-start jobs across two laptops", () => {
  it("run the owners' handlers on the laptop that holds the books only; Foundation's own on both", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    const onB = await runDayStart(b.test.db, b.clock);
    expect(onB.failed).toEqual([]);
    expect(onB.ran.filter((owner) => owner !== "core")).toEqual([]);
    expect(onB.elsewhere.length).toBeGreaterThan(0);

    const onA = await runDayStart(a.test.db, a.clock);
    expect(onA.failed).toEqual([]);
    expect(onA.elsewhere).toEqual([]);
    expect(onA.ran.length + onA.alreadyDone.length).toBeGreaterThanOrEqual(onB.elsewhere.length);
    await pair.syncAll();
    pair.expectSame();
  });
});

describe("rows that both laptops may make while apart", () => {
  it("get ids from what they are: one setting, one commune, one zone after sync", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    await pair.syncAll();
    for (const laptop of [a, b]) {
      await laptop.transact(async (ex, ctx) => {
        await setSetting(ex, ctx, "quote.validityDays", 20);
        const commune = await ensureCommune(ex, ctx, { wilayaCode: "25", nameAr: "الخروب" });
        await ensureZoneForCommune(ex, ctx, { communeId: commune.id });
        await ensureZoneForCommune(ex, ctx, { communeId: "commune-0401" });
      });
    }
    await pair.syncAll();
    pair.expectSame();
    const setting = await a.test.db
      .selectFrom("Setting")
      .select("id")
      .where("key", "=", "quote.validityDays")
      .execute();
    expect(setting).toEqual([{ id: "setting-quote.validityDays" }]);
    const communes = await a.test.db.selectFrom("Commune").select("id").where("wilayaCode", "=", "25").execute();
    expect(communes).toHaveLength(1);
    expect(communes[0].id).toMatch(/^commune-25-[0-9a-f]{16}$/);
    const zones = await a.test.db
      .selectFrom("Zone")
      .select("id")
      .where("id", "like", "zone-commune-%")
      .orderBy("id")
      .execute();
    expect(zones.map((zone) => zone.id)).toEqual([`zone-${communes[0].id}`, "zone-commune-0401"].sort());
  });
});
