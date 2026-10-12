/*
 * Browser-side stand-in for the Tauri runtime. Dev tooling only.
 *
 * The harness server puts this first in <head>, as a plain blocking script, so
 * it runs before the app's own boot script. It is never part of `src/` and is
 * never in a production bundle: the only thing that serves it is
 * scripts/harness.
 *
 * What it does:
 *  1. applies the run's choices (locale, theme, clock) from the
 *     query string, before the boot script reads localStorage;
 *  2. provides `window.__TAURI_INTERNALS__`, so `@tauri-apps/api` and the
 *     plugins work unchanged and every command goes to /__harness/invoke;
 *  3. keeps a small record (`window.__HARNESS__`) the driver reads to know when
 *     the screen has settled and what went wrong.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var nativeFetch = window.fetch.bind(window);

  var H = {
    /** Commands sent and not yet answered. */
    pending: 0,
    calls: 0,
    /** performance.now() of the last command to finish. */
    lastActivity: 0,
    /** Commands the harness has no answer for. */
    unstubbed: [],
    /** Commands that were rejected, with the error the app received. */
    failures: [],
    /** Notifications the app raised. */
    notifications: [],
    /** How many times the app asked to print. */
    prints: 0,
    /** What the content security policy refused, when the run serves one. */
    cspViolations: [],
    /** Reserved: the account the run asks to be signed in as. Read only in dev. */
    user: params.get("user") || null,
  };
  window.__HARNESS__ = H;

  document.addEventListener("securitypolicyviolation", function (event) {
    H.cspViolations.push({
      directive: event.effectiveDirective || event.violatedDirective,
      blocked: event.blockedURI,
      source: event.sourceFile,
      line: event.lineNumber,
    });
  });

  // ── 1. The run's choices ────────────────────────────────────────────────
  function preference(key, value) {
    try {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch (e) {
      // Storage unavailable: the app falls back to its own defaults.
    }
  }
  preference("locale", params.get("locale"));
  preference("theme_mode", params.get("theme"));

  // A fixed "now" that still ticks, so "today" is the same on every run while
  // timers and durations keep working.
  var nowParam = params.get("now");
  if (nowParam) {
    var RealDate = Date;
    var fixed = new RealDate(nowParam).getTime();
    if (!isNaN(fixed)) {
      var offset = fixed - RealDate.now();
      var HarnessDate = class extends RealDate {
        constructor() {
          if (arguments.length === 0) super(RealDate.now() + offset);
          else super(...arguments);
        }
        static now() {
          return RealDate.now() + offset;
        }
      };
      Object.defineProperty(HarnessDate, "name", { value: "Date" });
      window.Date = HarnessDate;
    }
  }

  // ── 2. Tauri internals ──────────────────────────────────────────────────
  var callbacks = new Map();
  var nextCallback = 1;

  function transformCallback(callback, once) {
    var id = nextCallback++;
    callbacks.set(id, function (data) {
      if (once) callbacks.delete(id);
      return callback && callback(data);
    });
    return id;
  }

  function isBinary(value) {
    return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
  }

  async function send(cmd, args, options) {
    // The two commands that restart the app: here, a reload is the restart.
    if (cmd === "plugin:process|restart" || cmd === "license_restart") {
      window.setTimeout(function () {
        window.location.reload();
      }, 0);
      return null;
    }

    var init;
    if (isBinary(args)) {
      init = {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-harness-cmd": encodeURIComponent(cmd),
          "x-harness-headers": encodeURIComponent(JSON.stringify((options && options.headers) || {})),
        },
        body: args,
      };
    } else {
      init = {
        method: "POST",
        headers: { "content-type": "application/json", "x-harness-cmd": encodeURIComponent(cmd) },
        body: JSON.stringify(args === undefined ? {} : args),
      };
    }

    var response = await nativeFetch("/__harness/invoke", init);
    var payload = await response.json();
    if (payload.ok) return payload.value;

    if (payload.unstubbed && H.unstubbed.indexOf(cmd) === -1) H.unstubbed.push(cmd);
    H.failures.push({ cmd: cmd, error: payload.error });
    throw payload.error;
  }

  function invoke(cmd, args, options) {
    H.pending += 1;
    H.calls += 1;
    return send(cmd, args, options).finally(function () {
      H.pending -= 1;
      H.lastActivity = performance.now();
    });
  }

  var label = /\/lock\.html$/.test(window.location.pathname) ? "lock" : "main";

  window.__TAURI_INTERNALS__ = {
    invoke: invoke,
    transformCallback: transformCallback,
    unregisterCallback: function (id) {
      callbacks.delete(id);
    },
    runCallback: function (id, data) {
      var callback = callbacks.get(id);
      if (callback) callback(data);
    },
    callbacks: callbacks,
    convertFileSrc: function (filePath, protocol) {
      return (
        "/__harness/asset?protocol=" + encodeURIComponent(protocol || "asset") + "&path=" + encodeURIComponent(filePath)
      );
    },
    metadata: {
      currentWindow: { label: label },
      currentWebview: { windowLabel: label, label: label },
    },
    plugins: { path: { sep: "/", delimiter: ":" } },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: function () {} };
  // The client's PCs run Windows; the Settings screen prints these.
  window.__TAURI_OS_PLUGIN_INTERNALS__ = {
    eol: "\r\n",
    platform: "windows",
    version: "10.0.19045",
    family: "windows",
    os_type: "windows",
    arch: "x86_64",
    exe_extension: "exe",
  };
  window.isTauri = true;

  // ── 3. Things a headless browser would otherwise swallow or block ───────
  function HarnessNotification(title, options) {
    var entry = typeof title === "object" && title !== null ? title : Object.assign({ title: title }, options || {});
    H.notifications.push(entry);
  }
  HarnessNotification.permission = "granted";
  HarnessNotification.requestPermission = function () {
    return Promise.resolve("granted");
  };
  window.Notification = HarnessNotification;

  window.print = function () {
    H.prints += 1;
  };
})();
