import { afterEach, describe, expect, it } from "vitest";

import { confirmClockJump } from "@/lib/clock/sanity";
import { logConsult } from "@/lib/log";
import { makeFullCopy } from "@/lib/sync/centre";
import { RelayFull, RelayLimit, RelayOffline } from "@/lib/sync/relay";
import { NeedsFullCopy } from "@/lib/sync/round";
import { readState } from "@/lib/sync/state";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import {
  editAWorker,
  expectChainsVerify,
  expectLegalNumbersUnique,
  issueReceipts,
  legalNumbersOf,
  LONG,
  moveBooksTo,
  registerAFile,
  registerAWorker,
  waitingOn,
} from "./helpers";

/** DECISION section 7, cases 2 to 6. */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const DAY_MS = 86_400_000;

/** One laptop works every day (one logged operation), the other is switched off. */
async function onlyOneWorks(p: SyncPair, laptop: SyncLaptop, days: number) {
  for (let day = 0; day < days; day++) {
    p.advance({ days: 1 });
    await laptop.transact((ex, ctx) =>
      logConsult(ex, ctx, { owner: "FOUNDATION", action: "VIEW", context: { test: "a working day" } }),
    );
    await laptop.sync();
  }
}

describe("case 2: a laptop stays off for weeks", () => {
  it("the mailbox keeps everything; it sends its own first, then applies the other's in order", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    // The assistant typed a worker just before switching her laptop off, without internet.
    p.relay.offline = true;
    const hers = await registerAWorker(p.b, { lastName: "مرابط", firstName: "نسيمة" });
    p.relay.offline = false;

    // Five weeks of the director's work alone.
    for (let week = 0; week < 5; week++) {
      await registerAFile(p.a);
      await issueReceipts(p.a, 1);
      await onlyOneWorks(p, p.a, 7);
    }
    expect(await waitingOn(p.b)).toBeGreaterThan(0);

    // She switches it on again: one round sends hers first, then takes everything of the director's.
    const round = await p.b.sync();
    expect(round.sent).toBeGreaterThan(0);
    expect(round.received).toBeGreaterThan(0);
    expect(await waitingOn(p.b)).toBe(0);
    await p.syncAll();
    p.expectSame();
    const onA = await p.a.test.db.selectFrom("StaffMember").select("id").where("id", "=", hers.id).execute();
    expect(onA).toHaveLength(1);

    // Its books, blocks and stamps continue: it can take the books and issue the next number. Her PC's date is five
    // weeks after the last work of its own log chain: the manager confirms it there first, as at the centre.
    await p.b.transact((ex, ctx) => confirmClockJump(ex, ctx));
    await moveBooksTo(p, p.b);
    const next = await issueReceipts(p.b, 1);
    expect(next.firstNumber).toContain("6");
    await registerAWorker(p.b);
    await p.syncAll();
    p.expectSame();
    await expectLegalNumbersUnique(p.a.test, p.b.test);
    await expectChainsVerify(p);
  });

  it(
    "fell behind what the mailbox keeps: it takes the full copy, then its own changes are applied on top",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      await p.syncAll();
      p.relay.offline = true;
      const hers = await registerAWorker(p.b, { lastName: "مرابط", firstName: "نسيمة" });
      p.relay.offline = false;
      for (let week = 0; week < 3; week++) {
        await registerAFile(p.a);
        await onlyOneWorks(p, p.a, 7);
      }
      // The books' laptop refreshes the full copy; then the mailbox collects what the copy covers (its 90 days passed).
      const copy = await makeFullCopy(p.a.env());
      for (const object of p.relay.env.MAILBOX.objects.values()) {
        object.sql.exec(`DELETE FROM envelope WHERE mseq <= ?`, copy.covers);
      }

      // She comes back: her own change goes first; the rest is no longer on the mailbox.
      const failure = await p.b.sync().then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(NeedsFullCopy);
      await p.reinstall(p.b, "CATCH_UP");
      await p.syncAll();
      p.expectSame();
      const onBoth = await Promise.all(
        [p.a, p.b].map((laptop) =>
          laptop.test.db.selectFrom("StaffMember").select("id").where("id", "=", hers.id).execute(),
        ),
      );
      expect(
        onBoth.map((rows) => rows.length),
        "her own change is on top of the full copy, on both",
      ).toEqual([1, 1]);
      await registerAWorker(p.b);
      await p.syncAll();
      p.expectSame();
      await expectChainsVerify(p);
    },
  );
});

