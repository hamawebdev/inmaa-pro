import { reconcileAnchor, writeAnchor, type AnchorComparison } from "@/lib/chain/anchor";
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
 * "unchecked" when it could not be made (a read that failed). An unchecked
 * database is treated as one in question: nothing is worked on until the
 * comparison succeeds (the screen offers to try again).
 */
export type StartupAnchor = AnchorComparison | { state: "unchecked"; error: string };

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

async function compareAtStart(clock: Clock): Promise<void> {
  try {
    anchorAtStart = await reconcileAnchor(db, desktopAnchorStore, clock.now().toISOString());
  } catch (error) {
    console.error("anchor: could not be compared at start", error);
    anchorAtStart = { state: "unchecked", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkClockAtStart(clock: Clock): Promise<void> {
  try {
    clockAtStart = await checkClock(db, buildContext(SYSTEM_SESSION, clock));
  } catch (error) {
    console.error("clock: could not be checked at start", error);
    clockAtStart = null;
  }
}

/**
 * The day's own work (contracts past their end, suspensions ending, the daily
 * copy) is the program writing by itself, at the PC's date. It waits while the
 * database is in question (anchor) or the date is (clock): the manager answers
 * first.
 */
async function startTheDayIfClear(clock: Clock): Promise<void> {
  if (anchorAtStart?.state !== "normal" || clockAtStart?.state !== "ok") return;
  try {
    await startDayWatch(clock);
  } catch (error) {
    console.error("daily: the day could not be started", error);
  }
}

/** Compares the anchor again: after the manager's answer wrote a new one, or after a comparison that failed. */
export async function recheckStartupAnchor(): Promise<StartupAnchor | null> {
  const clock = programClock();
  await compareAtStart(clock);
  changed();
  await startTheDayIfClear(clock);
  return anchorAtStart;
}

/** Checks the clock again: after the manager confirmed the date, or after the PC's date was corrected. */
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
  setProgramAnchor(desktopAnchorStore);

  // The registries each folder fills, before first run: it runs the owners' seed steps.
  loadFeatureEvents();
  loadFeatureAlerts();
  loadFeatureDaily();
  loadFeatureSeeds();

  if (!(await isFirstRunDone(db))) {
    const ctx = buildContext(SYSTEM_SESSION, clock);
    await db.transaction().execute((trx) => firstRun(trx, ctx));
    // Only where there is no anchor yet: a new database beside an old anchor is for the manager to judge.
    if (!(await desktopAnchorStore.read())) await writeAnchor(db, desktopAnchorStore, ctx.now);
  }

  await compareAtStart(clock);
  await checkClockAtStart(clock);
  changed();
  await startTheDayIfClear(clock);
}
