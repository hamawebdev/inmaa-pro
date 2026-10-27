import { describe, expect, it } from "vitest";

import { catalogueFromSeed } from "@/lib/options/service-catalogue";

import {
  addService,
  addToDivision,
  changeCount,
  draftsOf,
  moveService,
  offeredIn,
  othersOf,
  removedOf,
  removeService,
  restoreService,
  saveInputOf,
  updateService,
} from "./service-drafts";

const base = draftsOf(catalogueFromSeed());
const codes = (drafts: typeof base, division: "HOUSING" | "ORGANISATION" | "BUILDING" = "HOUSING") =>
  offeredIn(drafts, "PROVIDED", division).map((service) => service.code ?? service.key);
const POOLS = { ar: "تنظيف المسابح", fr: "Piscines", en: "Swimming pools" };

describe("the draft of Settings › الخدمات", () => {
  it("starts as the lists are saved, and sends nothing while nothing changed", () => {
    expect(codes(base).slice(0, 4)).toEqual(["FLOORS", "KITCHEN", "CURTAINS", "WINDOWS"]);
    expect(changeCount(base, base)).toBe(0);
    expect(saveInputOf(base, base)).toEqual({ lists: [] });
  });

  it("moves a service by swapping places with its neighbour, in that division only", () => {
    const moved = moveService(base, "PROVIDED", "HOUSING", "svc-PROVIDED-KITCHEN", -1);
    expect(codes(moved).slice(0, 2)).toEqual(["KITCHEN", "FLOORS"]);
    expect(codes(moved, "ORGANISATION").slice(0, 2)).toEqual(["FLOORS", "KITCHEN"]);
    expect(changeCount(base, moved)).toBe(2);
    // The first cannot go higher, the last no lower.
    expect(moveService(base, "PROVIDED", "HOUSING", "svc-PROVIDED-FLOORS", -1)).toBe(base);
  });

  it("adds a service last on the divisions chosen, and sends the whole list", () => {
    const added = addService(base, "PROVIDED", "new-1", POOLS, ["HOUSING", "ORGANISATION"]);
    expect(codes(added).at(-1)).toBe("new-1");
    expect(codes(added, "ORGANISATION").at(-1)).toBe("new-1");
    expect(codes(added, "BUILDING")).not.toContain("new-1");
    const { lists } = saveInputOf(base, added);
    expect(lists.map((entry) => entry.list)).toEqual(["PROVIDED"]);
    expect(lists[0].services).toHaveLength(36);
    expect(lists[0].services.at(-1)).toEqual({
      labels: POOLS,
      isActive: true,
      places: { HOUSING: 13, ORGANISATION: 20 },
    });
  });

  it("renames a service and changes its divisions", () => {
    const edited = updateService(
      base,
      "PROVIDED",
      "svc-PROVIDED-OVEN",
      { ar: "تنظيف الأفران", fr: "Fours", en: "Ovens" },
      ["HOUSING", "ORGANISATION"],
    );
    const oven = edited.PROVIDED.find((service) => service.code === "OVEN")!;
    expect(oven.labels.ar).toBe("تنظيف الأفران");
    expect(oven.places).toEqual({ HOUSING: 8, ORGANISATION: 20 });
    const dropped = updateService(base, "PROVIDED", "svc-PROVIDED-GARAGE", base.PROVIDED[12].labels, ["BUILDING"]);
    expect(codes(dropped)).not.toContain("GARAGE");
    expect(codes(dropped, "BUILDING")).toContain("GARAGE");
  });

  it("removes a service, keeps its places, and restores it last", () => {
    const removed = removeService(base, "PROVIDED", "svc-PROVIDED-KITCHEN");
    expect(codes(removed)).not.toContain("KITCHEN");
    expect(removedOf(removed, "PROVIDED").map((service) => service.code)).toEqual(["KITCHEN"]);
    expect(removed.PROVIDED.find((service) => service.code === "KITCHEN")!.places.HOUSING).toBe(1);

    const restored = restoreService(removed, "PROVIDED", "svc-PROVIDED-KITCHEN");
    expect(codes(restored).at(-1)).toBe("KITCHEN");
    expect(codes(restored, "ORGANISATION").at(-1)).toBe("KITCHEN");
  });

  it("offers a service of other divisions on this one too", () => {
    expect(othersOf(base, "PROVIDED", "HOUSING").map((service) => service.code)).toContain("OFFICES");
    const offered = addToDivision(base, "PROVIDED", "svc-PROVIDED-OFFICES", "HOUSING");
    expect(codes(offered).at(-1)).toBe("OFFICES");
  });
});
