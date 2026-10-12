import { describe, expect, it } from "vitest";

import { COMMUNES_OUM_EL_BOUAGHI } from "./communes-oum-el-bouaghi";
import { findWilaya, HOME_WILAYA_CODE, isWilayaCode, WILAYAS } from "./wilayas";

describe("places", () => {
  it("lists the 69 wilayas, coded 01 to 69 (ruling 6)", () => {
    expect(WILAYAS).toHaveLength(69);
    expect(WILAYAS.map((wilaya) => wilaya.code)).toEqual(
      Array.from({ length: 69 }, (_, index) => String(index + 1).padStart(2, "0")),
    );
    expect(findWilaya(HOME_WILAYA_CODE)?.nameAr).toBe("أم البواقي");
    expect(isWilayaCode("69")).toBe(true);
    expect(isWilayaCode("70")).toBe(false);
  });

  it("seeds the 29 communes of the home wilaya, each once, in the order of their official codes", () => {
    const names = COMMUNES_OUM_EL_BOUAGHI.map((commune) => commune.nameAr);
    expect(names).toHaveLength(29);
    expect(new Set(names).size).toBe(names.length);
    expect(COMMUNES_OUM_EL_BOUAGHI.map((commune) => commune.code)).toEqual(
      Array.from({ length: 29 }, (_, index) => `04${String(index + 1).padStart(2, "0")}`),
    );
    expect(COMMUNES_OUM_EL_BOUAGHI.find((commune) => commune.code === "0426")?.nameAr).toBe("الراحية");
  });
});
