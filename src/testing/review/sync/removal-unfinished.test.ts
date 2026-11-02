import { afterEach, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { removeDevice } from "@/lib/sync/centre";
import { syncStatus } from "@/lib/sync/services/status";
import { deviceIdOf, LONG } from "@/testing/scenarios/sync/helpers";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";
import type { SyncLaptop } from "@/testing/sync/pair";

/**
 * fix-sync (coordinator's follow-up): «إزالة غير مكتملة». A device the mailbox refuses while the replacement of the
 * centre key its removal owes was never recorded (the remover's laptop died between the two) shows as a danger on
 * every device's status; removing it again from a laptop finishes it, and the problem goes.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

const statusOf = (device: SyncLaptop) => syncStatus(device.test.db, buildContext(device.manager, device.clock));

it("a removal whose key replacement is owed shows as unfinished until it is done again", LONG, async () => {
  const t = (trio = await createSyncTrio());
  await t.syncAll();
  const phone = deviceIdOf(t.phone);
  // Laptop b's removal reached the mailbox, then b went down before it replaced the key.
  for (const object of t.relay.env.MAILBOX.objects.values()) {
    object.sql.exec(
      `UPDATE device SET removedAt = ?, removedBy = ?, keyDue = 1 WHERE id = ? AND removedAt IS NULL`,
      t.relay.time(),
      deviceIdOf(t.b),
      phone,
    );
  }
  t.advance({ minutes: 6 }); // the devices are listed every five minutes
  await t.a.sync();
  const before = await statusOf(t.a);
  expect(before.problems).toContain("REMOVAL_UNFINISHED");
  expect(before.severity).toBe("danger");
  expect(before.devices.find((device) => device.id === phone)?.removalUnfinished).toBe(true);

  // The director removes it again from laptop a: the key is replaced, and the problem goes.
  await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), { deviceId: phone, reason: "ضاع الهاتف" });
  expect((await statusOf(t.a)).problems).not.toContain("REMOVAL_UNFINISHED");
  t.advance({ minutes: 6 });
  await t.syncAll({ only: [t.a, t.b] });
  for (const device of [t.a, t.b]) expect((await statusOf(device)).problems).not.toContain("REMOVAL_UNFINISHED");
});
