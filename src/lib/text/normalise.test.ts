import { describe, expect, it } from "vitest";

import { normaliseName, phoneKey, phoneKeys } from "./normalise";

describe("search keys", () => {
  it("give two spellings of one Arabic name the same key", () => {
    expect(normaliseName("أمّ البواقي")).toBe(normaliseName("ام البواقى"));
    expect(normaliseName("فاطمة  بنـــت علي")).toBe(normaliseName("فاطمه بنت على"));
    expect(normaliseName("إيمان")).toBe(normaliseName("ايمان"));
    expect(normaliseName("  ")).toBe("");
  });

  it("write every phone number in its national form, and several between bars", () => {
    expect(phoneKey("+213 6 59 53 81 83")).toBe("0659538183");
    expect(phoneKey("00213659538183")).toBe("0659538183");
    expect(phoneKey("٠٦٥٩ ٥٣ ٨١ ٨٣")).toBe("0659538183");
    expect(phoneKeys(["0659 53 81 83", "", "0659538183", "032 42 15 00"])).toBe("|0659538183|032421500|");
    expect(phoneKeys([null, undefined])).toBe("");
  });
});
