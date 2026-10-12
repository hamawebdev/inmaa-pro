import { describe, expect, it } from "vitest";

import { MESSAGE_FOLDERS, MESSAGES } from "./catalogues";
import type { CodeLabelCase } from "./code-labels";

/**
 * The database stores codes ("FULL_DAY", "CONTRACT") and the screens label them
 * through `useCodeLabel`, which falls back to showing the raw code when a label
 * is missing. That fallback keeps old records readable, but it also means a new
 * code added without a translation would quietly appear as "FULL_DAY" on an
 * Arabic screen. This is what stops that.
 *
 * Each feature folder lists its own codes in `code-labels.ts`; nobody edits
 * this file to add one.
 */
const modules = import.meta.glob("../features/*/code-labels.ts", { eager: true }) as Record<
  string,
  { codeLabelCases: readonly CodeLabelCase[] }
>;

const CASES = Object.entries(modules).flatMap(([file, module]) => {
  const folder = /features\/([^/]+)\//.exec(file)?.[1] ?? file;
  return module.codeLabelCases.map(([namespace, codes]) => ({ folder, namespace, codes }));
});

function lookup(messages: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], messages);
}

describe("stored codes", () => {
  it("reads the list of every feature folder", () => {
    const folders = Object.keys(modules).map((file) => /features\/([^/]+)\//.exec(file)?.[1]);
    expect(folders.sort()).toEqual([...MESSAGE_FOLDERS].sort());
  });

  it("has a label for every code, in every language", () => {
    const missing = CASES.flatMap(({ folder, namespace, codes }) =>
      (["en", "ar", "fr"] as const).flatMap((locale) =>
        [...new Set(codes)]
          .filter((code) => typeof lookup(MESSAGES[locale], `${namespace}.${code}`) !== "string")
          .map((code) => `${folder}: ${locale} has no label for ${namespace}.${code}`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it("lists no empty set of codes", () => {
    expect(CASES.filter(({ codes }) => codes.length === 0).map(({ namespace }) => namespace)).toEqual([]);
  });
});
