import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { buildContext } from "@/lib/service/context";
import { removeOtherLaptop } from "@/lib/sync/centre";
import { RelayRevoked } from "@/lib/sync/relay";
import { writeState } from "@/lib/sync/state";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import {
  booksHolder,
  deviceIdOf,
  expectChainsVerify,
  expectLegalNumbersUnique,
  issueReceipts,
  LONG,
  logChainsOf,
  registerAWorker,
} from "./helpers";

/** DECISION section 7, cases 7, 8 and 9. */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const workerNumbers = async (p: SyncPair, side: "a" | "b") =>
  (await p[side].test.db.selectFrom("StaffMember").select(["id", "number"]).where("kind", "=", "WORKER").execute()).map(
    (row) => row.number,
  );

describe("case 7: one laptop restores a backup", () => {
  it(
    "it takes back what it had sent after the backup and the other's, then goes on: no number given twice",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      await registerAWorker(p.a);
      await issueReceipts(p.a, 1);
      await p.syncAll();
      const backup = p.a.test.snapshot();
      const logBefore = await logChainsOf(p.a.test);

      // After the backup: the director's laptop issues receipts 2 and 3 and registers workers; the assistant works too.
      await issueReceipts(p.a, 2);
      await registerAWorker(p.a);
      await registerAWorker(p.a);
      await registerAWorker(p.b);
      await p.syncAll();
      const expected = await logChainsOf(p.b.test);

      // The director's disk fails; she restores yesterday's backup.
      await p.restore(p.a, backup);
      expect(await logChainsOf(p.a.test)).toEqual(logBefore);
      const round = await p.a.sync();
      expect(round.caughtUp, "the restored laptop caught up before anything else").toBe(true);
      await p.syncAll();
      p.expectSame();
      expect(await logChainsOf(p.a.test)).toEqual(await logChainsOf(p.b.test));
      expect(Object.keys(await logChainsOf(p.a.test)).sort()).toEqual(Object.keys(expected).sort());

      // It goes on: its invoices, its log chain and its blocks continue as they were.
      expect(await booksHolder(p.a)).toBe(deviceIdOf(p.a));
      const next = await issueReceipts(p.a, 1);
      expect(next.firstNumber).toContain("4");
      const before = await workerNumbers(p, "a");
      await registerAWorker(p.a);
      const after = await workerNumbers(p, "a");
      expect(new Set(after).size, "no worker number given twice after the restore").toBe(after.length);
      expect(after.length).toBe(before.length + 1);
      await p.syncAll();
      p.expectSame();
      await expectLegalNumbersUnique(p.a.test, p.b.test);
      await expectChainsVerify(p);
    },
  );

  it("without internet, nothing numbered can be given on the restored laptop before it caught up", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await registerAWorker(p.a);
    await p.syncAll();
    const backup = p.a.test.snapshot();
    await issueReceipts(p.a, 2);
    for (let i = 0; i < 3; i++) await registerAWorker(p.a);
    await p.syncAll();

    await p.restore(p.a, backup);
    // What the program's start does after a restore (src/server/sync.ts, prepareSync): the laptop must catch up first.
    await writeState(p.a.test.db, "catchUp", {
      reason: "RESTORED",
      since: p.a.clock.now().toISOString(),
      done: 0,
      total: null,
    });
    p.relay.offline = true;
    await p.a.sync().catch(() => undefined);
    // The gate keeps everyone out but the manager, who signs in only to take the laptop out of sync. Whatever reaches
    // a service meanwhile (the manager past the gate, a screen left open) must not give again a number the mailbox
    // already holds: receipts 1 and 2, and the three workers' numbers, were given after this backup.
    await expect(issueReceipts(p.a, 1), "a receipt number given twice").rejects.toThrow();
    await expect(registerAWorker(p.a), "a worker number given twice").rejects.toThrow();

    p.relay.offline = false;
    await p.syncAll();
    p.expectSame();
    await expectLegalNumbersUnique(p.a.test, p.b.test);
    await expectChainsVerify(p);
  });
});

// Case 8: status-and-rejoin.test.ts.

describe("case 9: a laptop is lost or replaced", () => {
  it("the manager removes it with a typed reason: token revoked, key replaced, its blocks retired", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await registerAWorker(p.b);
    await p.syncAll();
    // The assistant's laptop works on alone and claims its next blocks; the director's laptop has not answered them.
    for (let i = 0; i < 9; i++) await registerAWorker(p.b);
    await p.b.sync();
    const ringBefore = p.a.vault.data!.keyRing.current;
    const ctx = buildContext(p.a.manager, p.a.clock);

    await expect(removeOtherLaptop(p.a.centre(), ctx, { deviceId: deviceIdOf(p.b), reason: "  " })).rejects.toThrow(
      "A reason is required.",
    );
    await removeOtherLaptop(p.a.centre(), buildContext(p.a.manager, p.a.clock), {
      deviceId: deviceIdOf(p.b),
      reason: "الحاسوب ضاع في التنقل",
    });
    expect(p.a.vault.data!.keyRing.current, "the centre key was replaced").not.toBe(ringBefore);
    const device = await p.a.test.db
      .selectFrom("SyncDevice")
      .selectAll()
      .where("id", "=", deviceIdOf(p.b))
      .executeTakeFirstOrThrow();
    expect(device.removedAt).not.toBeNull();
    expect(device.removedReason).toBe("الحاسوب ضاع في التنقل");
    await expect(p.b.sync()).rejects.toBeInstanceOf(RelayRevoked);
    // Its open blocks are retired: none of its numbers is given again by the director's laptop.
    const open = await p.a.test.db
      .selectFrom("NumberBlock")
      .select(["id", "kind", "answer"])
      .where("deviceId", "=", deviceIdOf(p.b))
      .where("kind", "=", "CLAIM")
      .where("answer", "is", null)
      .execute();
    expect(open, "no claim of the removed laptop is left unanswered").toEqual([]);
    for (let i = 0; i < 12; i++) await registerAWorker(p.a);
    const all = [...(await workerNumbers(p, "a")), ...(await workerNumbers(p, "b"))];
    const byNumber = new Map<string, number>();
    for (const number of all) byNumber.set(number, (byNumber.get(number) ?? 0) + 1);
    const onB = new Set(await workerNumbers(p, "b"));
    const onA = new Set(await workerNumbers(p, "a"));
    for (const number of onA) {
      // A number on both laptops is the same worker (synced before the loss), never two.
      if (onB.has(number)) expect(byNumber.get(number)).toBe(2);
    }
    expect((await verifyChains(p.a.test.db)).ok).toBe(true);
    // The director's log records the removal with her reason.
    const entry = await p.a.test.db
      .selectFrom("AuditLog")
      .select(["reason", "entity"])
      .where("entity", "=", "SyncDevice")
      .where("entityId", "=", deviceIdOf(p.b))
      .where("action", "=", "STATUS_CHANGE")
      .executeTakeFirst();
    expect(entry?.reason).toBe("الحاسوب ضاع في التنقل");
  });

  // The replacement laptop: status-and-rejoin.test.ts.
});

// Case 9's books taken from a lost laptop with a LOST_DEVICE gap: legal-numbers.test.ts.
