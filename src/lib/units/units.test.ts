import { describe, expect, it } from "vitest";

import { dinarsToMoney, formatHoursMinutes, formatMoney, formatMoneyAr } from "./index";

describe("the one money format", () => {
  it("writes a dot between thousands, a comma before the centimes, and always two decimals", () => {
    expect(formatMoney(19_565_000)).toBe("195.650,00");
    expect(formatMoney(4_567_500)).toBe("45.675,00");
    expect(formatMoney(1_250_000)).toBe("12.500,00");
    expect(formatMoney(123_456_789_012)).toBe("1.234.567.890,12");
    expect(formatMoney(99_999)).toBe("999,99");
    expect(formatMoney(100_000)).toBe("1.000,00");
    expect(formatMoney(5)).toBe("0,05");
    expect(formatMoney(0)).toBe("0,00");
  });

  it("keeps the sign in front, and takes what the form converters give", () => {
    expect(formatMoney(-250_050)).toBe("-2.500,50");
    expect(formatMoney(dinarsToMoney(1500.5))).toBe("1.500,50");
  });

  it("adds the Arabic currency word for paper", () => {
    expect(formatMoneyAr(19_565_000)).toBe("195.650,00 دج");
  });

  it("refuses an amount that is not a whole number of centimes", () => {
    expect(() => formatMoney(12.5)).toThrow("must be a whole number");
  });
});

describe("the one hours format (S-33)", () => {
  it("writes minutes as hours and minutes, never a decimal", () => {
    expect(formatHoursMinutes(19_080)).toBe("318:00");
    expect(formatHoursMinutes(425)).toBe("7:05");
    expect(formatHoursMinutes(0)).toBe("0:00");
    expect(formatHoursMinutes(-30)).toBe("-0:30");
  });
});
