/**
 * npm run demo: builds the demo database from every folder's demo data.
 *
 *   npm run demo                            → .harness/demo/inmaa-demo.db, with its anchor and manifest
 *   npm run demo -- --only clients,money    core's demo data and these folders' only
 *   npm run demo -- --out /tmp/demo.db
 *
 * Each folder writes its own, with its own services, in
 * src/features/<folder>/demo.ts (see "Demo data" in CLAUDE.md). The folders'
 * code is loaded through the project's own Vite, as the tests load it, so the
 * `@/` paths and the folder lists work; nothing is served and nothing listens.
 * The harness opens the result with `--demo`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./harness/lib/args.mjs";
import { DEMO_DB, demoFiles } from "./harness/lib/demo.mjs";
import { loadVite } from "./harness/lib/vite-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function buildDemo({ out = DEMO_DB, only } = {}) {
  const vite = await loadVite(ROOT);
  const server = await vite.createServer({
    root: ROOT,
    configFile: path.join(ROOT, "vite.config.ts"),
    cacheDir: path.join(ROOT, "node_modules", ".vite-demo"),
    logLevel: "warn",
    clearScreen: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { buildDemoDatabase } = await server.ssrLoadModule("/src/testing/demo-build.ts");
    return await buildDemoDatabase(path.resolve(out), { folders: only });
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2), { flags: ["help"] });
  if (args.help) {
    process.stdout.write("Usage: npm run demo [-- --only core,clients] [-- --out <file.db>]\n");
    process.exit(0);
  }
  const out = path.resolve(args.out ?? DEMO_DB);
  const only = args.only
    ? String(args.only)
        .split(",")
        .map((folder) => folder.trim())
        .filter(Boolean)
    : undefined;
  try {
    const manifest = await buildDemo({ out, only });
    const files = demoFiles(out);
    console.log(files.db);
    console.log(`  folders: ${manifest.folders.join(", ")}`);
    for (const [folder, names] of Object.entries(manifest.names)) {
      const keys = Object.keys(names);
      if (keys.length) console.log(`  {${folder}.…}: ${keys.join(", ")}`);
    }
    const rows = Object.entries(manifest.counts)
      .map(([table, count]) => `${table} ${count}`)
      .join(", ");
    console.log(`  rows: ${rows}`);
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  }
}
