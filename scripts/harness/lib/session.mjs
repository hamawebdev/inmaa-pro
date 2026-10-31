/**
 * One harness run: a backend with a fresh database, a server on a free port,
 * a headless Chrome, and their teardown. Everything a run creates lives under
 * `.harness/run/<id>/` and is deleted when the run ends.
 */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createBackend } from "./backend.mjs";
import { launchChrome } from "./browser.mjs";
import { startDistServer } from "./dist-server.mjs";
import { signIn } from "./sign-in.mjs";
import { acquireSlot } from "./slots.mjs";
import { startViteServer } from "./vite-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The project this harness belongs to. */
export const PROJECT_ROOT = path.resolve(HERE, "../../..");
/** Harness output and throwaway files. Git-ignored. */
export const HARNESS_DIR = path.join(PROJECT_ROOT, ".harness");
/** The scratch copy of the reference academy frontend. Git-ignored. */
export const REFERENCE_ROOT = path.join(PROJECT_ROOT, ".reference-scratch");

export const DEFAULT_SIZE = { width: 1440, height: 900 };
/** The two window sizes every screen is checked at: Tauri's default and its minimum. */
export const WINDOW_SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 640 },
];
/** The centre's time zone. Pinned so dates do not depend on the machine. */
export const DEFAULT_TIMEZONE = "Africa/Algiers";

