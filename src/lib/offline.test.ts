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
const FORBIDDEN_PLUGINS = ["opener", "shell", "http", "updater", "websocket", "upload", "deep-link"];
const FORBIDDEN_CRATES = ["reqwest", "ureq", "hyper", "isahc", "surf", "tungstenite", "tokio-tungstenite", "curl"];

describe("offline, by construction", () => {
  it("reads the files it is meant to check", () => {
    expect(cargoToml).toContain("[dependencies]");
    expect(Object.keys(capabilities).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(tauriConfigs).some((file) => file.endsWith("/tauri.conf.json"))).toBe(true);
    expect(Object.keys(htmlEntries)).toHaveLength(2);
  });

  it("depends on no Rust crate or Tauri plugin that reaches the network or another program", () => {
    // Dependency lines only: `name = …` or `name = { … }` at the start of a line.
    const dependencies = [...cargoToml.matchAll(/^([A-Za-z0-9_-]+)\s*=/gm)].map((match) => match[1]);
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
        .filter((identifier) => FORBIDDEN_PLUGINS.some((plugin) => identifier.startsWith(`${plugin}:`)))
        .map((identifier) => `${file}: ${identifier}`);
    });
    expect(granted).toEqual([]);
  });

  it("keeps a content security policy that names no outside address", () => {
    const config = JSON.parse(Object.entries(tauriConfigs).find(([file]) => file.endsWith("/tauri.conf.json"))![1]) as {
      app: { security: { csp: Record<string, string> | string | null } };
    };
    const csp = config.app.security.csp;

    expect(csp, "app.security.csp must be set: without it nothing is enforced").toBeTruthy();
    const directives =
      typeof csp === "string" ? Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+(.*)/))) : csp!;

    expect(directives["default-src"]).toBe("'self'");
    expect(directives["script-src"]).toBe("'self'");

    // Tauri's own two transports, as WebView2 on Windows spells them. Anything
    // else with a scheme and a host is an address on a network.
    // eslint-disable-next-line no-restricted-syntax -- named here so that they, and only they, are let through
    const allowed = new Set(["http://asset.localhost", "http://ipc.localhost"]);
    const outside = Object.entries(directives).flatMap(([name, value]) =>
      String(value)
        .split(/\s+/)
        .filter(
          (source) =>
            /^[a-z][a-z0-9+.-]*:\/\//i.test(source) || source === "*" || source === "https:" || source === "http:",
        )
        .filter((source) => !allowed.has(source))
        .map((source) => `${name} ${source}`),
    );
    expect(outside).toEqual([]);
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
