import { useEffect, useState } from "react";

import { toLocal } from "@/lib/clock";
import { programClock } from "@/lib/service/program";

/**
 * The centre's own date and time ("YYYY-MM-DD", "HH:MM"), read again every
 * minute so that a flag that depends on the time (no arrival reported) comes
 * up without anyone touching the screen.
 */
function readCentreClock() {
  const clock = programClock();
  const local = toLocal(clock.now(), clock.utcOffsetMin);
  return { today: local.date as string, nowTime: local.time as string };
}

export function useCentreClock(): { today: string; nowTime: string } {
  const [now, setNow] = useState(readCentreClock);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(readCentreClock()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
