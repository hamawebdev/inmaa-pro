import { sql } from "kysely";

import type { Executor, ServiceContext } from "@/lib/service/context";
import { booksState } from "@/lib/sync/books";

import { outboxTransactionCount } from "../payload";
import { identityKind, isCapturing, readDeviceIdentity } from "../session";
import { joiningPending, listFileStates, readExchange, readReceive, readSend, readState } from "../state";
import type { DeviceKind, DeviceSlot, SyncExchange, SyncProblem, SyncSeverity, SyncStatus } from "./types";

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
  "OUTDATED",
  "FULL",
  "REJOIN",
  "REMOVAL_UNFINISHED",
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
  OUTDATED: "danger",
  FULL: "danger",
  REJOIN: "danger",
  REMOVAL_UNFINISHED: "danger",
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
  joining: false,
};

export async function syncStatus(ex: Executor, ctx: ServiceContext, live: LiveSyncState = {}): Promise<SyncStatus> {
  const identity = await readDeviceIdentity(ex);
  if (!identity || !(await isCapturing(ex))) {
    if (!live.rejoin) return OFF;
    return { ...OFF, exchange: "REJOIN", problem: "REJOIN", problems: ["REJOIN"], severity: "danger" };
  }
  const [exchange, send, receive, catchUp, clock, files, waitingCount, listed] = await Promise.all([
    readExchange(ex),
    readSend(ex),
    readReceive(ex),
    readState(ex, "catchUp"),
    readState(ex, "clock"),
    listFileStates(ex),
    outboxTransactionCount(ex),
    readState(ex, "mailboxDevices"),
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
  // A legal incident: a removed device's document the chain refused after its books were taken (guard.ts).
  const { heldBooksRows, isLegalIncident } = await import("@/lib/sync/books");
  const incidents = { n: (await heldBooksRows(ex)).filter(isLegalIncident).length };

  const nowMs = Date.parse(ctx.now);
  const problems: SyncProblem[] = [];
  const heldCount = Number(counts?.n ?? 0);
  const incidentCount = Number(incidents?.n ?? 0);
  const offsetMs = clock?.offsetMs ?? null;
  const clockWrong = offsetMs !== null && Math.abs(offsetMs) > CLOCK_TOLERANCE_MS;
  const limitActive = exchange.limitRetryAt !== null && Date.parse(exchange.limitRetryAt) > nowMs;

  if (incidentCount > 0) problems.push("LEGAL_INCIDENT");
  if (exchange.lastOutcome === "REVOKED") problems.push("REVOKED");
  if (exchange.lastOutcome === "OUTDATED") problems.push("OUTDATED");
  if (exchange.lastOutcome === "FULL") problems.push("FULL");
  if (exchange.lastOutcome === "REJOIN") problems.push("REJOIN");
  const keyOwed = new Set(listed?.keyOwed ?? []);
  if (keyOwed.size > 0) problems.push("REMOVAL_UNFINISHED");
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
  else if (exchange.lastOutcome === "OUTDATED") state = "OUTDATED";
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
    thisDevice: { id: identity.id, name: identity.name, slot: identity.slot, kind: identityKind(identity) },
    devices: devices
      .map((device) => {
        const isThis = device.id === identity.id;
        const atMailbox = listed?.devices.find((entry) => entry.id === device.id) ?? null;
        return {
          id: device.id,
          name: device.name,
          slot: device.slot as DeviceSlot,
          kind: device.kind as DeviceKind,
          isThis,
          joinedAt: device.joinedAt,
          lastExchangeAt: isThis ? exchange.lastExchangeAt : (receive.origins[device.id]?.at ?? null),
          lastSeenAt: isThis ? exchange.lastExchangeAt : (atMailbox?.lastSeenAt ?? null),
          waitingFromIt: isThis
            ? 0
            : atMailbox
              ? Math.max(0, atMailbox.lastSeq - (receive.origins[device.id]?.env ?? 0))
              : null,
          removedAt: device.removedAt,
          holdsBooks: books?.holderDeviceId === device.id,
          removalUnfinished: keyOwed.has(device.id),
        };
      })
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
    joining: await joiningPending(ex),
  };
}
