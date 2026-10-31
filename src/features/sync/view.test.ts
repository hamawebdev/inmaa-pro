import { describe, expect, it } from "vitest";

import { previewStatus } from "./preview";
import { attentionCount, barState, clockDifferenceText, groupPairingCode } from "./view";

const NOW = Date.parse("2026-10-31T09:40:00.000Z");

describe("the bar", () => {
  it("shows nothing until sync is set up", () => {
    expect(barState(previewStatus("OFF"), NOW)).toBeNull();
  });

  it("says synced, sending, offline and paused in their tones", () => {
    expect(barState(previewStatus("TWO"), NOW)).toEqual({ state: "SYNCED", tone: "success" });
    expect(barState(previewStatus("SENDING"), NOW)).toEqual({ state: "SENDING", tone: "progress" });
    expect(barState(previewStatus("OFFLINE"), NOW)).toEqual({ state: "OFFLINE", tone: "neutral" });
    expect(barState(previewStatus("LIMIT"), NOW)).toEqual({ state: "LIMIT", tone: "warning" });
    expect(barState(previewStatus("CATCH_UP"), NOW)).toEqual({ state: "CATCHING_UP", tone: "progress" });
  });

  it("turns offline into a warning after a day with changes waiting", () => {
    expect(barState(previewStatus("OFFLINE"), NOW + 25 * 3600_000)).toEqual({ state: "OFFLINE", tone: "warning" });
  });

  it("says «يحتاج تدخلًا» for what the office must act on", () => {
    for (const name of ["FULL", "REVOKED", "CLOCK", "ATTENTION", "CATCH_UP_OFFLINE", "REJOIN"] as const) {
      expect(barState(previewStatus(name), NOW)).toEqual({ state: "ATTENTION", tone: "danger" });
    }
  });
});

describe("the alert tile", () => {
  it("counts each held change and conflict, and one for every other problem to act on", () => {
    expect(attentionCount(previewStatus("TWO"))).toBe(0);
    expect(attentionCount(previewStatus("OFFLINE"))).toBe(0);
    expect(attentionCount(previewStatus("LIMIT"))).toBe(0);
    // One held change, two conflicts; the files still to arrive are not the office's to act on.
    expect(attentionCount(previewStatus("ATTENTION"))).toBe(3);
    expect(attentionCount(previewStatus("REVOKED"))).toBe(1);
    expect(attentionCount(previewStatus("CLOCK"))).toBe(1);
    expect(attentionCount(previewStatus("OFF"))).toBe(0);
  });
});

describe("words and numbers", () => {
  it("writes the clock's difference with its sign", () => {
    expect(clockDifferenceText(-440_000)).toBe("−7:20");
    expect(clockDifferenceText(65_000)).toBe("1:05");
  });

  it("groups the pairing code by four, whatever was typed", () => {
    expect(groupPairingCode("7k3m9qx2ab4cdefgh5jk")).toEqual(["7K3M", "9QX2", "AB4C", "DEFG", "H5JK"]);
    expect(groupPairingCode("7K3M-9QX2 AB4C")).toEqual(["7K3M", "9QX2", "AB4C"]);
  });
});
