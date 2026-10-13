/**
 * Headless Google Chrome, driven through its debugging port with Node's
 * built-in WebSocket. No puppeteer, no playwright, nothing to install.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * How long a screen may take to settle. Generous on purpose: several teammates
 * share this machine, and a run that waited its turn should not then fail for
 * being slow. `HARNESS_SETTLE_MS` changes it.
 */
const SETTLE_TIMEOUT_MS = Number(process.env.HARNESS_SETTLE_MS) > 0 ? Number(process.env.HARNESS_SETTLE_MS) : 75_000;

/** The longest any one call to Chrome may take (a screenshot, a PDF of a long sheet). */
const CDP_TIMEOUT_MS = 90_000;

/**
 * How long a page that threw before drawing anything is given before the run
 * stops waiting for it. A module that does not compile (somebody's half-written
 * file) never draws: waiting the full settle time on it only keeps others in
 * the queue.
 */
const BROKEN_PAGE_MS = 4_000;

const CHROME_CANDIDATES = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"];

function findChrome() {
  const fromEnv = process.env.CHROME_BIN;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const found = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Google Chrome not found. Set CHROME_BIN to its path.");
  return found;
}

/** A minimal client for the Chrome DevTools Protocol, flat-session mode. */
class Connection {
  #socket;
  #nextId = 1;
  #waiting = new Map();
  #listeners = new Set();

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const waiter = this.#waiting.get(message.id);
        if (!waiter) return;
        this.#waiting.delete(message.id);
        if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result);
        return;
      }
      for (const listener of this.#listeners) listener(message);
    });
    socket.addEventListener("close", () => {
      for (const waiter of this.#waiting.values())
        waiter.reject(new Error(`${waiter.method}: Chrome closed the connection`));
      this.#waiting.clear();
    });
  }

  static open(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new Connection(socket)), { once: true });
      socket.addEventListener("error", () => reject(new Error(`could not connect to Chrome at ${url}`)), {
        once: true,
      });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      // No call to Chrome waits for ever: a hung renderer would otherwise hold the run, and its place in
      // the harness's queue, until somebody killed it.
      const timer = setTimeout(() => {
        if (!this.#waiting.delete(id)) return;
        reject(new Error(`${method}: Chrome did not answer within ${CDP_TIMEOUT_MS / 1000} s`));
      }, CDP_TIMEOUT_MS);
      timer.unref?.();
      const settle = (done) => (value) => {
        clearTimeout(timer);
        done(value);
      };
      this.#waiting.set(id, { resolve: settle(resolve), reject: settle(reject), method });
      this.#socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  /** @returns {() => void} unsubscribe */
  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close() {
    try {
      this.#socket.close();
    } catch {
      // Already gone.
    }
  }
}

/**
 * One tab. Collects what the page logged, threw and asked the network for, so a
 * run can report it instead of a screenshot being the only evidence.
 */
class Page {
  #connection;
  #sessionId;
  #targetId;
  #allowedOrigin = "";

  /** Console errors and warnings, uncaught exceptions, and browser-level errors. */
  problems = [];
  /** Requests to anything but the harness's own server. Must stay empty. */
  foreignRequests = [];
  /** Content-security-policy violations the browser reported. */
  cspViolations = [];

