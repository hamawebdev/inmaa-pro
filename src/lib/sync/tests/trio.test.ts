import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { buildContext } from "@/lib/service/context";
import { BOOKS_ON_DIRECTORS_LAPTOP, BOOKS_ON_DIRECTORS_PHONE, requestBooks } from "@/lib/sync/books";
import { makeFullCopy, removeDevice, SYNC_ERRORS } from "@/lib/sync/centre";
import { thisDeviceKind } from "@/lib/sync/device";
import { makesFullCopy } from "@/lib/sync/round";
import { syncStatus } from "@/lib/sync/services/status";
import { issueReceipts, registerAWorker } from "@/testing/scenarios/sync/helpers";
import type { SyncLaptop } from "@/testing/sync/pair";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

/**
 * The engine with three devices (docs/phone/DECISION.md sections 2, 3 and 6): the director's phone pairs on a
 * phone's code, its changes reach both laptops and theirs reach it, the books move to it and back, it never makes
 * the full copy, and it is removed like a lost laptop. The verifier's scenarios (src/testing/scenarios/phone/) take
 * every case of the sync decision further; these prove the harness and the engine's own rules.
 */
const LONG = { timeout: 300_000 };

let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

const idOf = (device: SyncLaptop) => device.vault.data!.deviceId;

async function holder(device: SyncLaptop) {
  const row = await device.test.db.selectFrom("SyncBooks").select("holderDeviceId").executeTakeFirst();
  return row?.holderDeviceId ?? null;
}

