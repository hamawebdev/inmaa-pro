import { describe, expect, it } from "vitest";

/**
 * The program is offline, and stays so by construction rather than by habit,
 * with one exception that is narrow by construction too.
 *
 * Rule 1 of CLAUDE.md, as docs/sync/DECISION.md section 9 amends it: nothing
 * may need a connection at run time, and the program reaches one address only,
 * the sync mailbox the director typed, over HTTPS, under `/v1/`. That request
 * is made by the Rust side, in one file (src-tauri/src/sync/http.rs), with one
 * HTTP library (`ureq`); the window itself still connects nowhere.
 *
 * Four things hold that line. ESLint refuses network calls, outside links and
 * web addresses in `src/` (eslint.config.js). The content security policy and
 * the navigation guard refuse them at run time (tauri.conf.json,
 * src-tauri/src/lib.rs). The sync command refuses any other address, path,
 * method, header or redirect (src-tauri/src/sync, with its Rust tests). And
 * this test reads the Rust manifest and sources, the capability files and the
 * Tauri configuration, where a single added line would hand the program a way out.
 * On the director's phone (docs/phone/DECISION.md section 7) it reads the
 * Android project too: three permissions, no clear text, no backup, no library
 * and no Kotlin that reaches outside.
 */
const raw = (pattern: Record<string, unknown>) => pattern as Record<string, string>;

const cargoToml = Object.values(
  raw(import.meta.glob("../../src-tauri/Cargo.toml", { query: "?raw", import: "default", eager: true })),
)[0];
const capabilities = raw(
  import.meta.glob("../../src-tauri/capabilities/*.json", { query: "?raw", import: "default", eager: true }),
);
const tauriConfigs = raw(
  import.meta.glob("../../src-tauri/tauri*.conf.json", { query: "?raw", import: "default", eager: true }),
);
const packageJson = Object.values(
  raw(import.meta.glob("../../package.json", { query: "?raw", import: "default", eager: true })),
)[0];
const htmlEntries = raw(import.meta.glob(["../../*.html"], { query: "?raw", import: "default", eager: true }));
const rustSources = raw(
  import.meta.glob("../../src-tauri/src/**/*.rs", { query: "?raw", import: "default", eager: true }),
);

/** The Android project (docs/phone/ANDROID-BUILD.md): its manifest, network and backup rules, Gradle file and Kotlin. */
const androidFiles = raw(
  import.meta.glob(
    [
      "../../src-tauri/gen/android/app/src/main/AndroidManifest.xml",
      "../../src-tauri/gen/android/app/src/*/res/xml/*.xml",
      "../../src-tauri/gen/android/app/build.gradle.kts",
      "../../src-tauri/gen/android/app/src/main/java/**/*.kt",
      "!../../src-tauri/gen/android/app/src/main/java/**/generated/**",
    ],
    { query: "?raw", import: "default", eager: true },
  ),
);
const androidFile = (path: string) => Object.entries(androidFiles).find(([file]) => repoPath(file) === path)?.[1] ?? "";

/** What the phone may ask Android for, and nothing else (docs/phone/DECISION.md section 7). */
const ANDROID_PERMISSIONS = [
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.INTERNET",
  "android.permission.POST_NOTIFICATIONS",
];
/** The libraries of Tauri's Android template, all the Android side may use; a new one is a decision. */
const ANDROID_LIBRARIES = [
  "androidx.activity:activity-ktx",
  "androidx.appcompat:appcompat",
  "androidx.lifecycle:lifecycle-process",
  "androidx.test.espresso:espresso-core",
  "androidx.test.ext:junit",
  "androidx.webkit:webkit",
  "com.google.android.material:material",
  "junit:junit",
];

/** The one HTTP library the program may use, and the one file that may use it (DECISION section 9). */
const SYNC_HTTP_CRATE = "ureq";
const SYNC_HTTP_FILE = "src-tauri/src/sync/http.rs";

/** The Tauri plugins the program uses. A new one is a decision, not a line: it must be added here too. */
const PLUGINS = ["dialog", "fs", "log", "notification", "os", "process", "single-instance", "store", "window-state"];

/** A Rust file's code without its tests: everything before the first `#[cfg(test)]`; nothing for a tests file. */
function withoutTests(file: string, text: string): string {
  if (/\/tests\.rs$/.test(file)) return "";
  const at = text.indexOf("#[cfg(test)]");
  return at === -1 ? text : text.slice(0, at);
}

