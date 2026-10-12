import { describe, expect, it } from "vitest";

import { codesOf } from "../validators/option-lists";

import { proposedContractKind, proposedEndDate } from "./contract-terms";

describe("the proposed «تاريخ النهاية»", () => {
  it("is the eve of the same day, that many months on", () => {
    expect(proposedEndDate("2026-01-01", "M1")).toBe("2026-01-31");
    expect(proposedEndDate("2026-01-15", "M3")).toBe("2026-04-14");
    expect(proposedEndDate("2026-12-10", "M6")).toBe("2027-06-09");
    expect(proposedEndDate("2026-03-01", "Y1")).toBe("2027-02-28");
    expect(proposedEndDate("2027-03-01", "Y1")).toBe("2028-02-29");
  });

  it("ends on the month's last day when the day does not exist there", () => {
    expect(proposedEndDate("2026-01-31", "M1")).toBe("2026-02-28");
    expect(proposedEndDate("2026-08-31", "M3")).toBe("2026-11-30");
    expect(proposedEndDate("2024-02-29", "Y1")).toBe("2025-02-28");
  });

  it("proposes nothing from what is not a date", () => {
    expect(proposedEndDate("", "M1")).toBeNull();
    expect(proposedEndDate("2026-02-30", "M1")).toBeNull();
    expect(proposedEndDate("12/10/2026", "M1")).toBeNull();
  });

  it("is never before the start", () => {
    for (const duration of codesOf("CONTRACT_DURATION")) {
      for (const start of ["2026-01-01", "2026-01-31", "2026-02-28", "2026-06-30", "2026-12-31"]) {
        expect(proposedEndDate(start, duration)! > start).toBe(true);
      }
    }
  });
});

describe("the proposed «نوع العقد»", () => {
  it("is «قصير» up to three months and «طويل» from six", () => {
    expect(codesOf("CONTRACT_DURATION").map((duration) => `${duration} ${proposedContractKind(duration)}`)).toEqual([
      "M1 SHORT",
      "M3 SHORT",
      "M6 LONG",
      "Y1 LONG",
    ]);
  });
});
