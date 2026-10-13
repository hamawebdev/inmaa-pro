import { reconcileAnchor, writeAnchor, type AnchorComparison } from "@/lib/chain/anchor";
import { desktopAnchorStore } from "@/lib/chain/anchor-desktop";
import { systemClock } from "@/lib/clock";
import { db } from "@/lib/db";
import { loadFeatureAlerts } from "@/lib/alerts";
import { loadFeatureDaily } from "@/lib/daily";
import { loadFeatureEvents } from "@/lib/events";
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
 *  5. the anchor against the database. What it found is kept for the screen
 *     that will ask the manager (`startupAnchor`); nothing is decided here;
 *  6. the day's own work, when the anchor found nothing to ask about.
 */
let anchorAtStart: AnchorComparison | null = null;
const anchorListeners = new Set<() => void>();

/** What the anchor said when the program started: "normal", or the state the manager must answer. */
export const startupAnchor = (): AnchorComparison | null => anchorAtStart;

/** Calls `listener` when the anchor's answer changes (the manager answered). Returns how to stop. */
export function subscribeToStartupAnchor(listener: () => void): () => void {
  anchorListeners.add(listener);
  return () => anchorListeners.delete(listener);
}

function setStartupAnchor(next: AnchorComparison | null): void {
  anchorAtStart = next;
  for (const listener of anchorListeners) listener();
}

/**
 * Compares the anchor again, after the manager's answer wrote a new one. When
 * it now agrees, the day's own work starts: it was held back until then.
 */
export async function recheckStartupAnchor(): Promise<AnchorComparison> {
  const clock = programClock();
  const comparison = await reconcileAnchor(db, desktopAnchorStore, clock.now().toISOString());
  setStartupAnchor(comparison);
  if (comparison.state === "normal") {
    try {
      await startDayWatch(clock);
    } catch (error) {
      console.error("daily: the day could not be started", error);
    }
  }
  return comparison;
}

export async function startProgram(): Promise<void> {
  const clock = systemClock(await getSetting(db, "system.utcOffsetMin"));
  setProgramClock(clock);
  setProgramAnchor(desktopAnchorStore);

  if (!(await isFirstRunDone(db))) {
    const ctx = buildContext(SYSTEM_SESSION, clock);
    await db.transaction().execute((trx) => firstRun(trx, ctx));
    // Only where there is no anchor yet: a new database beside an old anchor is for the manager to judge.
    if (!(await desktopAnchorStore.read())) await writeAnchor(db, desktopAnchorStore, ctx.now);
  }

  loadFeatureEvents();
  loadFeatureAlerts();
  loadFeatureDaily();

  try {
    setStartupAnchor(await reconcileAnchor(db, desktopAnchorStore, clock.now().toISOString()));
  } catch (error) {
    console.error("anchor: could not be compared at start", error);
  }

  // The day's own work (contracts past their end, suspensions ending) is the
  // program writing by itself. A database found behind or apart from its anchor
  // is the manager's to answer first: nothing is written to it before then.
  if (anchorAtStart?.state === "normal") {
    try {
      await startDayWatch(clock);
    } catch (error) {
      console.error("daily: the day could not be started", error);
    }
  }
}
