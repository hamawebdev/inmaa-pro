import { describe, expect, it } from "vitest";

import { catalogueFromSeed, type CatalogueEntry, type ServiceCatalogue } from "@/lib/options/service-catalogue";

import { isTicked } from "./answers";
import { columnServiceCounts, offeredServiceCodes, resolveDefinition } from "./catalogue";
import { FORM_DEFINITIONS } from "./definitions";
import type { FormKind } from "../validators/option-lists";
import type { FormRow, ResolvedDefinition, SheetPart } from "./types";

/**
 * His two service lists on his forms, as the manager edits them in Settings › الخدمات: a service added to some
 * divisions, renamed, moved, removed. The seeded lists themselves are held against his Word files in
 * definitions.test.ts.
 */

const POOLS: CatalogueEntry = {
  id: "svc-new",
  list: "PROVIDED",
  code: "ADDED_1",
  labels: { ar: "تنظيف المسابح", fr: "Piscines", en: "Swimming pools" },
  isActive: true,
  places: { HOUSING: { sortOrder: 99, isActive: true }, ORGANISATION: { sortOrder: 99, isActive: true } },
};

function edited(change: (catalogue: { PROVIDED: CatalogueEntry[]; PROGRAMMED: CatalogueEntry[] }) => void) {
  const catalogue = structuredClone(catalogueFromSeed()) as {
    PROVIDED: CatalogueEntry[];
    PROGRAMMED: CatalogueEntry[];
  };
  change(catalogue);
  return catalogue as ServiceCatalogue;
}

const entry = (catalogue: { PROVIDED: CatalogueEntry[] }, code: string) =>
  catalogue.PROVIDED.find((candidate) => candidate.code === code)!;

const providedRow = (form: ResolvedDefinition): FormRow => form.rows.find((row) => row.key === "providedServices")!;
const codesOn = (form: ResolvedDefinition) =>
  (providedRow(form).options ?? []).flatMap((option) => (option.code ? [option.code] : []));
const form = (kind: FormKind, catalogue: ServiceCatalogue, provided?: string[]) =>
  resolveDefinition(FORM_DEFINITIONS[kind], catalogue, provided ? { providedServices: provided } : null);

/** Each sheet column of the row: the codes it prints, and how many blank lines. */
function columns(definition: ResolvedDefinition, rowId: string) {
  const row = definition.rows.find((candidate) => candidate.id === rowId)!;
  const parts: Extract<SheetPart, { t: "options" }>[] = [];
  for (const block of definition.sheet) {
    if (block.t !== "table") continue;
    for (const line of block.rows)
      for (const cell of line.cells)
        for (const part of cell.parts) if (part.t === "options" && part.row === rowId) parts.push(part);
  }
  return parts.map((part) => {
    const options = (row.options ?? []).slice(part.from, part.to);
    return {
      codes: options.flatMap((option) => (option.code ? [option.code] : [])),
      blanks: options.filter((option) => option.free).length,
    };
  });
}

