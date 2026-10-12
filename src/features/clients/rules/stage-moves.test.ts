import { describe, expect, it } from "vitest";

import { dinarsToMoney, money } from "@/lib/units";

import type { FormValues } from "../forms/values";
import { FILE_STAGES } from "../validators/option-lists";

import { hasExpired, missingToContract, openMoves, stageMove, type StageFacts } from "./stage-moves";

const CONTRACT_READY: FormValues = {
  contractKind: "LONG",
  contractDuration: "Y1",
  visitsPerWeek: 3,
  executionDays: ["SAT", "MON", "WED"],
  startDate: "2026-11-01",
  endDate: "2027-10-31",
  arrivalTime: "08:00",
  departureTime: "12:00",
  workersCount: 2,
  paymentMethods: ["CASH"],
  totalAmount: dinarsToMoney(45000),
  firstDueDate: "2026-11-05",
  paymentFrequency: "MONTHLY",
  issuedDate: "2026-10-28",
};

const OFFICE_READY = { amountBasis: "PER_PAYMENT_PERIOD" };

const facts = (over: Partial<StageFacts> = {}): StageFacts => ({
  kind: "BUILDING_CONTRACT",
  stage: "NEW",
  closed: false,
  values: {},
  firstVisitPlanned: false,
  quoteIssued: false,
  quoteAccepted: false,
  endKind: null,
  today: "2026-10-12",
  byManager: false,
  ...over,
});

describe("what a sheet must say before «متعاقد»", () => {
  it("asks a contract for its terms, in the order of his sheet", () => {
    expect(missingToContract("HOUSING_CONTRACT", {})).toEqual([
      "contractKind",
      "contractDuration",
      "visitsPerWeek",
      "executionDays",
      "startDate",
      "endDate",
      "arrivalTime",
      "departureTime",
      "workersCount",
      "paymentMethods",
      "totalAmount",
      "firstDueDate",
      "paymentFrequency",
      "issuedDate",
      "amountBasis",
    ]);
    expect(missingToContract("HOUSING_CONTRACT", CONTRACT_READY)).toEqual(["amountBasis"]);
    expect(missingToContract("HOUSING_CONTRACT", CONTRACT_READY, OFFICE_READY)).toEqual([]);
  });

  it("does not ask an on-demand file what its total is the price of", () => {
    expect(missingToContract("HOUSING_REQUEST", CONTRACT_READY)).toEqual([]);
  });

  it("does not ask a request form for what only a contract prints", () => {
    const missing = missingToContract("ORG_REQUEST", {});
    expect(missing).not.toContain("contractKind");
    expect(missing).not.toContain("contractDuration");
    expect(missing).not.toContain("visitsPerWeek");
    expect(missing).not.toContain("paymentFrequency");
    expect(missing).toContain("executionDays");
    expect(missing).toContain("totalAmount");
    expect(missing).toContain("issuedDate");
  });

  it("counts an empty list, an empty text and a zero as not answered", () => {
    const values = { ...CONTRACT_READY, executionDays: [], arrivalTime: "", totalAmount: money(0) };
    expect(missingToContract("ORG_CONTRACT", values, OFFICE_READY)).toEqual([
      "executionDays",
      "arrivalTime",
      "totalAmount",
    ]);
  });
});

