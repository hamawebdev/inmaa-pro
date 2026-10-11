/**
 * Serves an app's source through its own Vite, with the harness attached.
 *
 * "Its own Vite" matters: the target is either this project or the scratch
 * copy of the reference, and each is loaded with the Vite, plugins and config
 * in its own folder. The harness adds one plugin from outside and changes no
 * file in the target.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { handleHarnessRequest, STUB_URL } from "./endpoints.mjs";

async function loadVite(root) {
  const packageDir = path.join(root, "node_modules", "vite");
  const manifestPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`no node_modules/vite under ${root}. The target needs its own installed dependencies.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry =
    typeof manifest.exports?.["."] === "string"
      ? manifest.exports["."]
      : (manifest.exports?.["."]?.import ?? manifest.main);
  return import(pathToFileURL(path.join(packageDir, entry)).href);
}

/** Adds the endpoints and puts the stub first in <head>. Serve only. */
function harnessPlugin(backend) {
  return {
    name: "inmaa-harness",
    apply: "serve",
    configureServer(server) {
      // Registered here, in the hook body, so it runs before Vite's own
      // middlewares and the SPA fallback never sees a harness URL.
      server.middlewares.use((req, res, next) => {
        handleHarnessRequest(req, res, backend).then((handled) => {
          if (!handled) next();
        }, next);
      });
    },
    transformIndexHtml: {
      order: "post",
      handler() {
        return [{ tag: "script", attrs: { src: STUB_URL }, injectTo: "head-prepend" }];
      },
    },
  };
}

/**
 * @param {object} options
 * @param {string} options.root
 * @param {ReturnType<import("./backend.mjs").createBackend>} options.backend
 * @param {object[]} [options.plugins] extra Vite plugins (experiments)
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>}
 */
export async function startViteServer({ root, backend, plugins = [] }) {
  const vite = await loadVite(root);
  const configFile = ["vite.config.ts", "vite.config.js", "vite.config.mjs"]
    .map((name) => path.join(root, name))
    .find((file) => fs.existsSync(file));

  // Vite ends the whole process on SIGTERM, and when stdin closes, as soon as
  // its own server is shut. That would cut this run's teardown short and leave
  // the run's folder behind, so the hooks it adds are taken back out below and
  // lib/session.mjs stays the only owner of shutdown.
  const sigterm = new Set(process.listeners("SIGTERM"));
  const stdinEnd = new Set(process.stdin.listeners("end"));

  const server = await vite.createServer({
    root,
    configFile: configFile ?? false,
    // Its own cache, so a harness run never invalidates the one `npm run dev`
    // built, and never the other way round. Experiments change the plugin list,
    // which Vite hashes into the cache, so each set of them gets its own too.
    cacheDir: path.join(root, "node_modules", [".vite-harness", ...plugins.map((plugin) => plugin.name)].join("-")),
    logLevel: "warn",
    clearScreen: false,
    server: {
      host: "127.0.0.1",
      // 0 = whatever is free. The app's own config pins 1420 for Tauri; two
      // runs, or a run beside `tauri dev`, must not fight over it.
      port: 0,
      strictPort: false,
      open: false,
      hmr: false,
      // One-shot: nothing is edited while a run is in flight.
      watch: null,
    },
    plugins: [harnessPlugin(backend), ...plugins],
  });

  await server.listen();
  for (const listener of process.listeners("SIGTERM")) {
    if (!sigterm.has(listener)) process.off("SIGTERM", listener);
  }
  for (const listener of process.stdin.listeners("end")) {
    if (!stdinEnd.has(listener)) process.stdin.off("end", listener);
  }

  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("the Vite server did not report a port");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}
