/**
 * The three URLs the harness adds to whichever server is showing the app:
 *
 *   GET  /__harness/stub.js   the browser-side Tauri stand-in
 *   POST /__harness/invoke    one Tauri command
 *   GET  /__harness/asset     a file `convertFileSrc()` pointed at
 *
 * Shared by the Vite dev server (lib/vite-server.mjs) and the static server
 * that shows a built `dist/` (lib/dist-server.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CommandFailure } from "./backend.mjs";

export const HARNESS_PREFIX = "/__harness/";
export const STUB_URL = "/__harness/stub.js";

const STUB_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../browser/tauri-stub.js");

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

/**
 * @returns {Promise<boolean>} true when the request was one of the harness's own
 */
export async function handleHarnessRequest(req, res, backend) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith(HARNESS_PREFIX)) return false;

  if (url.pathname === STUB_URL) {
    res.statusCode = 200;
    res.setHeader("content-type", "text/javascript; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(fs.readFileSync(STUB_FILE));
    return true;
  }

  if (url.pathname === "/__harness/asset") {
    try {
      const asset = backend.readAsset(url.searchParams.get("path") ?? "");
      if (!asset) {
        res.statusCode = 404;
        res.end("not found");
        return true;
      }
      res.statusCode = 200;
      res.setHeader("content-type", asset.contentType);
      res.setHeader("cache-control", "no-store");
      res.end(asset.body);
    } catch {
      res.statusCode = 403;
      res.end("forbidden");
    }
    return true;
  }

  if (url.pathname === "/__harness/invoke" && req.method === "POST") {
    const command = decodeURIComponent(String(req.headers["x-harness-cmd"] ?? ""));
    try {
      const body = await readBody(req);
      let value;
      if (String(req.headers["content-type"] ?? "").startsWith("application/octet-stream")) {
        const headers = JSON.parse(decodeURIComponent(String(req.headers["x-harness-headers"] ?? "%7B%7D")));
        value = backend.invoke(command, undefined, { body, headers });
      } else {
        value = backend.invoke(command, body.length ? JSON.parse(body.toString("utf8")) : {});
      }
      if (value instanceof Uint8Array) sendJson(res, 200, { ok: true, binary: Buffer.from(value).toString("base64") });
      else sendJson(res, 200, { ok: true, value: value ?? null });
    } catch (error) {
      if (error instanceof CommandFailure) {
        sendJson(res, 200, { ok: false, error: error.payload, unstubbed: error.unstubbed });
      } else {
        sendJson(res, 200, { ok: false, error: { message: error instanceof Error ? error.message : String(error) } });
      }
    }
    return true;
  }

  res.statusCode = 404;
  res.end("not found");
  return true;
}
