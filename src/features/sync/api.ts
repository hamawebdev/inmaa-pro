import * as React from "react";

import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/hooks/use-session";
import type { Capability } from "@/lib/access/catalogue";
import { can } from "@/lib/access/session";
import { pathKey } from "@/lib/compat/revalidate";
import { queryClient } from "@/lib/query-client";
import type { ActionResult, Executor, ServiceContext } from "@/lib/service/action";
import { requestBooksAction } from "@/lib/sync/books/actions";
import { onSyncApplied as onEngineSyncApplied } from "@/lib/sync/events";
import { syncStatus } from "@/lib/sync/services/status";
import {
  addSecondLaptopAction,
  joinCentre as engineJoinCentre,
  leaveSyncAction,
  mayJoinQuery,
  prepareSync as enginePrepareSync,
  rejoinFromFullCopy as engineRejoinFromFullCopy,
  removeLaptopAction,
  setUpSyncAction,
  startSync as engineStartSync,
  subscribeSyncStartup,
  syncNowAction,
  syncStartupState,
  syncStatusQuery,
} from "@/server/sync";
import {
  listConflictsQuery,
  resolveConflictAction,
  resolveHeldAction,
  retryHeldAction,
} from "@/lib/sync/services/conflicts";
import type {
  AddSecondLaptopInput,
  JoinCentreInput,
  JoinProgress,
  ListConflictsInput,
  PairingCodeAnswer,
  RemoveLaptopInput,
  ResolveConflictInput,
  ResolveHeldInput,
  RetryHeldInput,
  SetUpSyncInput,
  SyncConflictList,
  SyncStartupState,
  SyncStatus,
} from "@/lib/sync/services/types";

import {
  previewConflicts,
  previewPairing,
  previewStartup,
  previewStatus,
  SYNC_PREVIEWS,
  type SyncPreview,
} from "./preview";

/**
 * The one place the screens reach the sync engine (docs/sync/BUILD.md 2.7).
 *
 * Every screen of this folder, the bar and the gate call these and nothing
 * else, so the engine's services are named once. The engine's own words are
 * codes (src/lib/sync/services/types.ts); the words on screen are this
 * folder's messages.
 */

/** Settings › المزامنة: the path every sync read is keyed on, and every sync action refreshes. */
export const SYNC_PATH = "/dashboard/settings/sync";
export const SYNC_STATUS_KEY = [...pathKey(SYNC_PATH), "status"] as const;
export const SYNC_CONFLICTS_KEY = [...pathKey(SYNC_PATH), "conflicts"] as const;

/** How often the bar and the page read the status while the program is open. */
const STATUS_EVERY_MS = 15_000;

// ─── Development previews ────────────────────────────────────────────────────

let preview: SyncPreview | null = null;
const previewListeners = new Set<() => void>();

/**
 * In a development build only: `window.inmaaSyncPreview("TWO")` makes every
 * sync read answer one of ./preview.ts's samples, and `(null)` stops it.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { inmaaSyncPreview: (name: SyncPreview | null) => void }).inmaaSyncPreview = (name) => {
    preview = name && (SYNC_PREVIEWS as readonly string[]).includes(name) ? name : null;
    for (const listener of previewListeners) listener();
    void queryClient.invalidateQueries();
  };
}

// ─── The engine ──────────────────────────────────────────────────────────────

async function readStatus(): Promise<SyncStatus> {
  if (preview) return previewStatus(preview);
  return syncStatusQuery();
}

async function readConflicts(input: ListConflictsInput): Promise<SyncConflictList> {
  if (preview) return previewConflicts(preview);
  return listConflictsQuery(input);
}

/** The status inside a service (the alert tile's count): the database's part, with this reader's executor. */
export async function syncStatusFor(ex: Executor, ctx: ServiceContext): Promise<SyncStatus> {
  if (preview) return previewStatus(preview);
  return syncStatus(ex, ctx);
}