export function parseSize(text) {
  const match = /^(\d+)x(\d+)$/.exec(String(text));
  if (!match) throw new Error(`bad size "${text}": write it as 1440x900`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function sizeLabel(size) {
  return `${size.width}x${size.height}`;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

/** Left in a run's folder by `--keep`: the sweep spares it for a day, so it can be looked at. */
const KEPT_MARKER = "KEPT";
const KEPT_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * Cleans up after runs whose process is gone (a crash, a kill -9): stops the
 * Chrome they left, if it is still theirs, and removes their folder. A folder
 * kept on purpose (`--keep`) is removed only once it is a day old: several
 * people run the harness at once, and one's run must not delete another's.
 */
function sweepDeadRuns(runsDir) {
  if (!fs.existsSync(runsDir)) return;
  for (const name of fs.readdirSync(runsDir)) {
    const owner = Number(name.split("-").pop());
    if (!Number.isInteger(owner) || owner === process.pid || isAlive(owner)) continue;
    try {
      const kept = fs.statSync(path.join(runsDir, name, KEPT_MARKER));
      if (Date.now() - kept.mtimeMs < KEPT_FOR_MS) continue;
    } catch {
      // Not kept: a run that ended without its teardown.
    }

    const runDir = path.join(runsDir, name);
    try {
      const chromePid = Number(fs.readFileSync(path.join(runDir, "chrome.pid"), "utf8"));
      // Only if that pid is still a Chrome started on this very folder: pids are reused.
      const commandLine = fs.readFileSync(`/proc/${chromePid}/cmdline`, "utf8");
      // The browser leads its own process group (see browser.mjs), so this stops its helpers too.
      if (commandLine.includes(runDir)) process.kill(-chromePid, "SIGKILL");
    } catch {
      // No pid file, or the process is gone: nothing to stop.
    }
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

function buildUrl(origin, view) {
  const query = new URLSearchParams();
  for (const key of ["locale", "theme", "now"]) {
    if (view[key]) query.set(key, view[key]);
  }
  const page = view.page && view.page !== "index.html" ? view.page : "";
  const route = view.route ? `#${view.route.startsWith("/") ? view.route : `/${view.route}`}` : "";
  const search = query.toString();
  return `${origin}/${page}${search ? `?${search}` : ""}${route}`;
}

/**
 * @typedef {object} View
 * @property {string} [route]   hash-router path, e.g. "/dashboard/home"
 * @property {string} [page]    "index.html" (default), or another HTML file of the app (the reference's "lock.html")
 * @property {string} [locale]  "ar" | "fr" | "en"; omitted = the app's default
 * @property {string} [theme]   "light" | "dark" | "system"; omitted = the app's default
 * @property {string} [user]    the sign-in name of the account to be signed in as (default "manager")
 * @property {boolean} [signedOut] stay on the sign-in window instead of signing in
 * @property {string} [before]  JavaScript evaluated once the screen has settled and before it is looked at;
 *                              the screen is then left to settle again (open a dialog, pick an account)
 * @property {string} [now]     a fixed clock, local time, e.g. "2026-10-11T10:30:00"
 * @property {string} [wait]    CSS selector that must exist before the screen counts as settled
 * @property {"bottom"|number} [scroll] how far to scroll the app's main scroller
 * @property {string} [scrollTo] CSS selector: scroll until that element is at the top
 * @property {string} [clip]    CSS selector: shoot only that element
 * @property {string} [evaluate] JavaScript evaluated in the page once settled; its value is returned
 */

/**
 * @param {object} [options]
 * @param {string} [options.root]      the app to serve; this project by default
 * @param {string[]} [options.seeds]   SQL files applied after the migrations
 * @param {object|null} [options.syncVault] what the sync vault holds (null: sync not set up)
 * @param {object[]} [options.plugins] extra Vite plugins (experiments)
 * @param {Map<string, string[]>} [options.builtWithPolicy] serve the built `dist/` under this
 *   content security policy instead of the source through Vite
 * @param {string} [options.timezone]
 * @param {boolean} [options.keep]     leave the run's folder behind for inspection
 * @param {{ db: string, anchor: string, manifest?: { password?: string } }} [options.demo] start from the demo
 *   database (lib/demo.mjs); its manifest names the password its accounts sign in with
 * @param {string} [options.anchor] an anchor record to start from instead of the demo's (a database that
 *   does not agree with its anchor opens on the screen that asks the manager)
 */
export async function openHarness({
  root = PROJECT_ROOT,
  seeds = [],
  syncVault = null,
  plugins = [],
  builtWithPolicy,
  timezone = DEFAULT_TIMEZONE,
  keep = false,
  demo,
  anchor,
} = {}) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root, "index.html"))) {
    throw new Error(`${root} has no index.html. Is it an app folder?`);
  }

  // One of a few slots first: twenty runs at once starve one another (lib/slots.mjs).
  const releaseSlot = await acquireSlot(HARNESS_DIR);

  const runsDir = path.join(HARNESS_DIR, "run");
  sweepDeadRuns(runsDir);
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const runDir = path.join(runsDir, `${stamp}-${process.pid}`);
  fs.mkdirSync(runDir, { recursive: true });

  let backend;
  let server;
  let chrome;
  /** The one teardown, shared by every caller so a second request waits for the first. */
  let closing;
  let removed = false;

  async function tearDown() {
    if (chrome) await chrome.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    if (backend) backend.close();
    if (keep) {
      try {
        fs.writeFileSync(path.join(runDir, KEPT_MARKER), "kept with --keep\n");
      } catch {
        // The folder is gone already: nothing to keep.
      }
    } else {
      // Chrome can still be releasing its profile for a moment after it exits.
      for (let attempt = 0; attempt < 5 && !removed; attempt += 1) {
        try {
          fs.rmSync(runDir, { recursive: true, force: true });
          removed = true;
        } catch {
          await sleep(200);
        }
      }
    }
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("exit", onExit);
    releaseSlot();
  }

  function close() {
    closing ??= tearDown();
    return closing;
  }

  function onSignal() {
    // The teardown gets a few seconds; then the run ends anyway, and its place in the queue is given back.
    Promise.race([close(), sleep(5_000)]).finally(() => {
      releaseSlot();
      process.exit(130);
    });
  }
  // The last line of defence, for an exit nobody awaited: synchronous, so it
  // can only delete. Chrome has its own hook of the same kind in browser.mjs.
  function onExit() {
    if (removed || keep) return;
    try {
      fs.rmSync(runDir, { recursive: true, force: true });
    } catch {
      // The next run's sweep removes it.
    }
  }
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("exit", onExit);

  try {
    backend = await createBackend({
      root,
      runDir,
      seeds: seeds.map((seed) => path.resolve(seed)),
      syncVault,
      database: demo?.db,
      anchor: anchor ?? demo?.anchor,
    });
    server = builtWithPolicy
      ? await startDistServer({ root, backend, policy: builtWithPolicy })
      : await startViteServer({ root, backend, plugins });
    chrome = await launchChrome({ runDir });
  } catch (error) {
    await close();
    throw error;
  }

  /**
   * One clock for the whole session. Every tab starts its fixed `now` again,
   * but the database goes on: a view opened after another (a list of routes,
   * two sizes) would start before what the last one wrote (a print's
   * disclosure, a sign-in), and the program's clock guard would refuse the
   * sign-in. So a later view's `now` is moved on by the real time since the
   * session's first view, as if the PC's clock had kept running.
   */
  let clockBase = null;
  function continuousNow(now) {
    if (!now) return now;
    const fixed = Date.parse(`${now.length === 16 ? `${now}:00` : now.slice(0, 19)}Z`);
    if (Number.isNaN(fixed)) return now;
    if (!clockBase || clockBase.now !== now) {
      clockBase = { now, realMs: Date.now() };
      return now;
    }
    return new Date(fixed + (Date.now() - clockBase.realMs) + 1_000).toISOString().slice(0, 19);
  }

  /** Opens a view in a fresh tab and leaves it settled. */
  async function open(view, firstSize) {
    const page = await chrome.newPage();
    await page.prepare({ origin: server.origin, timezone });
    await page.setColorScheme(view.theme === "dark" ? "dark" : "light");
    await page.setViewport(firstSize.width, firstSize.height);
    const url = buildUrl(server.origin, { ...view, now: continuousNow(view.now) });
    await page.goto(url);
    // The program opens on its sign-in window: what `view.wait` names is behind it.
    let { settled, state } = await page.waitUntilSettled({ quietMs: 250 });
    if (settled && !view.signedOut) {
      await signIn(page, { user: view.user, password: demo?.manifest?.password });
    }
    ({ settled, state } = await page.waitUntilSettled({ selector: view.wait }));
    if (settled && view.before) {
      await page.evaluate(view.before);
      ({ settled, state } = await page.waitUntilSettled({ selector: view.wait, quietMs: 300 }));
    }
    if (settled && (view.scroll !== undefined || view.scrollTo)) {
      if (view.scrollTo) {
        const found = await page.evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(view.scrollTo)}); if (el) el.scrollIntoView({ block: "start" }); return !!el; })()`,
        );
        if (!found) throw new Error(`nothing matches the scroll target ${view.scrollTo}`);
      } else {
        const top = view.scroll === "bottom" ? "el.scrollHeight" : String(Number(view.scroll));
        await page.evaluate(
          `(() => { const el = document.querySelector("[data-app-main]") ?? document.scrollingElement; el.scrollTo(0, ${top}); })()`,
        );
      }
      await page.waitUntilSettled({ quietMs: 200 });
    }
    return { page, url, settled, state };
  }

  /** Everything a visit saw besides pixels. */
  async function report(page, extra) {
    const seen = await page
      .evaluate(
        `(() => { const h = window.__HARNESS__ ?? {}; return {
          notifications: h.notifications ?? [], prints: h.prints ?? 0, failures: h.failures ?? [], violations: h.cspViolations ?? [],
        }; })()`,
      )
      .catch(() => ({ notifications: [], prints: 0, failures: [], violations: [] }));
    // The page's own events name the directive; the browser log covers the case
    // where the stub itself was refused and could record nothing.
    const cspViolations = seen.violations.length
      ? seen.violations.map(
          (v) =>
            `${v.directive} refused ${v.blocked || "an inline block"}${v.source ? ` (${v.source}:${v.line})` : ""}`,
        )
      : page.cspViolations.slice();
    return {
      ...extra,
      notifications: seen.notifications,
      prints: seen.prints,
      failures: seen.failures,
      cspViolations,
      problems: page.problems.slice(),
      foreignRequests: page.foreignRequests.slice(),
      unstubbed: [...backend.unstubbed],
    };
  }

  /**
   * Opens one view, waits for it to settle, and reports what happened. No picture.
   *
   * @param {View} view
   */
  async function visit(view) {
    const { page, url, settled, state } = await open(view, DEFAULT_SIZE);
    try {
      const value = view.evaluate ? await page.evaluate(view.evaluate) : undefined;
      return await report(page, { url, settled, state, value });
    } finally {
      await page.close();
    }
  }

  /**
   * Shoots one view at one or more window sizes, from a single load.
   *
   * @param {View} view
   * @param {{ width: number, height: number }[]} [sizes]
   */
  async function shoot(view, sizes = [DEFAULT_SIZE]) {
    const { page, url, settled, state } = await open(view, sizes[0]);
    try {
      const shots = [];
      for (const [index, size] of sizes.entries()) {
        if (index > 0) {
          await page.setViewport(size.width, size.height);
          await page.waitUntilSettled({ quietMs: 250 });
        }
        let clip;
        if (view.clip) {
          clip = await page.evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(view.clip)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const pad = 8;
            const x = Math.max(0, Math.floor(r.x - pad)), y = Math.max(0, Math.floor(r.y - pad));
            return {
              x, y,
              width: Math.min(window.innerWidth - x, Math.ceil(r.width + pad * 2)),
              height: Math.min(window.innerHeight - y, Math.ceil(r.height + pad * 2)),
            };
          })()`);
          if (!clip) throw new Error(`nothing matches --clip ${view.clip}`);
        }
        shots.push({ size, png: await page.screenshot({ clip }) });
      }
      const value = view.evaluate ? await page.evaluate(view.evaluate) : undefined;
      return await report(page, { url, settled, state, shots, value });
    } finally {
      await page.close();
    }
  }

  /**
   * Prints one view to a PDF on A4.
   *
   * @param {View} view
   * @param {{ landscape?: boolean, marginMm?: number, backgrounds?: boolean }} [paper]
   */
  async function print(view, paper = {}) {
    const { page, url, settled, state } = await open(view, DEFAULT_SIZE);
    try {
      const pdf = await page.pdf(paper);
      return await report(page, { url, settled, state, pdf });
    } finally {
      await page.close();
    }
  }

  return {
    root,
    origin: server.origin,
    runDir,
    backend,
    /** What the built-dist server added to the written policy so the browser could stand in for Tauri. */
    policyAdditions: () => [...(server.added ?? [])],
    visit,
    shoot,
    print,
    close,
  };
}

/** Prints what a run saw besides the picture. Returns true when nothing needs attention. */
export function printReport(label, result, log = console.log) {
  let clean = true;
  if (!result.settled && result.state?.broken) {
    clean = false;
    const thrown = result.problems.find((problem) => problem.kind === "exception");
    log(
      `  ! ${label}: the page did not start: ${String(thrown?.text ?? "")
        .split("\n")[0]
        .slice(0, 300)}`,
    );
  } else if (!result.settled) {
    clean = false;
    log(`  ! ${label}: the screen never settled (${JSON.stringify(result.state)})`);
  }
  for (const url of new Set(result.foreignRequests)) {
    clean = false;
    log(`  ! ${label}: asked for something outside this machine: ${url}`);
  }
  for (const text of new Set(result.cspViolations)) {
    clean = false;
    log(`  ! ${label}: content security policy: ${text}`);
  }
  for (const command of result.unstubbed) log(`  ? ${label}: Tauri command with no harness answer: ${command}`);
  const seen = new Set();
  for (const problem of result.problems) {
    const line = `${problem.kind}: ${String(problem.text).split("\n")[0].slice(0, 300)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    log(`  - ${label}: ${line}`);
  }
  return clean;
}
