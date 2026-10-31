// Case 8 (a backup from before set-up), case 10 (access changed on the other laptop), and the weekly full copy.
import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import { buildContext } from "@/lib/service/context";
import { detectRejoin, leaveCentre } from "@/lib/sync/centre";
import { onSyncApplied } from "@/lib/sync/events";
import { syncStatus } from "@/lib/sync/services/status";
import { leftSync } from "@/lib/sync/state";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

let pair: SyncPair;
afterEach(() => pair?.close());

describe("a backup from before sync was set up (case 8)", () => {
  it("is found, joins again from the full copy, and takes back its own later work", async () => {
    pair = await createSyncPair({ keepPreSetUpBackup: true });
    const mine = await pair.a.test.rows.insert("Client", { name: "بعد الإعداد", phone1: "0661000080" });
    const theirs = await pair.b.test.rows.insert("Client", { name: "من الثاني", phone1: "0661000081" });
    await pair.syncAll();

    await pair.restore(pair.a, pair.preSetUpBackup!);
    expect(await detectRejoin(pair.a.test.db, pair.a.vault)).toBe(true);
    const shown = await syncStatus(pair.a.test.db, pair.a.test.ctx(), { rejoin: true });
    expect(shown.exchange).toBe("REJOIN");

    await pair.reinstall(pair.a, "REJOIN");
    expect(await detectRejoin(pair.a.test.db, pair.a.vault)).toBe(false);
    await pair.syncAll();
    pair.expectSame();
    for (const id of [mine.id, theirs.id]) {
      const row = await pair.a.test.db
        .selectFrom("Client")
        .select("id")
        .where("id", "=", id as string)
        .executeTakeFirst();
      expect(row).toBeDefined();
    }
  });
});

describe("an account changed on the other laptop (case 10)", () => {
  it("is announced as soon as the change is applied, so the session reloads", async () => {
    pair = await createSyncPair();
    await pair.syncAll();
    const heard: string[][] = [];
    const stop = onSyncApplied((info) => heard.push([...info.tables]));
    try {
      await pair.a.transact((ex) =>
        sql`UPDATE "User" SET "roleId" = 'ADMINISTRATION' WHERE "id" = ${pair.assistantId}`.execute(ex),
      );
      await pair.a.sync();
      await pair.b.sync();
    } finally {
      stop();
    }
    expect(heard.flat()).toContain("User");
    const onB = await pair.b.test.db
      .selectFrom("User")
      .select("roleId")
      .where("id", "=", pair.assistantId!)
      .executeTakeFirst();
    expect(onB?.roleId).toBe("ADMINISTRATION");
  });
});

describe("the full copy", () => {
  it("is refreshed weekly by the laptop that holds the books", async () => {
    pair = await createSyncPair();
    await pair.syncAll();
    const before = await pair.relay
      .client(null)
      .withCredentials({
        centreId: pair.a.vault.data!.centreId,
        deviceId: pair.a.vault.data!.deviceId,
        token: pair.a.vault.data!.token,
      })
      .latestFullCopy();
    pair.advance({ days: 8 });
    await pair.b.sync();
    await pair.a.sync();
    const after = await pair.a.env().mailbox.latestFullCopy();
    expect(after.copy?.blobId).not.toBe(before.copy?.blobId);
    expect(after.copy?.deviceId).toBe(pair.a.vault.data!.deviceId);
  });
});

describe("taking a laptop out of sync", () => {
  it("stops capture, clears its sync state and vault, and remembers which laptop it was", async () => {
    pair = await createSyncPair();
    const deviceId = pair.b.vault.data!.deviceId;
    await leaveCentre(pair.b.centre(), buildContext(pair.b.manager, pair.b.clock), { reason: "خارج الخدمة" });
    expect(pair.b.vault.data).toBeNull();
    expect(await leftSync(pair.b.test.db)).toMatchObject({ deviceId, slot: 1 });
    expect((await syncStatus(pair.b.test.db, pair.b.test.ctx())).state).toBe("OFF");
    // Its work goes on as in 1.0.0: nothing is captured.
    await pair.b.test.rows.insert("Client", { name: "وحده", phone1: "0661000090" });
    const outbox = await pair.b.test.db.selectFrom("SyncOutbox").select("seq").execute();
    expect(outbox).toHaveLength(0);
  });
});
