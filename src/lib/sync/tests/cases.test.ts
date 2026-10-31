// The engine's side of DECISION section 7: files, cuts, a restore, clocks, the service down, removal.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import { saveUpload, storagePathOf } from "@/lib/attachments";
import { buildContext } from "@/lib/service/context";
import { removeOtherLaptop } from "@/lib/sync/centre";
import { resolveConflict, resolveHeld } from "@/lib/sync/services/conflicts";
import { syncStatus } from "@/lib/sync/services/status";
import { PHOTO_UPLOAD_RULE } from "@/lib/uploads";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

let pair: SyncPair;
afterEach(() => pair?.close());

const status = (laptop: SyncLaptop) => syncStatus(laptop.test.db, laptop.test.ctx());
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

describe("stored files", () => {
  it("travel in parts beside their Upload row and are written whole, checked", async () => {
    pair = await createSyncPair();
    const bytes = new Uint8Array(2_500_000).map((_, i) => (i * 7) % 251); // three parts
    const { url } = await pair.a.transact((ex, ctx) =>
      saveUpload(ex, ctx, pair.a.store, {
        entity: "StaffMember",
        field: "photoUrl",
        file: { name: "photo.png", type: "image/png", bytes },
        rule: PHOTO_UPLOAD_RULE,
      }),
    );
    await pair.syncAll();
    pair.expectSame();
    const onB = join(pair.b.root, storagePathOf(url));
    expect(existsSync(onB)).toBe(true);
    expect(createHash("sha256").update(readFileSync(onB)).digest("hex")).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect((await status(pair.b)).filesToReceive).toBe(0);
  });
});

describe("a cut", () => {
  it("while sending: the envelope stored before its answer was lost is not applied twice", async () => {
    pair = await createSyncPair();
    const client = await pair.a.test.rows.insert("Client", { name: "مقطوع", phone1: "0661000020" });
    pair.relay.cutNext(1, (request) => request.method === "PUT" && request.path.includes("/envelopes/"));
    await expect(pair.a.sync()).rejects.toThrow();
    expect((await status(pair.a)).exchange).toBe("OFFLINE");
    await pair.syncAll();
    pair.expectSame();
    expect(await read(pair.b, "Client", client.id as string)).toBeDefined();
  });

  it("while applying: the transaction and its cursor go in whole or not at all", async () => {
    pair = await createSyncPair();
    const client = await pair.a.test.rows.insert("Client", { name: "نصف", phone1: "0661000021" });
    await pair.a.sync();
    // The power goes at the cursor's write: the whole transaction is undone with it.
    pair.b.test.raw.exec(`CREATE TEMP TRIGGER cut BEFORE UPDATE ON "SyncState" WHEN NEW."key" = 'receive'
      BEGIN SELECT RAISE(ABORT, 'power cut'); END`);
    await expect(pair.b.sync()).rejects.toThrow(/power cut/);
    expect(await read(pair.b, "Client", client.id as string)).toBeUndefined();
    pair.b.test.raw.exec("DROP TRIGGER temp.cut");
    await pair.syncAll();
    pair.expectSame();
  });
});

describe("a restore (case 7)", () => {
  it("takes back what the laptop sent after its backup, and the other laptop's, before going on", async () => {
    pair = await createSyncPair();
    const backup = pair.a.test.snapshot();
    const mine = await pair.a.test.rows.insert("Client", { name: "بعد النسخة", phone1: "0661000030" });
    const theirs = await pair.b.test.rows.insert("Client", { name: "من المساعدة", phone1: "0661000031" });
    await pair.syncAll();

    await pair.restore(pair.a, backup);
    expect(await read(pair.a, "Client", mine.id as string)).toBeUndefined();
    const round = await pair.a.sync();
    expect(round.caughtUp).toBe(true);
    expect(await read(pair.a, "Client", mine.id as string)).toBeDefined();
    expect(await read(pair.a, "Client", theirs.id as string)).toBeDefined();

    // It goes on numbering its envelopes after what the mailbox holds: nothing is refused, nothing given twice.
    await pair.a.test.rows.insert("Client", { name: "بعد الاسترجاع", phone1: "0661000032" });
    await pair.syncAll();
    pair.expectSame();
    expect((await status(pair.a)).exchange).toBe("SYNCED");
  });
});

describe("the clocks (case 3)", () => {
  it("merge by corrected stamps, not by a PC's wrong date, and say the clock is wrong", async () => {
    pair = await createSyncPair({ skewMs: { a: 86_400_000 } }); // a's PC is a day ahead
    await pair.b.sync(); // b measures its own clock
    const client = await pair.a.test.rows.insert("Client", { name: "ساعة", phone1: "0661000040" });
    await pair.syncAll();
    const id = client.id as string;
    await update(pair.a, "Client", id, { phone1: "0661111111" });
    pair.advance({ minutes: 1 });
    await update(pair.b, "Client", id, { phone1: "0662222222" }); // truly later
    await pair.syncAll();
    pair.expectSame();
    expect((await read(pair.a, "Client", id)).phone1).toBe("0662222222");
    const onA = await status(pair.a);
    expect(onA.clockWrong).toBe(true);
    expect(onA.problems).toContain("CLOCK");
    expect((await status(pair.b)).clockWrong).toBe(false);
  });
});

