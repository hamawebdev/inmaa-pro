import { describe, expect, it } from "vitest";

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
