// The merge rules of DECISION section 4, each on two laptops through the real mailbox.
import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import { stampTransaction } from "@/lib/sync/session";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

let pair: SyncPair;
afterEach(() => pair?.close());

const update = (laptop: SyncLaptop, table: string, id: string, set: Record<string, unknown>) =>
  laptop.transact(async (ex) => {
    const cols = Object.keys(set);
    await sql`UPDATE ${sql.table(table)} SET ${sql.join(cols.map((c) => sql`${sql.ref(c)} = ${set[c]}`))} WHERE "id" = ${id}`.execute(
      ex,
    );
  });

const read = async (laptop: SyncLaptop, table: string, id: string) =>
  (await sql<Record<string, unknown>>`SELECT * FROM ${sql.table(table)} WHERE "id" = ${id}`.execute(laptop.test.db))
    .rows[0];

const conflicts = (laptop: SyncLaptop) =>
  laptop.test.db.selectFrom("SyncConflict").selectAll().where("resolvedAt", "is", null).execute();
const held = (laptop: SyncLaptop) =>
  laptop.test.db.selectFrom("SyncHeld").selectAll().where("resolvedAt", "is", null).orderBy("id").execute();

async function clientOnBoth(): Promise<string> {
  const client = await pair.a.test.rows.insert("Client", { name: "عميل", phone1: "0661000001" });
  await pair.syncAll();
  return client.id as string;
}

