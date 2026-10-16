import { describe, expect, it } from "vitest";

import { SETTING_DEFAULTS } from "@/lib/settings/catalogue";

import { FORM_DEFINITIONS } from "../forms/definitions";
import { FORM_KINDS } from "../validators/option-lists";

import { formatRegistrationNumber, registrationPlaces, suffixPlaceOf } from "./registration-number";

describe("«رقم التسجيل»", () => {
  it("is written sequence, slash, suffix, by Foundation's numbering", () => {
    expect(formatRegistrationNumber("BUILDING_CONTRACT", 12, "BLC")).toBe("12/BLC");
    expect(formatRegistrationNumber("HOUSING_REQUEST", 7, "")).toBe("7");
    expect(formatRegistrationNumber("ORG_CONTRACT", 3, " OC ")).toBe("3/OC");
  });

  it("refuses a sequence that is not a whole number from 1", () => {
    expect(() => formatRegistrationNumber("BUILDING_CONTRACT", 0, "BLC")).toThrow(RangeError);
    expect(() => formatRegistrationNumber("HOUSING_REQUEST", 1.5, "")).toThrow(RangeError);
  });

  it("starts with the suffixes his empty forms print", () => {
    // The setting's first value and his Word files agree: «BLC» on the building contract, a blank elsewhere.
    const defaults = SETTING_DEFAULTS["numbering.fileSuffix"];
    for (const kind of FORM_KINDS) {
      expect(`${kind} ${defaults[kind] ?? ""}`).toBe(`${kind} ${FORM_DEFINITIONS[kind].registrationSuffix ?? ""}`);
    }
  });
});

describe("the two places of his line", () => {
  const building = FORM_DEFINITIONS.BUILDING_CONTRACT;
  const home = FORM_DEFINITIONS.HOUSING_REQUEST;
  const complex = FORM_DEFINITIONS.COMPLEX_CONTRACT;

  it("are his on an empty form: «BLC» on the building contract, a blank elsewhere", () => {
    expect(registrationPlaces(building, undefined)).toEqual({ sequence: "", suffix: "BLC" });
    expect(registrationPlaces(home, undefined)).toEqual({ sequence: "", suffix: null });
    expect(registrationPlaces(complex, "")).toEqual({ sequence: "", suffix: null });
  });

  it("carry a file's own number", () => {
    expect(registrationPlaces(building, "12/BLC")).toEqual({ sequence: "12", suffix: "BLC" });
    expect(registrationPlaces(home, "7")).toEqual({ sequence: "7", suffix: null });
    expect(registrationPlaces(home, "3/H/F")).toEqual({ sequence: "3", suffix: "H/F" });
    expect(registrationPlaces(building, formatRegistrationNumber("BUILDING_CONTRACT", 45, "BLC"))).toEqual({
      sequence: "45",
      suffix: "BLC",
    });
  });
});

it("B-002: the complexes copy prints its number alone; the building joins «/BLC»; the others keep a slash and a blank", () => {
  const building = FORM_DEFINITIONS.BUILDING_CONTRACT;
  const home = FORM_DEFINITIONS.HOUSING_REQUEST;
  const complex = FORM_DEFINITIONS.COMPLEX_CONTRACT;
  expect(suffixPlaceOf(complex, registrationPlaces(complex, "1"))).toBe("NONE");
  expect(suffixPlaceOf(complex, registrationPlaces(complex, undefined))).toBe("NONE");
  expect(suffixPlaceOf(building, registrationPlaces(building, "1/BLC"))).toBe("SUFFIX");
  expect(suffixPlaceOf(home, registrationPlaces(home, "7"))).toBe("BLANK");
});