/** Where a path ends inside the repository, for messages: `src-tauri/src/sync/http.rs`. */
const repoPath = (file: string) => file.replace(/^(\.\.\/)+/, "");

/** Plugins and crates whose whole purpose is to reach outside the program. */
const FORBIDDEN_PLUGINS = [
  "opener",
  "shell",
  "http",
  "updater",
  "websocket",
  "upload",
  "deep-link",
  "localhost",
  // No position, face or fingerprint is taken (scope section 5; audit OFF-5, OFF-6).
  "geolocation",
  "biometric",
  "barcode-scanner",
  "nfc",
];
const FORBIDDEN_CRATES = [
  "reqwest",
  "ureq",
  "hyper",
  "isahc",
  "surf",
  "tungstenite",
  "tokio-tungstenite",
  "curl",
  "attohttpc",
  "minreq",
  "opener",
  "open",
  "webbrowser",
  "that",
];
/** Permissions that would let the webview make windows of its own, which could load any address. */
const FORBIDDEN_PERMISSIONS = [
  "core:window:allow-create",
  "core:webview:allow-create-webview-window",
  "core:webview:allow-create-webview",
  "core:webview:allow-navigate",
];

/**
 * Every crate the manifest pulls in, under every spelling Cargo accepts: a
 * `name = …` line in a dependencies table, a `[dependencies.name]` table, and
 * the real name behind a rename (`alias = { package = "reqwest", … }`), in the
 * plain, dev, build and target-specific tables alike.
 */
export function cargoDependencies(manifest: string): string[] {
  const names = new Set<string>();
  let inDependencies = false;
  for (const line of manifest.split(/\r?\n/)) {
    const trimmed = line.trim();
    const table = /^\[(.+)\]$/.exec(trimmed);
    if (table) {
      const path = table[1].replace(/["']/g, "");
      const parts = path.split(".");
      const at = parts.findIndex((part) => /^(dev-|build-)?dependencies$/.test(part));
      // `[dependencies.reqwest]`, `[target.'cfg(windows)'.dependencies.reqwest]`: the table is one crate,
      // and its keys are that crate's fields (a `package = "…"` among them is read below).
      inDependencies = at !== -1 && !parts[at + 1];
      if (at !== -1 && parts[at + 1]) names.add(parts[at + 1]);
      continue;
    }
    if (trimmed.startsWith("package")) {
      const renamed = /^package\s*=\s*"([^"]+)"/.exec(trimmed);
      if (renamed) names.add(renamed[1]);
    }
    if (!inDependencies) continue;
    const entry = /^([A-Za-z0-9_-]+)\s*=/.exec(trimmed);
    if (entry && entry[1] !== "package") names.add(entry[1]);
    for (const renamed of trimmed.matchAll(/package\s*=\s*"([^"]+)"/g)) names.add(renamed[1]);
  }
  return [...names];
}