  constructor(connection, sessionId, targetId) {
    this.#connection = connection;
    this.#sessionId = sessionId;
    this.#targetId = targetId;

    connection.on((message) => {
      if (message.sessionId !== sessionId) return;
      const { method, params } = message;
      if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "warning")) {
        const text = params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
        this.problems.push({ kind: `console.${params.type}`, text });
      } else if (method === "Runtime.exceptionThrown") {
        const details = params.exceptionDetails;
        this.problems.push({ kind: "exception", text: details.exception?.description ?? details.text });
      } else if (method === "Log.entryAdded" && (params.entry.level === "error" || params.entry.level === "warning")) {
        const text = `${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ""}`;
        if (/Content Security Policy/i.test(text)) this.cspViolations.push(text);
        this.problems.push({ kind: `browser.${params.entry.level}`, text });
      } else if (method === "Network.requestWillBeSent") {
        const url = params.request.url;
        if (/^(data|blob|about):/.test(url)) return;
        if (this.#allowedOrigin && !url.startsWith(`${this.#allowedOrigin}/`)) this.foreignRequests.push(url);
      }
    });
  }

  send(method, params) {
    return this.#connection.send(method, params, this.#sessionId);
  }

  async prepare({ origin, timezone }) {
    this.#allowedOrigin = origin;
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Network.enable");
    if (timezone) await this.send("Emulation.setTimezoneOverride", { timezoneId: timezone });
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  }

  /** What a theme of "system" resolves to. Pinned, so a run never depends on the desktop. */
  async setColorScheme(scheme) {
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  /**
   * A full load, never a same-document hash change: the app keeps state in
   * memory (the query cache, the unlocked flag), and a screenshot must not
   * depend on what was shot before it.
   */
  async goto(url) {
    await this.send("Page.navigate", { url: "about:blank" });
    await this.send("Page.navigate", { url });
  }

  /**
   * Waits until the screen has stopped changing for a reason the harness can
   * see: the document and fonts are loaded, React has rendered, every Tauri
   * command has been answered and none has been sent for a moment.
   *
   * @returns {Promise<{ settled: boolean, state: object }>}
   */
  async waitUntilSettled({ selector, timeoutMs = SETTLE_TIMEOUT_MS, quietMs = 450 } = {}) {
    const probe = `(() => {
      const h = window.__HARNESS__;
      const root = document.getElementById("root");
      return {
        ready: document.readyState,
        fonts: document.fonts ? document.fonts.status : "loaded",
        rendered: !!root && root.childElementCount > 0,
        harness: !!h,
        pending: h ? h.pending : 0,
        quietFor: h ? performance.now() - h.lastActivity : 0,
        images: Array.from(document.images).every((image) => image.complete),
        selector: ${selector ? `!!document.querySelector(${JSON.stringify(selector)})` : "true"},
      };
    })()`;

    const deadline = Date.now() + timeoutMs;
    let state = {};
    let streak = 0;
    let brokenSince = null;
    while (Date.now() < deadline) {
      try {
        state = await this.evaluate(probe);
      } catch {
        state = {}; // Mid-navigation: the context was replaced. Ask again.
      }
      const settled =
        state.ready === "complete" &&
        state.fonts === "loaded" &&
        state.rendered &&
        state.harness &&
        state.pending === 0 &&
        state.quietFor >= quietMs &&
        state.images &&
        state.selector;
      // Nothing drawn, and the page threw: it is not going to start.
      const broken = !state.rendered && this.problems.some((problem) => problem.kind === "exception");
      if (broken) {
        brokenSince ??= Date.now();
        if (Date.now() - brokenSince >= BROKEN_PAGE_MS) return { settled: false, state: { ...state, broken: true } };
      } else {
        brokenSince = null;
      }
      streak = settled ? streak + 1 : 0;
      if (streak >= 2) {
        // Two frames, so the last render has been painted.
        await this.evaluate(
          "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))",
        );
        return { settled: true, state };
      }
      await sleep(150);
    }
    return { settled: false, state };
  }

  /** @param {{ clip?: { x: number, y: number, width: number, height: number } }} [options] */
  async screenshot({ clip } = {}) {
    const params = { format: "png", captureBeyondViewport: false };
    if (clip) params.clip = { ...clip, scale: 1 };
    const { data } = await this.send("Page.captureScreenshot", params);
    return Buffer.from(data, "base64");
  }

  /**
   * A4, with the page's own @page rule taking over once it has one.
   *
   * Backgrounds are off unless asked for, as in the print dialog, where
   * "Background graphics" starts unticked. A sheet whose shading or borders
   * must reach paper has to say so itself with `print-color-adjust: exact`.
   */
  async pdf({ landscape = false, marginMm, backgrounds = false } = {}) {
    const params = {
      landscape,
      printBackground: backgrounds,
      preferCSSPageSize: true,
      paperWidth: 210 / 25.4,
      paperHeight: 297 / 25.4,
      displayHeaderFooter: false,
    };
    if (marginMm !== undefined) {
      const inches = marginMm / 25.4;
      Object.assign(params, { marginTop: inches, marginBottom: inches, marginLeft: inches, marginRight: inches });
    }
    const { data } = await this.send("Page.printToPDF", params);
    return Buffer.from(data, "base64");
  }

  async close() {
    try {
      await this.#connection.send("Target.closeTarget", { targetId: this.#targetId });
    } catch {
      // The browser is going away anyway.
    }
  }
}

