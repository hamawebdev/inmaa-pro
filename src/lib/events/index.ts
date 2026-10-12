import type { Executor, ServiceContext } from "@/lib/service/context";
import type { LocalDate } from "@/lib/units";

/**
 * Events that cross owners (docs/data-model/CONTRACTS.md section 4).
 *
 * An event is a function call, not a message. `emit` runs every handler at
 * once, in a fixed order, inside the emitter's transaction: a handler that
 * throws rolls the whole action back. So one user action is one transaction
 * across owners, and a test can take a file from registration to a paid
 * invoice on one database.
 *
 * Two rules for a handler. It takes `(ex, ctx, payload)` like any service and
 * uses that `ex`. And it never throws for a reason the user cannot fix on the
 * spot: a zone with no supervisor leaves a key empty, it does not fail the
 * order someone is typing in.
 *
 * Each owner registers its handlers in its own folder, in
 * `src/features/<folder>/events.ts`:
 *
 *     export function registerEvents(on: OnEvent) {
 *       on("file.contracted", async (ex, ctx, { fileId }) => { … });
 *     }
 *
 * Nobody edits this file to add a handler. A new event, or a change to a
 * payload, is a change to the contract between owners: ask Foundation.
 */
export interface EventPayloads {
  "file.contracted": { fileId: string };
  "file.termsChanged": { fileId: string };
  "file.renewed": { fromFileId: string; toFileId: string };
  "file.ended": { fileId: string; endKind: string; endedDate: LocalDate };
  "site.changed": { siteId: string; zoneChanged: boolean; profileChanged: boolean };
  "zone.remapped": { communeId: string; fromZoneId: string | null; toZoneId: string };
  "visit.signedOff": { visitId: string };
  "visit.statusChanged": { visitId: string };
  "absence.recorded": { absenceId: string };
  "staff.unavailable": {
    workerId: string;
    fromDate: LocalDate;
    toDate?: LocalDate | null;
    cause: "LEFT" | "SANCTION_SET" | "SANCTION_LIFTED";
  };
  "sanction.changed": { sanctionId: string };
  "invoice.issued": { invoiceId: string };
  "invoice.voided": { invoiceId: string };
  "payment.recorded": { paymentId: string };
  "payment.voided": { paymentId: string };
  "payrun.closed": { payRunId: string };
  "payrun.voided": { payRunId: string };
  "payout.recorded": { staffPayoutId: string };
  "payout.voided": { staffPayoutId: string };
  "handout.returnedShort": { handOutReturnId: string };
  "complaint.settled": { complaintId: string };
  "problem.handedOver": { problemReportId: string; to: "STOCK" | "CLIENTS" | "PEOPLE" };
}

export type EventName = keyof EventPayloads;
export type EventHandler<E extends EventName> = (
  ex: Executor,
  ctx: ServiceContext,
  payload: EventPayloads[E],
) => Promise<void>;
export type OnEvent = <E extends EventName>(event: E, handler: EventHandler<E>) => void;

/** The folders that may register handlers, in the order they run when the contract names none. */
export const EVENT_OWNERS = ["core", "people", "clients", "operations", "money", "stock"] as const;
export type EventOwner = (typeof EVENT_OWNERS)[number];

/**
 * Who reacts first. The order is part of the contract: Operations creates the
 * visits of a contracted file before Money computes its dues from them.
 * An owner not named for an event runs after those that are.
 */
const ORDER: Partial<Record<EventName, readonly EventOwner[]>> = {
  "file.contracted": ["operations", "money"],
  "file.termsChanged": ["operations", "money"],
  "file.renewed": ["operations"],
  "file.ended": ["operations", "money"],
  "site.changed": ["operations"],
  "zone.remapped": ["clients"],
  "visit.signedOff": ["money", "operations"],
  "visit.statusChanged": ["money"],
  "staff.unavailable": ["operations", "money"],
  "payout.recorded": ["money"],
  "payout.voided": ["money"],
};

type AnyHandler = (ex: Executor, ctx: ServiceContext, payload: never) => Promise<void>;
const handlers = new Map<EventName, Array<{ owner: EventOwner; handler: AnyHandler }>>();

function rank(event: EventName, owner: EventOwner): number {
  const named = ORDER[event]?.indexOf(owner) ?? -1;
  return named === -1 ? 100 + EVENT_OWNERS.indexOf(owner) : named;
}

/** Registers one handler for an owner. Used through the `on` handed to each folder's `registerEvents`. */
export function registerHandler<E extends EventName>(owner: EventOwner, event: E, handler: EventHandler<E>): void {
  const list = handlers.get(event) ?? [];
  list.push({ owner, handler: handler as AnyHandler });
  // A stable sort: two handlers of one owner run in the order they were registered.
  list.sort((a, b) => rank(event, a.owner) - rank(event, b.owner));
  handlers.set(event, list);
}

/** Runs the handlers of an event, one after the other, in the emitter's transaction. */
export async function emit<E extends EventName>(
  ex: Executor,
  ctx: ServiceContext,
  event: E,
  payload: EventPayloads[E],
): Promise<void> {
  for (const { handler } of handlers.get(event) ?? []) {
    await (handler as unknown as EventHandler<E>)(ex, ctx, payload);
  }
}

/** Which owners react to an event, in order. For tests and for the contract check. */
export function listenersOf(event: EventName): EventOwner[] {
  return (handlers.get(event) ?? []).map((entry) => entry.owner);
}

/** Forgets every handler. For tests that register their own. */
export function clearHandlers(): void {
  handlers.clear();
}

let loaded = false;

/**
 * Registers the handlers of every feature folder that has an `events.ts`.
 * Called once at start, and by the test database, so a scenario test runs with
 * the same handlers as the program.
 */
export function loadFeatureEvents(): void {
  if (loaded) return;
  loaded = true;
  const modules = import.meta.glob<{ registerEvents?: (on: OnEvent) => void }>("../../features/*/events.ts", {
    eager: true,
  });
  for (const [file, module] of Object.entries(modules)) {
    const owner = /features\/([^/]+)\/events\.ts$/.exec(file)?.[1] as EventOwner | undefined;
    if (!owner || !EVENT_OWNERS.includes(owner)) continue;
    module.registerEvents?.((event, handler) => registerHandler(owner, event, handler));
  }
}

/** Lets `loadFeatureEvents` run again after `clearHandlers`. For tests. */
export function resetFeatureEvents(): void {
  loaded = false;
  clearHandlers();
}
