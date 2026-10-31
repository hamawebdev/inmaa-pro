import type { Kysely } from "kysely";

import type { Clock } from "@/lib/clock";
import type { DB } from "@/lib/db/schema";
import { buildContext, SYSTEM_SESSION, type Executor, type ServiceContext } from "@/lib/service/context";
import { seedSteps } from "@/lib/seeds";
import { getSetting, setSetting } from "@/lib/settings";
import { readBooksRow } from "@/lib/sync/books/guard";
import { stampTransaction, unstampTransaction } from "@/lib/sync/session";
import type { LocalDate } from "@/lib/units";

/**
 * The day-start job: what the program does by itself when a new day begins.
 *
 * A contract past its end date ends; a suspension with an end date is lifted;
 * a document expires. Nobody clicks for these. They run when the program
 * opens on a day it has not started yet, and at midnight if it is open.
 *
 * Each owner registers what it does, in `src/features/<folder>/daily.ts`:
 *
 *     export function registerDaily(daily: RegisterDaily) {
 *       daily("endExpiredContracts", async (ex, ctx, { today, since }) => { … });
 *     }
 *
 * The rules of a handler:
 *
 *  - it is given `(ex, ctx, day)` like any service. `ctx` is the program's own
 *    (`userId` null, name "system"): the log says the program did it;
 *  - it may run twice for one day, and after days the PC was off: write it on
 *    "on or before today", not "today", and so that a second run changes
 *    nothing. `since` is the last day this owner's handlers completed (null the
 *    first time);
 *  - all of one owner's handlers run in ONE transaction, with the mark that
 *    the day is done. If one throws, that owner's day is rolled back and tried
 *    again at the next start or the next hour; the other owners are not held up.
 *
 * Two laptops (DECISION section 4): the owners' handlers and seed steps run
 * only on the laptop that holds the books, so they never run twice; the
 * other laptop receives what they wrote. Foundation's own (`core`) run on
 * both. Before sync is set up, every owner runs, as in 1.0.0.
 */
export interface DayStart {
  /** The centre's date now. */
  today: LocalDate;
  /** The last day this owner's handlers completed, or null if they never ran. */
  since: LocalDate | null;
}

export type DailyHandler = (ex: Executor, ctx: ServiceContext, day: DayStart) => Promise<void>;
export type RegisterDaily = (name: string, handler: DailyHandler) => void;

export const DAILY_OWNERS = ["core", "people", "clients", "operations", "money", "stock"] as const;
export type DailyOwner = (typeof DAILY_OWNERS)[number];

/** Foundation's own steps: they run on both laptops (each its own day). */
const RUNS_ON_BOTH_LAPTOPS: ReadonlySet<DailyOwner> = new Set(["core"]);

const handlers = new Map<DailyOwner, Array<{ name: string; handler: DailyHandler }>>();

/** Registers one handler for an owner. Used through the function handed to each folder's `registerDaily`. */
export function registerDailyHandler(owner: DailyOwner, name: string, handler: DailyHandler): void {
  const list = handlers.get(owner) ?? [];
  if (list.some((entry) => entry.name === name)) throw new Error(`daily: ${owner} registers ${name} twice`);
  list.push({ name, handler });
  handlers.set(owner, list);
}

/** Which handlers each owner has, in the order they run. For tests. */
export function dailyHandlers(): Array<{ owner: DailyOwner; names: string[] }> {
  return DAILY_OWNERS.flatMap((owner) => {
    const list = handlers.get(owner);
    return list?.length ? [{ owner, names: list.map((entry) => entry.name) }] : [];
  });
}

let loaded = false;

/** Registers the handlers of every feature folder that has a `daily.ts`. Called at start, and by the test database. */
export function loadFeatureDaily(): void {
  if (loaded) return;
  loaded = true;
  const modules = import.meta.glob<{ registerDaily?: (daily: RegisterDaily) => void }>("../../features/*/daily.ts", {
    eager: true,
  });
  for (const [file, module] of Object.entries(modules)) {
    const owner = /features\/([^/]+)\/daily\.ts$/.exec(file)?.[1] as DailyOwner | undefined;
    if (!owner || !DAILY_OWNERS.includes(owner)) continue;
    module.registerDaily?.((name, handler) => registerDailyHandler(owner, name, handler));
  }
}

/** Forgets every handler and lets `loadFeatureDaily` run again. For tests. */
export function resetFeatureDaily(): void {
  loaded = false;
  handlers.clear();
}

export interface DayStartReport {
  today: LocalDate;
  /** The owners whose day was started by this run. */
  ran: DailyOwner[];
  /** The owners whose day was already started. */
  alreadyDone: DailyOwner[];
  /** The owners whose handlers failed: rolled back, to be tried again. */
  failed: Array<{ owner: DailyOwner; error: string }>;
  /** The owners left to the laptop that holds the books. */
  elsewhere: DailyOwner[];
}

/**
 * Starts the day for every owner that has not started it: one transaction per
 * owner, in owner order, as the program itself. Safe to call at any time; an
 * owner whose day is done is skipped.
 */
export async function runDayStart(db: Kysely<DB>, clock: Clock): Promise<DayStartReport> {
  const ctx = buildContext(SYSTEM_SESSION, clock);
  const report: DayStartReport = { today: ctx.today, ran: [], alreadyDone: [], failed: [], elsewhere: [] };

  for (const owner of DAILY_OWNERS) {
    const list = handlers.get(owner) ?? [];
    // An owner's seed steps run first: a database made before a seed existed catches up (src/lib/seeds).
    const seeds = seedSteps(owner);
    if (list.length === 0 && seeds.length === 0) continue;
    try {
      const ran = await db.transaction().execute(async (trx) => {
        const stamp = await stampTransaction(trx, ctx);
        // The books' laptop alone runs the owners' days (ctx.syncDeviceId is set by the stamp).
        if (!RUNS_ON_BOTH_LAPTOPS.has(owner) && ctx.syncDeviceId !== null) {
          const books = await readBooksRow(trx);
          if (books && books.holderDeviceId !== ctx.syncDeviceId) {
            await unstampTransaction(trx, stamp);
            return "elsewhere" as const;
          }
        }
        // Read inside the transaction: two windows of time cannot both start one owner's day.
        const done = await getSetting(trx, "system.dayStart");
        if (done[owner] === ctx.today) {
          await unstampTransaction(trx, stamp);
          return false;
        }
        const day: DayStart = { today: ctx.today, since: (done[owner] as LocalDate | undefined) ?? null };
        for (const { step } of seeds) await step(trx, ctx);
        for (const { handler } of list) await handler(trx, ctx, day);
        await setSetting(trx, ctx, "system.dayStart", { ...done, [owner]: ctx.today });
        await unstampTransaction(trx, stamp);
        return true;
      });
      (ran === "elsewhere" ? report.elsewhere : ran ? report.ran : report.alreadyDone).push(owner);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`daily: the day-start handlers of ${owner} failed and were rolled back`, error);
      report.failed.push({ owner, error: message });
    }
  }
  return report;
}
