/**
 * The 1.0.0 fixture: a database as an installed 1.0.0 copy holds it (migrations 0001 to
 * 0003 and their `_sqlx_migrations` rows, first run done, the 1.0.0 demo data, a receipt
 * series started on paper with its OPENING gap, two stored files). Made by
 * `node src/testing/fixtures/1.0.0/build.mjs` from the 1.0.0 code itself; `manifest.json`
 * says what it holds. For tests only.
 *
 *   const copy = upgradedFixtureCopy();          // a copy, upgraded as the program would at start
 *   const test = await openTestDatabase(copy.db, { anchor: fileAnchorStore(copy.anchor) });
 */
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DB = join(FIXTURE_DIR, "inmaa-1.0.0.db");
export const FIXTURE_ANCHOR = join(FIXTURE_DIR, "inmaa-1.0.0.anchor.json");
const MIGRATIONS_DIR = resolve(FIXTURE_DIR, "../../../../src-tauri/migrations");

export interface FixtureManifest {
  release: string;
  commit: string;
  migrations: string[];
  databaseId: string;
  clock: { firstRun: string; demo: string };
  password: string;
  names: Record<string, Record<string, string>>;
  files: Array<{ url: string; path: string }>;
  counts: Record<string, number>;
}

export function fixtureManifest(): FixtureManifest {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, "manifest.json"), "utf8")) as FixtureManifest;
}

export interface FixtureCopy {
  /** The database file. */
  db: string;
  /** Its anchor, as the 1.0.0 program kept it beside the database. */
  anchor: string;
  /** The program's data folder of the copy: `uploads/…` inside it holds the stored files' bytes. */
  dataDir: string;
}

/** A copy of the fixture in a new temporary folder, as 1.0.0 left it (nothing upgraded). */
export function fixtureCopy(): FixtureCopy {
  const dataDir = mkdtempSync(join(tmpdir(), "inmaa-1.0.0-"));
  const copy = { db: join(dataDir, "inmaa.db"), anchor: join(dataDir, "inmaa.anchor.json"), dataDir };
  cpSync(FIXTURE_DB, copy.db);
  cpSync(FIXTURE_ANCHOR, copy.anchor);
  cpSync(join(FIXTURE_DIR, "uploads"), join(dataDir, "uploads"), { recursive: true });
  return copy;
}

/**
 * Applies to a database file what the program's migrator would at start: each migration of
 * src-tauri/migrations that `_sqlx_migrations` does not list, in order, each in one
 * transaction with the program's two connect-time settings, then its row (sqlx 0.8: the
 * SHA-384 of the file's text). A listed migration whose text changed is refused, as sqlx
 * refuses it. Returns the migrations it applied.
 */
export function upgradeInPlace(file: string): string[] {
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;");
    const applied = new Map(
      (
        db.prepare("SELECT version, checksum FROM _sqlx_migrations WHERE success = 1").all() as Array<{
          version: number | bigint;
          checksum: Uint8Array;
        }>
      ).map((row) => [Number(row.version), Buffer.from(row.checksum).toString("hex")]),
    );
    const done: string[] = [];
    for (const name of readdirSync(MIGRATIONS_DIR)
      .filter((entry) => entry.endsWith(".sql"))
      .sort()) {
      const [, version, words] = /^(\d+)_(.+)\.sql$/.exec(name) ?? [];
      if (!version || !words) throw new Error(`fixture: ${name} is not a migration name`);
      const text = readFileSync(join(MIGRATIONS_DIR, name));
      const checksum = createHash("sha384").update(text).digest();
      const known = applied.get(Number(version));
      if (known !== undefined) {
        if (known !== checksum.toString("hex"))
          throw new Error(`fixture: migration ${name} was applied with other text`);
        continue;
      }
      db.exec("BEGIN");
      try {
        db.exec(text.toString("utf8"));
        db.prepare(
          "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) VALUES (?, ?, CURRENT_TIMESTAMP, 1, ?, 0)",
        ).run(Number(version), words.replace(/_/g, " "), checksum);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      done.push(name);
    }
    return done;
  } finally {
    db.close();
  }
}

/** A copy of the fixture, upgraded in place by every later migration. */
export function upgradedFixtureCopy(): FixtureCopy & { applied: string[] } {
  const copy = fixtureCopy();
  return { ...copy, applied: upgradeInPlace(copy.db) };
}
