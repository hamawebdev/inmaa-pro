import type { AnchorStore } from "@/lib/chain/anchor";
import { systemClock, type Clock } from "@/lib/clock";

/**
 * What the running program is bound to besides its database and its session:
 * its clock and the place its anchor is kept. Set once at start
 * (src/features/core/services/startup.ts); the harness and the tests set their
 * own.
 */
let clock: Clock = systemClock();
let anchor: AnchorStore | null = null;

export const programClock = (): Clock => clock;
export const programAnchor = (): AnchorStore | null => anchor;

export function setProgramClock(next: Clock): void {
  clock = next;
}

export function setProgramAnchor(next: AnchorStore | null): void {
  anchor = next;
}
