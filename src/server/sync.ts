import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

import { currentSession } from "@/lib/access/session";
import { commands } from "@/lib/bindings";
import { writeAnchor } from "@/lib/chain/anchor";
import { revalidatePath } from "@/lib/compat/revalidate";
import { db } from "@/lib/db";
import { asProgram } from "@/lib/service/action";
import { buildContext, SYSTEM_SESSION } from "@/lib/service/context";
import { describeError, ServiceError, type ActionResult } from "@/lib/service/errors";
import { programAnchor, programClock } from "@/lib/service/program";
import {
  detectRejoin,
  deviceIdentity,
  downloadForRejoin,
  envFor,
  finishInstall,
  leaveCentre,
  mailboxError,
  mayJoin,
  pairSecondLaptop,
  redeemAndDownload,
  removeOtherLaptop,
  setUpCentre,
  SYNC_ERRORS,
  type CentreEnv,
  type InstallNote,
  type SyncVault,
  type SyncVaultData,
} from "@/lib/sync/centre";
import type { FilesEnv, SyncFiles } from "@/lib/sync/files";
import { createSyncLoop, type RoundOutcome } from "@/lib/sync/loop";
import { createRelayClient, tauriTransport } from "@/lib/sync/relay";
import { syncStatus } from "@/lib/sync/services/status";
import type {
  AddSecondLaptopInput,
  JoinCentreInput,
  JoinProgress,
  PairingCodeAnswer,
  RemoveLaptopInput,
  SetUpSyncInput,
  SyncStartupState,
  SyncStatus,
} from "@/lib/sync/services/types";
import { readState, writeState } from "@/lib/sync/state";

/**
 * The sync engine in the running program: native's commands (BUILD 2.5) for
 * the vault, the files and the full copy; relay's client over native's HTTPS
 * command; the loop on the program's timer; and what the screens call.
 *
 * Start-up (program's src/features/core/services/startup.ts):
 *   1. `await prepareSync()` before the anchor check and before sign-in: a copy
 *      just installed becomes this laptop's database; a restored or forgotten
 *      laptop is found (`syncStartupState()`).
 *   2. If `syncStartupState()?.catchingUp`, keep sign-in closed and `startSync()`
 *      at once; `subscribeSyncStartup` says when it is done.
 *   3. Otherwise `startSync()` once start-up is clear.
 */

const SETTINGS_PATH = "/dashboard/settings/sync";

// ─── Native's commands ───────────────────────────────────────────────────────

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: { message: string } };

function unwrap<T>(result: Result<T>): T {
  if (result.status === "error") throw new Error(result.error.message);
  return result.data;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return String(error);
}

const nativeVault: SyncVault = {
  async read() {
    const text = unwrap(await commands.syncVaultRead());
    if (!text) return null;
    const value = JSON.parse(text) as Partial<SyncVaultData>;
    if (!value.centreId || !value.deviceId || !value.keyRing) return null;
    return value as SyncVaultData;
  },
  async write(data) {
    const { centreId, deviceId, token, slot, deviceName, keyRing } = data;
    unwrap(await commands.syncVaultWrite(JSON.stringify({ centreId, deviceId, token, slot, deviceName, keyRing })));
  },
  async clear() {
    unwrap(await commands.syncVaultClear());
  },
};

const nativeFiles: SyncFiles = {
  async info(path) {
    const info = unwrap(await commands.fileInfo(path));
    return info ? { size: info.size_bytes, sha256: info.sha256 } : null;
  },
  async readPart(path, offset, length) {
    return new Uint8Array(await invoke<ArrayBuffer>("file_read_part", { path, offset, len: length }));
  },
  async writePart(path, offset, bytes) {
    await invoke("file_write_part", bytes, {
      headers: { "x-file-path": encodeURIComponent(path), "x-file-offset": String(offset) },
    });
  },
  async commit(tmp, final, sha256) {
    unwrap(await commands.fileCommit(tmp, final, sha256));
  },
  async remove(path) {
    unwrap(await commands.fileRemove(path));
  },
  async snapshot(name) {
    const info = unwrap(await commands.dbSnapshot(name));
    return { path: info.path, size: info.size_bytes, sha256: info.sha256 };
  },
};

