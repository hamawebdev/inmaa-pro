import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { BOOKS_STAY_ON_LAPTOPS, requestBooks } from "@/lib/sync/books";
import { removeDevice, SYNC_ERRORS } from "@/lib/sync/centre";
import { LONG } from "@/testing/scenarios/phone/helpers";
import { booksHolder, deviceIdOf, issueReceipts, legalNumbersOf } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync, second pass): the phone holds the books and is lost. The director removes it from laptop a;
 * a's removal (and its forced take of the books) is committed but not yet sent. The assistant removes it from laptop
 * b too. The mailbox already lists the phone as removed, so b skips the revocation, receives "everything" (which does
 * not hold a's decision yet) and takes the books as well. Both laptops then hold the books and issue the same number.
 *
 * Fix (fix-sync): a laptop that did not revoke the device itself does not decide its books before its own database
 * has applied the other laptop's removal: «sync first». Since the phone never holds the books (docs/phone/DECISION.md
 * section 6, 2026-11-02), and only a laptop removes a device, the race needs a centre whose books row names the phone
 * from before that rule: this test writes it so (review-sync's test had the phone take them through «طلب الدفاتر»).
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

describe("review: two laptops remove the same lost phone that held the books", () => {
  it("never leaves the books on two devices at once", LONG, async () => {
    const t = (trio = await createSyncTrio());
    await t.syncAll(); // every device knows the phone's row
    await expect(t.phone.transact((ex, ctx) => requestBooks(ex, ctx))).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);
    // A books row naming the phone, as a centre could have before the rule.
    await t.a.transact(async (ex, ctx) => {
      await ex
        .updateTable("SyncBooks")
        .set({ holderDeviceId: deviceIdOf(t.phone), epoch: 2, handedAt: ctx.now, updatedAt: ctx.now })
        .where("id", "=", "books")
        .execute();
    });
    await t.syncAll();
    expect(await booksHolder(t.b)).toBe(deviceIdOf(t.phone));

    // The phone is lost. a removes it (online), then loses its connection before its next round.
    await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
      deviceId: deviceIdOf(t.phone),
      reason: "ضاع الهاتف",
      lastInvoice: null,
      lastReceipt: 0,
    });
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.a));
    // Meanwhile on b, not knowing a did it, the assistant removes the phone too: refused until a's removal arrives.
    await expect(
      removeDevice(t.b.centre(), buildContext(t.b.manager, t.b.clock), {
        deviceId: deviceIdOf(t.phone),
        reason: "ضاع الهاتف",
        lastInvoice: null,
        lastReceipt: 0,
      }),
    ).rejects.toThrow(SYNC_ERRORS.syncFirst);
    // Each issues a receipt where it believes it holds the books.
    for (const laptop of [t.a, t.b]) await issueReceipts(laptop, 1).catch(() => undefined);
    await t.syncAll({ only: [t.a, t.b] });
    expect(await booksHolder(t.b)).toBe(deviceIdOf(t.a));

    const owners = new Map<string, Set<string>>();
    for (const laptop of [t.a, t.b]) {
      for (const number of await legalNumbersOf(laptop.test)) {
        const key = `${number.key} ${number.year}: ${number.seq}`;
        owners.set(key, (owners.get(key) ?? new Set()).add(number.id));
      }
    }
    expect(
      [...owners].filter(([, ids]) => ids.size > 1).map(([key]) => key),
      "a legal number issued twice",
    ).toEqual([]);
  });
});
