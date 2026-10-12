import { describe, expect, it } from "vitest";

import { dinarsToMoney, toQty } from "@/lib/units";

import {
  formatSheetDate,
  formatSheetQty,
  freeText,
  isTicked,
  optionCode,
  phonePieces,
  placeParts,
  wilayaName,
  writtenValue,
} from "./answers";
import { FORM_DEFINITIONS } from "./definitions";
import type { FormRow } from "./types";
import type { FormValues } from "./values";

const row = (kind: keyof typeof FORM_DEFINITIONS, id: string): FormRow => {
  const found = FORM_DEFINITIONS[kind].rows.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found;
};
const ticks = (target: FormRow, values: FormValues) =>
  (target.options ?? []).map((_, index) => (isTicked(target, index, values) ? 1 : 0));

describe("what is written on a blank", () => {
  it("writes amounts in the program's one money format (Money's helper): «45.000,00»", () => {
    expect(writtenValue(row("HOUSING_CONTRACT", "HC-057"), { totalAmount: dinarsToMoney(45000) })).toEqual({
      text: "45.000,00",
      ltr: true,
    });
  });

  it("writes areas and durations from thousandths, with a decimal comma", () => {
    expect(formatSheetQty(toQty(180.5))).toBe("180,5");
    expect(formatSheetQty(toQty(60))).toBe("60");
    expect(formatSheetQty(toQty(0.125))).toBe("0,125");
    expect(
      writtenValue(row("HOUSING_REQUEST", "HR-039"), {
        executionDurationValue: toQty(1.5),
        executionDurationUnit: "DAYS",
      }),
    ).toEqual({ text: "1,5 يوم", ltr: false });
    expect(
      writtenValue(row("ORG_REQUEST", "OR-044"), { executionDurationValue: toQty(4), executionDurationUnit: "HOURS" }),
    ).toEqual({ text: "4 ساعة", ltr: false });
  });

  it("writes dates day first, as he does", () => {
    expect(formatSheetDate("2026-10-12")).toBe("12/10/2026");
    expect(writtenValue(row("HOUSING_REQUEST", "HR-015"), { firstVisitDate: "2026-10-10" })).toEqual({
      text: "10/10/2026",
      ltr: true,
    });
  });

  it("writes the commune, then the wilaya's name from its code", () => {
    const split = row("BUILDING_CONTRACT", "B-009");
    expect(placeParts(split, { commune: "عين البيضاء", wilaya: "04" })).toEqual(["عين البيضاء", "أم البواقي"]);
    expect(placeParts(split, {})).toEqual(["", ""]);
    // On the home request the blank is one undivided line (K10): both on it.
    expect(writtenValue(row("HOUSING_REQUEST", "HR-012"), { commune: "مسكيانة", wilaya: "04" })).toEqual({
      text: "مسكيانة / أم البواقي",
      ltr: false,
    });
    expect(wilayaName("04")).toBe("أم البواقي");
    expect(wilayaName("99")).toBe("99");
  });

  it("leaves a blank empty when there is nothing to write", () => {
    expect(writtenValue(row("HOUSING_REQUEST", "HR-009"), {})).toBeNull();
    expect(writtenValue(row("HOUSING_REQUEST", "HR-009"), { clientName: "" })).toBeNull();
  });
});

describe("which box is ticked", () => {
  it("ticks the one option of a single choice", () => {
    expect(ticks(row("HOUSING_REQUEST", "HR-016"), { cleanliness: "POOR" })).toEqual([0, 0, 0, 1, 0]);
    expect(ticks(row("HOUSING_CONTRACT", "HC-040"), { visitsPerWeek: 6 })).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("ticks every option of a several choice", () => {
    expect(ticks(row("HOUSING_REQUEST", "HR-040"), { executionDays: ["SAT", "WED"] })).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("ticks «نعم» or «لا» in his order, and neither when the answer is not known", () => {
    // «السجل التجاري» offers «لا» then «نعم» (K7).
    expect(ticks(row("ORG_REQUEST", "OR-010"), { hasTradeRegister: true })).toEqual([0, 1]);
    expect(ticks(row("ORG_REQUEST", "OR-010"), { hasTradeRegister: false })).toEqual([1, 0]);
    expect(ticks(row("ORG_REQUEST", "OR-010"), {})).toEqual([0, 0]);
    expect(ticks(row("HOUSING_REQUEST", "HR-060"), { hasGuard: true })).toEqual([1, 0]);
  });

  it("ticks «أخرى» for the code OTHER, and a blank line when something is written on it", () => {
    const property = row("HOUSING_REQUEST", "HR-008");
    expect(optionCode(property.list!, property.options![4])).toBe("OTHER");
    expect(ticks(property, { propertyType: "OTHER", propertyTypeOther: "طابق" })).toEqual([0, 0, 0, 0, 1]);

    const services = row("HOUSING_REQUEST", "HR-034");
    const values: FormValues = { providedServices: ["FLOORS"], providedServicesCustom: [null, "تنظيف السلم", null] };
    const ticked = ticks(services, values);
    expect(ticked.filter(Boolean)).toHaveLength(2);
    // The second blank line, at the foot of the third column.
    const secondBlank = services.options!.findIndex((option, index) => option.free && ticked[index] === 1);
    expect(freeText(services, secondBlank, values)).toBe("تنظيف السلم");
  });
});

describe("a resident's phone in his five dotted pairs", () => {
  it("writes the digits two by two from the right, a fixed line's first part short", () => {
    expect(phonePieces("0550 11 22 33", 5)).toEqual(["05", "50", "11", "22", "33"]);
    expect(phonePieces("032 42 18 90", 5)).toEqual(["0", "32", "42", "18", "90"]);
    expect(phonePieces(undefined, 5)).toEqual(["", "", "", "", ""]);
    expect(phonePieces("123", 5)).toEqual(["", "", "", "1", "23"]);
    // A longer number keeps what is left over in the first part.
    expect(phonePieces("00213 550 11 22 33", 5)).toEqual(["002135", "50", "11", "22", "33"]);
  });
});
