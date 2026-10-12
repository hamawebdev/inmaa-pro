import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import { FOLDER_MESSAGES, MESSAGE_FOLDERS, MESSAGES } from "./catalogues";

/**
 * Message keys are untyped — `use-intl` resolves them at runtime and a missing
 * one only produces a DEV console warning. So nothing except this file stops a
 * language from quietly drifting out of sync when a feature adds a key to its
 * en.json and forgets the other two.
 *
 * English is the reference: every new key is written in it first. (It is not
 * the language the program opens in; that is Arabic. See src/i18n/config.ts.)
 *
 * Each feature folder has its own three files, so each folder is checked on its
 * own, and a failure names the folder whose owner has to fix it. One more check
 * looks across folders: no two of them may define the same key.
 */

type Json = Record<string, unknown>;

const TRANSLATIONS = ["ar", "fr"] as const;

/** Dotted paths of every leaf string, e.g. "Settings.Backup.Title". */
function leafKeys(value: Json, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child !== null && typeof child === "object" ? leafKeys(child as Json, path) : [path];
  });
}

function leafValue(source: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Json)?.[key], source);
}

/**
 * Every argument an ICU string interpolates — `{name}` as well as the selector
 * of a `{name, plural, …}`. Parsed rather than pattern-matched because a plural
 * branch body is written `{one {# session}}`, which no regex can tell apart
 * from a real `{session}` placeholder.
 *
 * Branch *bodies* are deliberately not compared: a translation must be free to
 * reword "session"/"sessions", and French even needs its `one` branch to read
 * correctly for zero. Dropping an argument, though, silently interpolates
 * nothing at runtime, which is what this guards.
 *
 * A set rather than a list, because how often an argument is referenced is the
 * translator's business: Arabic inflects nouns that English leaves bare, so it
 * writes `{total} {total, plural, …}` where English writes `{total} sessions`.
 * Both supply exactly the argument `total`.
 */
function icuArguments(message: string): string[] {
  const names: string[] = [];

  function walk(nodes: MessageFormatElement[]): void {
    for (const node of nodes) {
      if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
      if ("value" in node && typeof node.value === "string") names.push(node.value);
      if ("options" in node) {
        for (const option of Object.values(node.options)) walk(option.value);
      }
      if (node.type === TYPE.tag) walk(node.children);
    }
  }

  walk(parse(message));
  return [...new Set(names)].sort();
}

describe.each(MESSAGE_FOLDERS)("messages of the %s folder", (folder) => {
  const files = FOLDER_MESSAGES[folder] as Record<string, Json>;
  const reference = leafKeys(files.en);

  it.each(TRANSLATIONS)("%s has exactly the same keys as en", (locale) => {
    const keys = leafKeys(files[locale]);
    const missing = reference.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.includes(key));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(TRANSLATIONS)("%s uses the same ICU arguments as en", (locale) => {
    const mismatched = reference
      .map((path) => ({
        path,
        en: icuArguments(String(leafValue(files.en, path))),
        translated: icuArguments(String(leafValue(files[locale], path) ?? "")),
      }))
      .filter(({ en: source, translated }) => source.join() !== translated.join());

    expect(mismatched).toEqual([]);
  });

  it.each(["en", ...TRANSLATIONS])("%s leaves no value empty", (locale) => {
    const empty = reference.filter((path) => {
      const value = leafValue(files[locale], path);
      return typeof value !== "string" || value.trim() === "";
    });

    expect(empty).toEqual([]);
  });
});

describe("message catalogues, across folders", () => {
  it("has no key defined by two folders", () => {
    // The catalogues are merged, and in a merge the later folder would win
    // without a word. A namespace may be shared (`Errors` is, by design); a key
    // may not.
    const owners = new Map<string, string[]>();
    for (const folder of MESSAGE_FOLDERS) {
      for (const key of leafKeys(FOLDER_MESSAGES[folder].en as Json)) {
        owners.set(key, [...(owners.get(key) ?? []), folder]);
      }
    }
    const clashes = [...owners]
      .filter(([, folders]) => folders.length > 1)
      .map(([key, folders]) => `${key}: ${folders.join(", ")}`);
    expect(clashes).toEqual([]);
  });

  it("has no folder using a key as a group where another uses it as a text", () => {
    // "Workers.New" as a text in one folder and "Workers.New.Title" in another
    // would merge into something neither wrote.
    const texts = new Set<string>();
    for (const folder of MESSAGE_FOLDERS)
      for (const key of leafKeys(FOLDER_MESSAGES[folder].en as Json)) texts.add(key);
    const shadowed = [...texts].filter((key) => [...texts].some((other) => other.startsWith(`${key}.`)));
    expect(shadowed).toEqual([]);
  });

  it("merges every folder into each language", () => {
    const total = MESSAGE_FOLDERS.reduce((sum, folder) => sum + leafKeys(FOLDER_MESSAGES[folder].en as Json).length, 0);
    for (const locale of ["en", "ar", "fr"] as const) {
      expect(leafKeys(MESSAGES[locale] as Json)).toHaveLength(total);
    }
    expect(total).toBeGreaterThan(100);
  });
});