describe("three devices", () => {
  it("pair the phone in slot 2; a change on any device reaches the other two", LONG, async () => {
    const t = (trio = await createSyncTrio());
    expect(t.phone.vault.data).toMatchObject({ slot: 2, kind: "PHONE" });
    expect(await thisDeviceKind(t.phone.test.db)).toBe("PHONE");
    expect(await thisDeviceKind(t.a.test.db)).toBe("LAPTOP");
    expect(await thisDeviceKind(t.b.test.db)).toBe("LAPTOP");

    await registerAWorker(t.phone, { lastName: "حمدي", firstName: "رضا", nationalIdNumber: "109870000000000001" });
    await registerAWorker(t.b, { lastName: "بوزيد", firstName: "سارة", nationalIdNumber: "109870000000000002" });
    await t.syncAll();
    t.expectSame();
    for (const device of t.devices()) {
      const names = await device.test.db.selectFrom("StaffMember").select("lastName").orderBy("lastName").execute();
      expect(names.map((row) => row.lastName)).toEqual(expect.arrayContaining(["حمدي", "بوزيد"]));
      expect((await verifyChains(device.test.db)).ok).toBe(true);
    }

    const status = await syncStatus(t.a.test.db, buildContext(t.a.manager, t.a.clock));
    expect(status.devices.map((device) => [device.slot, device.kind, device.isThis])).toEqual([
      [0, "LAPTOP", true],
      [1, "LAPTOP", false],
      [2, "PHONE", false],
    ]);
    expect(status.devices.every((device) => device.waitingFromIt === 0)).toBe(true);
    expect((await syncStatus(t.phone.test.db, buildContext(t.phone.manager, t.phone.clock))).thisDevice).toMatchObject({
      slot: 2,
      kind: "PHONE",
    });
  });

  it(
    "refuse a phone on a laptop's code, a laptop on the phone's, a second phone, and pairing from the phone",
    LONG,
    async () => {
      const t = (trio = await createSyncTrio({ joined: { b: false, phone: false } }));
      const laptopCode = await t.code("LAPTOP");
      t.assistantId = laptopCode.accountId;
      await expect(t.joinWith(t.phone, laptopCode.code, "PHONE")).rejects.toThrow(SYNC_ERRORS.codeForLaptop);
      const phoneCode = await t.code("PHONE");
      await expect(t.joinWith(t.b, phoneCode.code, "LAPTOP")).rejects.toThrow(SYNC_ERRORS.codeForPhone);
      // The refusals left both codes unspent: each device joins with its own.
      await t.joinWith(t.b, laptopCode.code, "LAPTOP");
      await t.joinWith(t.phone, phoneCode.code, "PHONE");
      expect(t.b.vault.data).toMatchObject({ slot: 1, kind: "LAPTOP" });
      expect(t.phone.vault.data).toMatchObject({ slot: 2, kind: "PHONE" });
      await expect(t.code("PHONE")).rejects.toThrow(SYNC_ERRORS.phoneTaken);
      await expect(t.code("LAPTOP")).rejects.toThrow(SYNC_ERRORS.twoLaptops);
      // A device that is not fresh never joins.
      const stranger = await t.fresh("stranger");
      await registerAWorker(stranger, { lastName: "غريب", firstName: "عمل", nationalIdNumber: "109870000000000009" });
      await expect(t.joinWith(stranger, phoneCode.code, "PHONE")).rejects.toThrow(SYNC_ERRORS.hasWork);
      await t.syncAll();
      await expect(t.code("LAPTOP", t.phone)).rejects.toThrow(SYNC_ERRORS.phonePairs);
      t.expectSame();
    },
  );

  it("move the books to the phone and back; each refusal says where they are", LONG, async () => {
    const t = (trio = await createSyncTrio());
    await expect(issueReceipts(t.phone)).rejects.toThrow(BOOKS_ON_DIRECTORS_LAPTOP);
    await t.phone.transact((ex, ctx) => requestBooks(ex, ctx));
    await t.syncAll();
    expect(await holder(t.a)).toBe(idOf(t.phone));
    await issueReceipts(t.phone, 2);
    await expect(issueReceipts(t.a)).rejects.toThrow(BOOKS_ON_DIRECTORS_PHONE);
    await expect(issueReceipts(t.b)).rejects.toThrow(BOOKS_ON_DIRECTORS_PHONE);
    // While the phone holds the books, the director's laptop makes the full copy; the phone never does.
    expect(await makesFullCopy(t.a.env())).toBe(true);
    expect(await makesFullCopy(t.phone.env())).toBe(false);
    await expect(makeFullCopy(t.phone.env())).rejects.toThrow("a phone never makes the full copy");

    await t.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await t.syncAll();
    expect(await holder(t.b)).toBe(idOf(t.b));
    await issueReceipts(t.b, 1);
    await t.syncAll();
    t.expectSame();
    for (const device of t.devices()) {
      const receipts = await device.test.db.selectFrom("Receipt").select("number").orderBy("numberSeq").execute();
      expect(receipts).toHaveLength(3);
      expect(new Set(receipts.map((row) => row.number)).size).toBe(3);
      expect((await verifyChains(device.test.db)).ok).toBe(true);
    }
  });

  it(
    "remove the phone (case 9): its token refused, the key replaced, and a new phone joins in slot 2",
    LONG,
    async () => {
      const t = (trio = await createSyncTrio());
      const lost = idOf(t.phone);
      await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), { deviceId: lost, reason: "هاتف ضائع" });
      await expect(t.phone.sync()).rejects.toMatchObject({ kind: "revoked" });
      // The assistant's laptop was not the remover: it takes the new key from the mailbox and goes on.
      await registerAWorker(t.b, { lastName: "بلعيد", firstName: "نور", nationalIdNumber: "109870000000000004" });
      await t.syncAll({ only: [t.a, t.b] });
      expect(t.b.vault.data!.keyRing.current).toBe(t.a.vault.data!.keyRing.current);
      t.expectSame([t.a, t.b]);
      const replacement = await t.replace(t.phone);
      expect(replacement.vault.data).toMatchObject({ slot: 2, kind: "PHONE" });
      expect(idOf(replacement)).not.toBe(lost);
      await registerAWorker(replacement, {
        lastName: "سعيدي",
        firstName: "أمين",
        nationalIdNumber: "109870000000000003",
      });
      await t.syncAll();
      t.expectSame();
      const devices = await t.b.test.db.selectFrom("SyncDevice").select(["id", "slot", "kind", "removedAt"]).execute();
      expect(devices.find((device) => device.id === lost)).toMatchObject({ slot: 2, kind: "PHONE" });
      expect(devices.find((device) => device.id === lost)?.removedAt).not.toBeNull();
      expect(
        devices
          .filter((device) => device.removedAt === null)
          .map((device) => device.slot)
          .sort(),
      ).toEqual([0, 1, 2]);
    },
  );
  it("hand each new key on to a laptop away across two removals", LONG, async () => {
    const t = (trio = await createSyncTrio());
    const first = t.a.vault.data!.keyRing.current;
    // b is off. The phone is lost and removed from a; its replacement joins, and is lost and removed in turn.
    await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), { deviceId: idOf(t.phone), reason: "ضاع" });
    await t.replace(t.phone);
    await t.syncAll({ only: [t.a, t.phone] });
    await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
      deviceId: idOf(t.phone),
      reason: "ضاع مرة أخرى",
    });
    const third = t.a.vault.data!.keyRing.current;
    expect(third).not.toBe(first);
    await registerAWorker(t.a, { lastName: "عمراني", firstName: "ليلى", nationalIdNumber: "109870000000000005" });
    // b comes back: it follows both rotations, sends under the newest key, and reads what a sealed under it.
    expect(t.b.vault.data!.keyRing.current).toBe(first);
    await registerAWorker(t.b, { lastName: "زروقي", firstName: "مراد", nationalIdNumber: "109870000000000006" });
    await t.syncAll({ only: [t.a, t.b] });
    expect(t.b.vault.data!.keyRing.current).toBe(third);
    expect(Object.keys(t.b.vault.data!.keyRing.keys)).toHaveLength(3);
    t.expectSame([t.a, t.b]);
  });
});
