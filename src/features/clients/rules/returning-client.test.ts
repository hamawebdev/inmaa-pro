import { describe, expect, it } from "vitest";

import { dinarsToMoney } from "@/lib/units";

import type { FormValues } from "../forms/values";
import { FORM_KINDS } from "../validators/option-lists";

import {
  answersOf,
  CLIENT_KEYS,
  JOB_KEYS,
  NEVER_COPIED_KEYS,
  returningClientFill,
  SITE_KEYS,
} from "./returning-client";

const PREVIOUS: FormValues = {
  registrationNumber: "12/BLC",
  registrationDate: "2025-10-01",
  statusTicks: ["NEW", "CONTRACT_ENDED"],
  dossierNumber: "41",
  clientName: "بلقاسم مرابط",
  capacity: "رئيس جمعية السكان",
  contractingParty: "RESIDENTS_ASSOCIATION",
  phone: "0661 20 31 42",
  siteNumber: "14",
  address: "حي 200 مسكن",
  commune: "عين البيضاء",
  wilaya: "04",
  commonName: "عمارة الورود",
  firstVisitDate: "2025-09-28",
  cleanliness: "POOR",
  cleanlinessNote: "بعد أشغال",
  equipmentStorage: true,
  storagePlace: "القبو",
  wasteDisposal: ["CONTAINERS"],
  entrances: 2,
  floors: 5,
  lifts: 0,
  hasBasements: true,
  residentTurnover: "LOW",
  providedServices: ["FLOORS", "CORRIDORS"],
  programmedServices: ["PERIODIC"],
  contractKind: "LONG",
  contractDuration: "Y1",
  visitsPerWeek: 3,
  executionDays: ["SAT", "MON", "WED"],
  startDate: "2025-10-05",
  endDate: "2026-10-04",
  arrivalTime: "08:00",
  departureTime: "12:00",
  workersCount: 2,
  payerName: "أمين الصندوق",
  payerPhone: "0550 11 22 33",
  totalAmount: dinarsToMoney(45000),
  firstDueDate: "2025-10-10",
  paymentFrequency: "MONTHLY",
  teamAccess: ["VIA_GUARD"],
  hasGuard: true,
  guardName: "عمار",
  issuedDate: "2025-10-01",
  residents: [{ number: 1, name: "سليم بوزيد", phone: "0770 00 11 22", registeredDate: "2025-10-01" }],
};

describe("the lists of what is copied", () => {
  it("name every answer of every form exactly once", () => {
    const lists = [...CLIENT_KEYS, ...SITE_KEYS, ...JOB_KEYS, ...NEVER_COPIED_KEYS];
    expect(new Set(lists).size).toBe(lists.length);
    const named = new Set(lists);
    for (const kind of FORM_KINDS) {
      expect([...answersOf(kind)].filter((key) => !named.has(key))).toEqual([]);
    }
    const printedSomewhere = new Set(FORM_KINDS.flatMap((kind) => [...answersOf(kind)]));
    expect(lists.filter((key) => !printedSomewhere.has(key))).toEqual([]);
  });
});

describe("the «قديم» fill-in", () => {
  const filled = returningClientFill({
    kind: "BUILDING_CONTRACT",
    previous: PREVIOUS,
    site: "same",
    purpose: "returning",
  });

  it("copies who the client is, the site and its description", () => {
    expect(filled).toMatchObject({
      dossierNumber: "41",
      clientName: "بلقاسم مرابط",
      capacity: "رئيس جمعية السكان",
      contractingParty: "RESIDENTS_ASSOCIATION",
      phone: "0661 20 31 42",
      siteNumber: "14",
      address: "حي 200 مسكن",
      commune: "عين البيضاء",
      wilaya: "04",
      commonName: "عمارة الورود",
      equipmentStorage: true,
      storagePlace: "القبو",
      wasteDisposal: ["CONTAINERS"],
      entrances: 2,
      floors: 5,
      lifts: 0,
      hasBasements: true,
      residentTurnover: "LOW",
    });
    expect(filled.residents).toEqual(PREVIOUS.residents);
  });

  it("leaves blank what belongs to the new job", () => {
    for (const key of [...NEVER_COPIED_KEYS, ...JOB_KEYS]) {
      expect(filled[key], key).toBeUndefined();
    }
  });

  it("copies only the client when the site is new", () => {
    const fresh = returningClientFill({
      kind: "BUILDING_CONTRACT",
      previous: PREVIOUS,
      site: "new",
      purpose: "returning",
    });
    expect(Object.keys(fresh).sort()).toEqual(
      ["capacity", "clientName", "contractingParty", "dossierNumber", "phone"].sort(),
    );
  });

  it("copies only what the new form prints", () => {
    // A client known from a building file opens a home file: the home form has no «الصفة» and no «جهة التعاقد».
    const home = returningClientFill({
      kind: "HOUSING_REQUEST",
      previous: PREVIOUS,
      site: "new",
      purpose: "returning",
    });
    expect(home).toEqual({ dossierNumber: "41", clientName: "بلقاسم مرابط", phone: "0661 20 31 42" });
  });
});

describe("a renewal", () => {
  const renewed = returningClientFill({
    kind: "BUILDING_CONTRACT",
    previous: PREVIOUS,
    site: "same",
    purpose: "renewal",
  });

  it("adds the services and the terms of the job", () => {
    expect(renewed).toMatchObject({
      providedServices: ["FLOORS", "CORRIDORS"],
      programmedServices: ["PERIODIC"],
      contractKind: "LONG",
      contractDuration: "Y1",
      visitsPerWeek: 3,
      executionDays: ["SAT", "MON", "WED"],
      arrivalTime: "08:00",
      workersCount: 2,
      payerName: "أمين الصندوق",
      totalAmount: dinarsToMoney(45000),
      paymentFrequency: "MONTHLY",
      teamAccess: ["VIA_GUARD"],
      hasGuard: true,
      guardName: "عمار",
    });
  });

  it("still leaves the dates, the visit and the registration blank", () => {
    for (const key of NEVER_COPIED_KEYS) {
      expect(renewed[key], key).toBeUndefined();
    }
  });
});
