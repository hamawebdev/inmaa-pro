import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

/**
 * Migration 0006 (docs/phone/DECISION.md section 2) on a database 1.1.0 left with sync set up: SyncDevice, SyncBooks
 * and NumberBlock are rebuilt, so every row must come out unchanged (the devices as laptops), the rules must hold
 * (slot 2 for the phone only, one active device a slot, no delete), and capture must go on on the three tables.
 */
const DIR = join(process.cwd(), "src-tauri/migrations");
const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function open(upTo: string): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;");
  for (const name of files) {
    if (name > upTo) break;
    db.exec("BEGIN");
    db.exec(readFileSync(join(DIR, name), "utf8"));
    db.exec("COMMIT");
  }
  return db;
}

const NOW = "2026-10-31T08:00:00.000Z";

describe("migration 0006", () => {
  it("keeps a 1.1.0 centre's devices, books and blocks, as laptops, and goes on capturing them", () => {
    expect(files).toContain("0006_phone.sql");
    const db = open("0005_sync.sql");
    db.exec(`UPDATE "SyncSession" SET "capturing" = 1, "txId" = 't1', "hlc" = '1761897600000.0000.dev-a'`);
    const device = db.prepare(
      `INSERT INTO "SyncDevice" ("id", "name", "slot", "joinedAt", "removedAt", "removedReason", "replacesDeviceId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    device.run("dev-a", "حاسوب المديرة", 0, NOW, null, null, null, NOW, NOW);
    device.run("dev-b", "old assistant", 1, NOW, NOW, "lost", null, NOW, NOW);
    device.run("dev-c", "assistant", 1, NOW, null, null, "dev-b", NOW, NOW);
    db.exec(
      `INSERT INTO "SyncBooks" ("id", "holderDeviceId", "epoch", "handedAt", "requestedByDeviceId", "requestedAt", "updatedAt") VALUES ('books', 'dev-a', 2, '${NOW}', 'dev-c', '${NOW}', '${NOW}')`,
    );
    db.exec(
      `INSERT INTO "NumberBlock" ("id", "key", "year", "blockIndex", "size", "deviceId", "kind", "answer", "answeredAt", "used", "createdAt", "updatedAt") VALUES ('CLIENT-0-3-dev-c', 'CLIENT', 0, 3, 10, 'dev-c', 'CLAIM', 'ACCEPTED', '${NOW}', 4, '${NOW}', '${NOW}')`,
    );
    db.exec(`UPDATE "SyncSession" SET "txId" = NULL, "capturing" = 0`);
    const before = {
      devices: db.prepare(`SELECT * FROM "SyncDevice" ORDER BY "id"`).all(),
      books: db.prepare(`SELECT * FROM "SyncBooks"`).all(),
      blocks: db.prepare(`SELECT * FROM "NumberBlock"`).all(),
    };

    db.exec("BEGIN");
    db.exec(readFileSync(join(DIR, "0006_phone.sql"), "utf8"));
    db.exec("COMMIT");

    const devices = db.prepare(`SELECT * FROM "SyncDevice" ORDER BY "id"`).all() as Array<Record<string, unknown>>;
    expect(devices.map(({ kind, ...rest }) => ({ ...rest, kindWas: kind }))).toEqual(
      before.devices.map((row) => ({ ...row, kindWas: "LAPTOP" })),
    );
    expect(db.prepare(`SELECT * FROM "SyncBooks"`).all()).toEqual(before.books);
    expect(db.prepare(`SELECT * FROM "NumberBlock"`).all()).toEqual(before.blocks);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe("ok");

    // The rules, on the rebuilt table.
    const phone = db.prepare(
      `INSERT INTO "SyncDevice" ("id", "name", "slot", "kind", "joinedAt", "createdAt", "updatedAt") VALUES (?, 'phone', ?, ?, '${NOW}', '${NOW}', '${NOW}')`,
    );
    expect(() => phone.run("dev-x", 2, "LAPTOP")).toThrow(/CHECK/);
    expect(() => phone.run("dev-x", 1, "PHONE")).toThrow(/CHECK/);
    phone.run("dev-p", 2, "PHONE");
    expect(() => phone.run("dev-q", 2, "PHONE")).toThrow(/UNIQUE/);
    expect(() => db.exec(`DELETE FROM "SyncDevice" WHERE "id" = 'dev-p'`)).toThrow(/NO_DELETE:SyncDevice/);
    expect(() => db.exec(`DELETE FROM "SyncBooks"`)).toThrow(/NO_DELETE:SyncBooks/);

    // Capture goes on on the three rebuilt tables.
    db.exec(`UPDATE "SyncSession" SET "capturing" = 1, "txId" = 't2', "hlc" = '1761897600001.0000.dev-a'`);
    db.exec(`UPDATE "SyncBooks" SET "holderDeviceId" = 'dev-p', "epoch" = 3, "updatedAt" = '${NOW}'`);
    db.exec(`UPDATE "NumberBlock" SET "used" = 5`);
    db.exec(`UPDATE "SyncDevice" SET "name" = 'هاتف المدير' WHERE "id" = 'dev-p'`);
    const captured = db
      .prepare(`SELECT "tbl", "rowId", "op", "data" FROM "SyncOutbox" WHERE "txId" = 't2' ORDER BY "seq"`)
      .all() as Array<{ tbl: string; rowId: string; op: string; data: string }>;
    expect(captured.map(({ tbl, rowId, op }) => [tbl, rowId, op])).toEqual([
      ["SyncBooks", "books", "U"],
      ["NumberBlock", "CLIENT-0-3-dev-c", "U"],
      ["SyncDevice", "dev-p", "U"],
    ]);
    expect(JSON.parse(captured[0].data)).toMatchObject({ holderDeviceId: ["dev-p", null], epoch: [3, null] });
    db.exec(`UPDATE "SyncSession" SET "txId" = NULL`);
    expect(() => db.exec(`UPDATE "SyncDevice" SET "name" = 'x' WHERE "id" = 'dev-p'`)).toThrow(/SYNC_UNSTAMPED/);
    db.close();
  });
});