describe("case 3: the two clocks disagree", () => {
  it("merge order follows the corrected stamps, not the PC's date", LONG, async () => {
    // The assistant's PC is set a day ahead.
    pair = await createSyncPair({ skewMs: { b: DAY_MS } });
    const p = pair;
    const worker = await registerAWorker(p.a, { lastName: "سعدي", firstName: "حورية" });
    await p.syncAll();
    const clock = await readState(p.b.test.db, "clock");
    expect(clock?.offsetMs, "the assistant's laptop measured its PC a day ahead of the mailbox").toBeLessThan(
      -DAY_MS + 60_000,
    );

    // Apart: the assistant types first (her PC says tomorrow), the director five minutes later in real time.
    p.relay.offline = true;
    await editAWorker(p.b, worker, { phone: "0770000002" });
    p.advance({ minutes: 5 });
    await editAWorker(p.a, worker, { phone: "0770000001" });
    p.relay.offline = false;
    await p.syncAll();
    p.expectSame();
    const phone = await p.b.test.db
      .selectFrom("StaffMember")
      .select("phone")
      .where("id", "=", worker.id)
      .executeTakeFirstOrThrow();
    expect(phone.phone.replace(/\s/g, ""), "the later change in real time wins, whatever the PC's date").toBe(
      "0770000001",
    );
    await expectChainsVerify(p);
  });

  it("each laptop's clock check reads its own log only; invoice dates keep their floor on both", LONG, async () => {
    pair = await createSyncPair({ skewMs: { b: DAY_MS } });
    const p = pair;
    await p.syncAll();
    // The assistant's log rows, dated tomorrow, reach the director's laptop: its own clock check is not moved by them.
    await registerAWorker(p.b);
    await p.syncAll();
    await issueReceipts(p.a, 1);

    // The assistant takes the books and issues a receipt dated by her PC: tomorrow.
    await moveBooksTo(p, p.b);
    await issueReceipts(p.b, 1);
    const tomorrow = await p.b.test.db
      .selectFrom("Receipt")
      .select("issueDate")
      .orderBy("numberSeq", "desc")
      .executeTakeFirstOrThrow();
    // Back on the director's laptop, a receipt dated today would go below the last one's date: refused.
    await moveBooksTo(p, p.a);
    await expect(issueReceipts(p.a, 1)).rejects.toThrow();
    // The next day it is allowed.
    p.advance({ days: 1 });
    await p.a.transact((ex, ctx) => logConsult(ex, ctx, { owner: "FOUNDATION", action: "VIEW" }));
    await issueReceipts(p.a, 1);
    const last = await p.a.test.db
      .selectFrom("Receipt")
      .select("issueDate")
      .orderBy("numberSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(last.issueDate >= tomorrow.issueDate).toBe(true);
    await p.syncAll();
    p.expectSame();
    await expectLegalNumbersUnique(p.a.test, p.b.test);
    await expectChainsVerify(p);
  });

  // What the screens show: status-and-rejoin.test.ts.
});

describe("case 4: a sync cut halfway", () => {
  it("an envelope whose answer was lost is sent again harmlessly; the mailbox stores it once", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await registerAWorker(p.a);
    p.relay.cutNext(1, (request) => request.method === "PUT" && request.path.includes("/envelopes/"));
    await expect(p.a.sync()).rejects.toThrow();
    expect(await waitingOn(p.a), "the outbox gives nothing up before the mailbox answered").toBeGreaterThan(0);
    await p.syncAll();
    p.expectSame();
    const puts = p.relay.delivered.filter(
      (request) => request.method === "PUT" && request.path.includes("/envelopes/"),
    );
    expect(new Set(puts.map((request) => request.path)).size).toBeLessThan(puts.length);
    await expectChainsVerify(p);
  });

  it(
    "a power cut while applying leaves the whole transaction applied or none of it, with its cursor",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      await p.syncAll();
      await issueReceipts(p.a, 3);
      await registerAFile(p.a);
      await p.a.sync();
      const before = (await readState(p.b.test.db, "receive"))?.cursor;
      // The power goes at the last statement of the apply transaction: writing the cursor.
      p.b.test.raw.exec(`CREATE TEMP TRIGGER "power_cut" BEFORE UPDATE ON "SyncState" WHEN NEW."key" = 'receive'
      BEGIN SELECT RAISE(ABORT, 'power cut'); END;`);
      await expect(p.b.sync()).rejects.toThrow();
      expect(await legalNumbersOf(p.b.test), "none of the transaction is here").toEqual([]);
      expect((await readState(p.b.test.db, "receive"))?.cursor).toBe(before);
      p.b.test.raw.exec(`DROP TRIGGER "power_cut"`);
      await p.syncAll();
      p.expectSame();
      expect((await legalNumbersOf(p.b.test)).length).toBe(3);
      await expectChainsVerify(p);
    },
  );

  it("a file is written only when all its parts arrived and its SHA-256 matches", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    const { saveUpload, storagePathOf } = await import("@/lib/attachments");
    const { setWorkerPhoto } = await import("@/features/people/services/worker-files");
    const { PHOTO_UPLOAD_RULE } = await import("@/lib/uploads");
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const worker = await registerAWorker(p.a);
    const bytes = new Uint8Array(4096).map((_, i) => (i * 7) % 251);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const photo = await p.a.transact((ex, ctx) =>
      saveUpload(ex, ctx, p.a.store, {
        entity: "StaffMember",
        field: "photoUrl",
        file: { name: "p.png", type: "image/png", bytes },
        rule: PHOTO_UPLOAD_RULE,
      }),
    );
    await p.a.transact((ex, ctx) => setWorkerPhoto(ex, ctx, { id: worker.id, url: photo.url }));
    await p.a.sync();
    // The part's download is cut on the assistant's laptop: nothing is written at the file's place.
    p.relay.cutNext(1, (request) => request.method === "GET" && request.path.includes("/parts/"));
    await p.b.sync().catch(() => undefined);
    const target = join(p.b.root, storagePathOf(photo.url));
    expect(existsSync(target)).toBe(false);
    await p.syncAll();
    expect(new Uint8Array(readFileSync(target))).toEqual(bytes);
    p.expectSame();
    await expectChainsVerify(p);
  });
});

