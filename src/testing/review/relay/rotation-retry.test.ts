import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { removeDevice } from "@/lib/sync/centre";
import { putRotation } from "@/lib/sync/rotation";
import { rotateKeyRing } from "@/lib/sync/crypto";
import { registerAWorker } from "@/testing/scenarios/sync/helpers";
import type { SyncLaptop } from "@/testing/sync/pair";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * review-relay: the key rotation part is named after the OLD key only, and the mailbox treats every part as
 * content-addressed ("a part stored once stays as it is"). So a second rotation away from the same key — a removal
 * retried after its answer was lost, or a part planted earlier by the device being removed — is silently not stored
 * (`existed: true`, ignored by putRotation), and the devices that stay follow to a key nobody uses.
 */
const LONG = { timeout: 300_000 };
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});
const idOf = (device: SyncLaptop) => device.vault.data!.deviceId;
const isRotationPut = (r: { method: string; path: string }) => r.method === "PUT" && r.path.includes("/parts/");

describe("review: a removal retried after the rotation part's answer was lost", () => {
  it("still hands the remover's current key on to the laptop that stays", LONG, async () => {
    const t = (trio = await createSyncTrio());
    await t.syncAll(); // (fix-relay) b may number only once it has caught up after joining (books/guard.ts)
    const ctx = () => buildContext(t.a.manager, t.a.clock);

    // The phone is lost. The director removes it from laptop a; the rotation part reaches the mailbox but the answer
    // is cut (mobile data, a timeout): the service fails before the new ring is saved. She presses «إزالة» again.
    t.relay.cutNext(1, isRotationPut);
    await expect(removeDevice(t.a.centre(), ctx(), { deviceId: idOf(t.phone), reason: "ضاع" })).rejects.toThrow();
    await removeDevice(t.a.centre(), ctx(), { deviceId: idOf(t.phone), reason: "ضاع" });

    await registerAWorker(t.a, { lastName: "عمراني", firstName: "ليلى", nationalIdNumber: "109870000000000005" });
    await registerAWorker(t.b, { lastName: "زروقي", firstName: "مراد", nationalIdNumber: "109870000000000006" });
    await t.syncAll({ only: [t.a, t.b] }).catch(() => undefined);

    // Expected: b took a's new key and both laptops hold the same data.
    expect(t.b.vault.data!.keyRing.current).toBe(t.a.vault.data!.keyRing.current);
    t.expectSame([t.a, t.b]);
  });
});

describe("review: a rotation part planted before the removal", () => {
  it("cannot replace the key the remover hands on", LONG, async () => {
    const t = (trio = await createSyncTrio());
    await t.syncAll(); // (fix-relay) b may number only once it has caught up after joining (books/guard.ts)
    // The phone (still active: stolen, not yet removed) holds the centre key and a valid token. It leaves a
    // "rotation" from the current key to a key of its own choosing.
    const phoneRing = t.phone.vault.data!.keyRing;
    const evil = await rotateKeyRing(phoneRing);
    const phoneMailbox = t.relay.client({
      centreId: t.phone.vault.data!.centreId,
      deviceId: idOf(t.phone),
      token: t.phone.vault.data!.token,
    });
    await putRotation(phoneMailbox, t.phone.vault.data!.centreId, phoneRing, evil);
    // (fix-relay) Recording it as the key in force is refused: the phone removed nobody (and a phone removes no one).
    await expect(phoneMailbox.rotateKey(evil.current, { from: phoneRing.current })).rejects.toMatchObject({
      code: "ROTATION_NOT_DUE",
    });

    // The director removes the phone, as case 9 says.
    await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), { deviceId: idOf(t.phone), reason: "سُرق" });
    await registerAWorker(t.b, { lastName: "زروقي", firstName: "مراد", nationalIdNumber: "109870000000000006" });
    await t.syncAll({ only: [t.a, t.b] }).catch(() => undefined);

    // Expected: b follows to the director's new key, never to the thief's.
    expect(t.b.vault.data!.keyRing.current).not.toBe(evil.current);
    expect(t.b.vault.data!.keyRing.current).toBe(t.a.vault.data!.keyRing.current);
  });
});
