import * as React from "react";

import { useQuery } from "@tanstack/react-query";

import { leaveSession } from "@/features/core/services/session";
import { SETTINGS_PATH } from "@/features/core/services/settings-form";
import { readIdleLockMinutesQuery } from "@/features/core/services/sign-in";
import { INPUT_EVENTS, isIdle } from "@/lib/access/idle";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The idle lock (the coordinator's ruling, F3b).
 *
 * Staff take turns at one PC and every change is logged under the name signed
 * in: an account left open puts the next person's acts under the wrong name.
 * After `security.idleLockMinutes` minutes without a key, a click or the mouse
 * moving, the program signs out to the sign-in window, exactly as «قفل الآن»
 * does: a form in progress is lost, nothing half-saved is kept. The log says
 * LOCK with cause IDLE.
 *
 * Mounted while somebody is signed in (src/components/security/program-gate.tsx).
 * It renders nothing. The delay is read under Settings' own key, so saving it
 * there applies at once.
 */
const CHECK_EVERY_MS = 15_000;

export function IdleLock() {
  const delay = useQuery({
    queryKey: [...pathKey(SETTINGS_PATH), "idle-lock"],
    queryFn: () => readIdleLockMinutesQuery(undefined),
  });
  const minutes = delay.data ?? 0;

  React.useEffect(() => {
    if (minutes <= 0) return;
    let lastInput = Date.now();
    let locking = false;
    const touched = () => {
      lastInput = Date.now();
    };
    for (const name of INPUT_EVENTS) window.addEventListener(name, touched, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      if (locking || !isIdle(lastInput, Date.now(), minutes)) return;
      locking = true;
      void leaveSession("IDLE", minutes);
    }, CHECK_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      for (const name of INPUT_EVENTS) window.removeEventListener(name, touched, { capture: true });
    };
  }, [minutes]);

  return null;
}
