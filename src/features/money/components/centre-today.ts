import { toLocal } from "@/lib/clock";
import { programClock } from "@/lib/service/program";

import type { IsoDate } from "../rules/dates";

/** Today at the centre, from the program's one clock (never the machine's time zone). */
export function centreToday(): IsoDate {
  const clock = programClock();
  return toLocal(clock.now(), clock.utcOffsetMin).date;
}
