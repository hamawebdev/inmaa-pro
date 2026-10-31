import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * DECISION section 9 and BUILD section 4: the program opens with no licence step. No trial, no unlock code, no lock
 * window, no licence card.
 *
 * Not a grep of words alone: the program's start is followed module by module from `src/main.tsx` (every import the
 * window loads, `@/…` and relative, dynamic ones included), and what it can call on the Rust side is read from the
 * commands Rust registers and the generated bindings. A licence step would need one of: a module of its own in that
 * graph, a command to ask Rust, a window to stand in, or a state of the gate.
 */
const ROOT = resolve(__dirname, "../../../..");
const SRC = join(ROOT, "src");

const IMPORT =
  /(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function resolveModule(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every module of the program the window can load, from its entry. */
function programGraph(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    seen.set(file, text);
    for (const match of text.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2] ?? match[3];
      const target = resolveModule(file, spec);
      if (target) queue.push(target);
    }
  }
  return seen;
}

const LICENCE = /licen[cs]e|unlock[-_ ]?code|trial/i;

describe("the program opens with no licence step", () => {
  const graph = programGraph(join(SRC, "main.tsx"));

  it("follows the whole start: the gate, the sign-in window and the router are in the graph", () => {
    const files = [...graph.keys()].map((file) => file.slice(SRC.length + 1));
    expect(files).toContain("components/security/program-gate.tsx");
    expect(files).toContain("components/security/sign-in-screen.tsx");
    expect(files).toContain("features/core/services/startup.ts");
    expect(files.length).toBeGreaterThan(200);
  });

  it("no module the window loads is a licence module, and none imports one", () => {
    const named = [...graph.keys()].filter((file) => LICENCE.test(file.slice(SRC.length)));
    expect(named).toEqual([]);
    expect(existsSync(join(SRC, "lock")), "src/lock is gone").toBe(false);
    expect(readdirSync(join(SRC, "lib")).filter((name) => /^licen/.test(name))).toEqual([]);
  });

  it("nothing the window loads calls a licence command, or any command Rust does not register", () => {
    const registered = rustCommands();
    expect(registered.length).toBeGreaterThan(10);
    expect(registered.filter((name) => LICENCE.test(name))).toEqual([]);
    const called = new Set<string>();
    for (const text of graph.values()) {
      for (const match of text.matchAll(/invoke(?:<[^>]*>)?\(\s*["']([a-z_0-9]+)["']/g)) called.add(match[1]);
      for (const match of text.matchAll(/\bcommands\.([a-zA-Z0-9]+)\(/g)) called.add(snake(match[1]));
    }
    expect(called.size, "the window's own commands were found").toBeGreaterThan(5);
    for (const command of called) {
      expect(LICENCE.test(command), `the window calls ${command}`).toBe(false);
      expect(registered, `${command} is called by the window but not registered by Rust`).toContain(command);
    }
  });

  it("the generated bindings hold no licence command", () => {
    const bindings = readFileSync(join(SRC, "lib/bindings.ts"), "utf8");
    const commands = [...bindings.matchAll(/^async ([a-zA-Z0-9]+)\(/gm)].map((match) => snake(match[1]));
    expect(commands.length).toBeGreaterThan(10);
    expect(commands.filter((name) => LICENCE.test(name))).toEqual([]);
  });

  it("the program has one window, the main one, which Rust opens straight away: no lock window", () => {
    const config = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8")) as {
      app: { windows: Array<{ label: string; url?: string }> };
    };
    expect(config.app.windows.map((window) => window.label)).toEqual(["main"]);
    expect(existsSync(join(ROOT, "lock.html"))).toBe(false);
    expect(existsSync(join(ROOT, "src-tauri/capabilities/lock.json"))).toBe(false);
    expect(existsSync(join(ROOT, "src-tauri/src/license"))).toBe(false);
    const rust = readFileSync(join(ROOT, "src-tauri/src/lib.rs"), "utf8");
    expect(rust).not.toMatch(/\bmod\s+licen[cs]e\b/);
    expect(rust).not.toMatch(/build_window\([^)]*"lock"/);
    // The window Rust builds at set-up is the main one, not behind any condition.
    expect(rust).toMatch(/build_window\(app\.handle\(\),\s*MAIN_WINDOW\)/);
  });

  it("the gate has no licence state: what stands in front of the program is sign-in, anchor, clock or catching up", () => {
    const gate = graph.get(join(SRC, "components/security/program-gate.tsx"))!;
    const screens = [...gate.matchAll(/<([A-Z][A-Za-z]+Screen)\b/g)].map((match) => match[1]);
    expect(new Set(screens)).toEqual(new Set(["SignInScreen", "AnchorScreen", "ClockScreen", "SyncCatchUpScreen"]));
    const startup = graph.get(join(SRC, "features/core/services/startup.ts"))!;
    expect(LICENCE.test(startup.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ""))).toBe(false);
  });
});

const snake = (name: string) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** The commands Rust registers: the typed ones collected for specta, and the raw sync ones. */
function rustCommands(): string[] {
  const dir = join(ROOT, "src-tauri/src");
  const texts: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".rs")) texts.push(readFileSync(path, "utf8"));
    }
  };
  walk(dir);
  const all = texts.join("\n");
  const names = new Set<string>();
  const collect = all.match(/collect_commands!\[([\s\S]*?)\]/);
  if (collect) for (const match of collect[1].matchAll(/(?:\w+::)*(\w+)/g)) names.add(match[1]);
  const raw = all.match(/RAW_COMMANDS\s*:\s*[^=]*=\s*&?\[([\s\S]*?)\]/);
  if (raw) for (const match of raw[1].matchAll(/"([a-z_0-9]+)"/g)) names.add(match[1]);
  return [...names];
}