describe("the service (cases 5 and 6)", () => {
  it("offline: each laptop works alone and the changes wait, then go", async () => {
    pair = await createSyncPair();
    pair.relay.offline = true;
    await pair.a.test.rows.insert("Client", { name: "ينتظر", phone1: "0661000050" });
    await expect(pair.a.sync()).rejects.toThrow();
    const waiting = await status(pair.a);
    expect(waiting.exchange).toBe("OFFLINE");
    expect(waiting.waitingCount).toBeGreaterThan(0);
    pair.relay.offline = false;
    await pair.syncAll();
    pair.expectSame();
    expect((await status(pair.a)).waitingCount).toBe(0);
  });

  it("the daily limit: says when requests resume, then goes on", async () => {
    pair = await createSyncPair();
    pair.relay.limitUntil = pair.clock.now().getTime() + 3_600_000;
    await pair.a.test.rows.insert("Client", { name: "حد", phone1: "0661000051" });
    await expect(pair.a.sync()).rejects.toThrow();
    const limited = await status(pair.a);
    expect(limited.exchange).toBe("LIMIT");
    expect(limited.limitRetryAt).not.toBeNull();
    pair.relay.limitUntil = null;
    pair.advance({ hours: 2 });
    await pair.syncAll();
    pair.expectSame();
  });
});

describe("conflicts and held changes, settled by the office", () => {
  it("«استعمال هذه القيمة» puts the other value back on both laptops", async () => {
    pair = await createSyncPair();
    const client = await pair.a.test.rows.insert("Client", { name: "ق", phone1: "0661000060" });
    await pair.syncAll();
    const id = client.id as string;
    await update(pair.a, "Client", id, { phone1: "0661111111" });
    pair.advance({ minutes: 1 });
    await update(pair.b, "Client", id, { phone1: "0662222222" });
    await pair.syncAll();
    const [conflict] = await pair.a.test.db.selectFrom("SyncConflict").selectAll().execute();
    await pair.a.transact((ex, ctx) => resolveConflict(ex, ctx, { conflictId: conflict.id, resolution: "USE_OTHER" }));
    await pair.syncAll();
    pair.expectSame();
    expect((await read(pair.b, "Client", id)).phone1).toBe("0661111111");
    const open = await pair.b.test.db.selectFrom("SyncConflict").selectAll().where("resolvedAt", "is", null).execute();
    expect(open).toHaveLength(0); // superseded on the other laptop
  });

  it("the same worker registered on both: set aside once, on either laptop, and both converge (case 12)", async () => {
    pair = await createSyncPair();
    const worker = { kind: "WORKER", nationalIdNumber: "109876543210987654" };
    const first = await pair.a.test.rows.insert("StaffMember", { ...worker, lastName: "أ" });
    pair.advance({ minutes: 1 });
    const second = await pair.b.test.rows.insert("StaffMember", { ...worker, lastName: "ب" });
    await pair.syncAll();
    const [held] = await pair.a.test.db.selectFrom("SyncHeld").selectAll().where("resolvedAt", "is", null).execute();
    expect(held.rowId).toBe(second.id);
    await pair.a.transact((ex, ctx) =>
      resolveHeld(ex, ctx, { heldId: held.id, action: "SET_ASIDE", reason: "تسجيل مكرر" }),
    );
    await pair.syncAll();
    pair.expectSame();
    expect((await read(pair.a, "StaffMember", second.id as string)).deletedAt).not.toBeNull();
    expect((await read(pair.b, "StaffMember", first.id as string)).deletedAt).toBeNull();
    for (const laptop of [pair.a, pair.b]) {
      const open = await laptop.test.db.selectFrom("SyncHeld").select("id").where("resolvedAt", "is", null).execute();
      expect(open).toHaveLength(0);
    }
  });
});

describe("a lost laptop (case 9)", () => {
  it("is removed with a reason: its token refused, the key replaced, and it says so", async () => {
    pair = await createSyncPair();
    const deviceId = pair.b.vault.data!.deviceId;
    const oldKey = pair.a.vault.data!.keyRing.current;
    await removeOtherLaptop(pair.a.centre(), buildContext(pair.a.manager, pair.a.clock), {
      deviceId,
      reason: "سُرق الحاسوب",
    });
    expect(pair.a.vault.data!.keyRing.current).not.toBe(oldKey);
    await expect(pair.b.sync()).rejects.toThrow();
    expect((await status(pair.b)).exchange).toBe("REVOKED");
    await pair.a.test.rows.insert("Client", { name: "بعد الإزالة", phone1: "0661000070" });
    await pair.a.sync();
    const removed = await pair.a.test.db
      .selectFrom("SyncDevice")
      .selectAll()
      .where("id", "=", deviceId)
      .executeTakeFirst();
    expect(removed?.removedReason).toBe("سُرق الحاسوب");

    // A replacement joins with a new code and a full copy, under a new laptop id and its own log chain.
    const replacement = await pair.replace(pair.b);
    const newId = replacement.vault.data!.deviceId;
    expect(newId).not.toBe(deviceId);
    await replacement.test.rows.insert("Client", { name: "من البديل", phone1: "0661000071" });
    await pair.syncAll();
    pair.expectSame();
    const chain = await pair.a.test.db
      .selectFrom("AuditLog")
      .select("chain")
      .where("chain", "=", `AuditLog:${newId}`)
      .executeTakeFirst();
    expect(chain).toBeDefined();
  });
});

describe("the 1.0.0 database", () => {
  it("upgrades, sets sync up, and a second laptop joins with the same data and files", async () => {
    pair = await createSyncPair({ fixture: true });
    await pair.syncAll();
    pair.expectSame();
    const uploads = await pair.a.test.db.selectFrom("Upload").select("url").where("purgedAt", "is", null).execute();
    for (const { url } of uploads) {
      if (!existsSync(join(pair.a.root, storagePathOf(url)))) continue;
      expect(existsSync(join(pair.b.root, storagePathOf(url)))).toBe(true);
    }
  });
});
