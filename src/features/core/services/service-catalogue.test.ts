import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { catalogueFromSeed, servicesOfDivision, type ServiceCatalogue } from "@/lib/options/service-catalogue";
import { SEED_PROVIDED_SERVICES_OF } from "@/lib/options/service-catalogue-seed";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  listServiceCatalogue,
  saveServiceCatalogue,
  serviceLabels,
  type ServiceDraft,
  type SaveServiceCatalogueInput,
} from "./service-catalogue";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** The list as the editor would send it back untouched. */
function draftsOf(catalogue: ServiceCatalogue, list: "PROVIDED" | "PROGRAMMED"): ServiceDraft[] {
  return catalogue[list].map((entry) => ({
    id: entry.id,
    labels: { ...entry.labels },
    isActive: entry.isActive,
    places: Object.fromEntries(
      Object.entries(entry.places)
        .filter(([, place]) => place?.isActive)
        .map(([division, place]) => [division, place!.sortOrder]),
    ),
  }));
}

async function save(input: SaveServiceCatalogueInput) {
  return test.transact((ex, ctx) => saveServiceCatalogue(ex, ctx, input));
}

const read = () => listServiceCatalogue(test.db);
const codesOf = (catalogue: ServiceCatalogue, division: "HOUSING" | "ORGANISATION" | "BUILDING" | "COMPLEX") =>
  servicesOfDivision(catalogue, "PROVIDED", division).map((service) => service.code);