describe("the services of a division on its forms", () => {
  it("lay out his own lists as his Word files print them", () => {
    const housing = columns(form("HOUSING_REQUEST", catalogueFromSeed()), "HR-034");
    expect(housing.map((column) => [column.codes.length, column.blanks])).toEqual([
      [4, 0],
      [3, 1],
      [3, 1],
      [3, 1],
    ]);
    expect(housing[1].codes[0]).toBe("CEILINGS");
  });

  it("show a service added to housing and organisations on their four forms, last, and not on the building's", () => {
    const catalogue = edited((lists) => lists.PROVIDED.push(POOLS));
    for (const kind of ["HOUSING_REQUEST", "HOUSING_CONTRACT", "ORG_REQUEST", "ORG_CONTRACT"] as const) {
      expect(codesOn(form(kind, catalogue)).at(-1), kind).toBe("ADDED_1");
    }
    expect(codesOn(form("BUILDING_CONTRACT", catalogue))).not.toContain("ADDED_1");
    expect(codesOn(form("COMPLEX_CONTRACT", catalogue))).not.toContain("ADDED_1");

    // Housing now has 14 services and 3 blank lines: the first column takes the extra line.
    const housing = columns(form("HOUSING_REQUEST", catalogue), "HR-034");
    expect(housing.map((column) => column.codes.length + column.blanks)).toEqual([5, 4, 4, 4]);
    expect(housing.at(-1)!.codes.at(-1)).toBe("ADDED_1");
    const option = providedRow(form("HOUSING_REQUEST", catalogue)).options!.find((item) => item.code === "ADDED_1")!;
    expect(option).toMatchObject({ raw: "تنظيف المسابح", side: "after" });
  });

  it("print a renamed service under its new name, on a file that ticked it before too", () => {
    const catalogue = edited((lists) => {
      entry(lists, "KITCHEN").labels = { ar: "تنظيف المطابخ", fr: "Cuisines", en: "Kitchens" };
    });
    const old = form("HOUSING_CONTRACT", catalogue, ["KITCHEN"]);
    const row = providedRow(old);
    const index = row.options!.findIndex((option) => option.code === "KITCHEN");
    expect(row.options![index].raw).toBe("تنظيف المطابخ");
    expect(isTicked(row, index, { providedServices: ["KITCHEN"] })).toBe(true);
  });

  it("put a moved service at its new place on that division's forms only", () => {
    const catalogue = edited((lists) => {
      // GARAGE, last on housing, swaps places with FLOORS, first.
      const garage = entry(lists, "GARAGE").places.HOUSING!;
      const floors = entry(lists, "FLOORS").places.HOUSING!;
      [garage.sortOrder, floors.sortOrder] = [floors.sortOrder, garage.sortOrder];
    });
    expect(codesOn(form("HOUSING_REQUEST", catalogue))[0]).toBe("GARAGE");
    expect(codesOn(form("HOUSING_REQUEST", catalogue)).at(-1)).toBe("FLOORS");
    expect(codesOn(form("ORG_REQUEST", catalogue))[0]).toBe("FLOORS");
  });

  it("no longer offer a removed service, but keep it, at its place, on a file that ticks it", () => {
    const catalogue = edited((lists) => {
      entry(lists, "KITCHEN").isActive = false;
    });
    const fresh = form("HOUSING_REQUEST", catalogue);
    expect(codesOn(fresh)).not.toContain("KITCHEN");
    expect(offeredServiceCodes(fresh).has("KITCHEN")).toBe(false);

    const old = form("HOUSING_REQUEST", catalogue, ["KITCHEN"]);
    expect(codesOn(old).slice(0, 3)).toEqual(["FLOORS", "KITCHEN", "CURTAINS"]);
    expect(providedRow(old).options!.find((option) => option.code === "KITCHEN")).toMatchObject({ removed: true });
    expect(offeredServiceCodes(old).has("KITCHEN")).toBe(false);
  });

  it("drop a division's service when the division no longer offers it, but keep it on that division's old files", () => {
    const catalogue = edited((lists) => {
      entry(lists, "GARAGE").places.HOUSING!.isActive = false;
    });
    expect(codesOn(form("HOUSING_REQUEST", catalogue))).not.toContain("GARAGE");
    expect(codesOn(form("HOUSING_REQUEST", catalogue, ["GARAGE"]))).toContain("GARAGE");
    expect(codesOn(form("BUILDING_CONTRACT", catalogue))).toContain("GARAGE");
  });
});

describe("the columns of a service block", () => {
  it("share his services and blank lines as his files do", () => {
    expect(columnServiceCounts(13, [0, 1, 1, 1])).toEqual([4, 3, 3, 3]);
    expect(columnServiceCounts(20, [1, 1, 1, 1])).toEqual([5, 5, 5, 5]);
    expect(columnServiceCounts(11, [1, 1, 1, 2])).toEqual([3, 3, 3, 2]);
    expect(columnServiceCounts(20, [0, 0, 0, 0])).toEqual([5, 5, 5, 5]);
  });

  it("give the extra lines to the first columns", () => {
    expect(columnServiceCounts(17, [0, 0, 0, 0])).toEqual([5, 4, 4, 4]);
    expect(columnServiceCounts(14, [0, 1, 1, 1])).toEqual([5, 3, 3, 3]);
  });

  it("let a column of blank lines take no service when the list is short", () => {
    const counts = columnServiceCounts(2, [1, 1, 1, 2]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(counts.every((count) => count >= 0)).toBe(true);
    expect(columnServiceCounts(0, [1, 1, 1, 2])).toEqual([0, 0, 0, 0]);
  });
});
