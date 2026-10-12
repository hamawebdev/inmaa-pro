import { describe, expect, it } from "vitest";

import type { LicenseStatus } from "@/lib/bindings";
import { isUsable, licenseState, remainingKey, remainingParts } from "@/lib/license";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function status(over: Partial<LicenseStatus>): LicenseStatus {
  return {
    state: "trial",
    remaining_ms: 30 * DAY,
    device_id: "A1B2-C3D4-E5F6-7890",
    contact_phone: "0540839434",
    trial_days: 30,
    ...over,
  };
}

describe("licenseState", () => {
  it("narrows the three states the backend reports", () => {
    expect(licenseState(status({ state: "trial" }))).toBe("trial");
    expect(licenseState(status({ state: "expired" }))).toBe("expired");
    expect(licenseState(status({ state: "unlocked" }))).toBe("unlocked");
  });

  it("treats anything it does not recognise as expired", () => {
    // Unreachable — both sides come from one Rust enum — but a countdown that
    // fails open on an unknown value is not a countdown.
    expect(licenseState(status({ state: "" }))).toBe("expired");
    expect(licenseState(status({ state: "TRIAL" }))).toBe("expired");
  });

  it("says whether the app should be usable", () => {
    expect(isUsable(status({ state: "trial" }))).toBe(true);
    expect(isUsable(status({ state: "unlocked" }))).toBe(true);
    expect(isUsable(status({ state: "expired" }))).toBe(false);
  });
});

describe("remainingParts", () => {
  it("counts in days while there are days left", () => {
    expect(remainingParts(12 * DAY)).toEqual({ unit: "day", value: 12 });
    expect(remainingParts(30 * DAY)).toEqual({ unit: "day", value: 30 });
  });

  it("rounds days up, so the app never says fewer days than it works for", () => {
    expect(remainingParts(29 * DAY + 4 * HOUR)).toEqual({ unit: "day", value: 30 });
    expect(remainingParts(DAY + 1)).toEqual({ unit: "day", value: 2 });
  });

  it("switches to hours inside the last day", () => {
    expect(remainingParts(23 * HOUR)).toEqual({ unit: "hour", value: 23 });
    expect(remainingParts(90 * 60 * 1000)).toEqual({ unit: "hour", value: 2 });
  });

  it("never counts down past one hour, or below zero", () => {
    // An academy with four minutes left is told "1 hour", not "0 hours" — the
    // countdown's last reading should still be a quantity.
    expect(remainingParts(4 * 60 * 1000)).toEqual({ unit: "hour", value: 1 });
    expect(remainingParts(0)).toEqual({ unit: "hour", value: 1 });
    expect(remainingParts(-5 * DAY)).toEqual({ unit: "hour", value: 1 });
  });

  it("hands the right plural key to i18n", () => {
    expect(remainingKey(12 * DAY)).toEqual({ key: "DaysRemaining", count: 12 });
    expect(remainingKey(7 * HOUR)).toEqual({ key: "HoursRemaining", count: 7 });
  });
});
