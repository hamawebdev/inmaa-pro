import { afterEach, describe, expect, it } from "vitest";

import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import { editAWorker, expectChainsVerify, LONG, openConflicts, registerAWorker } from "./helpers";

/**
 * DECISION section 7, case 1: both laptops change the same record while apart. Different fields: both kept. Same
 * field: the later stamp wins on both, the other value kept in the conflict list. Same values: nothing to show.
 * Both laptops end with the same data.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

async function workerAgreed(p: SyncPair) {
  const worker = await registerAWorker(p.a, { lastName: "سعدي", firstName: "حورية", phone: "0661203142" });
  await p.syncAll();
  p.relay.offline = true;
  return worker;
}

const phoneOf = (p: SyncPair, laptop: "a" | "b", id: string) =>
  p[laptop].test.db
    .selectFrom("StaffMember")
    .select(["phone", "address"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

describe("case 1: the same record changed on both laptops while apart", () => {
  it("different fields: both changes stay, on both laptops, and nothing is listed", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    const worker = await workerAgreed(p);

    await editAWorker(p.a, worker, { phone: "0770112233" });
    p.advance({ minutes: 5 });
    await editAWorker(p.b, worker, { address: "حي 500 مسكن، عين البيضاء" });

    p.relay.offline = false;
    await p.syncAll();
    p.expectSame();
    for (const side of ["a", "b"] as const) {
      expect(await phoneOf(p, side, worker.id)).toMatchObject({
        phone: expect.stringContaining("0770"),
        address: "حي 500 مسكن، عين البيضاء",
      });
      expect(await openConflicts(p[side])).toEqual([]);
    }
    await expectChainsVerify(p);
  });

  it(
    "the same field: the later stamp wins on both, the other value is listed, and one click puts it back",
    LONG,
    async () => {
      pair = await createSyncPair();
      const p = pair;
      const worker = await workerAgreed(p);

      // The director types first; the assistant types five minutes later: the assistant's value is the later stamp.
      await editAWorker(p.a, worker, { phone: "0770000001" });
      p.advance({ minutes: 5 });
      await editAWorker(p.b, worker, { phone: "0770000002" });

      p.relay.offline = false;
      await p.syncAll();
      p.expectSame();
      for (const side of ["a", "b"] as const) {
        expect((await phoneOf(p, side, worker.id)).phone).toContain("0770000002".slice(0, 4));
        expect((await phoneOf(p, side, worker.id)).phone.replace(/\s/g, "")).toBe("0770000002");
      }
      // The losing value is in the conflict list, with who typed it, on at least the laptop that received the later value.
      const listed = [...(await openConflicts(p.a)), ...(await openConflicts(p.b))].filter(
        (row) => row.tbl === "StaffMember" && row.rowId === worker.id && row.col === "phone",
      );
      expect(listed.length, "the other value is kept in the conflict list").toBeGreaterThan(0);
      for (const row of listed) {
        expect(String(JSON.parse(row.otherValue)).replace(/\s/g, "")).toBe("0770000001");
        expect(String(JSON.parse(row.keptValue)).replace(/\s/g, "")).toBe("0770000002");
        expect(row.otherDeviceId).toBe(p.a.vault.data!.deviceId);
      }
      await expectChainsVerify(p);
    },
  );

  // «استعمال هذه القيمة» on either laptop: held-and-conflicts.test.ts.

  it("the same value typed on both: nothing to show", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    const worker = await workerAgreed(p);

    await editAWorker(p.a, worker, { phone: "0770999999" });
    p.advance({ minutes: 5 });
    await editAWorker(p.b, worker, { phone: "0770999999" });

    p.relay.offline = false;
    await p.syncAll();
    p.expectSame();
    for (const side of ["a", "b"] as const) {
      const listed = (await openConflicts(p[side])).filter((row) => row.tbl === "StaffMember" && row.col === "phone");
      expect(listed).toEqual([]);
    }
    await expectChainsVerify(p);
  });
});
