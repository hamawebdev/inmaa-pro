import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { BOOKS_STAY_ON_LAPTOPS, requestBooks } from "@/lib/sync/books";
import { removeDevice } from "@/lib/sync/centre";
import { LONG } from "@/testing/scenarios/phone/helpers";
import { booksHolder, deviceIdOf, issueReceipts, legalNumbersOf } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync): the books taken from a "lost" device on a stale view. Two devices then hold the books at once
 * and issue the same receipt number.
 *
 * Fix (fix-sync): a removal first applies everything the removed device put on the mailbox. review-sync's test had
 * the phone take the books, hand them to b, and laptop a remove the phone on a stale view; since the phone never
 * holds the books (docs/phone/DECISION.md section 6, 2026-11-02), the stale view is now laptop a's of laptop b: b holds
 * the books, issues a receipt and sends it, and a, not having synced, removes b declaring the last receipt it knew.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

describe("review: the books taken from a lost holder on a stale view", () => {
  it("never lets two devices issue the same receipt number", LONG, async () => {
    const t = (trio = await createSyncTrio());
    await expect(t.phone.transact((ex, ctx) => requestBooks(ex, ctx))).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);
    await t.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await t.syncAll();
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.b));
    await issueReceipts(t.b, 2);
    await t.syncAll();

    // b issues receipt 3 and sends it. Laptop a has not synced since.
    await issueReceipts(t.b, 1);
    await t.b.sync();

    // b is then lost. The director removes it from laptop a, declaring the last receipt he knows of (2).
    await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
      deviceId: deviceIdOf(t.b),
      reason: "سُرق الحاسوب",
      lastInvoice: null,
      lastReceipt: 2,
    });
    // a applied b's receipt 3 before it took the books: its next receipt is 4.
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.a));
    const next = await issueReceipts(t.a, 1);
    expect(next.firstNumber).toContain("4");
    await t.syncAll({ only: [t.a, t.phone] });

    // Receipt 3/year must be one document across the centre.
    const owners = new Map<string, Set<string>>();
    for (const device of [t.a, t.phone]) {
      for (const number of await legalNumbersOf(device.test)) {
        const key = `${number.key} ${number.year}: ${number.seq}`;
        owners.set(key, (owners.get(key) ?? new Set()).add(number.id));
      }
    }
    const twice = [...owners].filter(([, ids]) => ids.size > 1).map(([key]) => key);
    expect(twice, "a legal number issued as two different documents").toEqual([]);
  });
});
