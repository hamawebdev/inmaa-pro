import { afterEach, describe, expect, it } from "vitest";

import { BOOKS_ELSEWHERE, BOOKS_STAY_ON_LAPTOPS, requestBooks } from "@/lib/sync/books";
import { thirdOf } from "@/lib/sync/blocks";
import { envFor } from "@/lib/sync/centre";
import { recordOutcome, runOnce } from "@/lib/sync/loop";
import { createRelayClient, PROTOCOL_HEADER, RelayOutdated, type RelayTransport } from "@/lib/sync/relay";
import { syncStatus } from "@/lib/sync/services/status";
import type { SyncLaptop } from "@/testing/sync/pair";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

import {
  booksHolder,
  deviceIdOf,
  expectLegalNumbersUnique,
  issueReceipts,
  legalNumbersOf,
  registerAFile,
  registerAWorker,
} from "../sync/helpers";

import { expectConverged, expectNoWorkerNumberTwice, LONG, moveBooksTo, workerNumbersOf } from "./helpers";

/**
 * docs/phone/DECISION.md section 2 and docs/phone/BUILD.md section 4: no invoice, receipt or ordinary number is
 * issued twice across the three devices, working apart and then together; apart, slot s takes only the blocks whose
 * index is s modulo 3; the books move among the three, one holder at a time; and a 1.1.0 program (sync protocol 1)
 * is refused by the mailbox.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

const slotOf = (t: SyncTrio, deviceId: string) =>
  deviceId === deviceIdOf(t.a) ? 0 : deviceId === deviceIdOf(t.b) ? 1 : deviceId === deviceIdOf(t.phone) ? 2 : -1;

describe("ordinary numbers on three devices", () => {
  it(
    "are never given twice apart or together, never change, and apart each device takes from its third",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      const given = new Map<string, string>();
      const register = async (device: SyncLaptop) => {
        const worker = await registerAWorker(device);
        const row = await device.test.db
          .selectFrom("StaffMember")
          .select("number")
          .where("id", "=", worker.id)
          .executeTakeFirstOrThrow();
        given.set(worker.id, row.number);
      };

      // Together: a few on each device, syncing between.
      for (let i = 0; i < 3; i++) {
        for (const device of t.devices()) await register(device);
        await t.syncAll();
      }
      // Apart long enough to use up the agreed blocks everywhere (blocks of 10).
      t.relay.offline = true;
      for (let i = 0; i < 23; i++) for (const device of t.devices()) await register(device);
      // Files and clients too.
      for (let i = 0; i < 4; i++) for (const device of t.devices()) await registerAFile(device);
      t.relay.offline = false;
      await t.syncAll();
      // Together again.
      for (let i = 0; i < 6; i++) {
        await register(t.devices()[i % 3]);
        if (i % 2 === 0) await t.syncAll();
      }
      await t.syncAll();
      t.expectSame();

      for (const device of t.devices()) {
        const numbers = await workerNumbersOf(device);
        for (const [id, number] of given) expect(numbers.get(id), `the number of ${id} never changed`).toBe(number);
      }
      await expectNoWorkerNumberTwice(t.devices());
      const files = await t.a.test.db.selectFrom("File").select(["formKind", "number"]).execute();
      expect(new Set(files.map((f) => `${f.formKind} ${f.number}`)).size, "no file number twice").toBe(files.length);
      const clients = await t.a.test.db.selectFrom("Client").select("number").execute();
      expect(new Set(clients.map((c) => c.number)).size, "no client number twice").toBe(clients.length);

      const fallback = await t.a.test.db
        .selectFrom("NumberBlock")
        .select(["deviceId", "blockIndex"])
        .where("kind", "=", "FALLBACK")
        .execute();
      expect(new Set(fallback.map((block) => block.deviceId)).size, "all three took fallback blocks apart").toBe(3);
      for (const block of fallback) {
        expect(thirdOf(block.blockIndex), `fallback block ${block.blockIndex} is in its device's third`).toBe(
          slotOf(t, block.deviceId),
        );
      }
      await expectConverged(t);
    },
  );
});

describe("legal numbers on three devices", () => {
  // fix-sync (docs/phone/DECISION.md section 6, 2026-11-02): the phone never holds the books. The first case moved
  // them a → phone → b → a; it now moves them a → b → a with apart periods, the phone refused throughout. The second
  // had the phone ask too; it now asserts the phone's refusal.
  it(
    "one unbroken receipt sequence while the books go a → b → a, with apart periods between; the phone is refused",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      await issueReceipts(t.a, 2); // 1, 2
      await t.syncAll();
      await expect(t.phone.transact((ex, ctx) => requestBooks(ex, ctx))).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);
      await moveBooksTo(t, t.b);
      await expect(issueReceipts(t.a, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
      await expect(issueReceipts(t.phone, 1)).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);

      // The assistant, without network: her laptop issues 3, 4, 5 while the director's laptop asks and waits.
      t.relay.offline = true;
      await issueReceipts(t.b, 3);
      await t.a.transact((ex, ctx) => requestBooks(ex, ctx));
      await expect(issueReceipts(t.a, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
      await expect(issueReceipts(t.phone, 1)).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);
      t.relay.offline = false;
      await t.syncAll();
      expect(await booksHolder(t.phone)).toBe(deviceIdOf(t.a));
      await issueReceipts(t.a, 2); // 6, 7
      await t.syncAll();
      await moveBooksTo(t, t.b);
      await issueReceipts(t.b, 1); // 8
      await t.syncAll();

      for (const device of t.devices()) {
        const seqs = (await legalNumbersOf(device.test))
          .filter((n) => n.key === "RECEIPT")
          .map((n) => n.seq)
          .sort((x, y) => x - y);
        expect(seqs, `the receipts on ${device.name}`).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      }
      await expectLegalNumbersUnique(...t.devices().map((device) => device.test));
      await expectConverged(t);
    },
  );

  it("the devices each ask for the books apart: never two holders, no number twice", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    await t.syncAll();
    t.relay.offline = true;
    await issueReceipts(t.a, 1);
    await t.b.transact((ex, ctx) => requestBooks(ex, ctx));
    await expect(t.phone.transact((ex, ctx) => requestBooks(ex, ctx))).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);
    await expect(issueReceipts(t.b, 1)).rejects.toThrow(BOOKS_ELSEWHERE);
    await expect(issueReceipts(t.phone, 1)).rejects.toThrow(BOOKS_STAY_ON_LAPTOPS);
    t.relay.offline = false;
    await t.syncAll();
    const holders = new Set(await Promise.all(t.devices().map((device) => booksHolder(device))));
    expect(holders.size, "one holder, the same on the three").toBe(1);
    const holder = t.devices().find((device) => deviceIdOf(device) === [...holders][0])!;
    expect(holder).not.toBe(t.phone);
    await issueReceipts(holder, 1);
    for (const device of t.devices().filter((d) => d !== holder)) {
      await expect(issueReceipts(device, 1)).rejects.toThrow(
        device === t.phone ? BOOKS_STAY_ON_LAPTOPS : BOOKS_ELSEWHERE,
      );
    }
    await t.syncAll();
    await expectConverged(t);
  });
});

describe("a 1.1.0 program beside the phone", () => {
  /** A transport that sends what a 1.1.0 laptop sends: no protocol header. */
  const oldProgram = (t: SyncTrio, version: string | null): RelayTransport => ({
    send(request) {
      const headers = { ...request.headers };
      if (version === null) delete headers[PROTOCOL_HEADER];
      else headers[PROTOCOL_HEADER] = version;
      return t.relay.transport.send({ ...request, headers });
    },
  });

  it("is refused by the mailbox with UPDATE_REQUIRED, and its status says «update the program»", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    await registerAWorker(t.b);
    for (const version of [null, "1"]) {
      const client = createRelayClient(oldProgram(t, version), null);
      await expect(client.time()).rejects.toBeInstanceOf(RelayOutdated);
    }
    // The assistant's laptop still on 1.1.0's protocol: its round ends OUTDATED, nothing is sent, nothing lost.
    const vault = t.b.vault.data!;
    const env = envFor(
      {
        ...t.b.centre(),
        mailbox: createRelayClient(oldProgram(t, "1"), null, { now: () => t.b.clock.now().getTime() }),
      },
      vault,
      t.b.test.anchor,
    );
    const outcome = await runOnce(env);
    expect(outcome.kind).toBe("OUTDATED");
    await recordOutcome(t.b.test.db, t.b.clock, outcome);
    const status = await syncStatus(t.b.test.db, t.b.test.ctx());
    expect(status.problem).toBe("OUTDATED");
    expect(status.severity).toBe("danger");
    // Updated (protocol 2), it sends what waited.
    await t.syncAll();
    await expectConverged(t);
  });
});