export const syncApi = {
  setUp: (input: SetUpSyncInput) => setUpSyncAction(input),
  addSecondLaptop: (input: AddSecondLaptopInput): Promise<ActionResult<PairingCodeAnswer>> =>
    preview ? Promise.resolve({ success: true, data: previewPairing() }) : addSecondLaptopAction(input),
  removeLaptop: (input: RemoveLaptopInput) => removeLaptopAction(input),
  resolveConflict: (input: ResolveConflictInput) => resolveConflictAction(input),
  retryHeld: (input: RetryHeldInput) => retryHeldAction(input),
  resolveHeld: (input: ResolveHeldInput) => resolveHeldAction(input),
  requestBooks: () => requestBooksAction(undefined),
  syncNow: () => syncNowAction(),
  leaveSync: (input: { reason: string }) => leaveSyncAction(input),
};

/** Joining from the first screen, before anybody signs in. It ends with the program's restart. */
export const joinCentre = (input: JoinCentreInput, onProgress?: (progress: JoinProgress) => void) =>
  engineJoinCentre(input, onProgress);

/**
 * Joining again from the centre's full copy, with this laptop's own keys (DECISION
 * section 7, case 8). It ends with the program's restart.
 */
export const rejoinFromFullCopy = (onProgress?: (progress: JoinProgress) => void) =>
  engineRejoinFromFullCopy(onProgress);

/**
 * Calls `listener` after each batch of the other laptop's changes was applied
 * here, outside its transaction, with the tables it touched. Returns how to stop.
 */
export function onSyncApplied(listener: (info: { tables: ReadonlySet<string> }) => void): () => void {
  return onEngineSyncApplied(listener);
}

/** Starts the exchange loop: once start-up found the database in order. Does nothing while sync is not set up. */
export function startSync(): void {
  engineStartSync();
}

/**
 * Before the anchor is compared and before sign-in: finishes a copy just
 * installed by joining, and finds whether this laptop must catch up or join
 * again (`useSyncStartup`). Does nothing while sync is not set up.
 */
export async function prepareSync(): Promise<void> {
  await enginePrepareSync();
}

/** Whether start-up found this laptop catching up: the exchange then starts at once, whatever the anchor says. */
export function catchingUpAtStart(): boolean {
  return startupState()?.catchingUp ?? false;
}

/** Whether this installation is new enough to join a centre instead (first run done, nothing typed). */
export async function mayJoin(): Promise<boolean> {
  if (preview) return preview === "OFF";
  return mayJoinQuery();
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Whether the signed-in account may ask for the books: whoever writes what
 * only the books' holder writes (ledger's `requestBooks` checks the same).
 */
export function useMayAskForBooks(): boolean {
  const session = useSession();
  return session !== null && BOOKS_CAPABILITIES.some((capability) => can(session, capability));
}

const BOOKS_CAPABILITIES: readonly Capability[] = [
  "invoice.issue",
  "invoice.void",
  "payment.record",
  "payment.void",
  "reconciliation.close",
  "pay.write",
  "sync.manage",
];

/** The engine's status, read every 15 seconds while a screen shows it. */
export function useSyncStatus() {
  return useQuery({
    queryKey: SYNC_STATUS_KEY,
    queryFn: readStatus,
    refetchInterval: STATUS_EVERY_MS,
    staleTime: STATUS_EVERY_MS,
  });
}

export function useSyncConflicts(enabled: boolean) {
  return useQuery({
    queryKey: SYNC_CONFLICTS_KEY,
    queryFn: () => readConflicts({}),
    enabled,
  });
}

// ─── Before sign-in ──────────────────────────────────────────────────────────

const startupListeners = new Set<() => void>();
let previewedStartup: SyncStartupState | null = null;
if (import.meta.env.DEV) {
  previewListeners.add(() => {
    previewedStartup = preview ? previewStartup(preview) : null;
    startupListeners.forEach((listener) => listener());
  });
}

function startupState(): SyncStartupState | null {
  return previewedStartup ?? syncStartupState();
}

function subscribeStartup(listener: () => void): () => void {
  startupListeners.add(listener);
  const stop = subscribeSyncStartup(() => listener());
  return () => {
    startupListeners.delete(listener);
    stop();
  };
}

/** What the gate shows before sign-in: catching up after a restore, or joining again. */
export function useSyncStartup(): SyncStartupState | null {
  return React.useSyncExternalStore(subscribeStartup, startupState, startupState);
}