/**
 * @param {object} options
 * @param {string} options.runDir where the throwaway profile goes
 * @returns {Promise<{ newPage: () => Promise<Page>, close: () => Promise<void> }>}
 */
export async function launchChrome({ runDir }) {
  const profile = path.join(runDir, "chrome-profile");
  fs.mkdirSync(profile, { recursive: true });

  const child = spawn(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-sync",
      "--disable-default-apps",
      "--disable-component-update",
      "--disable-background-networking",
      "--disable-domain-reliability",
      "--metrics-recording-only",
      "--no-pings",
      "--mute-audio",
      "--password-store=basic",
      "--use-mock-keychain",
      "--force-color-profile=srgb",
      "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication",
      // The page can reach this machine and nothing else. A screen that asks
      // for a remote font, script or image fails here and is reported.
      "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
      "--window-size=1440,900",
      "about:blank",
    ],
    // Its own process group, so the browser and every helper process it starts
    // can be stopped together and none is left to write into a deleted profile.
    { stdio: ["ignore", "ignore", "pipe"], detached: true },
  );
  const killGroup = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  };

  // Whatever ends this process, Chrome goes with it. `exit` handlers are
  // synchronous, which is why this is a plain kill and not the polite close.
  const killOnExit = killGroup;
  process.on("exit", killOnExit);
  // And for the ending no handler sees at all (kill -9): a one-line watchdog
  // that outlives this process, notices it is gone within a second, and stops
  // the browser if it is still the one started on this run's folder.
  spawn(
    "sh",
    [
      "-c",
      'while kill -0 "$1" 2>/dev/null; do sleep 1; done; if tr "\\0" " " < "/proc/$2/cmdline" 2>/dev/null | grep -qF -- "$3"; then kill -9 "-$2"; fi',
      "harness-watchdog",
      String(process.pid),
      String(child.pid),
      profile,
    ],
    { stdio: "ignore", detached: true },
  ).unref();
  // For the one ending no handler sees (kill -9): the next run reads this and
  // stops the orphan. See sweepDeadRuns in session.mjs.
  fs.writeFileSync(path.join(runDir, "chrome.pid"), String(child.pid));

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 20_000) stderr += chunk;
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));

  // Chrome writes the port it chose, and the browser endpoint, to this file.
  const portFile = path.join(profile, "DevToolsActivePort");
  let endpoint;
  for (let attempt = 0; attempt < 200 && !endpoint; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before it was ready:\n${stderr}`);
    if (fs.existsSync(portFile)) {
      const [port, browserPath] = fs.readFileSync(portFile, "utf8").trim().split("\n");
      if (port && browserPath) endpoint = `ws://127.0.0.1:${port}${browserPath}`;
    }
    if (!endpoint) await sleep(100);
  }
  if (!endpoint) {
    killGroup();
    throw new Error(`Chrome did not open its debugging port:\n${stderr}`);
  }

  const connection = await Connection.open(endpoint);

  return {
    async newPage() {
      const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
      return new Page(connection, sessionId, targetId);
    },
    async close() {
      try {
        await Promise.race([connection.send("Browser.close"), sleep(2_000)]);
      } catch {
        // Fall through to the kill below.
      }
      connection.close();
      const done = await Promise.race([exited.then(() => true), sleep(3_000).then(() => false)]);
      if (!done) {
        killGroup();
        await exited;
      }
      // Helpers that outlived the browser process, if any.
      killGroup();
      process.off("exit", killOnExit);
    },
  };
}
