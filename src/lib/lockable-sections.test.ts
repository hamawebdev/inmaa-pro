import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCKED_SECTIONS,
  LOCKABLE_SECTIONS,
  isSectionLocked,
  parseLockedSections,
  serializeLockedSections,
} from "./lockable-sections";

/**
 * The gate fails *closed*, and these are the cases that prove it. A bug here
 * does not throw or look wrong — it silently opens the payroll to whoever is at
 * the desk — so the malformed-input paths matter more than the happy one.
 */
describe("parseLockedSections", () => {
  it("falls back to the defaults when nothing was ever stored", () => {
    expect(parseLockedSections(undefined)).toEqual([...DEFAULT_LOCKED_SECTIONS]);
    expect(parseLockedSections("")).toEqual([...DEFAULT_LOCKED_SECTIONS]);
    expect(parseLockedSections("   ")).toEqual([...DEFAULT_LOCKED_SECTIONS]);
  });

  it('treats "[]" as a real choice to lock nothing', () => {
    // This is why an empty array cannot be the not-configured sentinel: an
    // centre that deliberately unlocked everything must not silently have the
    // defaults reapplied on next launch.
    expect(parseLockedSections("[]")).toEqual([]);
  });

  it("falls back to the defaults on malformed input rather than opening up", () => {
    expect(parseLockedSections("not json")).toEqual([...DEFAULT_LOCKED_SECTIONS]);
    expect(parseLockedSections("{}")).toEqual([...DEFAULT_LOCKED_SECTIONS]);
    expect(parseLockedSections("null")).toEqual([...DEFAULT_LOCKED_SECTIONS]);
    expect(parseLockedSections('"money"')).toEqual([...DEFAULT_LOCKED_SECTIONS]);
    expect(parseLockedSections("42")).toEqual([...DEFAULT_LOCKED_SECTIONS]);
  });

  it("drops ids it does not recognise", () => {
    // A section removed in a later version must not linger and lock an id that
    // has since been reused for something else.
    expect(parseLockedSections('["money","gone","settings"]')).toEqual(["money", "settings"]);
    expect(parseLockedSections('["home"]')).toEqual([]);
    expect(parseLockedSections("[1,2,3]")).toEqual([]);
  });

  it("round-trips through serialize", () => {
    const chosen = ["money", "requests"];
    expect(parseLockedSections(serializeLockedSections(chosen)).sort()).toEqual(chosen.sort());
  });
});

describe("serializeLockedSections", () => {
  it("writes in registry order, not click order", () => {
    // Two centres with the same choices should hold byte-identical rows.
    const a = serializeLockedSections(["settings", "money", "requests"]);
    const b = serializeLockedSections(["requests", "settings", "money"]);
    expect(a).toBe(b);
    expect(a).toBe(JSON.stringify(["requests", "money", "settings"]));
  });

  it("ignores unknown ids", () => {
    expect(serializeLockedSections(["money", "home", "bogus"])).toBe(JSON.stringify(["money"]));
  });
});

describe("isSectionLocked", () => {
  it("never locks the home screen, whatever is stored", () => {
    expect(isSectionLocked("home", ["home", "money"])).toBe(false);
  });

  it("never locks an unresolved route", () => {
    expect(isSectionLocked(undefined, [...DEFAULT_LOCKED_SECTIONS])).toBe(false);
  });

  it("locks exactly what the list names", () => {
    const locked = ["money", "settings"];
    expect(isSectionLocked("money", locked)).toBe(true);
    expect(isSectionLocked("settings", locked)).toBe(true);
    expect(isSectionLocked("requests", locked)).toBe(false);
    expect(isSectionLocked("employees", locked)).toBe(false);
  });
});

describe("registry", () => {
  it("offers every section except home", () => {
    expect(LOCKABLE_SECTIONS.map((s) => s.id)).toEqual([
      "employees",
      "workers",
      "requests",
      "money",
      "stock",
      "settings",
    ]);
  });

  it("ships defaults that are all lockable", () => {
    const ids = new Set(LOCKABLE_SECTIONS.map((s) => s.id as string));
    for (const id of DEFAULT_LOCKED_SECTIONS) expect(ids.has(id)).toBe(true);
  });
});
