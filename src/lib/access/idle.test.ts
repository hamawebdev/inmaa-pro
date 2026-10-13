import { expect, it } from "vitest";

import { isIdle } from "./idle";

it("locks after the delay without input, never when the delay is zero", () => {
  const start = Date.parse("2026-10-12T08:00:00.000Z");
  const minute = 60_000;
  expect(isIdle(start, start + 14 * minute + 59_000, 15)).toBe(false);
  expect(isIdle(start, start + 15 * minute, 15)).toBe(true);
  // A PC that slept through the delay wakes up locked.
  expect(isIdle(start, start + 8 * 60 * minute, 15)).toBe(true);
  expect(isIdle(start, start + 8 * 60 * minute, 0)).toBe(false);
  expect(isIdle(start, start + 8 * 60 * minute, Number.NaN)).toBe(false);
});
