// An installed 1.0.0 database upgrades in place (migrations 0004 and 0005), and keeps
// every row: the log and the legal gaps that 0005 rebuilds are compared column by column
// with the file as 1.0.0 left it, and the chains still verify.
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { openTestDatabase, type TestDatabase } from "@/testing/database";

import { FIXTURE_DB, fixtureCopy, fixtureManifest, upgradeInPlace } from "./index";

const read = (file: string, sql: string) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
};
const tablesOf = (file: string) =>
  (
    read(
      file,
      `SELECT "name" FROM sqlite_master WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite_%' AND "name" <> '_sqlx_migrations' ORDER BY "name"`,
    ) as Array<{ name: string }>
  ).map((row) => row.name);

let opened: TestDatabase | null = null;
afterEach(() => {
  opened?.close();
  opened = null;
});

describe("the 1.0.0 fixture", () => {
  it("is what 1.0.0 made: three migrations, its data, a legal gap, two stored files", () => {
    const manifest = fixtureManifest();
    expect(manifest.migrations).toEqual(["0001_init.sql", "0002_seed.sql", "0003_service_catalogue.sql"]);
    expect(read(FIXTURE_DB, `SELECT "version" FROM _sqlx_migrations ORDER BY "version"`)).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
    ]);
    expect(tablesOf(FIXTURE_DB)).toHaveLength(109);
    expect(manifest.counts.AuditLog).toBeGreaterThan(400);
    expect(manifest.counts.Invoice).toBeGreaterThan(0);
    expect(manifest.counts.Receipt).toBeGreaterThan(0);
    expect(manifest.counts.Payment).toBeGreaterThan(0);
    expect(manifest.counts.SequenceGap).toBe(1);
    expect(manifest.counts.Upload).toBe(2);
  });

  it("upgrades in place, every row kept, the rebuilt log and gaps unchanged column by column", () => {
    const copy = fixtureCopy();
    const before = new Map(
      tablesOf(copy.db).map((table) => [table, read(copy.db, `SELECT * FROM "${table}" ORDER BY rowid`)]),
    );

    expect(upgradeInPlace(copy.db)).toEqual(["0004_staff_trial_and_fixed_term.sql", "0005_sync.sql"]);

    for (const [table, rows] of before) {
      const after = read(copy.db, `SELECT * FROM "${table}" ORDER BY rowid`) as Array<Record<string, unknown>>;
      if (table === "AuditLog") {
        // The rebuilt log: every row as it was, and the new column empty (the 1.0.0 chain).
        expect(after.map(({ chain, ...rest }) => (expect(chain).toBeNull(), rest))).toEqual(rows);
      } else if (table === "StaffMember") {
        expect(after.map(({ trialEndDate: _t, fixedTermReason: _f, ...rest }) => rest)).toEqual(rows);
      } else {
        expect(after, table).toEqual(rows);
      }
    }
    expect(read(copy.db, "PRAGMA foreign_key_check")).toEqual([]);
    expect(read(copy.db, "PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
    expect(read(copy.db, `SELECT "id", "capturing", "applying" FROM "SyncSession"`)).toEqual([
      { id: "session", capturing: 0, applying: 0 },
    ]);
    // Opening it again finds nothing left to apply.
    expect(upgradeInPlace(copy.db)).toEqual([]);
  });

  it("the chains verify on the upgraded database", async () => {
    const copy = fixtureCopy();
    upgradeInPlace(copy.db);
    opened = await openTestDatabase(copy.db, { events: false });
    const report = await verifyChains(opened.db);
    expect(report.chains.filter((chain) => chain.firstBroken !== null)).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
