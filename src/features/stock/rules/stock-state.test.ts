import { describe, expect, it } from "vitest";

import { sampleInventory } from "../samples/inventory";

import { STOCK_STATES, needsPurchase, stockState } from "./stock-state";

const row = (onHand: number, min: number | null) => ({
  isActive: true,
  onHandQty: onHand * 1000,
  minLevel: min === null ? null : min * 1000,
});

describe("an item against its minimum", () => {
  it("is out when nothing is left, whether it has a minimum or not", () => {
    expect(stockState(row(0, 1))).toBe("OUT");
    expect(stockState(row(0, null))).toBe("OUT");
  });

  it("has reached its minimum at it and below it, as the alert says", () => {
    expect(stockState(row(10, 10))).toBe("LOW");
    expect(stockState(row(4.5, 5))).toBe("LOW");
    expect(stockState(row(10.001, 10))).toBe("OK");
  });

  it("is not watched when no minimum is set", () => {
    expect(stockState(row(2, null))).toBe("UNWATCHED");
  });

  it("asks for a purchase when out or at the minimum", () => {
    expect(STOCK_STATES.filter(needsPurchase)).toEqual(["OUT", "LOW"]);
  });
});

describe("the sample inventory", () => {
  const items = sampleInventory();

  it("keeps his four lines of the store table with their minimums", () => {
    const byCode = new Map(items.map((item) => [item.code, item]));
    expect(byCode.get("FLOOR_CLEANER")).toMatchObject({ onHandQty: 30_000, minLevel: 10_000, unit: "LITRE" });
    expect(byCode.get("GLASS_CLEANER")).toMatchObject({ onHandQty: 20_000, minLevel: 5_000 });
    expect(byCode.get("PPE_GLOVES")).toMatchObject({ onHandQty: 100_000, minLevel: 30_000, unit: "PAIR" });
    expect(byCode.get("BIN_BAGS")).toMatchObject({ onHandQty: 500_000, minLevel: 100_000 });
  });

  it("shows every state, in both kinds", () => {
    const states = new Set(items.map((item) => `${item.kind}:${stockState(item)}`));
    for (const kind of ["EQUIPMENT", "MATERIAL"]) {
      for (const state of ["LOW", "OK", "UNWATCHED"]) expect(states, `${kind}:${state}`).toContain(`${kind}:${state}`);
    }
    expect(states).toContain("EQUIPMENT:OUT");
  });

  it("has unique codes and ids", () => {
    expect(new Set(items.map((item) => item.code)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});