const mailbox = createRelayClient(tauriTransport, null, { now: () => programClock().now().getTime() });

function centreEnv(): CentreEnv {
  return { db, clock: programClock(), vault: nativeVault, files: nativeFiles, mailbox };
}

async function engineEnv(): Promise<FilesEnv | null> {
  if (!(await deviceIdentity(db))) return null;
  const vault = await nativeVault.read();
  if (!vault) return null;
  return envFor(centreEnv(), vault, programAnchor());
}

// ─── Start-up state, before sign-in ──────────────────────────────────────────

let startup: SyncStartupState | null = null;
const startupListeners = new Set<(state: SyncStartupState | null) => void>();

function setStartup(next: SyncStartupState | null): void {
  startup = next;
  for (const listener of startupListeners) listener(next);
}

/** What the first screens show about sync before anybody signs in, or null when nothing. */
export function syncStartupState(): SyncStartupState | null {
  return startup;
}

export function subscribeSyncStartup(listener: (state: SyncStartupState | null) => void): () => void {
  startupListeners.add(listener);
  return () => startupListeners.delete(listener);
}

/**
 * The first thing start-up does for sync, before the anchor check: finish a
 * copy installed at the last run (a join, or a laptop starting again from the
 * full copy), and find out whether this laptop must catch up or join again.
 */
export async function prepareSync(): Promise<SyncStartupState | null> {
  const clock = programClock();
  const pending = unwrap(await commands.syncInstallPending());
  if (pending) {
    const note = JSON.parse(pending) as InstallNote;
    await finishInstall(db, clock, note);
    const anchor = programAnchor();
    if (anchor) await writeAnchor(db, anchor, clock.now().toISOString(), { accept: "ANSWERED" });
    unwrap(await commands.syncInstallPendingClear());
    await commands.syncTmpClear();
  }
  const rejoin = await detectRejoin(db, nativeVault);
  let catchingUp = false;
  if (!rejoin && (await deviceIdentity(db))) {
    // A restored database: take back from the mailbox what it had sent after that backup, before anyone works.
    const restored = await invoke<string | null>("restore_pending").catch(() => null);
    if (restored && !(await readState(db, "catchUp"))) {
      await writeState(db, "catchUp", { reason: "RESTORED", since: clock.now().toISOString(), done: 0, total: null });
    }
    catchingUp = (await readState(db, "catchUp")) !== null;
  }
  setStartup(rejoin || catchingUp ? { catchingUp, offline: false, rejoin, done: 0, total: null } : null);
  return startup;
}

// ─── The loop ────────────────────────────────────────────────────────────────

let running = false;

const loop = createSyncLoop({
  db,
  clock: programClock,
  env: engineEnv,
  later: (work, ms) => {
    const timer = window.setTimeout(work, ms);
    return () => window.clearTimeout(timer);
  },
  onRunning: (now) => {
    running = now;
    revalidatePath(SETTINGS_PATH);
  },
  onOutcome: (outcome) => void afterRound(outcome),
});

async function afterRound(outcome: RoundOutcome): Promise<void> {
  const current = startup;
  if (current?.catchingUp) {
    const still = (await readState(db, "catchUp")) !== null;
    if (!still) setStartup(current.rejoin ? { ...current, catchingUp: false } : null);
    else setStartup({ ...current, offline: outcome.kind === "OFFLINE" || outcome.kind === "LIMIT" });
  }
  if (outcome.kind === "REJOIN") setStartup({ catchingUp: false, offline: false, rejoin: true, done: 0, total: null });
}

/** Starts the sync loop (idempotent; nothing happens when sync is not set up). */
export function startSync(): void {
  loop.start();
}

export function stopSync(): void {
  loop.stop();
}

// ─── What the screens call ───────────────────────────────────────────────────

/** The status the bar and Settings › المزامنة show; any signed-in role, and before sign-in. */
export async function syncStatusQuery(): Promise<SyncStatus> {
  const ctx = buildContext(SYSTEM_SESSION, programClock());
  return syncStatus(db, ctx, { running, rejoin: startup?.rejoin ?? false });
}

