import { currentSession } from "@/lib/access/session";
import { revalidatePath } from "@/lib/compat/revalidate";
import { db } from "@/lib/db";

import { SYSTEM_SESSION } from "./context";
import { programAnchor, programClock } from "./program";
import { createRunner } from "./runner";

/**
 * The program's runner: its database, whoever is signed in, its clock, its
 * anchor, and `revalidatePath`.
 *
 *     // src/features/<folder>/services/site.ts: the service, tested on a real database
 *     export async function saveSite(ex: Executor, ctx: ServiceContext, input: SaveSiteInput): Promise<{ id: string }> { … }
 *
 *     // the same file, last lines: what the screens import
 *     export const saveSiteAction = action(saveSite, { revalidate: ["/dashboard/files"] });
 *     export const listSitesQuery = query(listSites);
 *
 * See "How this codebase works" in CLAUDE.md for the whole recipe.
 */
const runner = createRunner({
  db,
  session: currentSession,
  clock: programClock,
  anchor: programAnchor,
  revalidate: revalidatePath,
});

export const { action, query, transact, anchorNow } = runner;

/**
 * The same three, run as the program itself (no user, every right): for what
 * happens before anybody is signed in. Sign-in is the one screen that uses it;
 * the day-start job has its own runner (src/lib/daily).
 */
const programRunner = createRunner({
  db,
  session: () => SYSTEM_SESSION,
  clock: programClock,
  anchor: programAnchor,
  revalidate: revalidatePath,
});

export const asProgram = {
  action: programRunner.action,
  query: programRunner.query,
  transact: programRunner.transact,
};

export type { ActionOptions, Service } from "./runner";
export type { Executor, ServiceContext, Session } from "./context";
export { ServiceError, type ActionResult } from "./errors";
