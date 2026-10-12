import { loadSession, setCurrentSession } from "@/lib/access/session";
import { reconcileAnchor, writeAnchor, type AnchorComparison } from "@/lib/chain/anchor";
import { desktopAnchorStore } from "@/lib/chain/anchor-desktop";
import { systemClock } from "@/lib/clock";
import { db } from "@/lib/db";
import { loadFeatureEvents } from "@/lib/events";
import { buildContext, SYSTEM_SESSION } from "@/lib/service/context";
import { setProgramAnchor, setProgramClock } from "@/lib/service/program";
import { getSetting } from "@/lib/settings";

import { firstRun, isFirstRunDone, STAND_IN_MANAGER_ID } from "./first-run";

/**
 * What runs once, before the first screen is drawn.
 *
 *  1. the clock, at the centre's own offset;
 *  2. first run, on a database that never had one;
 *  3. the session. STAND-IN: the manager account is signed in without being
 *     asked, until the sign-in screen exists;
 *  4. the handlers of the events that cross owners;
 *  5. the anchor against the database. What it found is kept for the screen
 *     that will ask the manager (`startupAnchor`); nothing is decided here.
 */
let anchorAtStart: AnchorComparison | null = null;

/** What the anchor said when the program started: "normal", or the state the manager must answer. */
export const startupAnchor = (): AnchorComparison | null => anchorAtStart;

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

  setCurrentSession(await loadSession(db, STAND_IN_MANAGER_ID));
  loadFeatureEvents();

  try {
    anchorAtStart = await reconcileAnchor(db, desktopAnchorStore, clock.now().toISOString());
  } catch (error) {
    console.error("anchor: could not be compared at start", error);
  }
}
