import { describe, expect, it } from "vitest";

/**
 * The program is offline, and stays so by construction rather than by habit.
 *
 * Rule 1 of CLAUDE.md: nothing may need a connection at run time. Three things
 * hold that line. ESLint refuses network calls, outside links and web addresses
 * in `src/` (eslint.config.js). The content security policy and the navigation
 * guard refuse them at run time (tauri.conf.json, src-tauri/src/lib.rs). And
 * this test reads the Rust manifest, the capability files and the Tauri
 * configuration, where a single added line would hand the webview a way out.
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
const htmlEntries = raw(
  import.meta.glob(["../../index.html", "../../lock.html"], { query: "?raw", import: "default", eager: true }),
);

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
    expect(Object.keys(capabilities).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(tauriConfigs).some((file) => file.endsWith("/tauri.conf.json"))).toBe(true);
    expect(Object.keys(htmlEntries)).toHaveLength(2);
  });

  it("depends on no Rust crate or Tauri plugin that reaches the network or another program", () => {
    const dependencies = cargoDependencies(cargoToml);
    expect(dependencies).toContain("tauri");
    const found = dependencies.filter(
      (name) =>
        FORBIDDEN_CRATES.includes(name) || FORBIDDEN_PLUGINS.some((plugin) => name === `tauri-plugin-${plugin}`),
    );
    expect(found).toEqual([]);
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

  it("loads nothing remote from the two HTML entry points", () => {
    const remote = Object.entries(htmlEntries).flatMap(([file, html]) =>
      [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)]
        .map((match) => match[1])
        .filter((address) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(address))
        .map((address) => `${file}: ${address}`),
    );
    expect(remote).toEqual([]);
  });
});
