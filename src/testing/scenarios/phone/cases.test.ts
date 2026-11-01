import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { confirmClockJump } from "@/lib/clock/sanity";
import { makeFullCopy, removeDevice } from "@/lib/sync/centre";
import { BOOKS_ELSEWHERE, booksState, requestBooks } from "@/lib/sync/books";
import { RelayOffline } from "@/lib/sync/relay";
import { NeedsFullCopy } from "@/lib/sync/round";
import { readState } from "@/lib/sync/state";
import type { SyncLaptop } from "@/testing/sync/pair";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

import {
  booksHolder,
  deviceIdOf,
  editAWorker,
  issueReceipts,
  legalNumbersOf,
  openConflicts,
  openHeld,
  registerAFile,
  registerAWorker,
} from "../sync/helpers";

import { expectConverged, LONG, moveBooksTo, openTheProgram, syncDevicesOn, waitingOn } from "./helpers";

/**
 * docs/sync/DECISION.md section 7, every case where the director's phone, as a third device, changes the outcome
 * (docs/phone/DECISION.md sections 2 and 6). Each test ends with the three copies holding the same shared rows, their
 * chains whole and no legal number twice.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

const DAY_MS = 86_400_000;

/** The laptops work every day (one logged operation each) and sync; the phone stays in a drawer. */
async function laptopsWorkAlone(t: SyncTrio, days: number, step = 1): Promise<void> {
  for (let day = 0; day < days; day += step) {
    t.advance({ days: step });
    for (const laptop of [t.a, t.b]) await openTheProgram(laptop);
    await t.syncAll({ only: [t.a, t.b] });
  }
}

const receiptSeqs = async (device: SyncLaptop) =>
  (await legalNumbersOf(device.test))
    .filter((n) => n.key === "RECEIPT")
    .map((n) => n.seq)
    .sort((x, y) => x - y);

const envelopesOnMailbox = (t: SyncTrio) => {
  let n = 0;
  for (const object of t.relay.env.MAILBOX.objects.values()) {
    n += Number(object.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM envelope`).toArray()[0]?.n ?? 0);
  }
  return n;
};

describe("case 1: the phone and a laptop change the same record while apart", () => {
  it(
    "different fields are both kept; the same field: the later stamp wins on all three, the other listed",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      const worker = await registerAWorker(t.a, { lastName: "قاسمي", firstName: "ليلى" });
      await t.syncAll();

      // The director, out of the office without network, edits her address and phone on his phone; the assistant
      // edits her phone five minutes later on her laptop.
      await editAWorker(t.phone, worker, { address: "حي 500 مسكن، عين البيضاء", phone: "0770000003" });
      t.advance({ minutes: 5 });
      await editAWorker(t.b, worker, { phone: "0770000004" });
      await t.syncAll({ only: [t.a, t.b] });
      await t.syncAll();

      for (const device of t.devices()) {
        const row = await device.test.db
          .selectFrom("StaffMember")
          .select(["phone", "address"])
          .where("id", "=", worker.id)
          .executeTakeFirstOrThrow();
        expect(row.address, `the phone's field is kept on ${device.name}`).toBe("حي 500 مسكن، عين البيضاء");
        expect(row.phone.replace(/\s/g, ""), `the later change wins on ${device.name}`).toBe("0770000004");
      }
      const listed = (await openConflicts(t.phone)).filter((row) => row.tbl === "StaffMember" && row.col === "phone");
      const listedOnA = (await openConflicts(t.a)).filter((row) => row.tbl === "StaffMember" && row.col === "phone");
      expect(listed.length + listedOnA.length, "the value that lost is kept in a conflict list").toBeGreaterThan(0);
      await expectConverged(t);
    },
  );
});

