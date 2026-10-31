import type { Kysely } from "kysely";

import type { Clock } from "@/lib/clock";
import type { DB } from "@/lib/db/schema";

import type { FilesEnv } from "./files";
import { mailboxFailureOf, refusalCodeOf, retryAtOf } from "./mailbox";
import { NeedsFullCopy, runRound, type RoundResult } from "./round";
import { onLocalWrite } from "./session";
import { readExchange, writeState, type ExchangeState } from "./state";

/**
 * When to sync (DECISION section 6): while the program is open and online,
 * every 15 seconds after recent activity and every 60 seconds when quiet; a
 * few seconds after a save; never faster than the free plan allows. A failure
 * backs off by its kind (offline, the daily limit until the hour it resets, a
 * full mailbox), and nothing is ever lost: what waits stays in the outbox.
 *
 * The outcome of each round is written into `SyncState` ("exchange"), which
 * `syncStatus` reads.
 */

export const ACTIVE_EVERY_MS = 15_000;
export const QUIET_EVERY_MS = 60_000;
/** A save is sent after this pause, so a burst of saves goes in one round. */
export const AFTER_SAVE_MS = 2_000;
/** Activity keeps the fast pace this long. */
const ACTIVE_FOR_MS = 5 * 60_000;
const OFFLINE_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
const FULL_EVERY_MS = 30 * 60_000;
const REFUSED_EVERY_MS = 5 * 60_000;

export type RoundOutcome =
  | { kind: "OK"; result: RoundResult }
  | { kind: "OFFLINE" | "LIMIT" | "FULL" | "REVOKED" | "REFUSED" | "REJOIN" | "NOT_SET_UP"; error?: unknown };

export interface SyncLoopDeps {
  db: Kysely<DB>;
  clock: () => Clock;
  /** The engine's view of this laptop, or null when sync is not set up. */
  env: () => Promise<FilesEnv | null>;
  /** The program's timer; returns a cancel. */
  later: (work: () => void, ms: number) => () => void;
  /** Told when a round starts and ends. */
  onRunning?: (running: boolean) => void;
  /** Told after every round. */
  onOutcome?: (outcome: RoundOutcome) => void;
  /** One round (`runOnce`); a test gives its own. */
  run?: (env: FilesEnv, options: { checkRestore?: boolean }) => Promise<RoundOutcome>;
}

/** Writes a round's outcome where `syncStatus` reads it. */
export async function recordOutcome(db: Kysely<DB>, clock: Clock, outcome: RoundOutcome): Promise<ExchangeState> {
  const now = clock.now();
  const previous = await readExchange(db);
  let next: ExchangeState;
  switch (outcome.kind) {
    case "OK":
      next = {
        ...previous,
        lastExchangeAt: now.toISOString(),
        lastOutcome: "OK",
        offlineSince: null,
        limitRetryAt: null,
        refusal: null,
      };
      break;
    case "OFFLINE":
      next = { ...previous, lastOutcome: "OFFLINE", offlineSince: previous.offlineSince ?? now.toISOString() };
      break;
    case "LIMIT": {
      const at = retryAtOf(outcome.error) ?? nextUtcMidnight(now.getTime());
      next = { ...previous, lastOutcome: "LIMIT", limitRetryAt: new Date(at).toISOString() };
      break;
    }
    case "NOT_SET_UP":
      return previous;
    default:
      next = { ...previous, lastOutcome: outcome.kind, refusal: refusalCodeOf(outcome.error) };
  }
  await writeState(db, "exchange", next);
  return next;
}

/** 00:00 UTC after an instant: when Cloudflare's daily counts reset. */
export function nextUtcMidnight(ms: number): number {
  const at = new Date(ms);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
}

