import { peekSession, sessionAfterSync, setCurrentSession } from "@/lib/access/session";
import { getRouter } from "@/lib/compat/router-instance";
import { queryClient } from "@/lib/query-client";
import { asProgram } from "@/lib/service/action";
import type { Executor, ServiceContext, Session } from "@/lib/service/context";
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

/**
 * Why the last session on this window ended, for the sign-in window to say so
 * once: the idle lock, or the account switched off on the other laptop.
 */
let lastLock: { cause: LockCause | "ACCOUNT_OFF"; minutes: number } | null = null;

/** Read by the sign-in window, and forgotten: it is said once. */
export function takeLastLock(): { cause: LockCause | "ACCOUNT_OFF"; minutes: number } | null {
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

const readSessionAfterSync = asProgram.query(
  (ex: Executor, _ctx: ServiceContext, input: { current: Session; tables: ReadonlySet<string> }) =>
    sessionAfterSync(ex, input.current, input.tables),
);

/**
 * After the other laptop's changes were applied here (docs/sync/DECISION.md
 * section 7, case 10). Every screen reads again. When the account, its role or
 * its grants changed, the session is read again at once: the bar and the route
 * gate follow, and a page now closed to her shows "not open to your account".
 * An account switched off on the other laptop is signed out, and the sign-in
 * window says why. What she did before the change arrived stands: it was
 * allowed when it was done.
 *
 * Answers what happened, for the caller to say it.
 */
export async function followSyncedChanges(tables: ReadonlySet<string>): Promise<"same" | "reloaded" | "signedOut"> {
  void queryClient.invalidateQueries();
  const current = peekSession();
  if (!current) return "same";
  let answer: Awaited<ReturnType<typeof sessionAfterSync>>;
  try {
    answer = await readSessionAfterSync({ current, tables });
  } catch (error) {
    console.error("session: could not be read again after sync", error);
    return "same";
  }
  // Somebody else signed in meanwhile: theirs was read at their own sign-in.
  if (peekSession()?.userId !== current.userId) return "same";
  if (answer.outcome === "signedOut") {
    // Switched off, or its role switched off: nobody keeps a session the centre has closed.
    await signOutAction({ cause: "USER" });
    lastLock = { cause: "ACCOUNT_OFF", minutes: 0 };
    setCurrentSession(null);
    queryClient.clear();
    void getRouter().navigate(HOME_PATH, { replace: true });
  } else if (answer.outcome === "reloaded" && answer.session) {
    setCurrentSession(answer.session);
  }
  return answer.outcome;
}
