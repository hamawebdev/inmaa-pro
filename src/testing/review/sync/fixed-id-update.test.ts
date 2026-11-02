import { afterEach, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { LONG } from "@/testing/scenarios/sync/helpers";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

/**
 * Review (review-sync): a row with an id derived from what it is (a setting `setting-<key>`, a zone, a commune) made
 * on both laptops while apart, then changed again on the one whose insert is the older. `applyUpdate` (apply.ts)
 * reads only the field's own stamp (`cells.get(col)`), never the row's insert stamp (`"*"`), so on the laptop whose
 * newer insert won, the older laptop's update is taken as replacing nothing and moves the field back; the laptop that
 * made the update keeps the newer insert's value (`mergeInsert` does read the stamps). The two never agree again.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

it("a setting first set on both laptops, then changed on one, converges to the latest change", LONG, async () => {
  pair = await createSyncPair();
  const p = pair;
  await p.syncAll();
  // While apart: b sets the idle lock (its first write of the key inserts the row), then changes it.
  await p.b.transact((ex, ctx) => setSetting(ex, ctx, "security.idleLockMinutes", 25));
  p.advance({ minutes: 1 });
  await p.b.transact((ex, ctx) => setSetting(ex, ctx, "security.idleLockMinutes", 30));
  p.advance({ minutes: 1 });
  // a sets it last of all (its own first write: an insert).
  await p.a.transact((ex, ctx) => setSetting(ex, ctx, "security.idleLockMinutes", 20));
  await p.syncAll();

  const valueOn = async (laptop: typeof p.a) =>
    (
      await laptop.test.db
        .selectFrom("Setting")
        .select("value")
        .where("key", "=", "security.idleLockMinutes")
        .executeTakeFirst()
    )?.value;
  expect({ a: await valueOn(p.a), b: await valueOn(p.b) }).toEqual({ a: "20", b: "20" });
  p.expectSame();
});
