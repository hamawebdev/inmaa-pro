import { afterEach, expect, it } from "vitest";

import { answerBooksRequest, BOOKS_STAY_ON_LAPTOPS, requestBooks } from "@/lib/sync/books";
import { LONG } from "@/testing/scenarios/phone/helpers";
import { booksHolder, deviceIdOf, issueReceipts } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync): the books handed to the phone by laptop a while laptop b, which has not yet seen the
 * hand-over, removes the phone: the books end on a removed device.
 *
 * Fix (fix-sync): the phone never holds the books (docs/phone/DECISION.md section 6, 2026-11-02), and a removal
 * receives everything first; between the two laptops the race cannot happen (only a laptop removes, and it applies
 * the hand-over it receives before deciding). So this test now checks that the books can never reach the phone: its
 * request is refused, and a request from it in the database (written before the rule) is never answered. The
 * «استرجاع الدفاتر» path for a removed holder is kept for a centre that had one.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

it("the books never go to the phone, so they never end on a removed one", LONG, async () => {
  const t = (trio = await createSyncTrio());
  await t.syncAll();
  await expect(t.phone.transact((ex, ctx) => requestBooks(ex, ctx))).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);

  // A request from the phone already in the books row (written before the rule): the holder does not hand over.
  await t.a.transact(async (ex, ctx) => {
    await ex
      .updateTable("SyncBooks")
      .set({ requestedByDeviceId: deviceIdOf(t.phone), requestedAt: ctx.now, updatedAt: ctx.now })
      .where("id", "=", "books")
      .execute();
    expect(await answerBooksRequest(ex, ctx)).toEqual({ handedTo: null });
  });
  await t.syncAll();
  for (const device of t.devices()) expect(await booksHolder(device)).toBe(deviceIdOf(t.a));
  await issueReceipts(t.a, 1);
  await expect(issueReceipts(t.phone, 1)).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);
});
