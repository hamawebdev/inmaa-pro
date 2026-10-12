import type { Capability, SectionCode, SectionLevel } from "@/lib/access/catalogue";
import { can, currentSession, hasSession, sectionLevel } from "@/lib/access/session";
import { toLocal } from "@/lib/clock";
import { programClock } from "@/lib/service/program";
import type { LocalDate } from "@/lib/units";

/**
 * What the signed-in account holds, for deciding what a screen shows. The
 * services decide what is allowed; this only keeps a screen from offering what
 * they would refuse. Until sign-in exists the manager is signed in at start,
 * and holds everything.
 */
export function may(capability: Capability): boolean {
  return !hasSession() || can(currentSession(), capability);
}

/** Whether the account reaches a bar section at this level. */
export function mayIn(section: SectionCode, level: SectionLevel): boolean {
  if (!hasSession()) return true;
  const held = sectionLevel(currentSession(), section);
  return held !== null && (level === "READ" || held === "WRITE");
}

/** A number, a date or a code inside a sentence: kept left to right in Arabic. */
export const isolate = (text: string) => `\u2066${text}\u2069`;

/** Today at the centre, by the program's own clock: the default of a date field. */
export function todayAtTheCentre(): LocalDate {
  const clock = programClock();
  return toLocal(clock.now(), clock.utcOffsetMin).date;
}
