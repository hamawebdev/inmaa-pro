import { describe, expect, it } from "vitest";

import { CLIENT_SANCTIONS, FILE_STAGES } from "../validators/option-lists";

import { statusTicks } from "./status-ticks";

describe("the eight boxes of «حالة الملف»", () => {
  it("ticks «جديد» alone on a new client's new file", () => {
    expect(statusTicks({ stage: "NEW", isReturning: false, clientSanction: "NONE" })).toEqual(["NEW"]);
  });

  it("ticks «قديم» alone when the fill-in was used and the file is at its first stage", () => {
    expect(statusTicks({ stage: "NEW", isReturning: true, clientSanction: "NONE" })).toEqual(["OLD"]);
  });

  it("adds the stage once the file is past the first", () => {
    expect(statusTicks({ stage: "VISIT", isReturning: false, clientSanction: "NONE" })).toEqual(["NEW", "VISIT"]);
    expect(statusTicks({ stage: "QUOTE", isReturning: true, clientSanction: "NONE" })).toEqual(["OLD", "QUOTE"]);
    expect(statusTicks({ stage: "CONTRACTED", isReturning: false, clientSanction: "NONE" })).toEqual([
      "NEW",
      "CONTRACTED",
    ]);
    expect(statusTicks({ stage: "CONTRACT_ENDED", isReturning: true, clientSanction: "NONE" })).toEqual([
      "OLD",
      "CONTRACT_ENDED",
    ]);
  });

  it("adds the client's sanction, in the order of his boxes", () => {
    expect(statusTicks({ stage: "CONTRACTED", isReturning: true, clientSanction: "SUSPENDED" })).toEqual([
      "OLD",
      "CONTRACTED",
      "SUSPENDED",
    ]);
    expect(statusTicks({ stage: "NEW", isReturning: false, clientSanction: "PENALISED" })).toEqual([
      "NEW",
      "PENALISED",
    ]);
  });

  it("never ticks «قديم» and «جديد» together, nor two stages", () => {
    for (const stage of FILE_STAGES) {
      for (const isReturning of [true, false]) {
        for (const clientSanction of CLIENT_SANCTIONS) {
          const ticks = statusTicks({ stage, isReturning, clientSanction });
          expect(ticks.filter((tick) => tick === "OLD" || tick === "NEW")).toHaveLength(1);
          expect(ticks.filter((tick) => ["VISIT", "QUOTE", "CONTRACTED", "CONTRACT_ENDED"].includes(tick)).length).toBe(
            stage === "NEW" ? 0 : 1,
          );
        }
      }
    }
  });
});
