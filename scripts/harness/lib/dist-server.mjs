/**
 * Serves an app's built `dist/` the way the installed program will see it:
 * bundled files only, under the content security policy from tauri.conf.json.
 *
 * Tauri applies that policy only to its embedded assets, so neither `tauri dev`
 * nor the Vite server ever enforces it. This is the one place it can be seen
 * working before a real launch.
 *
 * What is adapted for the browser, and why (also in README.md):
 *  - the stub is added as the first script in <head>; it is same-origin, so
 *    `script-src 'self'` covers it;
 *  - inline scripts in the HTML get their sha256 added to `script-src`, which
 *    is what Tauri does at build time;
 *  - where the policy allows Tauri's own transports, the same directive allows
 *    this server, because here those transports are plain same-origin requests:
 *    `ipc:` in connect-src, `asset:` in img-src / media-src / font-src.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { handleHarnessRequest, STUB_URL } from "./endpoints.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/**
 * @param {string | Record<string, string | string[]>} csp as written in tauri.conf.json
 * @returns {Map<string, string[]>}
 */
export function parsePolicy(csp) {
  const policy = new Map();
  if (typeof csp === "string") {
    for (const part of csp.split(";")) {
      const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
      if (name) policy.set(name, sources);
    }
  } else if (csp && typeof csp === "object") {
    for (const [name, sources] of Object.entries(csp)) {
      policy.set(name, Array.isArray(sources) ? sources.slice() : String(sources).split(/\s+/).filter(Boolean));
    }
  }
  if (policy.size === 0) throw new Error("the content security policy is empty");
  return policy;
}

export function serializePolicy(policy) {
  return Array.from(policy, ([name, sources]) => [name, ...sources].join(" ")).join("; ");
}

/** The policy from an app's src-tauri/tauri.conf.json, or null when it sets none. */
export function readPolicyFromTauriConfig(root) {
  const file = path.join(root, "src-tauri", "tauri.conf.json");
  if (!fs.existsSync(file)) return null;
  const csp = JSON.parse(fs.readFileSync(file, "utf8"))?.app?.security?.csp;
  return csp ? parsePolicy(csp) : null;
}

function inlineScriptHashes(html) {
  const hashes = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    hashes.push(`'sha256-${crypto.createHash("sha256").update(match[2], "utf8").digest("base64")}'`);
  }
  return hashes;
}

/** The header this server sends, and the list of things it added to the written policy. */
export function browserPolicy(policy, html) {
  const adapted = new Map(Array.from(policy, ([name, sources]) => [name, sources.slice()]));
  const added = [];
  const allow = (directive, source, reason) => {
    const sources = adapted.get(directive);
    if (!sources || sources.includes(source)) return;
    sources.push(source);
    added.push(`${directive} ${source} (${reason})`);
  };

  const scriptSrc = adapted.has("script-src") ? "script-src" : "default-src";
  for (const hash of inlineScriptHashes(html))
    allow(scriptSrc, hash, "inline script; Tauri adds this hash at build time");
  if (adapted.get("connect-src")?.some((source) => source === "ipc:" || source === "http://ipc.localhost")) {
    allow("connect-src", "'self'", "stands for Tauri's ipc: transport");
  }
  for (const directive of ["img-src", "media-src", "font-src"]) {
    if (adapted.get(directive)?.some((source) => source === "asset:" || source === "http://asset.localhost")) {
      allow(directive, "'self'", "stands for Tauri's asset: protocol");
    }
  }
  return { header: serializePolicy(adapted), added };
}

/**
 * @param {object} options
 * @param {string} options.root   the app folder; its `dist/` is served
 * @param {ReturnType<import("./backend.mjs").createBackend>} options.backend
 * @param {Map<string, string[]>} options.policy
 * @returns {Promise<{ origin: string, added: Set<string>, close: () => Promise<void> }>}
 */
export async function startDistServer({ root, backend, policy }) {
  const dist = path.join(root, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    throw new Error(`${dist} has no index.html. Build the app first: npm run build`);
  }
  const added = new Set();

  const server = http.createServer((req, res) => {
    handleHarnessRequest(req, res, backend)
      .then((handled) => {
        if (handled) return;
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
        const file = path.join(dist, relative);
        if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }

        const extension = path.extname(file).toLowerCase();
        res.setHeader("content-type", TYPES[extension] ?? "application/octet-stream");
        res.setHeader("cache-control", "no-store");
        if (extension !== ".html") {
          res.end(fs.readFileSync(file));
          return;
        }

        const source = fs.readFileSync(file, "utf8");
        // The hashes are of the app's own inline scripts, taken before the stub goes in.
        const adapted = browserPolicy(policy, source);
        for (const line of adapted.added) added.add(line);
        res.setHeader("content-security-policy", adapted.header);
        res.end(source.replace(/<head([^>]*)>/i, `<head$1><script src="${STUB_URL}"></script>`));
      })
      .catch((error) => {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : String(error));
      });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  return {
    origin: `http://127.0.0.1:${address.port}`,
    added,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
