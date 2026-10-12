import type { LicenseStatus } from "@/lib/bindings";

/**
 * How the trial is *described*. Not how it is decided.
 *
 * Rust owns the verdict — it is taken before a window exists and enforced by
 * `license::guard` on every command (see src-tauri/src/license/mod.rs). Nothing
 * in this file, or anywhere else in the frontend, can lock or unlock anything.
 * All it does is turn the milliseconds the backend reports into a phrase an
 * academy owner can read, in one place rather than in each of the two screens
 * that need it.
 */

/** Milliseconds in a day, for turning the backend's countdown into words. */
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Inside this much of the trial, the Settings card turns amber. */
export const WARNING_MS = 7 * DAY_MS;

/** The three states, narrowed from the backend's plain string. */
export type LicenseState = "trial" | "expired" | "unlocked";

export function licenseState(status: LicenseStatus): LicenseState {
  switch (status.state) {
    case "unlocked":
      return "unlocked";
    case "trial":
      return "trial";
    // Anything unrecognised is treated as expired. It cannot happen — the two
    // sides are generated from one Rust enum — but a countdown that fails open
    // on a value it does not understand is not a countdown.
    default:
      return "expired";
  }
}

/** Whether the app should be usable. Display only; the real gate is in Rust. */
export function isUsable(status: LicenseStatus): boolean {
  return licenseState(status) !== "expired";
}

/**
 * How the remaining trial is counted for display.
 *
 * Days while there are days, hours in the last one — an owner with nineteen
 * hours left needs to know it is today, and "1 day remaining" for anything under
 * 24 hours would round a morning's warning into a day's.
 *
 * Days round UP: with 29 days and 4 hours left the academy has, in the sense
 * they care about, 30 days of teaching left, and a countdown that says 29 while
 * the app still works for another day and a bit reads as broken.
 */
export function remainingParts(remainingMs: number): {
  unit: "day" | "hour";
  value: number;
} {
  const ms = Math.max(0, remainingMs);
  if (ms >= DAY_MS) return { unit: "day", value: Math.ceil(ms / DAY_MS) };
  return { unit: "hour", value: Math.max(1, Math.ceil(ms / HOUR_MS)) };
}

/**
 * The message key and its `count` for the current state — so the Settings card
 * and the lock screen cannot drift into describing the same licence two
 * different ways.
 *
 * The key is relative to the `License` namespace, which is what
 * `useTranslations("License")` is scoped to at both call sites.
 */
export function remainingKey(remainingMs: number): {
  key: "DaysRemaining" | "HoursRemaining";
  count: number;
} {
  const { unit, value } = remainingParts(remainingMs);
  return {
    key: unit === "day" ? "DaysRemaining" : "HoursRemaining",
    count: value,
  };
}
