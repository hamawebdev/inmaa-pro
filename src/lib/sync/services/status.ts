import { sql } from "kysely";

import type { Executor, ServiceContext } from "@/lib/service/context";
import { booksState } from "@/lib/sync/books";

import { outboxTransactionCount } from "../payload";
import { isCapturing, readDeviceIdentity } from "../session";
import { listFileStates, readExchange, readReceive, readSend, readState } from "../state";
import type { SyncExchange, SyncProblem, SyncSeverity, SyncStatus } from "./types";

/**
 * What the bar, Settings › المزامنة and the alert tile show (BUILD 2.7).
 *
 * Read from this database alone: the sync loop writes the outcome of its last
 * round into `SyncState` ("exchange"), so the status is right in a test and on
 * the home screen's alert count. The running program adds only whether a
 * round is under way now (`live.running`, src/server/sync.ts).
 *
 * Open to every signed-in role: it shows no business data.
 */

/** Beyond this, «ساعة هذا الحاسوب غير مضبوطة». */
export const CLOCK_TOLERANCE_MS = 120_000;
/** OFFLINE is shown as a problem only after this long. */
const OFFLINE_NOTICE_MS = 30 * 60_000;

const ORDER: readonly SyncProblem[] = [
  "LEGAL_INCIDENT",
  "REVOKED",
  "FULL",
  "REJOIN",
  "CATCH_UP_OFFLINE",
  "CLOCK",
  "HELD",
  "LIMIT",
  "CONFLICTS",
  "OFFLINE",
  "FILES_MISSING",
];

const SEVERITY: Readonly<Record<SyncProblem, SyncSeverity>> = {
  LEGAL_INCIDENT: "danger",
  REVOKED: "danger",
  FULL: "danger",
  REJOIN: "danger",
  CATCH_UP_OFFLINE: "danger",
  CLOCK: "warning",
  HELD: "warning",
  LIMIT: "warning",
  CONFLICTS: "info",
  OFFLINE: "info",
  FILES_MISSING: "info",
};

export interface LiveSyncState {
  /** A round is running now. */
  running?: boolean;
  /** The program found, at start, that this database must join again from the full copy (case 8). */
  rejoin?: boolean;
}

const OFF: SyncStatus = {
  state: "OFF",
  exchange: "OFF",
  problem: null,
  problems: [],
  severity: "ok",
  thisDevice: null,
  devices: [],
  lastExchangeAt: null,
  offlineSince: null,
  waitingCount: 0,
  filesToSend: 0,
  filesToReceive: 0,
  limitRetryAt: null,
  clockOffsetMs: null,
  clockWrong: false,
  books: null,
  heldCount: 0,
  conflictCount: 0,
  incidentCount: 0,
  catchUp: null,
};

