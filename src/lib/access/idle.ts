/**
 * The idle lock's one rule: whether the program has gone without input for as
 * long as the setting `security.idleLockMinutes` allows. Zero minutes is off.
 *
 * Times are wall-clock milliseconds on purpose: a PC that slept through the
 * delay wakes up locked.
 */
export function isIdle(lastInputAt: number, now: number, minutes: number): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  return now - lastInputAt >= minutes * 60_000;
}

/** What counts as somebody being there. */
export const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