describe("case 5: the internet is down", () => {
  it("each laptop works alone, its changes wait, and they go when the internet returns", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    p.relay.offline = true;
    await registerAWorker(p.a);
    await registerAFile(p.a);
    await registerAWorker(p.b);
    await expect(p.a.sync()).rejects.toBeInstanceOf(RelayOffline);
    await expect(p.b.sync()).rejects.toBeInstanceOf(RelayOffline);
    expect(await waitingOn(p.a)).toBe(2);
    expect(await waitingOn(p.b)).toBe(1);
    p.relay.offline = false;
    await p.syncAll();
    p.expectSame();
    expect(await waitingOn(p.a)).toBe(0);
    await expectChainsVerify(p);
  });

  // What the screens show: status-and-rejoin.test.ts.
});

describe("case 6: the free service is down, its daily limit reached, or the mailbox full", () => {
  it("the daily limit: refused until the reset, with when to try again; nothing is lost", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    p.relay.limitUntil = p.relay.time() + 3 * 3_600_000;
    await registerAWorker(p.a);
    const failure = await p.a.sync().then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RelayLimit);
    expect((failure as RelayLimit).retryAt).toBeGreaterThan(p.a.clock.now().getTime());
    await registerAWorker(p.b);
    p.advance({ hours: 4 });
    await p.syncAll();
    p.expectSame();
    await expectChainsVerify(p);
  });

  it("the service down: the same as offline, nothing lost", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    p.relay.down = true;
    await registerAWorker(p.a);
    await expect(p.a.sync()).rejects.toBeInstanceOf(RelayOffline);
    p.relay.down = false;
    await p.syncAll();
    p.expectSame();
    await expectChainsVerify(p);
  });

  it("a full mailbox refuses writes as FULL; nothing is lost and it goes once room is made", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    p.relay.full = true;
    await registerAWorker(p.a);
    await expect(p.a.sync()).rejects.toBeInstanceOf(RelayFull);
    expect(await waitingOn(p.a)).toBe(1);
    p.relay.full = false;
    await p.syncAll();
    p.expectSame();
    await expectChainsVerify(p);
  });

  // What the screens show: status-and-rejoin.test.ts.
});
