import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { DEMO_PASSWORD } from "@/features/core/demo";
import { toLocal } from "@/lib/clock";

import { fileAnchorStore } from "./anchor-file";
import { createTestDatabase, migrationFiles } from "./database";
import { DEMO_NOW, type DemoNames } from "./demo";
import { TABLE_SHAPES } from "./table-shapes";

/**
 * Builds the demo database into a file, for `npm run demo` (scripts/demo.mjs)
 * and the harness's `--demo`.
 *
 * Three files: `<name>.db`, its anchor `<name>.anchor.json` (as the program
 * keeps it outside the database), and `<name>.json`, which says what was built:
 * the folders, what each named, the rows per table, and a fingerprint of the
 * migrations so the harness can tell a stale build.
 */
export interface DemoManifest {
  builtAt: string;
  demoNow: string;
  /** The same instant as the harness's `--now` takes it: the centre's local time. */
  demoLocal: string;
  migrations: string;
  folders: string[];
  names: Record<string, DemoNames>;
  counts: Record<string, number>;
  /** The sign-in names of the demo accounts, the manager first, and the one password they share: the harness's `--user`. */
  accounts: string[];
  password: string;
}

/** A fingerprint of the migrations, as scripts/harness/lib/demo.mjs computes it from the files. */
export function migrationsFingerprint(): string {
  const hash = createHash("sha256");
  for (const { name, sql } of migrationFiles()) hash.update(`${name}\n${sql}\n`);
  return hash.digest("hex");
}

const sidecars = (file: string) => {
  const base = file.replace(/\.db$/, "");
  return { anchor: `${base}.anchor.json`, manifest: `${base}.json` };
};

export async function buildDemoDatabase(
  file: string,
  options: { folders?: readonly string[] } = {},
): Promise<DemoManifest> {
  mkdirSync(dirname(file), { recursive: true });
  const building = `${file}.building-${process.pid}`;
  const target = sidecars(file);
  const temporary = sidecars(building);
  for (const leftover of [building, `${building}-journal`, temporary.anchor]) rmSync(leftover, { force: true });

  const test = await createTestDatabase({
    file: building,
    now: DEMO_NOW,
    anchor: fileAnchorStore(temporary.anchor),
    demo: options.folders ?? true,
  });
  let manifest: DemoManifest;
  try {
    const counts: Record<string, number> = {};
    for (const table of Object.keys(TABLE_SHAPES)) {
      const row = test.raw.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number | bigint };
      if (Number(row.n) > 0) counts[table] = Number(row.n);
    }
    const local = toLocal(DEMO_NOW, test.clock.utcOffsetMin);
    manifest = {
      builtAt: new Date().toISOString(),
      demoNow: DEMO_NOW,
      demoLocal: `${local.date}T${local.time}:00`,
      migrations: migrationsFingerprint(),
      folders: Object.keys(test.demo),
      names: test.demo,
      counts,
      accounts: (
        await test.db.selectFrom("User").select("username").where("isActive", "=", 1).orderBy("createdAt").execute()
      ).map((account) => account.username),
      password: DEMO_PASSWORD,
    };
  } finally {
    test.close();
  }

  // Into place in one step each, so a harness run reading them at the same moment never sees half a file.
  renameSync(building, file);
  if (existsSync(temporary.anchor)) renameSync(temporary.anchor, target.anchor);
  writeFileSync(`${target.manifest}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(`${target.manifest}.tmp`, target.manifest);
  return manifest;
}
