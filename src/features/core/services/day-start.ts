import { toLocal, type Clock } from "@/lib/clock";
import { revalidatePath } from "@/lib/compat/revalidate";
import { runDayStart } from "@/lib/daily";
import { db } from "@/lib/db";
import { runAutomaticBackup } from "@/server/backup";

/**
 * The day-start job in the running program (the runner and its rules are in
 * src/lib/daily).
 *
 * It runs when the program opens, and again when the centre's date changes
 * while it is open: the watch looks once a minute. An owner whose handlers
 * failed is tried again every hour, and so is the daily backup, which is made
 * right after the day's work (src/server/backup.ts). What the handlers changed (a contract
 * ended, a suspension lifted) is on every screen at once: all of them are
 * refreshed.
 */
const RETRY_EVERY_MS = 60 * 60_000;

let watch: number | null = null;

async function run(clock: Clock): Promise<boolean> {
  const report = await runDayStart(db, clock);
  if (report.ran.length > 0) revalidatePath("/dashboard");
  // After the day's own changes, so that today's copy holds them. Not due: nothing happens.
  const backup = await runAutomaticBackup().catch((error: unknown) => {
    console.error("backup: the daily copy failed", error);
    return "failed" as const;
  });
  // A copy that could not be made (the stick is not in) is tried again with the hour.
  return report.failed.length > 0 || backup === "failed";
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
