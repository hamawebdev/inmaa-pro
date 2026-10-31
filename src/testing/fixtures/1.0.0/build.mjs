/**
 * Rebuilds the 1.0.0 fixture: a database exactly as an installed 1.0.0 copy holds it.
 *
 *   node src/testing/fixtures/1.0.0/build.mjs
 *
 * The program at release 1.0.0 (commit f5fd092) is unpacked with `git archive` into a
 * temporary folder outside the repository (nothing in the repository's git state is
 * written), its node_modules borrowed from this checkout, and its own code makes the
 * data: its migrations 0001 to 0003, first run, its demo data (every folder's, through
 * its own services, on its clock of Monday 12 October 2026), then, through its own
 * services again, a receipt series started on paper in 2025 (a SequenceGap of kind
 * OPENING, which references its log entry) and two stored files (a worker's photo, and
 * her signed form, restricted). Last, the `_sqlx_migrations` rows sqlx wrote when the
 * 1.0.0 program applied those three migrations, so the program that opens the file
 * upgrades it in place, as it would on the centre's PC.
 *
 * Writes, beside this script:
 *   inmaa-1.0.0.db            the database (journal mode DELETE, one file)
 *   inmaa-1.0.0.anchor.json   its anchor, as the 1.0.0 program kept it outside the database
 *   uploads/…                 the bytes of its two stored files, at their storage paths
 *   manifest.json             what it holds: row counts, the names the demo data gave, the files
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const RELEASE = "f5fd092";

// The 1.0.0 code that writes the extra rows, run inside the unpacked 1.0.0 tree (its `@/` paths).
const BUILDER = `
import { declarePaperNumbers } from "@/features/core/services/paper-numbers";
import { linkUpload, memoryByteStore, saveUpload, storagePathOf } from "@/lib/attachments";
import { PHOTO_UPLOAD_RULE, CV_UPLOAD_RULE } from "@/lib/uploads";
import { writeAnchor } from "@/lib/chain/anchor";
import { fileAnchorStore } from "./anchor-file";
import { createTestDatabase, TABLE_SHAPES_FOR_FIXTURE } from "./fixture-shim";
import { runDemo } from "./demo";
import { DEMO_NOW } from "./demo";

// A PNG of one pixel, and a one-page PDF: real file types, so the upload rules accept them.
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
const PDF = new TextEncoder().encode("%PDF-1.4\\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\\ntrailer<</Root 1 0 R>>\\n%%EOF\\n");

export async function buildFixture(file: string, anchorFile: string) {
  // The centre started the program at the end of 2025, with receipts already written on paper that year.
  const anchor = fileAnchorStore(anchorFile);
  const test = await createTestDatabase({ file, now: "2025-12-20T08:00:00.000Z", anchor });
  try {
    await test.transact((ex, ctx) =>
      declarePaperNumbers(ex, ctx, { key: "RECEIPT", lastValue: 37, lastDate: "2025-12-18", reason: "وصولات محررة يدويا قبل البرنامج" }),
    );
    test.clock.set(DEMO_NOW);
    const names = await runDemo(test.db, { clock: test.clock });
    const store = memoryByteStore();
    const worker = names.people.workerSamira;
    const files = await test.transact(async (ex, ctx) => {
      const photo = await saveUpload(ex, ctx, store, {
        entity: "StaffMember", field: "photoUrl", rule: PHOTO_UPLOAD_RULE,
        file: { name: "samira.png", type: "image/png", bytes: PNG },
      });
      await linkUpload(ex, ctx, photo.url, worker);
      const form = await saveUpload(ex, ctx, store, {
        entity: "StaffConfidential", field: "signedFormScanUrl", rule: CV_UPLOAD_RULE, restrictedCapability: "staff.health.read",
        file: { name: "form.pdf", type: "application/pdf", bytes: PDF },
      });
      const confidential = await ex.selectFrom("StaffConfidential").select("id").where("staffId", "=", worker).executeTakeFirstOrThrow();
      await linkUpload(ex, ctx, form.url, confidential.id);
      await ex.updateTable("StaffMember").set({ photoUrl: photo.url, updatedAt: ctx.now, updatedByUserId: ctx.userId }).where("id", "=", worker).execute();
      await ex.updateTable("StaffConfidential").set({ signedFormScanUrl: form.url, updatedAt: ctx.now, updatedByUserId: ctx.userId }).where("id", "=", confidential.id).execute();
      return [photo.url, form.url].map((url) => ({ url, path: storagePathOf(url), bytes: Buffer.from(store.files.get(storagePathOf(url))!).toString("base64") }));
    });
    // As the program does after every action and when its window closes: the anchor holds the last heads.
    await writeAnchor(test.db, anchor, test.clock.now().toISOString());
    const counts: Record<string, number> = {};
    for (const table of Object.keys(TABLE_SHAPES_FOR_FIXTURE)) {
      const row = test.raw.prepare(\`SELECT COUNT(*) AS n FROM "\${table}"\`).get() as { n: number | bigint };
      if (Number(row.n) > 0) counts[table] = Number(row.n);
    }
    return { names, files, counts };
  } finally {
    test.close();
  }
}
`;
const SHIM = `
export { createTestDatabase } from "./database";
export { TABLE_SHAPES as TABLE_SHAPES_FOR_FIXTURE } from "./table-shapes";
`;

const work = mkdtempSync(join(tmpdir(), "inmaa-fixture-1.0.0-"));
try {
  const tree = join(work, "tree");
  mkdirSync(tree);
  // Read-only for this repository: git archive writes the release's files to stdout.
  const archive = execFileSync("git", ["-C", ROOT, "archive", RELEASE], { maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", tree], { input: archive });
  symlinkSync(join(ROOT, "node_modules"), join(tree, "node_modules"));
  writeFileSync(join(tree, "src/testing/fixture-builder.ts"), BUILDER);
  writeFileSync(join(tree, "src/testing/fixture-shim.ts"), SHIM);

  const { loadVite } = await import(join(tree, "scripts/harness/lib/vite-server.mjs"));
  const vite = await loadVite(tree);
  const server = await vite.createServer({
    root: tree,
    configFile: join(tree, "vite.config.ts"),
    cacheDir: join(work, "vite-cache"),
    logLevel: "warn",
    clearScreen: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const db = join(work, "inmaa-1.0.0.db");
  const anchor = join(work, "inmaa-1.0.0.anchor.json");
  let built;
  try {
    const { buildFixture } = await server.ssrLoadModule("/src/testing/fixture-builder.ts");
    built = await buildFixture(db, anchor);
  } finally {
    await server.close();
  }

  // What sqlx wrote when the 1.0.0 program applied its three migrations (sqlx 0.8: the
  // checksum is the SHA-384 of the file's text; the description, the name's words).
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(db);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
)`);
  const migrations = readdirSync(join(tree, "src-tauri/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const insert = sqlite.prepare(
    "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) VALUES (?, ?, ?, 1, ?, ?)",
  );
  for (const name of migrations) {
    const [, version, words] = /^(\d+)_(.+)\.sql$/.exec(name);
    const checksum = createHash("sha384")
      .update(readFileSync(join(tree, "src-tauri/migrations", name)))
      .digest();
    insert.run(Number(version), words.replace(/_/g, " "), "2025-12-20 08:00:00", checksum, 1_000_000);
  }
  sqlite.exec("PRAGMA journal_mode = DELETE");
  const check = sqlite.prepare("PRAGMA integrity_check").get().integrity_check;
  sqlite.close();
  if (check !== "ok") throw new Error(`fixture: integrity_check says ${check}`);

  rmSync(join(HERE, "uploads"), { recursive: true, force: true });
  for (const file of built.files) {
    const target = join(HERE, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(file.bytes, "base64"));
  }
  cpSync(db, join(HERE, "inmaa-1.0.0.db"));
  if (existsSync(anchor)) cpSync(anchor, join(HERE, "inmaa-1.0.0.anchor.json"));
  const manifest = {
    release: "1.0.0",
    commit: RELEASE,
    migrations,
    databaseId: "00000000-0000-4000-8000-000000000001",
    clock: { firstRun: "2025-12-20T08:00:00.000Z", demo: "2026-10-12T08:00:00.000Z" },
    password: "inmaa-demo",
    names: built.names,
    files: built.files.map(({ url, path }) => ({ url, path })),
    counts: built.counts,
  };
  writeFileSync(join(HERE, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // As the repository formats JSON (npm run format:check).
  execFileSync(join(ROOT, "node_modules/.bin/prettier"), [
    "--write",
    join(HERE, "manifest.json"),
    join(HERE, "inmaa-1.0.0.anchor.json"),
  ]);
  console.log(`1.0.0 fixture written: ${Object.values(built.counts).reduce((a, b) => a + b, 0)} rows`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
