import { describe, expect, it } from "vitest";

import { fromTyped, toTyped } from "./decimal";

describe("numbers in a settings form", () => {
  it("shows a stored number in the unit people say, with a decimal comma", () => {
    expect(toTyped(30000, 100)).toBe("300");
    expect(toTyped(30050, 100)).toBe("300,5");
    expect(toTyped(1950, 100)).toBe("19,5");
    expect(toTyped(450, 60)).toBe("7,5");
    expect(toTyped(2500, 1000)).toBe("2,5");
    expect(toTyped(null, 100)).toBe("");
  });

  it("reads what the office types: a comma or a dot for decimals, a dot for thousands", () => {
    expect(fromTyped("300", 100)).toBe(30000);
    expect(fromTyped("300,50", 100)).toBe(30050);
    expect(fromTyped("300.5", 100)).toBe(30050);
    expect(fromTyped("1.500", 100)).toBe(150000);
    expect(fromTyped("1.500,25", 100)).toBe(150025);
    expect(fromTyped(" 7,5 ", 60)).toBe(450);
    expect(fromTyped("١٩", 100)).toBe(1900);
    expect(fromTyped("", 100)).toBeNull();
  });

  it("answers undefined while the text is not a number yet", () => {
    expect(fromTyped("7,", 60)).toBeUndefined();
    expect(fromTyped("abc", 1)).toBeUndefined();
    expect(fromTyped("1,2,3", 1)).toBeUndefined();
  });
});
