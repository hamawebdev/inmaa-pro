import { afterEach, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { JOINING } from "@/lib/sync/books";
import { removeDevice } from "@/lib/sync/centre";
import { LONG } from "@/testing/scenarios/phone/helpers";
import { deviceIdOf, registerAWorker } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * Review (review-sync): a phone replaced into slot 2 numbers in the third of the phone it replaces. The old phone's
 * last envelope was on the mailbox before its token was revoked, but laptop a removed it and made the replacement's
 * full copy without receiving first (`removeDevice`, `pairDevice`: send, then copy). The new phone, before its first
 * round (offline after joining), takes a fallback block in its third "above every block it knows": the very block the
 * old phone numbered in. When the old phone's envelope is applied, two workers carry one number.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

it("a replacement phone never gives a number its predecessor gave", LONG, async () => {
  const t = (trio = await createSyncTrio());
  await t.syncAll();
  // The old phone registers a worker (a fallback block in its third) and sends it; a has not received it yet.
  const old = await registerAWorker(t.phone, { nationalIdNumber: "109870000000000301" });
  await t.phone.sync();
  // The phone is lost the same evening. The director removes it from a and pairs the new phone.
  await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
    deviceId: deviceIdOf(t.phone),
    reason: "ضاع الهاتف",
  });
  const replacement = await t.replace(t.phone, { firstRound: false });
  // Fix (fix-sync): the removal and the pairing received first, so the copy the new phone started from holds the
  // old phone's worker and the block it numbered in.
  const inCopy = await replacement.test.db.selectFrom("StaffMember").select("id").where("id", "=", old.id).execute();
  expect(inCopy).toHaveLength(1);
  // Offline after joining, the director registers a worker on the new phone: refused until its first sync reached
  // the mailbox's newest envelope (review-sync's test expected the registration to go through offline).
  await expect(registerAWorker(replacement, { nationalIdNumber: "109870000000000302" })).rejects.toThrow(JOINING);
  await replacement.sync();
  const fresh = await registerAWorker(replacement, { nationalIdNumber: "109870000000000302" });
  await t.syncAll();

  const numbers = await t.a.test.db
    .selectFrom("StaffMember")
    .select(["id", "number"])
    .where("id", "in", [old.id, fresh.id])
    .execute();
  const onReplacement = await replacement.test.db
    .selectFrom("StaffMember")
    .select(["id", "number"])
    .where("id", "in", [old.id, fresh.id])
    .execute();
  const all = [...numbers, ...onReplacement];
  const byNumber = new Map<string, Set<string>>();
  for (const row of all) byNumber.set(row.number, (byNumber.get(row.number) ?? new Set()).add(row.id));
  expect(
    [...byNumber].filter(([, ids]) => ids.size > 1).map(([number]) => number),
    "a worker number given to two workers",
  ).toEqual([]);
});
