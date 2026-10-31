import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { detectRejoin, removeOtherLaptop } from "@/lib/sync/centre";
import { syncStatus } from "@/lib/sync/services/status";
import { upgradedFixtureCopy } from "@/testing/fixtures/1.0.0";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import {
  deviceIdOf,
  expectChainsVerify,
  expectLegalNumbersUnique,
  issueReceipts,
  LONG,
  logChainsOf,
  moveBooksTo,
  registerAWorker,
} from "./helpers";

/**
 * What the bar and Settings › المزامنة show for the cases of DECISION section 7 (3, 5, 6, 7, 9, 11, 12), case 8
 * (a backup from before set-up), and case 9's replacement laptop.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const statusOf = (laptop: SyncLaptop) => laptop.transact((ex, ctx) => syncStatus(ex, ctx));
const roundOf = (laptop: SyncLaptop) => laptop.sync().catch((error: unknown) => error);

describe("the status the screens show", () => {
  it("synced, then «غير متصل» with how many changes wait, then synced again", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    expect(await statusOf(p.a)).toMatchObject({ state: "ON", exchange: "SYNCED", waitingCount: 0, problem: null });

    p.relay.offline = true;
    await registerAWorker(p.a);
    await registerAWorker(p.a);
    await roundOf(p.a);
    const offline = await statusOf(p.a);
    expect(offline).toMatchObject({ exchange: "OFFLINE", waitingCount: 2 });
    expect(offline.offlineSince).toBeTruthy();
    p.relay.offline = false;
    await p.syncAll();
    expect(await statusOf(p.a)).toMatchObject({ exchange: "SYNCED", waitingCount: 0 });
  });

  it("the daily limit says when it resumes; a full mailbox is danger", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    p.relay.limitUntil = p.relay.time() + 2 * 3_600_000;
    await registerAWorker(p.a);
    await roundOf(p.a);
    const limited = await statusOf(p.a);
    expect(limited.exchange).toBe("LIMIT");
    expect(limited.problems).toContain("LIMIT");
    expect(Date.parse(limited.limitRetryAt!)).toBeGreaterThan(p.a.clock.now().getTime());

    p.relay.limitUntil = null;
    p.relay.full = true;
    await roundOf(p.a);
    const full = await statusOf(p.a);
    expect(full).toMatchObject({ exchange: "FULL", problem: "FULL", severity: "danger" });
    p.relay.full = false;
    await p.syncAll();
    p.expectSame();
  });

  it("a PC more than 2 minutes from the mailbox: «ساعة هذا الحاسوب غير مضبوطة» with the difference", LONG, async () => {
    pair = await createSyncPair({ skewMs: { b: 5 * 60_000 } });
    const p = pair;
    await p.syncAll();
    const onB = await statusOf(p.b);
    expect(onB.clockWrong).toBe(true);
    expect(onB.problems).toContain("CLOCK");
    expect(Math.round((onB.clockOffsetMs ?? 0) / 60_000)).toBe(-5);
    const onA = await statusOf(p.a);
    expect(onA.clockWrong).toBe(false);
  });

  it("where the books are and since when, held changes and conflicts counted", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    const onB = await statusOf(p.b);
    expect(onB.books).toMatchObject({ holderDeviceId: deviceIdOf(p.a), heldHere: false });
    expect(onB.books!.since).toBeTruthy();
    expect(onB.books!.holderName).toBeTruthy();

    p.relay.offline = true;
    await registerAWorker(p.a, { nationalIdNumber: "109870012345678" });
    await registerAWorker(p.b, { nationalIdNumber: "109870012345678" });
    p.relay.offline = false;
    await p.syncAll();
    for (const laptop of [p.a, p.b]) {
      const status = await statusOf(laptop);
      expect(status.heldCount, `held on ${laptop.name}`).toBeGreaterThan(0);
      expect(status.problems).toContain("HELD");
    }
  });

  it("a removed laptop shows REVOKED, as danger", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    await removeOtherLaptop(p.a.centre(), buildContext(p.a.manager, p.a.clock), {
      deviceId: deviceIdOf(p.b),
      reason: "الحاسوب استُبدل",
    });
    await roundOf(p.b);
    expect(await statusOf(p.b)).toMatchObject({ exchange: "REVOKED", problem: "REVOKED", severity: "danger" });
  });

  it("a lost laptop's documents that cannot join the chain show as a legal incident, danger", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await moveBooksTo(p, p.b);
    await issueReceipts(p.b, 3);
    await p.b.sync();
    await removeOtherLaptop(p.a.centre(), buildContext(p.a.manager, p.a.clock), {
      deviceId: deviceIdOf(p.b),
      reason: "الحاسوب تعطل",
      lastInvoice: null,
      lastReceipt: 2,
    });
    await p.a.sync();
    const status = await statusOf(p.a);
    expect(status.incidentCount).toBeGreaterThan(0);
    expect(status).toMatchObject({ problem: "LEGAL_INCIDENT", severity: "danger" });
  });
});

describe("case 7: catching up after a restore", () => {
  it("shows CATCHING_UP until it has taken back what it had sent", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    const backup = p.a.test.snapshot();
    await issueReceipts(p.a, 2);
    await p.syncAll();
    await p.restore(p.a, backup);
    // The internet is down when the restored laptop starts: it cannot know, and waits; nothing is sent from it.
    p.relay.offline = true;
    await roundOf(p.a);
    p.relay.offline = false;
    await p.a.sync();
    expect((await statusOf(p.a)).exchange).not.toBe("CATCHING_UP");
    await p.syncAll();
    p.expectSame();
    expect((await issueReceipts(p.a, 1)).firstNumber).toContain("3");
    await expectChainsVerify(p);
  });
});

describe("case 8: a laptop restores a backup from before sync was set up", () => {
  it("is no longer in sync, offers to join again, and joins from the full copy", LONG, async () => {
    pair = await createSyncPair({ fixture: true });
    const p = pair;
    await registerAWorker(p.a);
    await registerAWorker(p.b);
    await p.syncAll();
    const chains = await logChainsOf(p.b.test);

    // The director restores the 1.0.0 database she had before sync was set up.
    const before = upgradedFixtureCopy();
    await p.restore(p.a, before.db);
    expect(await detectRejoin(p.a.test.db, p.a.vault)).toBe(true);
    expect(await p.a.transact((ex, ctx) => syncStatus(ex, ctx, { rejoin: true }))).toMatchObject({
      exchange: "REJOIN",
      problem: "REJOIN",
      severity: "danger",
    });

    await p.reinstall(p.a, "REJOIN");
    expect(await detectRejoin(p.a.test.db, p.a.vault)).toBe(false);
    await p.syncAll();
    p.expectSame();
    expect(await logChainsOf(p.a.test)).toEqual(await logChainsOf(p.b.test));
    expect(Object.keys(await logChainsOf(p.a.test))).toEqual(expect.arrayContaining(Object.keys(chains)));
    // It goes on: its next receipt number follows, nothing is given twice.
    await issueReceipts(p.a, 1);
    await registerAWorker(p.a);
    await p.syncAll();
    p.expectSame();
    await expectLegalNumbersUnique(p.a.test, p.b.test);
    await expectChainsVerify(p);
  });
});

describe("case 9: a replacement laptop", () => {
  it("joins with a new code and a full copy, under a new laptop id and a new log chain", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await registerAWorker(p.b);
    await p.syncAll();
    const lost = deviceIdOf(p.b);
    const lostChain = `AuditLog:${lost}`;
    await removeOtherLaptop(p.a.centre(), buildContext(p.a.manager, p.a.clock), {
      deviceId: lost,
      reason: "سُرق الحاسوب",
    });
    const replacement = await p.replace(p.b);
    const id = deviceIdOf(replacement);
    expect(id).not.toBe(lost);
    await registerAWorker(replacement);
    await registerAWorker(p.a);
    await p.syncAll();
    p.expectSame();
    const chains = await logChainsOf(p.a.test);
    expect(chains[`AuditLog:${id}`]).toBeGreaterThan(0);
    expect(chains[lostChain], "the lost laptop's log stays, closed").toBeGreaterThan(0);
    const devices = await p.a.test.db
      .selectFrom("SyncDevice")
      .select(["id", "slot", "removedAt", "replacesDeviceId"])
      .execute();
    expect(devices.find((d) => d.id === id)).toMatchObject({ slot: 1, removedAt: null, replacesDeviceId: lost });
    // The removed laptop's claims are retired: none left waiting.
    const waiting = await p.a.test.db
      .selectFrom("NumberBlock")
      .select("id")
      .where("deviceId", "=", lost)
      .where("kind", "=", "CLAIM")
      .where("answer", "is", null)
      .execute();
    expect(waiting).toEqual([]);
    await expectChainsVerify(p);
  });
});
