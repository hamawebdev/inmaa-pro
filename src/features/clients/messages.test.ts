import { describe, expect, it } from "vitest";

import ar from "./messages/ar.json";
import { optionCode, optionLabel, withoutTatweel } from "./forms/answers";
import { FORM_DEFINITIONS } from "./forms/definitions";
import { HEADING_CARDS, labelKeyOf, LIST_NAMESPACES } from "./forms/screen-labels";
import { FORM_KINDS, OPTION_LISTS, type OptionListName } from "./validators/option-lists";

/**
 * Arabic is the client's language: every label of his forms on screen is his
 * own word, on every form that prints it (scope sections 2, 7 and 9). The test
 * reads the Arabic messages against the form definitions, which are checked
 * against his Word files (forms/definitions.test.ts).
 */

function at(tree: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

describe("the Arabic of the form screen", () => {
  it("labels every answer with his words, on each of the six forms", () => {
    const wrong: string[] = [];
    for (const kind of FORM_KINDS) {
      for (const row of FORM_DEFINITIONS[kind].rows) {
        if (!row.key || !row.label || row.role === "heading" || row.role === "title") continue;
        const key = labelKeyOf(kind, row.key);
        const label = at(ar, `FileForm.Labels.${key}`);
        if (label !== row.label) wrong.push(`${kind} ${row.id} ${key}: «${String(label)}» is not «${row.label}»`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("titles every card with his heading", () => {
    const wrong: string[] = [];
    for (const kind of FORM_KINDS) {
      for (const row of FORM_DEFINITIONS[kind].rows.filter((candidate) => candidate.role === "heading")) {
        const title = at(ar, `FileForm.Cards.${HEADING_CARDS[row.label]?.titleKey}`);
        if (title !== row.label) wrong.push(`${kind} ${row.id}: «${String(title)}» is not «${row.label}»`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("words our lists' options as his forms do, his agreed corrections included", () => {
    const wrong: string[] = [];
    for (const kind of FORM_KINDS) {
      for (const row of FORM_DEFINITIONS[kind].rows) {
        if (!row.list || !row.options) continue;
        const namespace = LIST_NAMESPACES[row.list as OptionListName];
        if (!namespace.startsWith("FileOptions.")) continue;
        for (const option of row.options) {
          const code = optionCode(row.list as OptionListName, option);
          // A bare blank line has no word of his: «أخرى» is ours.
          if (code === null || option.raw.trim() === "") continue;
          const label = at(ar, `${namespace}.${code}`);
          const his = withoutTatweel(optionLabel(option)).replace(/:$/, "").trim();
          if (label !== his) wrong.push(`${kind} ${row.id} ${code}: «${String(label)}» is not «${his}»`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("has a label for every option of our lists", () => {
    for (const [list, namespace] of Object.entries(LIST_NAMESPACES)) {
      if (!namespace.startsWith("FileOptions.")) continue;
      for (const entry of OPTION_LISTS[list as OptionListName]) {
        expect(typeof at(ar, `${namespace}.${entry.code}`), `${namespace}.${entry.code}`).toBe("string");
      }
    }
  });
});
