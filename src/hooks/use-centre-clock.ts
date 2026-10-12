import { useEffect, useState } from "react";

import { toLocal } from "@/lib/clock";
import { programClock } from "@/lib/service/program";

/**
 * The centre's own date and time ("YYYY-MM-DD", "HH:MM"), read again every
 * minute: a screen that depends on the time (a visit with no arrival reported,
 * "today") follows the clock without anyone touching it, and turns the page at
 * midnight.
 */
function readCentreClock() {
  const clock = programClock();
  const local = toLocal(clock.now(), clock.utcOffsetMin);
  return { today: local.date as string, nowTime: local.time as string };
}

export function useCentreClock(): { today: string; nowTime: string } {
  const [now, setNow] = useState(readCentreClock);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = readCentreClock();
      setNow((current) => (current.today === next.today && current.nowTime === next.nowTime ? current : next));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
