import { useSyncExternalStore } from "react";

import type { Capability, SectionCode, SectionLevel } from "@/lib/access/catalogue";
import { can, peekSession, sectionLevel, subscribeToSession } from "@/lib/access/session";
import type { Session } from "@/lib/service/context";

/**
 * Who is signed in, for a screen that shows or hides something by role. Null
 * when nobody is. It follows sign-in and sign-out. A service never uses this:
 * it reads its `ctx`.
 */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribeToSession, peekSession, peekSession);
}

/**
 * Whether the signed-in user holds a capability: to leave out a button he
 * could only be refused by, or a column he may not read. The service checks
 * again; this only decides what is drawn.
 *
 *     const seesCost = useCan("cost.read");
 */
export function useCan(capability: Capability): boolean {
  const session = useSession();
  return session !== null && can(session, capability);
}

/**
 * The signed-in user's level on a bar section: "WRITE", "READ" or null. A
 * screen opened by somebody who only reads leaves out its add and save buttons.
 *
 *     const mayWrite = useSectionLevel("WORKERS") === "WRITE";
 */
export function useSectionLevel(section: SectionCode): SectionLevel | null {
  const session = useSession();
  return session === null ? null : sectionLevel(session, section);
}
