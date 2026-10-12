import { setCurrentSession } from "@/lib/access/session";
import { getRouter } from "@/lib/compat/router-instance";
import { queryClient } from "@/lib/query-client";
import type { Session } from "@/lib/service/context";
import { HOME_PATH } from "@/navigation/sections";

import { signOutAction } from "./sign-in";

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

/** «قفل الآن». The next person starts on the home screen, not where this one stood. */
export async function leaveSession(): Promise<void> {
  // Never throws. A log line that could not be written must not keep somebody signed in.
  await signOutAction(undefined);
  setCurrentSession(null);
  queryClient.clear();
  void getRouter().navigate(HOME_PATH, { replace: true });
}
