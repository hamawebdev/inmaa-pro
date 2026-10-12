import { toLocal, type Clock } from "@/lib/clock";
import { revalidatePath } from "@/lib/compat/revalidate";
import { runDayStart } from "@/lib/daily";
import { db } from "@/lib/db";

/**
 * The day-start job in the running program (the runner and its rules are in
 * src/lib/daily).
 *
 * It runs when the program opens, and again when the centre's date changes
 * while it is open: the watch looks once a minute. An owner whose handlers
 * failed is tried again every hour. What the handlers changed (a contract
 * ended, a suspension lifted) is on every screen at once: all of them are
 * refreshed.
 */
const RETRY_EVERY_MS = 60 * 60_000;

let watch: number | null = null;

async function run(clock: Clock): Promise<boolean> {
  const report = await runDayStart(db, clock);
  if (report.ran.length > 0) revalidatePath("/dashboard");
  return report.failed.length > 0;
}

/** Starts the day now, then keeps watch for the next one. Called once, when the program opens. */
export async function startDayWatch(clock: Clock): Promise<void> {
  let failed = await run(clock);
  if (watch !== null) return;

  let day = toLocal(clock.now(), clock.utcOffsetMin).date;
  let triedAt = clock.now().getTime();
  watch = window.setInterval(() => {
    const now = clock.now();
    const today = toLocal(now, clock.utcOffsetMin).date;
    const due = today !== day || (failed && now.getTime() - triedAt >= RETRY_EVERY_MS);
    if (!due) return;
    day = today;
    triedAt = now.getTime();
    void run(clock).then((stillFailed) => {
      failed = stillFailed;
    });
  }, 60_000);
}
