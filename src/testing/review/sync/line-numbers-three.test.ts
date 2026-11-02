import { afterEach, describe, expect, it } from "vitest";

import { LONG } from "@/testing/scenarios/phone/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync): the line-number repair (`settleLineClash`, apply.ts) with three devices. Each device picks
 * "the next free number" from what it holds, so two devices move two different lines to the same number; the moves
 * then clash as plain updates, which are not repaired, and are held for good.
 * `pair.test` / merge.test.ts proves the two-laptop case only.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

describe("review: three devices add a line with the same number to one document while apart", () => {
  it("converge without held changes", LONG, async () => {
    const t = (trio = await createSyncTrio());
    const file = await t.a.test.rows.insert("File", {});
    await t.syncAll();
    const fileId = file.id as string;
    const due = { fileId, seq: 1, kind: "EXTRA", dueDate: "2026-10-30", expectedAmount: 100, amount: 100 } as never;
    await t.a.test.rows.insert("PaymentDue", due);
    t.advance({ minutes: 1 });
    await t.b.test.rows.insert("PaymentDue", due);
    t.advance({ minutes: 1 });
    await t.phone.test.rows.insert("PaymentDue", due);
    await t.syncAll();

    const heldOn = async (name: "a" | "b" | "phone") =>
      (
        await t[name].test.db.selectFrom("SyncHeld").select(["tbl", "reason"]).where("resolvedAt", "is", null).execute()
      ).map((row) => `${row.tbl}: ${row.reason}`);
    expect({ a: await heldOn("a"), b: await heldOn("b"), phone: await heldOn("phone") }).toEqual({
      a: [],
      b: [],
      phone: [],
    });
    t.expectSame();
  });
});
