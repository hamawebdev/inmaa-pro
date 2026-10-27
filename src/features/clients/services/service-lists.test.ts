import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listServiceCatalogue,
  saveServiceCatalogue,
  type ServiceDraft,
} from "@/features/core/services/service-catalogue";
import { clearHandlers, loadFeatureEvents, registerHandler, resetFeatureEvents } from "@/lib/events";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";

import { renewFile } from "./contracts";
import { getFileForScheduling } from "./exports";
import { loadFileRecord, sheetValuesOf } from "./file-records";
import { moveFileStage, registerFile, saveFileForm, type RegisterFileInput } from "./files";

/**
 * A file under his two service lists as the manager edits them (Settings › الخدمات): a removed service stays
 * on the files that tick it and is refused on a new one, a reorder is never a change of a signed sheet, a
 * renamed service reads under its new name, a renewal leaves a removed service behind.
 */

let test: TestDatabase;
let termsChanged: unknown[];
beforeEach(async () => {
  clearHandlers();
  resetFeatureEvents();
  loadFeatureEvents();
  test = await createTestDatabase();
  termsChanged = [];
  registerHandler("stock", "file.termsChanged", async (_ex, _ctx, payload) => {
    termsChanged.push(payload);
  });
});
afterEach(() => {
  test.close();
  clearHandlers();
  resetFeatureEvents();
  loadFeatureEvents();
});

const demoInput = (name: string): RegisterFileInput =>
  structuredClone(DEMO_FILES.find((file) => file.name === name)!.input) as RegisterFileInput;
const register = (input: RegisterFileInput) => test.transact((ex, ctx) => registerFile(ex, ctx, input));
const move = (fileId: string, to: "QUOTE" | "CONTRACTED") =>
  test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to }));
const sheetOf = async (fileId: string) => sheetValuesOf((await loadFileRecord(test.db, fileId))!);

/** Edits «الخدمات المقدمة» as the editor would, and saves it. */
async function editProvided(change: (drafts: Map<string, ServiceDraft>) => void) {
  const catalogue = await listServiceCatalogue(test.db);
  const drafts = new Map(
    catalogue.PROVIDED.map((entry): [string, ServiceDraft] => [
      entry.code,
      {
        id: entry.id,
        labels: { ...entry.labels },
        isActive: entry.isActive,
        places: Object.fromEntries(
          Object.entries(entry.places)
            .filter(([, place]) => place?.isActive)
            .map(([division, place]) => [division, place!.sortOrder]),
        ),
      },
    ]),
  );
  change(drafts);
  await test.transact((ex, ctx) => saveServiceCatalogue(ex, ctx, { list: "PROVIDED", services: [...drafts.values()] }));
}

describe("a file under the manager's service lists", () => {
  it("keeps a service removed since on the file that ticks it, and refuses it on a new file", async () => {
    const input = demoInput("housingContract");
    expect(input.values.providedServices).toContain("KITCHEN");
    const { fileId } = await register(input);
    await editProvided((drafts) => {
      drafts.get("KITCHEN")!.isActive = false;
    });

    // Saved again as it was: the removed service stays ticked.
    await test.transact((ex, ctx) => saveFileForm(ex, ctx, { fileId, values: input.values }));
    expect((await sheetOf(fileId)).providedServices).toContain("KITCHEN");

    // A new file is no longer offered it.
    await expect(register(demoInput("housingContract"))).rejects.toThrow("This service is no longer offered.");
    const without = demoInput("housingContract");
    without.values.providedServices = without.values.providedServices!.filter((code) => code !== "KITCHEN");
    await expect(register(without)).resolves.toBeTruthy();
  });

  it("does not take a reorder of the lists for a change of a signed sheet", async () => {
    const input = demoInput("housingContract");
    const { fileId } = await register(input);
    await move(fileId, "QUOTE");
    await move(fileId, "CONTRACTED");
    termsChanged.length = 0;
    await editProvided((drafts) => {
      const floors = drafts.get("FLOORS")!;
      const garage = drafts.get("GARAGE")!;
      [floors.places.HOUSING, garage.places.HOUSING] = [garage.places.HOUSING, floors.places.HOUSING];
    });
    const logged = await test.db.selectFrom("AuditLog").select("id").where("entity", "=", "File").execute();

    // No reason asked, nothing logged on the file, nobody told: the sheet says the same thing.
    const saved = await test.transact((ex, ctx) => saveFileForm(ex, ctx, { fileId, values: input.values }));
    expect(saved.changed).toBe(false);
    expect(await test.db.selectFrom("AuditLog").select("id").where("entity", "=", "File").execute()).toHaveLength(
      logged.length,
    );
    expect(termsChanged).toEqual([]);
    // Whoever sorts the rows reads today's order: FLOORS now comes after the others.
    const rows = await test.db
      .selectFrom("FileService")
      .select(["code", "sortOrder"])
      .where("fileId", "=", fileId)
      .where("list", "=", "PROVIDED")
      .where("code", "is not", null)
      .orderBy("sortOrder")
      .execute();
    expect(rows.at(-1)?.code).toBe("FLOORS");
  });

  it("reads a renamed service under its new name, on a file registered before", async () => {
    const { fileId } = await register(demoInput("housingContract"));
    await editProvided((drafts) => {
      drafts.get("KITCHEN")!.labels = { ar: "تنظيف المطابخ", fr: "Cuisines", en: "Kitchens" };
    });
    const scheduled = await test.transact((ex, ctx) => getFileForScheduling(ex, ctx, { fileId }));
    expect(scheduled!.services.find((service) => service.code === "KITCHEN")?.labelAr).toBe("تنظيف المطابخ");
  });

  it("renews a contract without a service removed since", async () => {
    const input = demoInput("housingContract");
    const { fileId } = await register(input);
    await move(fileId, "QUOTE");
    await move(fileId, "CONTRACTED");
    await editProvided((drafts) => {
      drafts.get("KITCHEN")!.isActive = false;
    });
    const next = await test.transact((ex, ctx) => renewFile(ex, ctx, { fileId }));
    const renewed = await sheetOf(next.fileId);
    expect(renewed.providedServices).not.toContain("KITCHEN");
    expect(renewed.providedServices).toEqual(input.values.providedServices!.filter((code) => code !== "KITCHEN"));
  });
});
