import { setCurrentSession } from "@/lib/access/session";
import { getRouter } from "@/lib/compat/router-instance";
import { queryClient } from "@/lib/query-client";
import type { Session } from "@/lib/service/context";
import { HOME_PATH } from "@/navigation/sections";

import { signOutAction, type LockCause } from "./sign-in";

/**
 * The session of the running program: who is at the keyboard now.
 *
 * Nobody is, when the program opens: the sign-in window is drawn instead of
 * the program (src/main.tsx), so no screen exists to read anything. Entering
 * and leaving both empty the query cache: what one person was shown is never
 * left in memory for the next.
 */
export function enterSession(session: Session): void {
  queryClient.clear();
  setCurrentSession(session);
}

/** Why the last session on this window ended, for the sign-in window to say so once. */
let lastLock: { cause: LockCause; minutes: number } | null = null;

/** Read by the sign-in window, and forgotten: it is said once. */
export function takeLastLock(): { cause: LockCause; minutes: number } | null {
  const lock = lastLock;
  lastLock = null;
  return lock;
}

/**
 * «قفل الآن», or the idle lock. The next person starts on the home screen, not
 * where this one stood, and nothing half-typed is kept: the pages are gone
 * with the router.
 */
export async function leaveSession(cause: LockCause = "USER", idleMinutes = 0): Promise<void> {
  // Never throws. A log line that could not be written must not keep somebody signed in.
  await signOutAction({ cause });
  lastLock = cause === "IDLE" ? { cause, minutes: idleMinutes } : null;
  setCurrentSession(null);
  queryClient.clear();
  void getRouter().navigate(HOME_PATH, { replace: true });
}