describe("his two service lists", () => {
  it("start as migration 0003 seeded them: his 48 services, each division in his print order", async () => {
    const catalogue = await read();
    expect(catalogue).toEqual(catalogueFromSeed());
    expect(codesOf(catalogue, "HOUSING")).toEqual(SEED_PROVIDED_SERVICES_OF.HOUSING);
    expect(catalogue.PROVIDED).toHaveLength(35);
    expect(catalogue.PROGRAMMED).toHaveLength(13);
  });

  it("add a service to the divisions chosen, at the end, coded ADDED_1, and log it", async () => {
    const drafts = draftsOf(await read(), "PROVIDED");
    drafts.push({
      labels: { ar: "تنظيف المسابح", fr: "Piscines", en: "Swimming pools" },
      isActive: true,
      places: { HOUSING: 99, ORGANISATION: 99 },
    });
    expect(await save({ list: "PROVIDED", services: drafts })).toEqual({ added: 1, changed: 0 });

    const catalogue = await read();
    expect(codesOf(catalogue, "HOUSING").at(-1)).toBe("ADDED_1");
    expect(codesOf(catalogue, "HOUSING")).toHaveLength(14);
    expect(codesOf(catalogue, "ORGANISATION").at(-1)).toBe("ADDED_1");
    expect(codesOf(catalogue, "BUILDING")).not.toContain("ADDED_1");

    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("entity", "=", "CatalogueService")
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "CHANGE", entityLabel: "تنظيف المسابح" });
    expect(entry.changes).toContain("ADDED_1");
  });

  it("rename a service in its three names, and move one within a division only", async () => {
    const drafts = draftsOf(await read(), "PROGRAMMED");
    const guests = drafts.find((draft) => draft.id === "svc-PROGRAMMED-GUESTS")!;
    guests.labels = { ar: "تنظيف غرف الضيوف", fr: "Chambres d'amis", en: "Guest rooms" };
    // Housing: DEEP (last) moves to the top; the other divisions keep their order.
    for (const draft of drafts) if (draft.places.HOUSING !== undefined) draft.places.HOUSING += 1;
    drafts.find((draft) => draft.id === "svc-PROGRAMMED-DEEP")!.places.HOUSING = 0;
    await save({ list: "PROGRAMMED", services: drafts });

    const catalogue = await read();
    const housing = servicesOfDivision(catalogue, "PROGRAMMED", "HOUSING");
    expect(housing[0].code).toBe("DEEP");
    expect(housing.map((service) => service.code).slice(1, 3)).toEqual(["PERIODIC", "AFTER_CONSTRUCTION"]);
    expect(servicesOfDivision(catalogue, "PROGRAMMED", "ORGANISATION")[0].code).toBe("PERIODIC");
    expect(housing.find((service) => service.code === "GUESTS")!.labels.ar).toBe("تنظيف غرف الضيوف");
    expect((await serviceLabels(test.db, "PROGRAMMED")).get("GUESTS")).toBe("تنظيف غرف الضيوف");
  });

  it("remove a service: no longer offered, still known by its name, kept at its place for a file that ticks it", async () => {
    const drafts = draftsOf(await read(), "PROVIDED");
    drafts.find((draft) => draft.id === "svc-PROVIDED-KITCHEN")!.isActive = false;
    await save({ list: "PROVIDED", services: drafts });

    const catalogue = await read();
    expect(codesOf(catalogue, "HOUSING")).not.toContain("KITCHEN");
    const kept = servicesOfDivision(catalogue, "PROVIDED", "HOUSING", ["KITCHEN"]);
    expect(kept[1]).toMatchObject({ code: "KITCHEN", offered: false });
    expect((await serviceLabels(test.db, "PROVIDED")).get("KITCHEN")).toBe("تنظيف المطبخ");

    // Restored, it is offered again.
    const again = draftsOf(catalogue, "PROVIDED");
    again.find((draft) => draft.id === "svc-PROVIDED-KITCHEN")!.isActive = true;
    await save({ list: "PROVIDED", services: again });
    expect(codesOf(await read(), "HOUSING")).toContain("KITCHEN");
  });

  it("take a division away from a service, and give it one", async () => {
    const drafts = draftsOf(await read(), "PROVIDED");
    const garage = drafts.find((draft) => draft.id === "svc-PROVIDED-GARAGE")!;
    delete garage.places.HOUSING;
    drafts.find((draft) => draft.id === "svc-PROVIDED-OVEN")!.places.ORGANISATION = 99;
    await save({ list: "PROVIDED", services: drafts });

    const catalogue = await read();
    expect(codesOf(catalogue, "HOUSING")).not.toContain("GARAGE");
    expect(codesOf(catalogue, "ORGANISATION").at(-1)).toBe("OVEN");
    expect(codesOf(catalogue, "BUILDING")).toContain("GARAGE");
  });

  it("change nothing when the list comes back as it was", async () => {
    expect(await save({ list: "PROVIDED", services: draftsOf(await read(), "PROVIDED") })).toEqual({
      added: 0,
      changed: 0,
    });
    const logged = await test.db.selectFrom("AuditLog").select("id").where("entity", "=", "CatalogueService").execute();
    expect(logged).toHaveLength(0);
  });

  it("refuse a name missing in one language, a name twice, a service with no division", async () => {
    const base = draftsOf(await read(), "PROVIDED");
    const withNew = (draft: ServiceDraft) => [...base, draft];
    await expect(
      save({
        list: "PROVIDED",
        services: withNew({
          labels: { ar: "تنظيف المسابح", fr: "", en: "Pools" },
          isActive: true,
          places: { HOUSING: 0 },
        }),
      }),
    ).rejects.toThrow("A service needs its name in Arabic, French and English.");
    await expect(
      save({
        list: "PROVIDED",
        services: withNew({
          labels: { ar: "تنظيف  المطبخ", fr: "Cuisine", en: "Kitchen" },
          isActive: true,
          places: { HOUSING: 0 },
        }),
      }),
    ).rejects.toThrow("Two services of this list have the same name.");
    await expect(
      save({
        list: "PROVIDED",
        services: withNew({ labels: { ar: "تنظيف المسابح", fr: "Piscines", en: "Pools" }, isActive: true, places: {} }),
      }),
    ).rejects.toThrow("Choose at least one division for each service.");
    await expect(save({ list: "PROVIDED", services: base.slice(1) })).rejects.toThrow(
      "This list has changed. Reload it and try again.",
    );
  });

  it("is the manager's: another role is refused", async () => {
    const services = draftsOf(await read(), "PROVIDED");
    await expect(
      test.transact(
        (ex, ctx) => saveServiceCatalogue(ex, ctx, { list: "PROVIDED", services }),
        await test.sessionFor("ACCOUNTANT"),
      ),
    ).rejects.toThrow();
  });

  it("are rows the database never deletes, with one code per list", async () => {
    expect(() => test.raw.exec(`DELETE FROM "CatalogueService" WHERE "id" = 'svc-PROVIDED-FLOORS'`)).toThrow(
      /NO_DELETE/,
    );
    expect(() =>
      test.raw.exec(`DELETE FROM "CatalogueServiceDivision" WHERE "id" = 'svc-PROVIDED-FLOORS-HOUSING'`),
    ).toThrow(/NO_DELETE/);
    expect(() =>
      test.raw.exec(
        `INSERT INTO "CatalogueService" ("id","list","code","labelAr","labelFr","labelEn","createdAt","updatedAt") VALUES ('x','PROVIDED','FLOORS','أ','b','c','2026-10-12T08:00:00.000Z','2026-10-12T08:00:00.000Z')`,
      ),
    ).toThrow(/UNIQUE/);
    expect(() =>
      test.raw.exec(
        `INSERT INTO "CatalogueService" ("id","list","code","labelAr","labelFr","labelEn","createdAt","updatedAt") VALUES ('y','PROVIDED','NEW',' ','b','c','2026-10-12T08:00:00.000Z','2026-10-12T08:00:00.000Z')`,
      ),
    ).toThrow(/CHECK/);
  });
});
