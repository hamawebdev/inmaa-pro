import { reconcileAnchorAtStart, writeAnchor, type StartupAnchor } from "@/lib/chain/anchor";
import { desktopAnchorStore } from "@/lib/chain/anchor-desktop";
import { systemClock, type Clock } from "@/lib/clock";
import { checkClock, type ClockState } from "@/lib/clock/sanity";
import { db } from "@/lib/db";
import { loadFeatureAlerts } from "@/lib/alerts";
import { loadFeatureDaily } from "@/lib/daily";
import { loadFeatureEvents } from "@/lib/events";
import { loadFeatureSeeds } from "@/lib/seeds";
import { buildContext, SYSTEM_SESSION } from "@/lib/service/context";
import { programClock, setProgramAnchor, setProgramClock } from "@/lib/service/program";
import { getSetting } from "@/lib/settings";

import { startDayWatch } from "./day-start";
import { firstRun, isFirstRunDone } from "./first-run";

/**
 * What runs once, before the first screen is drawn.
 *
 *  1. the clock, at the centre's own offset;
 *  2. first run, on a database that never had one;
 *  3. the registries each folder fills: the handlers of the events that cross
 *     owners, the alerts, and what each owner does when a day starts;
 *  4. nobody is signed in: the first screen is the sign-in window
 *     (src/main.tsx), and everything here runs as the program itself;
 *  5. the anchor against the database, and the PC's clock against the work
 *     already recorded. What they found is kept for the screens that ask the
 *     manager (`startupAnchor`, `startupClock`); nothing is decided here;
 *  6. the day's own work, when neither found anything to ask about.
 */

/**
 * What the anchor said when the program started: the comparison, or
 * "unchecked" when it could not be made (a read or the anchor command failed).
 * An unchecked database is treated as one in question (audit LOG-11): the
 * anchor screen stands in front of the program, for everybody, until the
 * comparison succeeds (its «try again»), and the day's own work waits.
 */
export type { StartupAnchor };

let anchorAtStart: StartupAnchor | null = null;
let clockAtStart: ClockState | null = null;
const listeners = new Set<() => void>();

export const startupAnchor = (): StartupAnchor | null => anchorAtStart;
/** Where the PC's clock stood when the program started (src/lib/clock/sanity.ts). */
export const startupClock = (): ClockState | null => clockAtStart;

/** Calls `listener` when the anchor's answer or the clock's changes. Returns how to stop. */
export function subscribeToStartupAnchor(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const subscribeToStartupClock = subscribeToStartupAnchor;

function changed(): void {
  for (const listener of listeners) listener();
}

/**
 * The runners write the anchor after a chained commit, before a backup and when
 * the window closes, but only while the database agrees with it (audit
 * FND-01): a database in question, or one that could not be compared, has no
 * anchor bound, and nothing anybody does (a sign-in, a lock, closing the
 * window) can make it pass as normal at the next start. `writeAnchor` refuses
 * it as well. The manager's answer writes it (`anchorAfterAnswer`).
 */
async function compareAtStart(clock: Clock): Promise<void> {
  anchorAtStart = await reconcileAnchorAtStart(db, desktopAnchorStore, clock.now().toISOString());
  setProgramAnchor(anchorAtStart.state === "normal" ? desktopAnchorStore : null);
}

/**
 * After the manager's answer on the anchor screen is committed: the anchor
 * follows the database he kept, then the comparison is made again (it is
 * normal now, and the runners are bound to the anchor once more).
 */
export async function anchorAfterAnswer(): Promise<StartupAnchor | null> {
  const clock = programClock();
  await writeAnchor(db, desktopAnchorStore, clock.now().toISOString(), { accept: "ANSWERED" });
  return recheckStartupAnchor();
}

async function checkClockAtStart(clock: Clock): Promise<void> {
  try {
    clockAtStart = await checkClock(db, buildContext(SYSTEM_SESSION, clock));
  } catch (error) {
    // Unknown is not "in order": the day's own work waits (fail closed), and is tried again with the hour.
    console.error("clock: could not be checked at start", error);
    clockAtStart = null;
  }
}

const isClear = () => anchorAtStart?.state === "normal" && clockAtStart?.state === "ok";

/**
 * The day's own work (contracts past their end, suspensions ending, the daily
 * copy) is the program writing by itself, at the PC's date. It waits while the
 * database is in question (anchor), could not be checked, or the date is in
 * question (clock): the manager answers first. It runs at start when things
 * are clear, and again each time they become clear (the manager confirmed the
 * date); a recheck that finds nothing new does not run it again. The watch
 * then checks the clock itself before each day (day-start.ts).
 */
let wasClear = false;
async function startTheDayIfClear(clock: Clock): Promise<void> {
  const clear = isClear();
  const becameClear = clear && !wasClear;
  wasClear = clear;
  if (!becameClear) return;
  try {
    await startDayWatch(clock);
  } catch (error) {
    console.error("daily: the day could not be started", error);
  }
}

/**
 * Compares the anchor and checks the clock again: after the manager's answer
 * wrote a new anchor, or after a comparison that failed (the screen's «try
 * again»).
 */
export async function recheckStartupAnchor(): Promise<StartupAnchor | null> {
  const clock = programClock();
  await compareAtStart(clock);
  await checkClockAtStart(clock);
  changed();
  await startTheDayIfClear(clock);
  return anchorAtStart;
}

/**
 * Checks the clock again: after each sign-in (a session opened on a date in
 * question changes what the clock is measured against), after the manager
 * confirmed the date, after the PC's date was corrected.
 */
export async function recheckStartupClock(): Promise<ClockState | null> {
  const clock = programClock();
  await checkClockAtStart(clock);
  changed();
  await startTheDayIfClear(clock);
  return clockAtStart;
}

export async function startProgram(): Promise<void> {
  const clock = systemClock(await getSetting(db, "system.utcOffsetMin"));
  setProgramClock(clock);
  // Bound once the comparison has found the database in order (`compareAtStart`).
  setProgramAnchor(null);

  // The registries each folder fills, before first run: it runs the owners' seed steps.
  loadFeatureEvents();
  loadFeatureAlerts();
  loadFeatureDaily();
  loadFeatureSeeds();

  if (!(await isFirstRunDone(db))) {
    const ctx = buildContext(SYSTEM_SESSION, clock);
    await db.transaction().execute((trx) => firstRun(trx, ctx));
    // Only where there is no anchor yet: a new database beside an old anchor is for the manager to judge.
    if (!(await desktopAnchorStore.read())) {
      await writeAnchor(db, desktopAnchorStore, ctx.now, { accept: "FIRST_RUN" });
    }
  }

  await compareAtStart(clock);
  await checkClockAtStart(clock);
  changed();
  await startTheDayIfClear(clock);
}