describe("case 2: the phone stays off for weeks", () => {
  it(
    "the mailbox keeps what the phone has not applied, even past 90 days; it sends its own first, then catches up",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await t.syncAll();
      // The director typed a worker on his phone just before leaving it in a drawer.
      const his = await registerAWorker(t.phone, { lastName: "زروال", firstName: "منيرة" });

      // A hundred days of the office's work on the two laptops; the books' laptop refreshes the full copy.
      for (let week = 0; week < 15; week++) {
        await registerAFile(t.a);
        await issueReceipts(t.a, 1);
        await registerAWorker(t.b);
        await laptopsWorkAlone(t, 7, 7);
      }
      await makeFullCopy(t.a.env());
      t.advance({ days: 1 });
      await t.syncAll({ only: [t.a, t.b] });
      // Both laptops have acknowledged everything and it is all older than 90 days, but the phone has not applied it:
      // nothing is deleted.
      const kept = envelopesOnMailbox(t);
      expect(kept, "the envelopes wait for the phone").toBeGreaterThan(30);
      expect(await waitingOn(t.phone)).toBeGreaterThan(0);

      // He opens the app: one round sends his worker first, then applies the hundred days in order.
      const round = await t.phone.sync();
      expect(round.sent).toBeGreaterThan(0);
      expect(round.received).toBeGreaterThan(0);
      expect(await waitingOn(t.phone)).toBe(0);
      await t.syncAll();
      for (const device of [t.a, t.b]) {
        const rows = await device.test.db.selectFrom("StaffMember").select("id").where("id", "=", his.id).execute();
        expect(rows, `the phone's worker reached ${device.name}`).toHaveLength(1);
      }
      // Once every device applied them (and ten minutes passed), the mailbox may let them go.
      t.advance({ minutes: 11 });
      await openTheProgram(t.a);
      await t.syncAll();
      expect(envelopesOnMailbox(t), "applied by all three: collected").toBeLessThan(kept);

      // His phone's own clock check (its own log chain) saw a jump: he confirms the date, then works on.
      await t.phone.transact((ex, ctx) => confirmClockJump(ex, ctx));
      await moveBooksTo(t, t.phone);
      // A hundred days on: the year turned, and 2027's receipts went on from the laptops' numbers.
      const lastOn2027 = (await legalNumbersOf(t.a.test)).filter((n) => n.key === "RECEIPT" && n.year === 2027);
      const next = await issueReceipts(t.phone, 1);
      expect(next.firstNumber).toBe(`${String(lastOn2027.length + 1).padStart(6, "0")}/2027`);
      await t.syncAll();
      await expectConverged(t);
    },
  );

  it(
    "fell behind what the mailbox keeps: the phone takes the full copy a laptop made, then its own changes",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await t.syncAll();
      const his = await registerAWorker(t.phone, { lastName: "زروال", firstName: "منيرة" });
      for (let week = 0; week < 3; week++) {
        await registerAFile(t.a);
        await laptopsWorkAlone(t, 7, 7);
      }
      // The phone never makes the full copy (docs/phone/DECISION.md section 6); the books' laptop does.
      await expect(makeFullCopy(t.phone.env())).rejects.toThrow();
      const copy = await makeFullCopy(t.a.env());
      for (const object of t.relay.env.MAILBOX.objects.values()) {
        object.sql.exec(`DELETE FROM envelope WHERE mseq <= ?`, copy.covers);
      }
      const failure = await t.phone.sync().then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(NeedsFullCopy);
      await t.reinstall(t.phone, "CATCH_UP");
      expect(t.phone.vault.data).toMatchObject({ kind: "PHONE", slot: 2 });
      await t.syncAll();
      for (const device of t.devices()) {
        const rows = await device.test.db.selectFrom("StaffMember").select("id").where("id", "=", his.id).execute();
        expect(rows, `his worker is on ${device.name}`).toHaveLength(1);
      }
      await registerAWorker(t.phone);
      await t.syncAll();
      await expectConverged(t);
    },
  );
});

describe("case 3: the phone's clock disagrees", () => {
  it("merge order follows the corrected stamps; the phone's clock check reads its own log only", LONG, async () => {
    // The phone's clock is a day ahead (a phone set by hand, no network time).
    trio = await createSyncTrio({ skewMs: { phone: DAY_MS } });
    const t = trio;
    const worker = await registerAWorker(t.a, { lastName: "سعدي", firstName: "حورية" });
    await t.syncAll();
    const clock = await readState(t.phone.test.db, "clock");
    expect(clock?.offsetMs, "the phone measured itself a day ahead of the mailbox").toBeLessThan(-DAY_MS + 60_000);

    // Apart: the phone types first (its clock says tomorrow), the director's laptop five real minutes later.
    t.relay.offline = true;
    await editAWorker(t.phone, worker, { phone: "0770000002" });
    t.advance({ minutes: 5 });
    await editAWorker(t.a, worker, { phone: "0770000001" });
    t.relay.offline = false;
    await t.syncAll();
    for (const device of t.devices()) {
      const row = await device.test.db
        .selectFrom("StaffMember")
        .select("phone")
        .where("id", "=", worker.id)
        .executeTakeFirstOrThrow();
      expect(row.phone.replace(/\s/g, ""), `the later change in real time wins on ${device.name}`).toBe("0770000001");
    }
    // The phone's log rows dated tomorrow reached the laptops; their own clock checks are not moved: a receipt
    // issues on the director's laptop today.
    await issueReceipts(t.a, 1);
    await t.syncAll();
    await expectConverged(t);
  });
});

