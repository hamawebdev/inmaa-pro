import { describe, expect, it } from "vitest";

import { documentState, documentsToFollow, type HeldDocument } from "./documents";

const TODAY = "2026-10-12";
const LEAD = 30;

describe("the state of one document", () => {
  it.each([
    ["2026-10-11", "EXPIRED"],
    ["2026-10-12", "EXPIRING"],
    ["2026-11-11", "EXPIRING"],
    ["2026-11-12", "VALID"],
  ] as const)("expiring on %s is %s", (expiryDate, state) => {
    expect(documentState({ type: "MEDICAL_CERT", delivered: true, expiryDate }, TODAY, LEAD)).toBe(state);
  });

  it("never expires without an expiry date", () => {
    expect(documentState({ type: "BIRTH_CERT", delivered: true, expiryDate: null }, TODAY, LEAD)).toBe("NO_EXPIRY");
  });

  it("is missing when not handed in", () => {
    expect(documentState(undefined, TODAY, LEAD)).toBe("MISSING");
    expect(documentState({ type: "BIRTH_CERT", delivered: false, expiryDate: null }, TODAY, LEAD)).toBe("MISSING");
  });
});

describe("the documents to follow for one person", () => {
  const held: HeldDocument[] = [
    { type: "ID_CARD_COPY", delivered: true, expiryDate: "2030-01-01" },
    { type: "MEDICAL_CERT", delivered: true, expiryDate: "2026-10-01" },
    { type: "CRIMINAL_RECORD", delivered: true, expiryDate: "2026-10-20" },
    { type: "CROSSED_CCP_CHEQUE", delivered: true, expiryDate: null },
  ];

  it("lists the expired, then the missing, then those about to expire", () => {
    expect(documentsToFollow(held, ["ID_CARD_COPY", "BIRTH_CERT", "MEDICAL_CERT"], TODAY, LEAD)).toEqual([
      { type: "MEDICAL_CERT", state: "EXPIRED", daysLeft: -11 },
      { type: "BIRTH_CERT", state: "MISSING", daysLeft: null },
      { type: "CRIMINAL_RECORD", state: "EXPIRING", daysLeft: 8 },
    ]);
  });

  it("counts a renewed document, not the copy it replaces", () => {
    const renewed = [...held, { type: "MEDICAL_CERT" as const, delivered: true, expiryDate: "2027-10-01" }];
    expect(documentsToFollow(renewed, ["MEDICAL_CERT"], TODAY, LEAD)).toEqual([
      { type: "CRIMINAL_RECORD", state: "EXPIRING", daysLeft: 8 },
    ]);
  });

  it("has nothing to follow when all is in order", () => {
    expect(documentsToFollow(held.slice(0, 1), ["ID_CARD_COPY"], TODAY, LEAD)).toEqual([]);
  });
});
