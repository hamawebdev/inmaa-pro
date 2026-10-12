/**
 * The demo database, for the harness's `--demo`.
 *
 * `npm run demo` (scripts/demo.mjs) builds it from every folder's
 * `src/features/<folder>/demo.ts` into .harness/demo/. A run with `--demo`
 * copies it into its own folder instead of building an empty database, after
 * building it again if it is missing or older than the migrations or than a
 * folder's demo.ts. A route may name a record of the demo data:
 * `--route "/dashboard/files/{clients.housingFile}/print"`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { HARNESS_DIR, PROJECT_ROOT } from "./session.mjs";

export const DEMO_DB = path.join(HARNESS_DIR, "demo", "inmaa-demo.db");

/** The database and the two files written beside it. */
export function demoFiles(db = DEMO_DB) {
  const base = db.replace(/\.db$/, "");
  return { db, anchor: `${base}.anchor.json`, manifest: `${base}.json` };
}

/** The same fingerprint as `migrationsFingerprint()` in src/testing/demo-build.ts. */
export function migrationsFingerprint(root = PROJECT_ROOT) {
  const dir = path.join(root, "src-tauri", "migrations");
  const hash = createHash("sha256");
  for (const name of fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    hash.update(`${name}\n${fs.readFileSync(path.join(dir, name), "utf8")}\n`);
  }
  return hash.digest("hex");
}

function staleReason(root, files) {
  if (!fs.existsSync(files.db) || !fs.existsSync(files.manifest)) return "there is none yet";
  const manifest = JSON.parse(fs.readFileSync(files.manifest, "utf8"));
  if (manifest.migrations !== migrationsFingerprint(root)) return "the migrations changed since it was built";
  const built = Date.parse(manifest.builtAt);
  const features = path.join(root, "src", "features");
  for (const folder of fs.readdirSync(features)) {
    const file = path.join(features, folder, "demo.ts");
    if (fs.existsSync(file) && fs.statSync(file).mtimeMs > built) {
      return `src/features/${folder}/demo.ts changed since it was built`;
    }
  }
  return null;
}

/**
 * The demo database, built first when it is missing or stale. Notes go to
 * stderr: stdout is where the entry scripts print the files they wrote.
 */
export function ensureDemoDatabase(root = PROJECT_ROOT) {
  const files = demoFiles();
  const reason = staleReason(root, files);
  if (reason) {
    console.error(`demo data: ${reason}; building it (npm run demo)…`);
    const run = spawnSync(process.execPath, [path.join(root, "scripts", "demo.mjs")], { stdio: ["ignore", 2, 2] });
    if (run.status !== 0) throw new Error("the demo data could not be built: see above");
  }
  const manifest = JSON.parse(fs.readFileSync(files.manifest, "utf8"));
  console.error(`demo data: built ${manifest.builtAt}, folders ${manifest.folders.join(", ")}`);
  return { ...files, manifest };
}

/** Replaces `{folder.name}` in a route by the id that folder's demo data named. */
export function resolveDemoRoute(route, names) {
  if (!route) return route;
  return route.replace(/\{([a-z]+)\.([A-Za-z0-9_]+)\}/g, (_whole, folder, name) => {
    const id = names[folder]?.[name];
    if (!id) {
      const known = Object.entries(names).flatMap(([owner, entries]) =>
        Object.keys(entries).map((key) => `${owner}.${key}`),
      );
      throw new Error(`the demo data names no record ${folder}.${name}. Named: ${known.join(", ") || "none"}`);
    }
    return id;
  });
}
