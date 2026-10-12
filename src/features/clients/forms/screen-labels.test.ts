import { describe, expect, it } from "vitest";

import { FORM_KINDS } from "../validators/option-lists";

import { FORM_DEFINITIONS } from "./definitions";
import { formTitleOf, headerRowsOf, screenCardsOf } from "./screen-labels";

describe("his forms as cards on screen", () => {
  it("opens a card at each heading of his, in his order", () => {
    expect(screenCardsOf("HOUSING_REQUEST").map((card) => card.titleKey)).toEqual([
      "basic.HOUSING",
      "description",
      "provided",
      "programmed.HOUSING",
      "financial",
    ]);
    expect(screenCardsOf("ORG_CONTRACT").map((card) => card.titleKey)).toEqual([
      "basic.ORGANISATION",
      "description",
      "provided",
      "programmed.OTHER",
      "financial",
    ]);
    expect(screenCardsOf("COMPLEX_CONTRACT").map((card) => card.id)).toEqual([
      "basic",
      "residentsInfo",
      "buildingSpecs",
      "provided",
      "programmed",
      "financial",
      "residents",
    ]);
  });

  it("puts every answer of every form on the screen, once, in his order", () => {
    for (const kind of FORM_KINDS) {
      const answers = FORM_DEFINITIONS[kind].rows.filter((row) => row.key !== null).map((row) => row.id);
      const shown = [
        ...headerRowsOf(kind).map((row) => row.id),
        ...screenCardsOf(kind).flatMap((card) => card.rows.map((row) => row.id)),
      ];
      expect(shown, kind).toEqual(answers);
    }
  });

  it("titles the first card with the words in his form's box", () => {
    expect(formTitleOf("BUILDING_CONTRACT")).toBe("نوع الخدمة : عقد (عمارة)");
    expect(formTitleOf("COMPLEX_CONTRACT")).toBe("نوع الخدمة : عقد (تجمع سكني)");
    expect(headerRowsOf("HOUSING_REQUEST").map((row) => row.key)).toEqual(["registrationNumber", "registrationDate"]);
  });
});
