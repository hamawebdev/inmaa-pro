import { describe, expect, it } from "vitest";

import { FILE_PARTS } from "./file-parts";
import { SECTIONS, resolveSection } from "./sections";

/**
 * Who may declare which route.
 *
 * Each owner writes its own route list (src/features/<owner>/routes.tsx) and
 * its own pages, so that no two teammates edit the same file. This test is what
 * keeps that true: a path declared in the wrong list, declared twice, or sitting
 * outside every section fails here, with the path named.
 *
 * The lists are read as text, not imported. Importing them would load every
 * screen in the program into a test that only needs the paths, and a screen
 * that needs a browser would break it. That is why each `path` must be a plain
 * string literal.
 *
 * The table below is CLAUDE.md's, "Who owns which files". Change it only when
 * the coordinator changes that one.
 */
const OWNERS = {
  core: ["home", "settings"],
  people: ["employees", "employee-attendance", "workers", "hiring", "hours-pay"],
  clients: ["files", "clients", "rep-visits"],
  operations: ["supervisors", "work-program", "worker-attendance", "visits", "quality"],
  money: ["expenses", "income", "invoices", "payments", "reports", "inventory", "handouts", "purchases", "maintenance"],
} as const;

type Owner = keyof typeof OWNERS;

/** The parts of a file that are not Clients': `files/:id/<part>` belongs to the part's owner. */
const FILE_PART_OWNER = new Map<string, Owner>(FILE_PARTS.map((part) => [part.id, part.owner]));

const sources = import.meta.glob("../features/*/routes.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const declared = Object.entries(sources).flatMap(([file, text]) => {
  const owner = /features\/([^/]+)\/routes\.tsx$/.exec(file)?.[1] as Owner;
  return [...text.matchAll(/\bpath:\s*(["'`])([^"'`]*)\1/g)].map((match) => ({ owner, path: match[2] }));
});

function ownerOf(path: string): Owner | undefined {
  const [first, , third] = path.split("/");
  if (first === "files" && third) return FILE_PART_OWNER.get(third) ?? "clients";
  return (Object.keys(OWNERS) as Owner[]).find((owner) => (OWNERS[owner] as readonly string[]).includes(first));
}

describe("route lists", () => {
  it("reads the five lists", () => {
    expect(
      Object.keys(sources)
        .map((file) => /features\/([^/]+)\//.exec(file)?.[1])
        .sort(),
    ).toEqual(Object.keys(OWNERS).sort());
    expect(declared.length).toBeGreaterThan(30);
  });

  it("finds every path as a plain string literal", () => {
    // `path: someVariable` would slip past the checks below.
    for (const [file, text] of Object.entries(sources)) {
      const all = text.match(/\bpath:/g)?.length ?? 0;
      const literal = text.match(/\bpath:\s*(["'`])[^"'`$]*\1/g)?.length ?? 0;
      expect(literal, `${file}: write every path as a string literal`).toBe(all);
    }
  });

  it("keeps every path with the owner CLAUDE.md names", () => {
    const misplaced = declared
      .filter(({ owner, path }) => ownerOf(path) !== owner)
      .map(({ owner, path }) => `${path} is declared by ${owner}, but belongs to ${ownerOf(path) ?? "nobody"}`);
    expect(misplaced).toEqual([]);
  });

  it("declares no path twice", () => {
    const paths = declared.map(({ path }) => path);
    expect(paths.filter((path, index) => paths.indexOf(path) !== index)).toEqual([]);
  });

  it("puts every path inside a section, so the bar always has a light on", () => {
    const outside = declared
      .map(({ path }) => path)
      .filter((path) => resolveSection(`/dashboard/${path}`) === undefined);
    expect(outside).toEqual([]);
  });

  it("has a route for every tab and for every part of a file", () => {
    const paths = new Set(declared.map(({ path }) => path));
    const missing = [
      ...SECTIONS.flatMap((section) => [section.href, ...(section.tabs ?? []).map((tab) => tab.href)]).map((href) =>
        href.replace("/dashboard/", ""),
      ),
      "files/:id",
      ...FILE_PARTS.map((part) => `files/:id/${part.id}`),
    ].filter((path) => !paths.has(path));
    expect(missing).toEqual([]);
  });
});