export async function syncStatus(ex: Executor, ctx: ServiceContext, live: LiveSyncState = {}): Promise<SyncStatus> {
  const identity = await readDeviceIdentity(ex);
  if (!identity || !(await isCapturing(ex))) {
    if (!live.rejoin) return OFF;
    return { ...OFF, exchange: "REJOIN", problem: "REJOIN", problems: ["REJOIN"], severity: "danger" };
  }
  const [exchange, send, receive, catchUp, clock, files, waitingCount] = await Promise.all([
    readExchange(ex),
    readSend(ex),
    readReceive(ex),
    readState(ex, "catchUp"),
    readState(ex, "clock"),
    listFileStates(ex),
    outboxTransactionCount(ex),
  ]);
  void send;
  const books = await booksState(ex, { ...ctx, syncDeviceId: identity.id });
  const devices = await ex.selectFrom("SyncDevice").selectAll().orderBy("slot").orderBy("joinedAt").execute();

  const counts = await ex
    .selectFrom("SyncHeld")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("resolvedAt", "is", null)
    .executeTakeFirst();
  const conflictCount = await ex
    .selectFrom("SyncConflict")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("resolvedAt", "is", null)
    // A search key is settled with its field and never counted alone (conflicts.ts).
    .where(sql<boolean>`NOT ("col" GLOB '*[a-z]Key' OR "col" GLOB '*[a-z]Keys')`)
    .executeTakeFirst();
  const { BOOKS_TABLES } = await import("@/lib/sync/books");
  const removed = devices.filter((device) => device.removedAt !== null).map((device) => device.id);
  const incidents =
    removed.length === 0
      ? { n: 0 }
      : await ex
          .selectFrom("SyncHeld")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("resolvedAt", "is", null)
          .where("tbl", "in", [...BOOKS_TABLES])
          .where("originDeviceId", "in", removed)
          .executeTakeFirst();

  const nowMs = Date.parse(ctx.now);
  const problems: SyncProblem[] = [];
  const heldCount = Number(counts?.n ?? 0);
  const incidentCount = Number(incidents?.n ?? 0);
  const offsetMs = clock?.offsetMs ?? null;
  const clockWrong = offsetMs !== null && Math.abs(offsetMs) > CLOCK_TOLERANCE_MS;
  const limitActive = exchange.limitRetryAt !== null && Date.parse(exchange.limitRetryAt) > nowMs;

  if (incidentCount > 0) problems.push("LEGAL_INCIDENT");
  if (exchange.lastOutcome === "REVOKED") problems.push("REVOKED");
  if (exchange.lastOutcome === "FULL") problems.push("FULL");
  if (exchange.lastOutcome === "REJOIN") problems.push("REJOIN");
  if (catchUp && exchange.lastOutcome === "OFFLINE") problems.push("CATCH_UP_OFFLINE");
  if (clockWrong) problems.push("CLOCK");
  if (heldCount - incidentCount > 0) problems.push("HELD");
  if (limitActive) problems.push("LIMIT");
  if (Number(conflictCount?.n ?? 0) > 0) problems.push("CONFLICTS");
  if (
    exchange.lastOutcome === "OFFLINE" &&
    exchange.offlineSince !== null &&
    nowMs - Date.parse(exchange.offlineSince) > OFFLINE_NOTICE_MS
  ) {
    problems.push("OFFLINE");
  }
  const filesToReceive = files.filter((file) => file.stage === "FETCH").length;
  if (files.some((file) => file.stage === "FETCH" && (file.tries ?? 0) > 3)) problems.push("FILES_MISSING");
  problems.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  let state: SyncExchange;
  if (exchange.lastOutcome === "REVOKED") state = "REVOKED";
  else if (problems.includes("REJOIN") || live.rejoin) state = "REJOIN";
  else if (catchUp) state = "CATCHING_UP";
  else if (exchange.lastOutcome === "FULL") state = "FULL";
  else if (limitActive) state = "LIMIT";
  else if (exchange.lastOutcome === "OFFLINE") state = "OFFLINE";
  else if (live.running || waitingCount > 0 || exchange.lastExchangeAt === null) state = "SENDING";
  else state = "SYNCED";

  const problem = problems[0] ?? null;
  return {
    state: "ON",
    exchange: state,
    problem,
    problems,
    severity: problem ? SEVERITY[problem] : "ok",
    thisDevice: { id: identity.id, name: identity.name, slot: identity.slot },
    devices: devices
      .map((device) => ({
        id: device.id,
        name: device.name,
        slot: (device.slot === 0 ? 0 : 1) as 0 | 1,
        isThis: device.id === identity.id,
        joinedAt: device.joinedAt,
        lastExchangeAt: device.id === identity.id ? exchange.lastExchangeAt : (receive.origins[device.id]?.at ?? null),
        removedAt: device.removedAt,
        holdsBooks: books?.holderDeviceId === device.id,
      }))
      .sort((a, b) => Number(b.isThis) - Number(a.isThis)),
    lastExchangeAt: exchange.lastExchangeAt,
    offlineSince: exchange.offlineSince,
    waitingCount,
    filesToSend: files.filter((file) => file.stage === "SEND").length,
    filesToReceive,
    limitRetryAt: limitActive ? exchange.limitRetryAt : null,
    clockOffsetMs: offsetMs,
    clockWrong,
    books: books
      ? {
          holderDeviceId: books.holderDeviceId,
          holderName: books.holderName,
          heldHere: books.heldHere,
          since: books.handedAt,
          requestedByDeviceId: books.requestedByDeviceId,
          requestedAt: books.requestedAt,
        }
      : null,
    heldCount,
    conflictCount: Number(conflictCount?.n ?? 0),
    incidentCount,
    catchUp: catchUp ? { reason: catchUp.reason, done: catchUp.done, total: catchUp.total } : null,
  };
}
