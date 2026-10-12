import { describe, expect, it } from "vitest";

import { formatQuantity } from "./quantities";

describe("a quantity on paper", () => {
  it("drops trailing zeros and writes a comma before the decimals", () => {
    expect(formatQuantity(13_000)).toBe("13");
    expect(formatQuantity(1_500)).toBe("1,5");
    expect(formatQuantity(125)).toBe("0,125");
    expect(formatQuantity(0)).toBe("0");
    expect(formatQuantity(-2_250)).toBe("-2,25");
    expect(formatQuantity(1_234_000)).toBe("1 234");
  });

  it("refuses a fraction of a thousandth", () => {
    expect(() => formatQuantity(1.5)).toThrow(RangeError);
  });
});
