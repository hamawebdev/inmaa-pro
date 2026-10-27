import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEMO_FILES } from "@/features/clients/demo";
import { resolveDefinition, keptServicesOf } from "@/features/clients/forms/catalogue";
import { FORM_DEFINITIONS } from "@/features/clients/forms/definitions";
import type { ResolvedDefinition } from "@/features/clients/forms/types";
import { openFileSheet } from "@/features/clients/services/file-reads";
import { moveFileStage, registerFile, type RegisterFileInput } from "@/features/clients/services/files";
import type { FormKind } from "@/features/clients/validators/option-lists";
import { listServiceCatalogue, saveServiceLists, type ServiceDraft } from "@/features/core/services/service-catalogue";

import { createTestDatabase, type TestDatabase } from "../../database";

/**
 * Acceptance: his two service lists are the manager's (the developer, 2026-10-22). A service added, renamed,
 * moved and removed in Settings › الخدمات shows correctly, for its division, on the request form, on the
 * contract, and on their printed sheets; a removed service is no longer offered for new requests, and a contract
 * that already has it keeps it, on screen and on paper.
 *
 * Every step goes through the services the screens call: the editor's `saveServiceLists`, the file's
 * `registerFile` and `moveFileStage`, the print page's `openFileSheet`. The screen and the sheet are drawn from
 * the form resolved against the lists (`resolveDefinition`): what they show is what is checked here, option by
 * option and column by column. The PDFs of the same edits are looked at by eye (docs/checker/acceptance.md).
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const demoInput = (name: string): RegisterFileInput =>
  structuredClone(DEMO_FILES.find((file) => file.name === name)!.input) as RegisterFileInput;

/** What a form lists in a service row, as the screen and the sheet draw it: each column's services, then blanks. */
function printed(definition: ResolvedDefinition, key: "providedServices" | "programmedServices") {
  const row = definition.rows.find((candidate) => candidate.key === key)!;
  const columns: string[][] = [];
  for (const block of definition.sheet) {
    if (block.t !== "table") continue;
    for (const line of block.rows)
      for (const cell of line.cells)
        for (const part of cell.parts) {
          if (part.t !== "options" || part.row !== row.id) continue;
          columns.push(
            (row.options ?? []).slice(part.from, part.to).map((option) => (option.free ? "……" : option.raw)),
          );
        }
  }
  return columns;
}
const flat = (columns: string[][]) => columns.flat().filter((text) => text !== "……");

const formOf = async (kind: FormKind, values?: Parameters<typeof keptServicesOf>[0]) =>
  resolveDefinition(FORM_DEFINITIONS[kind], await listServiceCatalogue(test.db), keptServicesOf(values));

describe("his service lists, edited in Settings › الخدمات", () => {
  it("reach the request form, the contract and their printed sheets, division by division", async () => {
    // A contract signed before the edit ticks the kitchen, which the manager then removes.
    const signedInput = demoInput("housingContract");
    expect(signedInput.values.providedServices).toContain("KITCHEN");
    const signed = await test.transact((ex, ctx) => registerFile(ex, ctx, signedInput));
    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: signed.fileId, to: "QUOTE" }));
    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: signed.fileId, to: "CONTRACTED" }));

    // The manager's edit, one Save: a service added for homes and organisations, one renamed, one moved, one
    // removed.
    const catalogue = await listServiceCatalogue(test.db);
    const drafts: ServiceDraft[] = catalogue.PROVIDED.map((entry) => ({
      id: entry.id,
      labels: { ...entry.labels },
      isActive: entry.isActive,
      places: Object.fromEntries(
        Object.entries(entry.places).flatMap(([division, place]) =>
          place?.isActive ? [[division, place.sortOrder]] : [],
        ),
      ),
    }));
    const draft = (code: string) => drafts[catalogue.PROVIDED.findIndex((entry) => entry.code === code)];
    drafts.push({
      labels: { ar: "تنظيف المسابح", fr: "Piscines", en: "Swimming pools" },
      isActive: true,
      places: { HOUSING: 13, ORGANISATION: 20 },
    });
    draft("CURTAINS").labels = { ar: "تنظيف الستائر والمفروشات", fr: "Rideaux et tentures", en: "Curtains and drapes" };
    // Housing: the garage, last, swaps places with the floors, first.
    [draft("GARAGE").places.HOUSING, draft("FLOORS").places.HOUSING] = [
      draft("FLOORS").places.HOUSING,
      draft("GARAGE").places.HOUSING,
    ];
    draft("KITCHEN").isActive = false;
    await test.transact((ex, ctx) => saveServiceLists(ex, ctx, { lists: [{ list: "PROVIDED", services: drafts }] }));

    // The housing request form: the pools last, the renamed curtains, the garage first, no kitchen.
    const request = flat(printed(await formOf("HOUSING_REQUEST"), "providedServices"));
    expect(request[0]).toBe("تنظيف المرآب");
    expect(request).toContain("تنظيف الستائر والمفروشات");
    expect(request).not.toContain("تنظيف المطبخ");
    expect(request.at(-1)).toBe("تنظيف المسابح");
    expect(request.at(-2)).toBe("تنظيف الأرضيات");
    // One service removed, one added: thirteen again, in his layout, his three blank lines at the foot of the last
    // three columns.
    const columns = printed(await formOf("HOUSING_REQUEST"), "providedServices");
    expect(columns.map((column) => column.length)).toEqual([4, 4, 4, 4]);
    expect(columns.map((column) => column.at(-1) === "……")).toEqual([false, true, true, true]);

    // The organisation's forms list the pools too; the building's and the complex's do not, nor did the move
    // reach them.
    expect(flat(printed(await formOf("ORG_CONTRACT"), "providedServices")).at(-1)).toBe("تنظيف المسابح");
    const building = flat(printed(await formOf("BUILDING_CONTRACT"), "providedServices"));
    expect(building).not.toContain("تنظيف المسابح");
    expect(building[0]).toBe("تنظيف الأرضيات");

    // A new request may tick the pools, not the kitchen.
    const fresh = demoInput("housingRequest");
    fresh.values.providedServices = ["ADDED_1", "FLOORS"];
    const registered = await test.transact((ex, ctx) => registerFile(ex, ctx, fresh));
    const freshSheet = await test.transact((ex, ctx) => openFileSheet(ex, ctx, { fileId: registered.fileId }));
    expect(freshSheet.values.providedServices).toEqual(expect.arrayContaining(["ADDED_1", "FLOORS"]));
    const withKitchen = demoInput("housingRequest");
    withKitchen.values.providedServices = ["KITCHEN"];
    await expect(test.transact((ex, ctx) => registerFile(ex, ctx, withKitchen))).rejects.toThrow(
      "This service is no longer offered.",
    );

    // The signed contract keeps the kitchen, ticked, at its place, on screen and on paper; it reads the renamed
    // curtains under their new name.
    const sheet = await test.transact((ex, ctx) => openFileSheet(ex, ctx, { fileId: signed.fileId }));
    expect(sheet.values.providedServices).toContain("KITCHEN");
    const contract = await formOf("HOUSING_CONTRACT", sheet.values);
    const listed = flat(printed(contract, "providedServices"));
    expect(listed.slice(0, 3)).toEqual(["تنظيف المرآب", "تنظيف المطبخ", "تنظيف الستائر والمفروشات"]);
    const kitchen = contract.rows
      .find((row) => row.key === "providedServices")!
      .options!.find((option) => option.code === "KITCHEN")!;
    expect(kitchen).toMatchObject({ raw: "تنظيف المطبخ", removed: true });
  });
});