async function asAction<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(SETTINGS_PATH);
    return { success: true, data };
  } catch (error) {
    const mapped = mailboxError(error);
    if (!(mapped instanceof ServiceError)) console.error(mapped);
    return { success: false, error: describeError(mapped) };
  }
}

const sessionContext = () => buildContext(currentSession(), programClock());

export function setUpSyncAction(input: SetUpSyncInput): Promise<ActionResult<{ deviceId: string }>> {
  return asAction(async () => {
    const ctx = sessionContext();
    if (await deviceIdentity(db)) throw new ServiceError(SYNC_ERRORS.alreadySetUp);
    try {
      unwrap(await commands.syncSetOrigin(input.origin.trim()));
    } catch {
      throw new ServiceError(SYNC_ERRORS.notMailbox);
    }
    const vault = await setUpCentre(centreEnv(), ctx, { setupKey: input.setupKey, deviceName: input.deviceName });
    loop.start();
    return { deviceId: vault.deviceId };
  });
}

export function addSecondLaptopAction(input: AddSecondLaptopInput): Promise<ActionResult<PairingCodeAnswer>> {
  return asAction(() => pairSecondLaptop(centreEnv(), sessionContext(), input));
}

export function removeLaptopAction(input: RemoveLaptopInput): Promise<ActionResult<{ removed: string }>> {
  return asAction(async () => {
    await removeOtherLaptop(centreEnv(), sessionContext(), input);
    return { removed: input.deviceId };
  });
}

export function leaveSyncAction(input: { reason: string }): Promise<ActionResult<{ left: true }>> {
  return asAction(async () => {
    await leaveCentre(centreEnv(), sessionContext(), input);
    loop.stop();
    setStartup(null);
    return { left: true as const };
  });
}

/** «مزامنة الآن»: a round now; any signed-in user. Answers the status after it. */
export function syncNowAction(): Promise<ActionResult<SyncStatus>> {
  return asAction(async () => {
    loop.start();
    await loop.now();
    return syncStatusQuery();
  });
}

/** Whether the first screen offers «الانضمام إلى مركز موجود». No session needed. */
export function mayJoinQuery(): Promise<boolean> {
  return asProgram.query((ex) => mayJoin(ex))(undefined);
}

async function install(path: string, note: InstallNote): Promise<void> {
  try {
    unwrap(await commands.syncInstallCopy(path, JSON.stringify(note)));
  } catch (error) {
    const message = messageOf(error);
    if (!message.startsWith("RESTORE_RELAUNCH:")) throw error;
    console.error("sync: the copy failed to install after the database was closed", message);
  }
  await relaunch();
}

/**
 * «الانضمام إلى مركز موجود», from the first screen, before anybody signs in:
 * the code redeemed, the full copy downloaded and installed, and the program
 * restarts on it. Throws a ServiceError the screen shows.
 */
export async function joinCentre(input: JoinCentreInput, onProgress?: (progress: JoinProgress) => void): Promise<void> {
  try {
    try {
      unwrap(await commands.syncSetOrigin(input.origin.trim()));
    } catch {
      throw new ServiceError(SYNC_ERRORS.notMailbox);
    }
    const { path, note } = await redeemAndDownload(centreEnv(), input, (phase, done, total) =>
      onProgress?.({ phase, done, total }),
    );
    onProgress?.({ phase: "INSTALL", done: 0, total: 1 });
    await install(path, note);
  } catch (error) {
    throw mailboxError(error);
  }
}

/**
 * Case 8 (and case 7 when the mailbox no longer holds what this laptop needs):
 * this laptop starts again from the full copy, keeping its identity.
 */
export async function rejoinFromFullCopy(onProgress?: (progress: JoinProgress) => void): Promise<void> {
  try {
    const { path, note } = await downloadForRejoin(
      centreEnv(),
      startup?.rejoin ? "REJOIN" : "CATCH_UP",
      (done, total) => onProgress?.({ phase: "COPY", done, total }),
    );
    onProgress?.({ phase: "INSTALL", done: 0, total: 1 });
    await install(path, note);
  } catch (error) {
    throw mailboxError(error);
  }
}