describe("case 4: a sync on the phone cut halfway", () => {
  it("an envelope whose answer was lost is sent again harmlessly; the mailbox stores it once", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    await t.syncAll();
    const phoneId = deviceIdOf(t.phone);
    const storedOfPhone = () => {
      let n = 0;
      for (const object of t.relay.env.MAILBOX.objects.values()) {
        n += Number(
          object.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM envelope WHERE deviceId = ?`, phoneId).toArray()[0]
            ?.n ?? 0,
        );
      }
      return n;
    };
    const before = storedOfPhone();
    const sentBefore = t.relay.delivered.length;
    await registerAWorker(t.phone);
    t.relay.cutNext(1, (request) => request.method === "PUT" && request.path.includes("/envelopes/"));
    await expect(t.phone.sync()).rejects.toThrow();
    expect(await waitingOn(t.phone), "the outbox gives nothing up before the mailbox answered").toBeGreaterThan(0);
    await t.syncAll();
    const puts = t.relay.delivered
      .slice(sentBefore)
      .filter(
        (request) =>
          request.method === "PUT" &&
          request.path.includes("/envelopes/") &&
          request.headers.authorization === `Bearer ${t.phone.vault.data!.token}`,
      );
    expect(new Set(puts.map((request) => request.path)).size, "the cut envelope was sent again").toBeLessThan(
      puts.length,
    );
    expect(storedOfPhone() - before, "each envelope the phone sent is stored once").toBe(
      new Set(puts.map((request) => request.path)).size,
    );
    await expectConverged(t);
  });
});

describe("case 5: no network on the phone", () => {
  it("the phone works alone, its changes wait, and they go when the network returns", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    await t.syncAll();
    t.relay.offline = true;
    await registerAWorker(t.phone);
    await registerAFile(t.phone);
    await expect(t.phone.sync()).rejects.toBeInstanceOf(RelayOffline);
    expect(await waitingOn(t.phone)).toBe(2);
    t.relay.offline = false;
    await t.syncAll();
    expect(await waitingOn(t.phone)).toBe(0);
    await expectConverged(t);
  });
});

describe("case 7: a laptop restores a backup while the phone worked", () => {
  it("the restored laptop takes back the phone's changes too, and gives no number twice", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    await registerAWorker(t.a);
    await issueReceipts(t.a, 1);
    await t.syncAll();
    const backup = t.a.test.snapshot();
    // After the backup: the director works on his laptop and on his phone.
    await issueReceipts(t.a, 2);
    await registerAWorker(t.a);
    await registerAWorker(t.phone);
    await registerAFile(t.phone);
    await t.syncAll();

    await t.restore(t.a, backup);
    const round = await t.a.sync();
    expect(round.caughtUp, "the restored laptop caught up before anything else").toBe(true);
    await t.syncAll();
    const next = await issueReceipts(t.a, 1);
    expect(next.firstNumber).toContain("4");
    await registerAWorker(t.a);
    await t.syncAll();
    await expectConverged(t);
  });
});

describe("case 9: the phone is lost while it holds the books", () => {
  it(
    "the manager removes it from a laptop, declaring the last number seen: LOST_DEVICE gap, key replaced, a new phone joins",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await issueReceipts(t.a, 2);
      await t.syncAll();
      await moveBooksTo(t, t.phone);
      // The director issues 3, 4, 5 on his phone in the field and loses it before it could send them.
      t.relay.offline = true;
      await issueReceipts(t.phone, 3);
      t.relay.offline = false;
      // Meanwhile it also took fallback blocks of its own third for workers.
      for (let i = 0; i < 3; i++) await registerAWorker(t.phone);

      const lost = deviceIdOf(t.phone);
      const ringBefore = t.a.vault.data!.keyRing.current;
      await expect(
        removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), { deviceId: lost, reason: "  " }),
      ).rejects.toThrow("A reason is required.");
      await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
        deviceId: lost,
        reason: "ضاع الهاتف في السوق",
        lastInvoice: null,
        lastReceipt: 5,
      });
      expect(t.a.vault.data!.keyRing.current, "the centre key was replaced").not.toBe(ringBefore);
      expect(await booksHolder(t.a)).toBe(deviceIdOf(t.a));
      const gaps = await t.a.test.db.selectFrom("SequenceGap").selectAll().where("kind", "=", "LOST_DEVICE").execute();
      expect(gaps).toMatchObject([{ key: "RECEIPT", fromValue: 3, toValue: 5 }]);
      await expect(t.phone.sync(), "the lost phone's token is refused").rejects.toThrow();
      const next = await issueReceipts(t.a, 1);
      expect(next.firstNumber).toContain("6");
      await t.syncAll({ only: [t.a, t.b] });
      const removed = (await syncDevicesOn(t.b)).find((row) => row.id === lost);
      expect(removed?.removedAt, "the assistant's laptop sees the phone removed").not.toBeNull();
      // The assistant's laptop still cannot issue: the books are on the director's laptop.
      await expect(issueReceipts(t.b, 1)).rejects.toThrow(BOOKS_ELSEWHERE);

      // A new phone joins with a new code and the full copy, under a new id and a new log chain.
      const lostChain = `AuditLog:${lost}`;
      const phone = await t.replace(t.phone);
      expect(deviceIdOf(phone)).not.toBe(lost);
      expect(phone.vault.data).toMatchObject({ kind: "PHONE", slot: 2 });
      await registerAWorker(phone);
      for (const device of t.devices()) {
        await device.sync().catch((error: unknown) => {
          throw new Error(`verifier: the first round after the new phone joined failed on ${device.name}`, {
            cause: error,
          });
        });
      }
      await t.syncAll();
      const chains = (await phone.test.db.selectFrom("AuditLog").select("chain").distinct().execute()).map(
        (row) => row.chain,
      );
      expect(chains, "the new phone writes its own log chain").toContain(`AuditLog:${deviceIdOf(phone)}`);
      expect(`AuditLog:${deviceIdOf(phone)}`, "the lost phone's chain is not reused").not.toBe(lostChain);
      expect(await receiptSeqs(phone)).toEqual([1, 2, 6]);
      await expectConverged(t);
    },
  );
});

describe("case 9 with a device away: the key replaced while it was off", () => {
  it(
    "the phone removed from the director's laptop while the assistant's laptop is off: it comes back days later and goes on",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await registerAWorker(t.b);
      await t.syncAll();
      // The assistant's laptop is switched off with a change of hers waiting.
      const hers = await registerAWorker(t.b);
      await removeDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
        deviceId: deviceIdOf(t.phone),
        reason: "الهاتف تعطل",
      });
      await registerAWorker(t.a);
      for (let day = 0; day < 4; day++) {
        t.advance({ days: 1 });
        await openTheProgram(t.a);
        await t.a.sync();
      }
      // Days later she switches on: her laptop finds the new key left for it, sends hers and takes the director's.
      t.advance({ days: 1 });
      await openTheProgram(t.b);
      await t.syncAll({ only: [t.a, t.b] });
      expect(t.b.vault.data!.keyRing.current).toBe(t.a.vault.data!.keyRing.current);
      const onA = await t.a.test.db.selectFrom("StaffMember").select("id").where("id", "=", hers.id).execute();
      expect(onA).toHaveLength(1);
      await expectConverged(t, [t.a, t.b]);
    },
  );

  it(
    "the assistant's laptop away across two removals of the phone (lost, its replacement lost too)",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await t.syncAll();
      const hers = await registerAWorker(t.b);
      const ctx = () => buildContext(t.a.manager, t.a.clock);
      await removeDevice(t.a.centre(), ctx(), { deviceId: deviceIdOf(t.phone), reason: "ضاع الهاتف" });
      const second = await t.replace(t.phone);
      await registerAWorker(second);
      await t.syncAll({ only: [t.a, second] });
      await removeDevice(t.a.centre(), ctx(), { deviceId: deviceIdOf(second), reason: "ضاع الهاتف الثاني" });
      const third = await t.replace(t.phone);
      await t.syncAll({ only: [t.a, third] });
      // She comes back after both rotations.
      t.advance({ days: 2 });
      await openTheProgram(t.b);
      await t.syncAll();
      for (const device of t.devices()) {
        const rows = await device.test.db.selectFrom("StaffMember").select("id").where("id", "=", hers.id).execute();
        expect(rows, `her worker is on ${device.name}`).toHaveLength(1);
      }
      await expectConverged(t);
    },
  );
});

describe("case 11: the assistant's laptop and the phone ask for the books at once", () => {
  it(
    "only the holder hands over, to one asker at a time; the other waits and is told where they are",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await issueReceipts(t.a, 1);
      await t.syncAll();
      await t.b.transact((ex, ctx) => requestBooks(ex, ctx));
      await t.phone.transact((ex, ctx) => requestBooks(ex, ctx));
      await t.syncAll();
      const holder = await booksHolder(t.a);
      expect([deviceIdOf(t.b), deviceIdOf(t.phone)]).toContain(holder);
      for (const device of t.devices()) expect(await booksHolder(device)).toBe(holder);
      const [winner, waiting] = holder === deviceIdOf(t.b) ? [t.b, t.phone] : [t.phone, t.b];
      await issueReceipts(winner, 1);
      await expect(issueReceipts(waiting, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
      await expect(issueReceipts(t.a, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
      const state = await booksState(waiting.test.db, waiting.test.ctx());
      expect(state).toMatchObject({ holderDeviceId: deviceIdOf(winner), heldHere: false });

      // The one still waiting asks again: it gets them from the new holder.
      await moveBooksTo(t, waiting);
      await issueReceipts(waiting, 1);
      await t.syncAll();
      for (const device of t.devices()) expect(await receiptSeqs(device)).toEqual([1, 2, 3]);
      await expectConverged(t);
    },
  );

  it(
    "the phone holding the books is switched off: the laptops wait, and the screen says the phone has them",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await moveBooksTo(t, t.phone);
      await t.a.transact((ex, ctx) => requestBooks(ex, ctx));
      for (let round = 0; round < 3; round++) {
        t.advance({ minutes: 5 });
        await t.syncAll({ only: [t.a, t.b] });
      }
      const state = await booksState(t.a.test.db, t.a.test.ctx());
      expect(state).toMatchObject({ holderDeviceId: deviceIdOf(t.phone), heldHere: false });
      await expect(issueReceipts(t.a, 1)).rejects.toThrow(/phone/i);
      // He opens the app: the books go to the director's laptop.
      await t.syncAll();
      expect(await booksHolder(t.a)).toBe(deviceIdOf(t.a));
      await issueReceipts(t.a, 1);
      await t.syncAll();
      await expectConverged(t);
    },
  );
});

describe("case 12: the phone and a laptop register the same thing while apart", () => {
  it(
    "the same national number: held with a plain reason on the devices, nothing lost; all three converge",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await t.syncAll();
      t.relay.offline = true;
      const onPhone = await registerAWorker(t.phone, {
        lastName: "بن علي",
        firstName: "فاطمة",
        nationalIdNumber: "109870012345678",
      });
      t.advance({ minutes: 3 });
      const onB = await registerAWorker(t.b, {
        lastName: "بن علي",
        firstName: "فاطمة",
        nationalIdNumber: "109870012345678",
      });
      t.relay.offline = false;
      await t.syncAll();
      for (const [device, theirs] of [
        [t.phone, onB.id],
        [t.b, onPhone.id],
      ] as const) {
        const held = (await openHeld(device)).filter((row) => row.tbl === "StaffMember");
        expect(
          held.map((row) => row.rowId),
          `${device.name} holds the other's worker`,
        ).toContain(theirs);
      }
      // The director's laptop received both: it keeps one and holds the other.
      const live = await t.a.test.db
        .selectFrom("StaffMember")
        .select("id")
        .where("nationalIdNumber", "=", "109870012345678")
        .where("deletedAt", "is", null)
        .execute();
      expect(live).toHaveLength(1);
      expect((await openHeld(t.a)).filter((row) => row.tbl === "StaffMember").length).toBeGreaterThan(0);
    },
  );
});
