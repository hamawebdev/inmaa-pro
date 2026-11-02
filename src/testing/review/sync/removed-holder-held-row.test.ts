import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { buildContext } from "@/lib/service/context";
import { BOOKS_HELD_HERE, requestBooks } from "@/lib/sync/books";
import { removeDevice } from "@/lib/sync/centre";
import { resolveHeld } from "@/lib/sync/services/conflicts";
import { withStampedTransaction } from "@/lib/sync/session";
import { LONG } from "@/testing/scenarios/phone/helpers";
import { booksHolder, deviceIdOf, registerAFile, registerAWorker } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";
// After the helpers: Money's payments module before Clients' files trips an import cycle (see helpers.ts).
import { recordPayment } from "@/features/money/services/payments";

/**
 * Review (review-sync, second pass): finding 2 again, through the removal instead of the hand-over. `requireBooks`
 * waited for held books-table rows of a device still in the centre only: a removed device's held legal row was taken
 * for a legal incident that "never joins the chain". Yet another device may already have applied that very row (its
 * parent was not held there). The device that takes the books writes the next Payment on a chain one row short, and
 * the chain forks across the centre.
 *
 * Fix (fix-sync): a books' row held for a missing parent (or behind another held change) holds the books back and
 * refuses the forced take, whoever sent it; only a removed device's row the chain refused after the take is a legal
 * incident. review-sync's test had the phone hold the books; since the phone never does (docs/phone/DECISION.md
 * section 6, 2026-11-02), the lost holder is laptop b, and the clash that holds the payment's parent on a is between a
 * and the phone.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

describe("review: the books taken from a removed holder whose last payment is held on the taker", () => {
  it("does not fork the Payment chain", LONG, async () => {
    const t = (trio = await createSyncTrio());
    await t.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await t.syncAll();
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.b));
    const file = await registerAFile(t.b);
    await t.syncAll();

    // Case 12 while apart: one national number on a and on the phone; the phone's goes first, so a holds it.
    const nin = "109870000000000555";
    await registerAWorker(t.a, { lastName: "حمدي", firstName: "رضا", nationalIdNumber: nin });
    const onPhone = await registerAWorker(t.phone, { lastName: "حمدي", firstName: "رضا", nationalIdNumber: nin });
    await t.phone.sync();
    await t.b.sync();
    await t.a.sync();

    // The assistant records a transfer on b, collected by the phone's worker, and it reaches the mailbox.
    await t.b.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.fileId,
        receivedDate: ctx.today,
        method: "BANK_TRANSFER",
        amount: 1_000_00,
        reference: "VIR-1",
        collectorKind: "EMPLOYEE",
        collectorStaffId: onPhone.id,
      }),
    );
    await t.b.sync();
    await t.phone.sync(); // the phone applies b's payment: chainSeq 1 there

    // b is lost; a removes it, receiving everything first (the payment is held on a): the take is refused.
    const remove = () =>
      removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
        deviceId: deviceIdOf(t.b),
        reason: "سُرق الحاسوب",
        lastInvoice: null,
        lastReceipt: null,
      });
    await expect(remove()).rejects.toThrow(BOOKS_HELD_HERE);
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.b));

    // The office settles the clash on a; the payment applies there; the removal is done again and takes the books.
    const worker = await t.a.test.db
      .selectFrom("SyncHeld")
      .select("id")
      .where("tbl", "=", "StaffMember")
      .where("rowId", "=", onPhone.id)
      .where("resolvedAt", "is", null)
      .executeTakeFirstOrThrow();
    await withStampedTransaction(t.a.test.db, buildContext(t.a.manager, t.a.clock), (ex, ctx) =>
      resolveHeld(ex, ctx, { heldId: worker.id, action: "SET_ASIDE", reason: "مسجّل مرتين" }),
    );
    await t.syncAll({ only: [t.a, t.phone] });
    await remove();
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.a));
    await t.a.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.fileId,
        receivedDate: ctx.today,
        method: "BANK_TRANSFER",
        amount: 2_000_00,
        reference: "VIR-2",
      }),
    );
    await t.syncAll({ only: [t.a, t.phone] });

    const chainSeqs = new Map<number, Set<string>>();
    for (const device of [t.a, t.phone]) {
      for (const row of await device.test.db.selectFrom("Payment").select(["id", "chainSeq"]).execute()) {
        chainSeqs.set(row.chainSeq, (chainSeqs.get(row.chainSeq) ?? new Set()).add(row.id));
      }
    }
    expect(
      [...chainSeqs].filter(([, ids]) => ids.size > 1).map(([seq]) => seq),
      "two payments share a chainSeq across devices",
    ).toEqual([]);
    for (const device of [t.a, t.phone]) expect((await verifyChains(device.test.db)).ok).toBe(true);
  });
});