/** A source of a content security policy that is an address on a network: a host, a scheme with a host, a wildcard. */
export function outsideSources(policy: string | Record<string, string>): string[] {
  const directives =
    typeof policy === "string" ? Object.fromEntries(policy.split(";").map((d) => d.trim().split(/\s+(.*)/))) : policy;
  // Tauri's own two transports, as WebView2 on Windows spells them. Anything
  // else with a scheme and a host, a bare host, or a wildcard is an address on a network.
  const allowed = new Set(["http://asset.localhost", "http://ipc.localhost"]);
  const keywords = new Set([
    "'self'",
    "'none'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "'wasm-unsafe-eval'",
    "'strict-dynamic'",
  ]);
  const localSchemes = new Set(["data:", "blob:", "asset:", "ipc:", "tauri:"]);
  return Object.entries(directives).flatMap(([name, value]) =>
    String(value ?? "")
      .split(/\s+/)
      .filter((source) => source !== "")
      .filter((source) => !keywords.has(source) && !localSchemes.has(source) && !allowed.has(source))
      // 'sha256-…' and 'nonce-…' are hashes, not places.
      .filter((source) => !/^'(sha(256|384|512)|nonce)-/.test(source))
      .map((source) => `${name} ${source}`),
  );
}

describe("offline, by construction", () => {
  it("reads the files it is meant to check", () => {
    expect(cargoToml).toContain("[dependencies]");
    // One window, one capability: the licence's lock window and its capability are gone.
    expect(Object.keys(capabilities).map(repoPath)).toEqual(["src-tauri/capabilities/default.json"]);
    expect(Object.keys(tauriConfigs).some((file) => file.endsWith("/tauri.conf.json"))).toBe(true);
    expect(Object.keys(htmlEntries).map(repoPath)).toEqual(["index.html"]);
    expect(Object.keys(rustSources).map(repoPath)).toContain(SYNC_HTTP_FILE);
  });

  it("depends on no Rust crate or Tauri plugin that reaches the network or another program, but the sync's one", () => {
    const dependencies = cargoDependencies(cargoToml);
    expect(dependencies).toContain("tauri");
    const found = dependencies.filter(
      (name) =>
        (FORBIDDEN_CRATES.includes(name) && name !== SYNC_HTTP_CRATE) ||
        FORBIDDEN_PLUGINS.some((plugin) => name === `tauri-plugin-${plugin}`),
    );
    expect(found).toEqual([]);
    // Exactly the plugins it had: none added.
    expect(
      dependencies
        .filter((name) => name.startsWith("tauri-plugin-"))
        .map((name) => name.slice("tauri-plugin-".length))
        .sort(),
    ).toEqual(PLUGINS);
  });

  it("uses one HTTP library, with HTTPS on ring and nothing else, in one file", () => {
    expect(cargoDependencies(cargoToml)).toContain(SYNC_HTTP_CRATE);
    // Its line: default features off (gzip), rustls only (ring and the bundled roots; no OpenSSL, no cookies).
    const line = cargoToml.split(/\r?\n/).find((text) => text.trim().startsWith(`${SYNC_HTTP_CRATE} =`));
    expect(line).toMatch(/default-features\s*=\s*false/);
    expect(/features\s*=\s*\[([^\]]*)\]/.exec(line ?? "")?.[1].replace(/\s/g, "")).toBe('"rustls"');

    // Named in that file and nowhere else in the Rust sources, comments included.
    const naming = Object.entries(rustSources)
      .filter(([, text]) => new RegExp(`\\b${SYNC_HTTP_CRATE}\\b`).test(text))
      .map(([file]) => repoPath(file));
    expect(naming).toEqual([SYNC_HTTP_FILE]);
    // And no other client is reached for by its path either.
    const others = Object.entries(rustSources).flatMap(([file, text]) =>
      FORBIDDEN_CRATES.filter((name) => name !== SYNC_HTTP_CRATE)
        .filter((name) => new RegExp(`\\b${name.replace(/-/g, "_")}::`).test(text))
        .map((name) => `${repoPath(file)}: ${name}`),
    );
    expect(others).toEqual([]);
  });

  it("sends only toward the address the director typed: no web address written in the Rust code", () => {
    // A literal with a host after the scheme ("https://example.com") in code that ships. Tests may use
    // their own local server; a sentence such as "must start with https://" names no host.
    const addresses = Object.entries(rustSources).flatMap(([file, text]) =>
      [...withoutTests(file, text).matchAll(/"[^"\n]*\b(?:https?|wss?|ftp):\/\/[A-Za-z0-9[][^"\n]*"/g)].map(
        (match) => `${repoPath(file)}: ${match[0]}`,
      ),
    );
    expect(addresses).toEqual([]);

    // The one call that sends: the origin read from the vault, HTTPS required.
    const sync = withoutTests(
      "mod.rs",
      Object.entries(rustSources).find(([file]) => file.endsWith("/sync/mod.rs"))![1],
    );
    const sends = [...sync.matchAll(/http::send\(([^)]*)\)/g)].map((match) => match[1].replace(/\s+/g, " ").trim());
    expect(sends).toEqual(["&origin, outgoing, http::TIMEOUT, true"]);
    expect(sync).toMatch(/let origin = vault::origin\(/);
    const http = withoutTests(
      SYNC_HTTP_FILE,
      Object.entries(rustSources).find(([file]) => file.endsWith("/sync/http.rs"))![1],
    );
    expect(http).toMatch(/\.https_only\(https_only\)/);
    expect(http).toMatch(/\.max_redirects\(0\)/);
  });

  it("depends on no JavaScript package for those plugins either", () => {
    const manifest = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(names.filter((name) => FORBIDDEN_PLUGINS.some((plugin) => name === `@tauri-apps/plugin-${plugin}`))).toEqual(
      [],
    );
  });

  it("grants no capability to those plugins", () => {
    const granted = Object.entries(capabilities).flatMap(([file, text]) => {
      const permissions = (JSON.parse(text) as { permissions: Array<string | { identifier: string }> }).permissions;
      return permissions
        .map((permission) => (typeof permission === "string" ? permission : permission.identifier))
        .filter(
          (identifier) =>
            FORBIDDEN_PLUGINS.some((plugin) => identifier.startsWith(`${plugin}:`)) ||
            FORBIDDEN_PERMISSIONS.includes(identifier),
        )
        .map((identifier) => `${file}: ${identifier}`);
    });
    expect(granted).toEqual([]);
  });

  it("lets no window delete a stored file: a file's bytes are kept ten years (LOG-13)", () => {
    const removes = Object.entries(capabilities).flatMap(([file, text]) =>
      (JSON.parse(text) as { permissions: Array<string | { identifier: string }> }).permissions
        .map((permission) => (typeof permission === "string" ? permission : permission.identifier))
        .filter((identifier) => identifier === "fs:allow-remove" || identifier.startsWith("fs:allow-remove-"))
        .map((identifier) => `${file}: ${identifier}`),
    );
    expect(removes).toEqual([]);
  });

  it("keeps a content security policy that names no outside address, in every configuration", () => {
    const main = JSON.parse(Object.entries(tauriConfigs).find(([file]) => file.endsWith("/tauri.conf.json"))![1]) as {
      app: { security: { csp: Record<string, string> | string | null } };
    };
    const csp = main.app.security.csp;
    expect(csp, "app.security.csp must be set: without it nothing is enforced").toBeTruthy();
    const directives =
      typeof csp === "string" ? Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+(.*)/))) : csp!;
    expect(directives["default-src"]).toBe("'self'");
    expect(directives["script-src"]).toBe("'self'");

    // A platform's own file (tauri.windows.conf.json, tauri.linux.conf.json…) is merged over the main
    // one at build time: a policy, or a policy switched off, there counts as much as here.
    const outside = Object.entries(tauriConfigs).flatMap(([file, text]) => {
      const config = JSON.parse(text) as { app?: { security?: { csp?: Record<string, string> | string | null } } };
      const policy = config.app?.security?.csp;
      if (policy === undefined) return [];
      if (policy === null) return [`${file}: the policy is switched off`];
      return outsideSources(policy).map((source) => `${file}: ${source}`);
    });
    expect(outside).toEqual([]);
  });

  it("would see an address, a host or a wildcard in a policy, and a crate under any spelling", () => {
    expect(outsideSources("default-src 'self'; connect-src 'self' ipc: http://ipc.localhost")).toEqual([]);
    expect(
      outsideSources("default-src 'self' example.org; connect-src wss://example.org *.cdn.net; img-src *"),
    ).toEqual(["default-src example.org", "connect-src wss://example.org", "connect-src *.cdn.net", "img-src *"]);
    expect(
      cargoDependencies(
        [
          "[dependencies]",
          'tauri = { version = "2" }',
          'web = { package = "reqwest", version = "0.12" }',
          "[dependencies.ureq]",
          'version = "2"',
          "[target.'cfg(windows)'.dependencies]",
          'webbrowser = "1"',
          "[dev-dependencies]",
          'opener = "0.7"',
        ].join("\n"),
      ).sort(),
    ).toEqual(["opener", "reqwest", "tauri", "ureq", "web", "webbrowser"]);
  });

  it("names no updater, no remote window and no dev server outside this machine", () => {
    for (const [file, text] of Object.entries(tauriConfigs)) {
      const config = JSON.parse(text) as {
        plugins?: Record<string, unknown>;
        build?: { devUrl?: string };
        app?: { windows?: Array<{ url?: string }> };
      };
      expect(Object.keys(config.plugins ?? {}), file).not.toContain("updater");
      if (config.build?.devUrl) expect(config.build.devUrl, file).toMatch(/^http:\/\/localhost:\d+$/);
      for (const window of config.app?.windows ?? []) {
        expect(window.url ?? "index.html", file).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
      }
    }
  });

  it("asks Android for three permissions only, and keeps the data out of every backup and transfer", () => {
    const manifest = androidFile("src-tauri/gen/android/app/src/main/AndroidManifest.xml");
    expect(manifest, "the Android manifest").toContain("<manifest");
    const asked = [...manifest.matchAll(/<uses-permission\b([^>]*)>/g)]
      .filter((match) => !/tools:node\s*=\s*"remove"/.test(match[1]))
      .map((match) => /android:name\s*=\s*"([^"]+)"/.exec(match[1])?.[1])
      .sort();
    expect(asked).toEqual(ANDROID_PERMISSIONS);
    // What a library adds is merged in: the notification plugin's two are removed by name.
    for (const name of ["RECEIVE_BOOT_COMPLETED", "WAKE_LOCK"]) {
      expect(manifest).toMatch(new RegExp(`android\\.permission\\.${name}"\\s+tools:node="remove"`));
    }
    expect(manifest).not.toMatch(/<uses-permission-sdk-23\b/);
    expect(manifest).toMatch(/android:allowBackup="false"/);
    expect(manifest).toMatch(/android:dataExtractionRules="@xml\/data_extraction_rules"/);
    expect(manifest).toMatch(/android:networkSecurityConfig="@xml\/network_security_config"/);
    // No other app is offered a way in: one activity, the launcher's, and nothing else exported.
    expect([...manifest.matchAll(/android:exported="true"/g)]).toHaveLength(1);
    expect(manifest).not.toMatch(/<provider\b/);

    const rules = androidFile("src-tauri/gen/android/app/src/main/res/xml/data_extraction_rules.xml");
    for (const section of ["cloud-backup", "device-transfer"]) {
      const body = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(rules)?.[1] ?? "";
      expect(body, section).toMatch(/<exclude domain="root" path="\." \/>/);
      expect(body, section).not.toMatch(/<include\b/);
    }
  });

  it("refuses clear text on Android, but toward the dev server in a debug build", () => {
    const release = androidFile("src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml");
    expect(release).toMatch(/<base-config cleartextTrafficPermitted="false">/);
    expect(release).not.toMatch(/cleartextTrafficPermitted="true"/);
    // Only the system's certificates: one installed on the phone by someone else is not trusted.
    expect(release).not.toMatch(/src="user"/);

    const debug = androidFile("src-tauri/gen/android/app/src/debug/res/xml/network_security_config.xml");
    expect(debug).toMatch(/<base-config cleartextTrafficPermitted="false">/);
    const allowed = [...debug.matchAll(/<domain-config cleartextTrafficPermitted="true">([\s\S]*?)<\/domain-config>/g)]
      .flatMap((match) => [...match[1].matchAll(/<domain[^>]*>([^<]+)<\/domain>/g)].map((domain) => domain[1].trim()))
      .sort();
    expect(allowed).toEqual(["127.0.0.1", "localhost"]);
    expect(debug).not.toMatch(/src="user"/);
  });

  it("adds no library and no way out on the Android side", () => {
    const gradle = androidFile("src-tauri/gen/android/app/build.gradle.kts");
    const libraries = [
      ...gradle.matchAll(
        /(?:implementation|api|testImplementation|androidTestImplementation)\("([^:"]+:[^:"]+):[^"]*"\)/g,
      ),
    ]
      .map((match) => match[1])
      .sort();
    expect(libraries).toEqual(ANDROID_LIBRARIES);
    expect(gradle).not.toMatch(/(?:implementation|api)\s*\(\s*(?:files|fileTree|project)\(/);

    const kotlin = Object.entries(androidFiles).filter(([file]) => file.endsWith(".kt"));
    expect(kotlin.map(([file]) => repoPath(file))).toContain(
      "src-tauri/gen/android/app/src/main/java/com/hamawebdev/inmaa_pro/MainActivity.kt",
    );
    const ways = kotlin.flatMap(([file, text]) =>
      [
        /\bHttpURLConnection\b/,
        /\bURL\(/,
        /\bSocket\(/,
        /\bACTION_VIEW\b/,
        /\bACTION_DIAL\b/,
        /\bACTION_SEND/,
        /startActivity\(/,
        /"(?:https?|wss?):\/\//,
        /loadUrl\(/,
      ]
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${repoPath(file)}: ${pattern}`),
    );
    expect(ways).toEqual([]);
    // The window is open to a debugger only in a test build.
    const activity = kotlin.find(([file]) => file.endsWith("/MainActivity.kt"))![1];
    expect(activity).toMatch(/if \(BuildConfig\.WEBVIEW_DEBUG\) \{\s*WebView\.setWebContentsDebuggingEnabled\(true\)/);
    expect(gradle).toMatch(/val webViewDebug = System\.getenv\("INMAA_ANDROID_TEST"\) == "1"/);
  });

  it("loads nothing remote from the HTML entry point", () => {
    const remote = Object.entries(htmlEntries).flatMap(([file, html]) =>
      [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)]
        .map((match) => match[1])
        .filter((address) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(address))
        .map((address) => `${file}: ${address}`),
    );
    expect(remote).toEqual([]);
  });
});