/** One round, its failure turned into an outcome; a fault in the code is thrown. */
export async function runOnce(
  env: FilesEnv,
  options: { checkRestore?: boolean; onProgress?: (done: number, total: number | null) => void } = {},
): Promise<RoundOutcome> {
  try {
    return { kind: "OK", result: await runRound(env, options) };
  } catch (error) {
    if (error instanceof NeedsFullCopy) return { kind: "REJOIN", error };
    const kind = mailboxFailureOf(error);
    if (kind === "offline") return { kind: "OFFLINE", error };
    if (kind === "limit") return { kind: "LIMIT", error };
    if (kind === "full") return { kind: "FULL", error };
    if (kind === "revoked") return { kind: "REVOKED", error };
    if (kind === "refused" || kind === "conflict") return { kind: "REFUSED", error };
    throw error;
  }
}

export function createSyncLoop(deps: SyncLoopDeps) {
  let started = false;
  let running = false;
  let again = false;
  let cancel: (() => void) | null = null;
  let failures = 0;
  let activeUntil = 0;
  let checkRestore = true;
  let stopListening: (() => void) | null = null;
  const waiters: Array<(outcome: RoundOutcome) => void> = [];

  function schedule(ms: number): void {
    cancel?.();
    if (!started) return;
    cancel = deps.later(() => {
      cancel = null;
      void round();
    }, ms);
  }

  function delayAfter(outcome: RoundOutcome): number | null {
    const now = deps.clock().now().getTime();
    switch (outcome.kind) {
      case "OK": {
        failures = 0;
        const moved = outcome.result.sent + outcome.result.received + outcome.result.filesReceived > 0;
        if (moved) activeUntil = now + ACTIVE_FOR_MS;
        if (outcome.result.waiting) return ACTIVE_EVERY_MS;
        return now < activeUntil ? ACTIVE_EVERY_MS : QUIET_EVERY_MS;
      }
      case "OFFLINE":
        failures += 1;
        return OFFLINE_BACKOFF_MS[Math.min(failures - 1, OFFLINE_BACKOFF_MS.length - 1)];
      case "LIMIT":
        return Math.max(ACTIVE_EVERY_MS, (retryAtOf(outcome.error) ?? nextUtcMidnight(now)) - now + 5_000);
      case "FULL":
        return FULL_EVERY_MS;
      case "REFUSED":
        checkRestore = true;
        return REFUSED_EVERY_MS;
      case "REVOKED":
      case "REJOIN":
      case "NOT_SET_UP":
        return null; // nothing more to do until the office acts
    }
  }

  async function round(): Promise<RoundOutcome> {
    if (running) {
      again = true;
      return new Promise((resolve) => waiters.push(resolve));
    }
    running = true;
    deps.onRunning?.(true);
    let outcome: RoundOutcome;
    try {
      const env = await deps.env();
      if (!env) outcome = { kind: "NOT_SET_UP" };
      else {
        outcome = await (deps.run ?? runOnce)(env, { checkRestore });
        if (outcome.kind === "OK") checkRestore = false;
        await recordOutcome(deps.db, deps.clock(), outcome);
      }
    } catch (error) {
      console.error("sync: a round failed", error);
      outcome = { kind: "REFUSED", error };
    } finally {
      running = false;
      deps.onRunning?.(false);
    }
    deps.onOutcome?.(outcome);
    for (const resolve of waiters.splice(0)) resolve(outcome);
    if (again) {
      again = false;
      schedule(0);
    } else {
      const delay = delayAfter(outcome);
      if (delay !== null) schedule(delay);
    }
    return outcome;
  }

  return {
    /** Starts the loop: a first round at once. Idempotent. */
    start(): void {
      if (started) return;
      started = true;
      stopListening = onLocalWrite(() => {
        activeUntil = deps.clock().now().getTime() + ACTIVE_FOR_MS;
        if (!running) schedule(AFTER_SAVE_MS);
      });
      schedule(0);
    },
    stop(): void {
      started = false;
      cancel?.();
      cancel = null;
      stopListening?.();
      stopListening = null;
    },
    /** «مزامنة الآن»: a round now (or right after the one running); resolves with its outcome. */
    now(): Promise<RoundOutcome> {
      failures = 0;
      checkRestore = true;
      cancel?.();
      return round();
    },
    get running(): boolean {
      return running;
    },
  };
}

export type SyncLoop = ReturnType<typeof createSyncLoop>;
