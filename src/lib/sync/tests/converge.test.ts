import { afterEach, describe, expect, it } from "vitest";

import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

describe("two laptops", () => {
  it("start the same after joining", async () => {
    pair = await createSyncPair();
    await pair.syncAll();
    pair.expectSame();
  });

  it("converge after edits on both sides", async () => {
    pair = await createSyncPair();
    const p = pair;
    const one = await p.a.test.rows.insert("Client", { name: "عميل أ", phone1: "0661000001" });
    const two = await p.b.test.rows.insert("Client", { name: "عميل ب", phone1: "0661000002" });
    await p.syncAll();
    p.expectSame();

    await p.a.transact((ex) =>
      ex
        .updateTable("Client")
        .set({ phone1: "0661999999" })
        .where("id", "=", two.id as string)
        .execute(),
    );
    await p.b.transact((ex) =>
      ex
        .updateTable("Client")
        .set({ note: "ملاحظة" })
        .where("id", "=", one.id as string)
        .execute(),
    );
    await p.syncAll();
    p.expectSame();
    const onB = await p.b.test.db
      .selectFrom("Client")
      .select("phone1")
      .where("id", "=", two.id as string)
      .executeTakeFirstOrThrow();
    expect(onB.phone1).toBe("0661999999");
  });
});
