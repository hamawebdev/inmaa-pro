import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { buildContext } from "@/lib/service/context";
import { BOOKS_ARRIVING, requestBooks } from "@/lib/sync/books";
import { resolveHeld } from "@/lib/sync/services/conflicts";
import { withStampedTransaction } from "@/lib/sync/session";
import { LONG } from "@/testing/scenarios/phone/helpers";
import { booksHolder, deviceIdOf, registerAFile, registerAWorker } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";
// After the helpers: Money's payments module before Clients' files trips an import cycle (see helpers.ts).
import { recordPayment } from "@/features/money/services/payments";

/**
 * Review (review-sync): a legal row of the books' holder is held on the device that then takes the books (its
 * parent row was held there: case 12, the same national number registered on two devices). `requireBooks` checks
 * only the invoice and receipt counters, so the new holder writes the next Payment on a chain that is one row short:
 * two payments with one chainSeq, the legal chain forks and the devices never converge.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

describe("review: the books handed to a device that holds a legal row of the holder's", () => {
  it("does not fork the Payment chain", LONG, async () => {
    const t = (trio = await createSyncTrio());
    // fix-sync (docs/phone/DECISION.md section 6, 2026-11-02): the phone never holds the books, so the holder whose
    // payment is held on a is the assistant's laptop b (review-sync's test had the phone hold them), and the clash
    // that holds the payment's parent on a is between a and the phone.
    // The books go to b; a contract file is registered there and reaches everyone.
    await t.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await t.syncAll();
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.b));
    const file = await registerAFile(t.b);
    await t.syncAll();

    // Case 12 while apart: the same national number registered on a and on the phone.
    const nin = "109870000000000077";
    await registerAWorker(t.a, { lastName: "حمدي", firstName: "رضا", nationalIdNumber: nin });
    const onB = await registerAWorker(t.phone, { lastName: "حمدي", firstName: "رضا", nationalIdNumber: nin });
    await t.phone.sync(); // the phone's worker goes first: b keeps it, a holds it (UNIQUE)
    await t.b.sync();
    await t.a.sync();

    // The assistant, on b, records a transfer collected by the phone's worker (any parent held on a will do).
    await t.b.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.fileId,
        receivedDate: ctx.today,
        method: "BANK_TRANSFER",
        amount: 1_000_00,
        reference: "VIR-1",
        collectorKind: "EMPLOYEE",
        collectorStaffId: onB.id,
      }),
    );
    await t.b.sync();

    // The director on laptop a asks for the books; b hands them over.
    await t.a.transact((ex, ctx) => requestBooks(ex, ctx));
    await t.a.sync(); // receives the payment: held on a (its collector is held there)
    await t.b.sync();
    await t.a.sync();
    expect(await booksHolder(t.a)).toBe(deviceIdOf(t.a));
    const held = await t.a.test.db
      .selectFrom("SyncHeld")
      .select(["tbl", "reason"])
      .where("resolvedAt", "is", null)
      .execute();
    expect(held.map((row) => row.tbl)).toContain("Payment");

    // a now holds the books and records a payment: it must not take the chainSeq of the payment it holds.
    const second = () =>
      t.a.transact((ex, ctx) =>
        recordPayment(ex, ctx, {
          fileId: file.fileId,
          receivedDate: ctx.today,
          method: "BANK_TRANSFER",
          amount: 2_000_00,
          reference: "VIR-2",
        }),
      );
    // Fix (fix-sync): refused while a holds the phone's payment back (review-sync's test let it through and looked
    // for the fork afterwards); once the office settles the clash, the payment applies and a records the next one.
    await expect(second()).rejects.toThrow(BOOKS_ARRIVING);
    const worker = await t.a.test.db
      .selectFrom("SyncHeld")
      .select("id")
      .where("tbl", "=", "StaffMember")
      .where("rowId", "=", onB.id)
      .where("resolvedAt", "is", null)
      .executeTakeFirstOrThrow();
    await withStampedTransaction(t.a.test.db, buildContext(t.a.manager, t.a.clock), (ex, ctx) =>
      resolveHeld(ex, ctx, { heldId: worker.id, action: "SET_ASIDE", reason: "مسجّل مرتين" }),
    );
    await t.syncAll();
    await second();
    await t.syncAll();

    const chainSeqs = new Map<number, Set<string>>();
    for (const device of t.devices()) {
      for (const row of await device.test.db.selectFrom("Payment").select(["id", "chainSeq"]).execute()) {
        chainSeqs.set(row.chainSeq, (chainSeqs.get(row.chainSeq) ?? new Set()).add(row.id));
      }
    }
    const forked = [...chainSeqs].filter(([, ids]) => ids.size > 1).map(([seq]) => seq);
    expect(forked, "two payments share a chainSeq across devices").toEqual([]);
    for (const device of t.devices()) expect((await verifyChains(device.test.db)).ok).toBe(true);
  });
});
