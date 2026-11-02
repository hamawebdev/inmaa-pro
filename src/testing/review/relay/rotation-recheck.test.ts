import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { removeDevice } from "@/lib/sync/centre";
import type { SyncLaptop } from "@/testing/sync/pair";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * review-relay, re-review of fix-relay: the mailbox lets only the laptop that removed a device record the key's
 * replacement (ROTATION_NOT_DUE otherwise), and `rotateCentreKey` takes ROTATION_NOT_DUE as "nothing due from this
 * laptop" and returns the ring unchanged. So a removal that the mailbox revoked from one laptop, and that is then
 * finished from the other laptop, completes without ever replacing the key the removed device holds.
 */
const LONG = { timeout: 300_000 };
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});
const idOf = (device: SyncLaptop) => device.vault.data!.deviceId;

describe("review: a removal started on one laptop and finished on the other", () => {
  it("still replaces the centre key", LONG, async () => {
    const t = (trio = await createSyncTrio());
    await t.syncAll();
    const before = t.a.vault.data!.keyRing.current;

    // On laptop a the director removes the stolen phone: the mailbox revokes it, then a loses its connection (or
    // its battery) before the key is replaced. She finishes the removal on laptop b, signed in as herself.
    const aMailbox = t.relay.client({
      centreId: t.a.vault.data!.centreId,
      deviceId: idOf(t.a),
      token: t.a.vault.data!.token,
    });
    await aMailbox.removeDevice(idOf(t.phone));
    await removeDevice(t.b.centre(), buildContext(t.b.manager, t.b.clock), { deviceId: idOf(t.phone), reason: "سُرق" });

    // Expected: the key in force is no longer the one the phone holds (or the removal says it is not finished).
    const keys = await aMailbox.keys();
    expect(keys.current).not.toBeNull();
    expect(t.b.vault.data!.keyRing.current).not.toBe(before);
  });
});
