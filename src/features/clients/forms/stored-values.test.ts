import { describe, expect, it } from "vitest";

import { dinarsToMoney } from "@/lib/units";

import { FORM_KINDS } from "../validators/option-lists";

import { DESCRIPTION_KEYS, FILE_ANSWER_KEYS, PARTY_KEYS, printedKeys, storedAnswersOf } from "./stored-values";
import type { FieldKey } from "./values";

describe("where his answers are kept", () => {
  it("gives every answer of every form a place, and no answer two", () => {
    const homes: FieldKey[] = [
      "clientName",
      "managerName",
      "capacity",
      "contractingParty",
      "contractingPartyOther",
      "sector",
      "hasTradeRegister",
      "phone",
      "siteNumber",
      "commonName",
      "address",
      "propertyType",
      "propertyTypeOther",
      "ownership",
      "commune",
      "wilaya",
      "providedServices",
      "providedServicesCustom",
      "programmedServices",
      "programmedServicesCustom",
      "registrationNumber",
      "registrationDate",
      "dossierNumber",
      "statusTicks",
      ...FILE_ANSWER_KEYS,
      ...DESCRIPTION_KEYS,
    ];
    expect(new Set(homes).size).toBe(homes.length);
    for (const kind of FORM_KINDS) {
      expect([...printedKeys(kind)].filter((key) => !homes.includes(key))).toEqual([]);
    }
  });

  it("writes only what a form prints: a housing request leaves an organisation's manager alone", () => {
    const answers = storedAnswersOf("HOUSING_REQUEST", { clientName: "بوزيد سليم", managerName: "قاسمي نادية" });
    expect(answers.client).toEqual({ name: "بوزيد سليم", phone1: null });
    expect(answers.file).not.toHaveProperty("contractKind");
    expect(answers.description).not.toHaveProperty("offices");
    expect(answers.serviceLists).toEqual(["PROVIDED", "PROGRAMMED"]);
  });

  it("keeps a set as a list of codes, nothing ticked as [], and a yes / no as 1, 0 or null", () => {
    const answers = storedAnswersOf("ORG_CONTRACT", {
      executionDays: ["SAT", "MON"],
      hasGuard: false,
      hasTradeRegister: true,
      totalAmount: dinarsToMoney(45000),
      paymentPlace: "  مقر المركز ",
      guardName: "   ",
    });
    expect(answers.file).toMatchObject({
      executionDays: '["SAT","MON"]',
      paymentMethods: "[]",
      hasGuard: 0,
      securityInstructions: null,
      totalAmount: 4500000,
      paymentPlace: "مقر المركز",
      guardName: null,
    });
    expect(answers.client).toMatchObject({ hasTradeRegister: 1 });
  });

  it("turns the services into rows: ticked options, then the blank lines with their slot", () => {
    const answers = storedAnswersOf("HOUSING_CONTRACT", {
      providedServices: ["KITCHEN", "FLOORS"],
      providedServicesCustom: [null, "تنظيف السلم"],
      programmedServices: ["PERIODIC"],
    });
    expect(answers.services).toEqual([
      { list: "PROVIDED", code: "FLOORS", customLabel: null, blankSlot: null, sortOrder: 0 },
      { list: "PROVIDED", code: "KITCHEN", customLabel: null, blankSlot: null, sortOrder: 1 },
      { list: "PROVIDED", code: null, customLabel: "تنظيف السلم", blankSlot: 2, sortOrder: 11 },
      { list: "PROGRAMMED", code: "PERIODIC", customLabel: null, blankSlot: null, sortOrder: 0 },
    ]);
  });

  it("freezes at «متعاقد» every party value a sheet prints", () => {
    const printedAnywhere = new Set(FORM_KINDS.flatMap((kind) => [...printedKeys(kind)]));
    expect(PARTY_KEYS.filter((key) => !printedAnywhere.has(key))).toEqual([]);
  });
});
