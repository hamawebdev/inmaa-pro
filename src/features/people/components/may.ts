import type { Capability, SectionCode, SectionLevel } from "@/lib/access/catalogue";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { can, currentSession, hasSession } from "@/lib/access/session";
import { toLocal } from "@/lib/clock";
import { programClock } from "@/lib/service/program";
import type { LocalDate } from "@/lib/units";

/**
 * What the signed-in account holds, for deciding what a screen draws: a
 * button it could only be refused by is left out. The services decide what is
 * allowed; this only follows them. Both follow sign-in and sign-out.
 */
export function useMay(capability: Capability): boolean {
  return useCan(capability);
}

/** Whether the account reaches a bar section at this level. */
export function useMayIn(section: SectionCode, level: SectionLevel): boolean {
  const held = useSectionLevel(section);
  return held !== null && (level === "READ" || held === "WRITE");
}

/** The same as `useMay`, for an event handler: what the account holds at this moment. */
export function mayNow(capability: Capability): boolean {
  return hasSession() && can(currentSession(), capability);
}

/** A number, a date or a code inside a sentence: kept left to right in Arabic. */
export const isolate = (text: string) => `\u2066${text}\u2069`;

/** Today at the centre, by the program's own clock: the default of a date field. */
export function todayAtTheCentre(): LocalDate {
  const clock = programClock();
  return toLocal(clock.now(), clock.utcOffsetMin).date;
}