describe("the moves of a file", () => {
  it("goes to «الزيارة» once a first visit is planned or dated", () => {
    expect(stageMove(facts(), "VISIT")).toMatchObject({ allowed: false, refusal: "NO_FIRST_VISIT" });
    expect(stageMove(facts({ firstVisitPlanned: true }), "VISIT")).toEqual({ allowed: true });
    expect(stageMove(facts({ values: { firstVisitDate: "2026-10-14" } }), "VISIT")).toEqual({ allowed: true });
  });

  it("goes to «عرض سعر» once a quote is issued or the total is typed, with or without a visit", () => {
    expect(stageMove(facts({ stage: "VISIT" }), "QUOTE")).toMatchObject({ allowed: false, refusal: "NO_QUOTE" });
    expect(stageMove(facts({ stage: "VISIT", quoteIssued: true }), "QUOTE")).toEqual({ allowed: true });
    expect(stageMove(facts({ stage: "NEW", values: { totalAmount: dinarsToMoney(9000) } }), "QUOTE")).toEqual({
      allowed: true,
    });
  });

  it("takes a contract to «متعاقد» once its sheet and what its total is the price of are filled", () => {
    const quoted = { stage: "QUOTE", quoteIssued: true } as const;
    expect(stageMove(facts({ ...quoted, values: CONTRACT_READY }), "CONTRACTED")).toEqual({
      allowed: false,
      refusal: "MISSING_ANSWERS",
      missing: ["amountBasis"],
    });
    expect(
      stageMove(facts({ ...quoted, values: { ...CONTRACT_READY, startDate: "" }, office: OFFICE_READY }), "CONTRACTED"),
    ).toEqual({ allowed: false, refusal: "MISSING_ANSWERS", missing: ["startDate"] });
    expect(stageMove(facts({ ...quoted, values: CONTRACT_READY, office: OFFICE_READY }), "CONTRACTED")).toEqual({
      allowed: true,
    });
  });

  it("takes an on-demand file to «متعاقد» only once its quote is accepted and its sheet filled", () => {
    const quoted = { kind: "HOUSING_REQUEST", stage: "QUOTE", quoteIssued: true } as const;
    expect(stageMove(facts({ ...quoted, values: CONTRACT_READY }), "CONTRACTED")).toMatchObject({
      allowed: false,
      refusal: "QUOTE_NOT_ACCEPTED",
    });
    expect(
      stageMove(facts({ ...quoted, quoteAccepted: true, values: { ...CONTRACT_READY, issuedDate: "" } }), "CONTRACTED"),
    ).toEqual({ allowed: false, refusal: "MISSING_ANSWERS", missing: ["issuedDate"] });
    expect(stageMove(facts({ ...quoted, quoteAccepted: true, values: CONTRACT_READY }), "CONTRACTED")).toEqual({
      allowed: true,
    });
  });

  it("does not skip a stage other than «الزيارة»", () => {
    const ready = { quoteIssued: true, quoteAccepted: true, values: CONTRACT_READY };
    expect(stageMove(facts({ stage: "NEW", ...ready }), "CONTRACTED")).toMatchObject({ refusal: "NOT_THE_NEXT_STAGE" });
    expect(stageMove(facts({ stage: "VISIT", ...ready }), "CONTRACTED")).toMatchObject({
      refusal: "NOT_THE_NEXT_STAGE",
    });
    expect(stageMove(facts({ stage: "QUOTE", ...ready }), "CONTRACT_ENDED")).toMatchObject({
      refusal: "NOT_THE_NEXT_STAGE",
    });
  });

  it("goes to «انتهاء التعاقد» after the end date, or when the office gives a reason", () => {
    const contracted = { stage: "CONTRACTED", values: CONTRACT_READY } as const;
    expect(stageMove(facts(contracted), "CONTRACT_ENDED")).toMatchObject({ allowed: false, refusal: "NO_END_REASON" });
    expect(stageMove(facts({ ...contracted, today: "2027-10-31" }), "CONTRACT_ENDED")).toMatchObject({
      allowed: false,
    });
    expect(stageMove(facts({ ...contracted, today: "2027-11-01" }), "CONTRACT_ENDED")).toEqual({ allowed: true });
    expect(stageMove(facts({ ...contracted, endKind: "ENDED_BY_CLIENT" }), "CONTRACT_ENDED")).toEqual({
      allowed: true,
    });
    expect(stageMove(facts({ ...contracted, kind: "HOUSING_REQUEST", endKind: "JOB_DONE" }), "CONTRACT_ENDED")).toEqual(
      {
        allowed: true,
      },
    );
  });

  it("goes back only for the manager, and never once signed", () => {
    expect(stageMove(facts({ stage: "QUOTE" }), "VISIT")).toMatchObject({ allowed: false, refusal: "NEEDS_MANAGER" });
    expect(stageMove(facts({ stage: "QUOTE", byManager: true }), "VISIT")).toEqual({ allowed: true });
    expect(stageMove(facts({ stage: "CONTRACTED", byManager: true }), "QUOTE")).toMatchObject({
      allowed: false,
      refusal: "SIGNED",
    });
    expect(stageMove(facts({ stage: "CONTRACT_ENDED", byManager: true }), "CONTRACTED")).toMatchObject({
      allowed: false,
      refusal: "SIGNED",
    });
  });

  it("does not move a closed file, nor to the stage it is at", () => {
    for (const to of FILE_STAGES) {
      expect(stageMove(facts({ stage: "QUOTE", closed: true, byManager: true }), to)).toMatchObject({
        allowed: false,
        refusal: "CLOSED",
      });
    }
    expect(stageMove(facts({ stage: "VISIT" }), "VISIT")).toMatchObject({ allowed: false, refusal: "SAME_STAGE" });
  });

  it("lists the moves open now, forward ones first", () => {
    expect(openMoves(facts({ values: { firstVisitDate: "2026-10-14", totalAmount: dinarsToMoney(9000) } }))).toEqual([
      "VISIT",
      "QUOTE",
    ]);
    expect(openMoves(facts({ stage: "QUOTE", byManager: true }))).toEqual(["NEW", "VISIT"]);
    expect(openMoves(facts({ stage: "CONTRACT_ENDED" }))).toEqual([]);
  });
});

describe("the end of a contract", () => {
  it("comes the day after «تاريخ النهاية»", () => {
    expect(hasExpired("2026-10-31", "2026-10-31")).toBe(false);
    expect(hasExpired("2026-10-31", "2026-11-01")).toBe(true);
    expect(hasExpired(undefined, "2026-11-01")).toBe(false);
    expect(hasExpired("", "2026-11-01")).toBe(false);
  });
});
