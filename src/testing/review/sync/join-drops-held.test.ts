import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { resolveHeld } from "@/lib/sync/services/conflicts";
import { withStampedTransaction } from "@/lib/sync/session";
import { LONG } from "@/testing/scenarios/phone/helpers";
import { registerAWorker } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync): a device that joins from a full copy made while the maker held a change of another device
 * never receives that change. `finishInstall` deletes `SyncHeld`, yet the copy's cursor is past the envelope that
 * carried it. When the office settles the clash on the maker, the maker and the other laptop converge; the new device
 * stays without the record for good.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

describe("review: joining from a copy made while a change was held", () => {
  it("still converges once the held change is settled", LONG, async () => {
    const t = (trio = await createSyncTrio({ joined: { phone: false } }));
    // Case 12 while apart: the same national number on b, then on a.
    const nin = "109870000000000088";
    const onB = await registerAWorker(t.b, { lastName: "بلعيد", firstName: "نور", nationalIdNumber: nin });
    t.advance({ minutes: 5 });
    await registerAWorker(t.a, { lastName: "بلعيد", firstName: "نور", nationalIdNumber: nin });
    await t.b.sync();
    await t.a.sync(); // b's worker is held on a
    await t.b.sync(); // a's worker is held on b
    const heldOnA = await t.a.test.db.selectFrom("SyncHeld").selectAll().where("resolvedAt", "is", null).execute();
    expect(heldOnA.map((row) => row.rowId)).toContain(onB.id);

    // The director pairs his phone now: its copy is a's database, with b's worker held.
    await t.joinPhone();
    await t.syncAll();

    // The office settles the clash on a: a's own record (the newer) is set aside, b's applies.
    const held = heldOnA.find((row) => row.rowId === onB.id)!;
    await withStampedTransaction(t.a.test.db, buildContext(t.a.manager, t.a.clock), (ex, ctx) =>
      resolveHeld(ex, ctx, { heldId: held.id, action: "SET_ASIDE", reason: "مسجلة مرتين" }),
    );
    await t.syncAll();

    const has = async (name: "a" | "b" | "phone") =>
      (await t[name].test.db.selectFrom("StaffMember").select("id").where("id", "=", onB.id).executeTakeFirst()) !==
      undefined;
    expect({ a: await has("a"), b: await has("b"), phone: await has("phone") }).toEqual({
      a: true,
      b: true,
      phone: true,
    });
    t.expectSame();
  });
});