describe("the merge", () => {
  it("keeps both when different fields changed while apart", async () => {
    pair = await createSyncPair();
    const id = await clientOnBoth();
    await update(pair.a, "Client", id, { phone1: "0661111111" });
    await update(pair.b, "Client", id, { note: "من المساعدة" });
    await pair.syncAll();
    pair.expectSame();
    expect(await read(pair.a, "Client", id)).toMatchObject({ phone1: "0661111111", note: "من المساعدة" });
    expect(await conflicts(pair.a)).toHaveLength(0);
    expect(await conflicts(pair.b)).toHaveLength(0);
  });

  it("gives the same field to the later stamp on both, and lists the other value", async () => {
    pair = await createSyncPair();
    const id = await clientOnBoth();
    await update(pair.a, "Client", id, { phone1: "0661111111" });
    pair.advance({ minutes: 1 });
    await update(pair.b, "Client", id, { phone1: "0662222222" }); // later
    await pair.syncAll();
    pair.expectSame();
    expect((await read(pair.a, "Client", id)).phone1).toBe("0662222222");
    for (const laptop of [pair.a, pair.b]) {
      const listed = await conflicts(laptop);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        tbl: "Client",
        rowId: id,
        col: "phone1",
        keptValue: JSON.stringify("0662222222"),
        otherValue: JSON.stringify("0661111111"),
        otherDeviceId: pair.a.vault.data!.deviceId,
      });
    }
  });

  it("shows nothing when both typed the same value", async () => {
    pair = await createSyncPair();
    const id = await clientOnBoth();
    await update(pair.a, "Client", id, { phone1: "0663333333" });
    await update(pair.b, "Client", id, { phone1: "0663333333" });
    await pair.syncAll();
    pair.expectSame();
    expect(await conflicts(pair.a)).toHaveLength(0);
    expect(await conflicts(pair.b)).toHaveLength(0);
  });

  it("lets a delete stand over a change made on the other laptop, and keeps the change in the list", async () => {
    pair = await createSyncPair();
    const contact = await pair.a.test.rows.insert("Contact", { name: "منسق" });
    await pair.syncAll();
    const id = contact.id as string;
    await pair.a.transact((ex) => ex.deleteFrom("Contact").where("id", "=", id).execute());
    await update(pair.b, "Contact", id, { phone: "0550000000" });
    await pair.syncAll();
    pair.expectSame();
    expect(await read(pair.a, "Contact", id)).toBeUndefined();
    for (const laptop of [pair.a, pair.b]) {
      const listed = await conflicts(laptop);
      expect(listed.map((c) => [c.col, c.otherValue])).toEqual([["phone", JSON.stringify("0550000000")]]);
    }
  });

  it("holds a change the database refuses on both laptops, and goes on with the rest", async () => {
    pair = await createSyncPair();
    await pair.a.test.rows.insert("Skill", { code: "SKILL_9", labelAr: "تنظيف الزجاج" });
    await pair.b.test.rows.insert("Skill", { code: "SKILL_9", labelAr: "غسل الزجاج" });
    const other = await pair.b.test.rows.insert("Client", { name: "يمر", phone1: "0661000009" });
    await pair.syncAll();
    expect(await read(pair.a, "Client", other.id as string)).toBeDefined();
    for (const laptop of [pair.a, pair.b]) {
      const waiting = await held(laptop);
      expect(waiting).toHaveLength(1);
      expect(waiting[0]).toMatchObject({ tbl: "Skill" });
      expect(waiting[0].reason).toMatch(/UNIQUE/);
    }
  });

  it("refuses a write that forgot to stamp its transaction", async () => {
    pair = await createSyncPair();
    await expect(
      pair.a.test.db
        .transaction()
        .execute((trx) =>
          trx
            .updateTable("Setting")
            .set({ updatedAt: pair.a.clock.now().toISOString() })
            .where("key", "=", "numbering.startAt")
            .execute(),
        ),
    ).resolves.toBeDefined(); // not captured: no row named, nothing fires
    const client = await pair.a.test.rows.insert("Client", { name: "س", phone1: "0661000010" });
    await expect(
      pair.a.test.db.transaction().execute((trx) =>
        trx
          .updateTable("Client")
          .set({ note: "x" })
          .where("id", "=", client.id as string)
          .execute(),
      ),
    ).rejects.toThrow(/SYNC_UNSTAMPED/);
    await expect(
      pair.a.test.db.transaction().execute(async (trx) => {
        await stampTransaction(trx, pair.a.test.ctx());
        await trx
          .updateTable("Client")
          .set({ note: "x" })
          .where("id", "=", client.id as string)
          .execute();
      }),
    ).resolves.toBeUndefined();
  });

  it("merges a row both laptops made under the same id, the later insert winning", async () => {
    pair = await createSyncPair();
    const base = { id: "skill-fixed", code: "SKILL_FIXED" };
    await pair.a.test.rows.insert("Skill", { ...base, labelAr: "أ" });
    pair.advance({ minutes: 1 });
    await pair.b.test.rows.insert("Skill", { ...base, labelAr: "ب" });
    await pair.syncAll();
    pair.expectSame();
    expect((await read(pair.a, "Skill", "skill-fixed")).labelAr).toBe("ب");
  });

  it("moves the later of two lines given the same number while apart", async () => {
    pair = await createSyncPair();
    const file = await pair.a.test.rows.insert("File", {});
    await pair.syncAll();
    const fileId = file.id as string;
    const due = { fileId, seq: 1, kind: "EXTRA", dueDate: "2026-10-30", expectedAmount: 100, amount: 100 } as never;
    const first = await pair.a.test.rows.insert("PaymentDue", due);
    pair.advance({ minutes: 1 });
    const second = await pair.b.test.rows.insert("PaymentDue", due);
    await pair.syncAll();
    pair.expectSame();
    expect((await read(pair.a, "PaymentDue", first.id as string)).seq).toBe(1);
    expect((await read(pair.a, "PaymentDue", second.id as string)).seq).toBe(2);
    expect(await held(pair.a)).toHaveLength(0);
    expect(await held(pair.b)).toHaveLength(0);
  });

  it("holds a clash of line numbers on an append-only table on both laptops", async () => {
    pair = await createSyncPair();
    const purchase = await pair.a.test.rows.insert("Purchase", {});
    await pair.syncAll();
    const purchaseId = purchase.id as string;
    await pair.a.test.rows.insert("PurchaseLine", { purchaseId, seq: 1 });
    await pair.b.test.rows.insert("PurchaseLine", { purchaseId, seq: 1 });
    await pair.syncAll();
    for (const laptop of [pair.a, pair.b]) {
      const waiting = await held(laptop);
      expect(waiting.map((row) => row.tbl)).toEqual(["PurchaseLine"]);
    }
  });
});
