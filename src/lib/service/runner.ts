import type { Kysely } from "kysely";

import { LEGAL_CHAINS, writeAnchor, type AnchorStore } from "@/lib/chain/anchor";
import type { Clock } from "@/lib/clock";
import type { DB } from "@/lib/db/schema";
import { stampTransaction, unstampTransaction } from "@/lib/sync/session";

import { buildContext, type Executor, type ServiceContext, type Session } from "./context";
import { describeError, ServiceError, type ActionResult } from "./errors";

/**
 * The thin wrapper between a screen and a service.
 *
 * A service is `(ex, ctx, input)` and knows nothing of the program around it.
 * A runner binds the four things it needs: a database, who is signed in, a
 * clock, and what to refresh afterwards. The program has one runner
 * (src/lib/service/action.ts); a test builds its own on a fresh database
 * (src/testing/database.ts), so the same functions run in both.
 */
export interface RunnerDeps {
  db: Kysely<DB>;
  /** Who is acting. Read once per action. */
  session: () => Session;
  clock: () => Clock;
  /** Where the anchor is kept, or null to keep none. */
  anchor: () => AnchorStore | null;
  /** Refreshes the screens that show a path: `revalidatePath`. */
  revalidate: (path: string) => void;
  /**
   * Runs `work` once `ms` have passed: the program's timer. With it, a log
   * entry left unanchored by the once-a-minute rule is anchored when its
   * minute is up, not only at the next action (audit LOG-10). Tests leave it
   * out.
   */
  later?: (work: () => void, ms: number) => void;
}

export type Service<Input, Output> = (ex: Executor, ctx: ServiceContext, input: Input) => Promise<Output>;

export interface ActionOptions<Input, Output> {
  /** The routes whose queries are refetched after a successful save. */
  revalidate?: readonly string[] | ((output: Output, input: Input) => readonly string[]);
}

/** The log's chain alone is anchored at most this often; every legal document is anchored at once. */
const LOG_ANCHOR_EVERY_MS = 60_000;

export function createRunner(deps: RunnerDeps) {
  let lastAnchorAt = 0;
  let catchUpDue = false;

  /** After a commit: brings the anchor up to date when the action added to a chain. Never fails the action. */
  async function anchorAfter(ctx: ServiceContext): Promise<void> {
    const store = deps.anchor();
    if (!store || ctx.touchedChains.size === 0) return;
    const legal = [...ctx.touchedChains].some((table) => LEGAL_CHAINS.has(table));
    const at = Date.parse(ctx.now);
    const sinceLast = Math.abs(at - lastAnchorAt);
    if (!legal && sinceLast < LOG_ANCHOR_EVERY_MS) {
      catchUp(LOG_ANCHOR_EVERY_MS - sinceLast);
      return;
    }
    try {
      await writeAnchor(deps.db, store, ctx.now);
      lastAnchorAt = at;
    } catch (error) {
      // The data is committed. A missed anchor is found and repaired at the next start ("ahead").
      console.error("anchor: write failed", error);
    }
  }

  /** The log's head, anchored when its minute is up, if nothing anchored it meanwhile. One timer at a time. */
  function catchUp(ms: number): void {
    if (!deps.later || catchUpDue) return;
    catchUpDue = true;
    const anchoredBefore = lastAnchorAt;
    deps.later(() => {
      catchUpDue = false;
      if (lastAnchorAt !== anchoredBefore) return;
      anchorNow().catch((error: unknown) => console.error("anchor: write failed", error));
    }, ms);
  }

  /**
   * Runs a service as one transaction and throws what it throws.
   * For a service that calls other owners' services: they all get the same `ex`.
   */
  async function transact<Output>(work: (ex: Executor, ctx: ServiceContext) => Promise<Output>): Promise<Output> {
    const ctx = buildContext(deps.session(), deps.clock());
    // Stamped first and last (src/lib/sync/session.ts): once sync is set up, the capture triggers refuse an unstamped write.
    const output = await deps.db.transaction().execute(async (trx) => {
      const stamp = await stampTransaction(trx, ctx);
      const result = await work(trx, ctx);
      await unstampTransaction(trx, stamp);
      return result;
    });
    await anchorAfter(ctx);
    return output;
  }

  /**
   * Turns a service into what a screen calls: one transaction, an answer
   * instead of an exception, and the screens refreshed.
   *
   *     export const saveSiteAction = action(saveSite, { revalidate: ["/dashboard/files"] });
   *     const result = await saveSiteAction(input);
   *     if (!result.success) toast.error(tError(result.error));
   */
  function action<Input, Output>(service: Service<Input, Output>, options: ActionOptions<Input, Output> = {}) {
    return async (input: Input): Promise<ActionResult<Output>> => {
      try {
        const data = await transact((ex, ctx) => service(ex, ctx, input));
        const paths =
          typeof options.revalidate === "function" ? options.revalidate(data, input) : (options.revalidate ?? []);
        for (const path of paths) deps.revalidate(path);
        return { success: true, data };
      } catch (error) {
        if (!(error instanceof ServiceError)) console.error(error);
        return { success: false, error: describeError(error) };
      }
    };
  }

  /**
   * Turns a reading service into a query function. No transaction: a read
   * holds the connection for one statement at a time. It throws; TanStack
   * Query shows the error.
   *
   *     useQuery({ queryKey: pathKey("/dashboard/files"), queryFn: () => listFilesQuery({ stage: "NEW" }) })
   *
   * A read that must write (a CONSULT entry for restricted data) is an
   * `action`, not a `query`.
   */
  function query<Input, Output>(service: Service<Input, Output>) {
    return async (input: Input): Promise<Output> => {
      const ctx = buildContext(deps.session(), deps.clock());
      try {
        return await service(deps.db, ctx, input);
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        console.error(error);
        throw new ServiceError(describeError(error));
      }
    };
  }

  /** Writes the anchor now: before a backup, when the program closes, after the manager's answer to a warning. */
  async function anchorNow(): Promise<void> {
    const store = deps.anchor();
    if (!store) return;
    const now = deps.clock().now().toISOString();
    await writeAnchor(deps.db, store, now);
    lastAnchorAt = Date.parse(now);
  }

  return { action, query, transact, anchorNow };
}

export type Runner = ReturnType<typeof createRunner>;
