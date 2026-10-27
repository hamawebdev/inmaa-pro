import { describe, expect, it } from "vitest";

/**
 * No browser or system picker opens anywhere in the program (the developer, 2026-10-22). A date, a time, a
 * period, a text with usual answers and a choice from a list are the program's own pickers
 * (`@/components/pickers`, `@/components/ui/select`), each applied only when its «تأكيد» is pressed.
 *
 * ESLint refuses the same while the code is written (eslint.config.js, NO_NATIVE_PICKER_SYNTAX). This test
 * reads every source file as text, and also catches what lint cannot see: an input whose `type` is computed.
 * File buttons are not pickers here: they stay as the academy has them (CLAUDE.md).
 */
const sources = import.meta.glob(["../../**/*.{ts,tsx}", "!../../**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Wrappers that pass a caller's `type` through: lint checks what their callers pass. */
const PASS_THROUGH = ["src/components/ui/input.tsx", "src/components/ui/input-group.tsx"];

/** The `type` values an input may compute among: none of them opens a picker. */
const PLAIN_TYPES = new Set([
  "text",
  "password",
  "number",
  "search",
  "email",
  "tel",
  "hidden",
  "checkbox",
  "radio",
  "file",
]);

/** The source without its comments: a comment may name what it no longer uses. No string here holds `//`. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Whether a computed `type={…}` can only ever be a plain field: it names its types, and none is a picker. */
function plainComputedType(tag: string): boolean {
  const expression = /\btype=\{([^}]*)\}/.exec(tag)?.[1] ?? "";
  const literals = [...expression.matchAll(/["'`]([a-z-]+)["'`]/g)].map((match) => match[1]);
  return literals.length > 0 && literals.every((literal) => PLAIN_TYPES.has(literal));
}

/** An `<input>` or `<Input>` opening tag, up to its first `>` that is not part of `=>`. */
const INPUT_TAGS = /<(?:input|Input)\b(?:[^>]|=>)*>/g;

function offences(path: string, source: string): string[] {
  const text = withoutComments(source);
  const found: string[] = [];
  const line = (index: number) => text.slice(0, index).split("\n").length;
  for (const tag of text.matchAll(INPUT_TAGS)) {
    const where = `${path}:${line(tag.index ?? 0)}`;
    if (/\btype=(?:"|\{\s*["'`])(?:date|time|datetime-local|month|week|color)["'`]/.test(tag[0])) {
      found.push(`${where}: a native date, time or colour field`);
    } else if (/\btype=\{/.test(tag[0]) && !plainComputedType(tag[0]) && !PASS_THROUGH.includes(path)) {
      found.push(`${where}: an input whose type is computed (it could be a native date or time field)`);
    }
    if (/\slist=/.test(tag[0])) found.push(`${where}: an input with a browser suggestion list`);
  }
  for (const match of text.matchAll(/<(select|datalist)[\s>]/g)) {
    found.push(`${path}:${line(match.index ?? 0)}: a native <${match[1]}>`);
  }
  for (const match of text.matchAll(/\.showPicker\s*\(/g))
    found.push(`${path}:${line(match.index ?? 0)}: showPicker()`);
  for (const match of text.matchAll(
    /from\s+["'](@\/components\/ui\/(?:native-select|combobox)|@\/components\/date-range-picker|@base-ui\/react\/(?:select|combobox))["']/g,
  )) {
    found.push(`${path}:${line(match.index ?? 0)}: imports ${match[1]}`);
  }
  for (const match of text.matchAll(/captionLayout=["'{][^"'}]*dropdown/g)) {
    found.push(`${path}:${line(match.index ?? 0)}: a calendar caption drawn with native selects`);
  }
  return found;
}

describe("the program's pickers", () => {
  it("read every source file", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(500);
  });

  it("leave no browser or system picker in the program", () => {
    // A key is relative to this file: name it from the project's root.
    const found = Object.entries(sources).flatMap(([key, text]) =>
      offences(new URL(key, "file:///src/components/pickers/").pathname.slice(1), text),
    );
    expect(found).toEqual([]);
  });

  it("would see one if it came back", () => {
    expect(offences("x.tsx", `<Input type="date" value={v} onChange={(e) => f(e.target.value)} />`)).toHaveLength(1);
    expect(offences("x.tsx", `<input\n  type={"time"}\n  value={v}\n/>`)).toHaveLength(1);
    expect(offences("x.tsx", `<Input type={field.kind} />`)).toHaveLength(1);
    expect(offences("x.tsx", `<select value={v}><option /></select>`)).toHaveLength(1);
    expect(offences("x.tsx", `<Input list="communes" /><datalist id="communes" />`)).toHaveLength(2);
    expect(offences("x.tsx", `import { NativeSelect } from "@/components/ui/native-select";`)).toHaveLength(1);
    expect(offences("x.tsx", `<Input type="text" /><Input type="number" /><TextField type="date" />`)).toEqual([]);
    expect(offences("x.tsx", `<Input type={shown ? "text" : "password"} />\n// no <select> here`)).toEqual([]);
  });
});
