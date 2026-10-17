import { invoke } from "@tauri-apps/api/core";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

import { APP_CONFIG } from "@/config/app-config";
import {
  assessRestoreQuery,
  backupAsProgram,
  beginBackupAction,
  readBackupSettingsQuery,
  recordBackupRunAction,
  type BackupKind,
  type BackupManifest,
  type FolderCheck,
} from "@/features/core/services/backups";
import { currentSession } from "@/lib/access/session";
import { toLocal } from "@/lib/clock";
import { anchorNow } from "@/lib/service/action";
import { programClock } from "@/lib/service/program";

/**
 * Backup and restore, on the desktop side.
 *
 * A backup is the SQLite file, a sibling folder of uploads, and a manifest
 * beside them saying what the copy holds. The copying runs in Rust
 * (src-tauri/src/backup.rs): the destination is wherever the user points, and
 * the window's own file permissions stop at its uploads folder. What a backup
 * *is* to the database (whether today's is due, its row in `BackupRun`, its
 * line in the log, the folders refused) is in
 * src/features/core/services/backups.ts, where it is tested.
 */

/** Dialog titles are user-visible, so they come from the caller's translations. */
export type DialogLabels = { title: string; filterName: string };

export type BackupOutcome =
  | { done: true; path: string }
  | { done: false; cancelled: true }
  | { done: false; cancelled: false; error: string };

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);

/** A moment as a file name part, in the centre's own time: `2026-10-12-09-00-00`. */
function stamp(): string {
  const clock = programClock();
  const now = clock.now();
  const local = toLocal(now.toISOString(), clock.utcOffsetMin);
  return `${local.date}-${local.time.replace(":", "-")}-${String(now.getUTCSeconds()).padStart(2, "0")}`;
}

/** What Rust can tell about a folder: whether it is there, can be written, and is synchronised to a cloud. */
export async function checkBackupFolder(dir: string): Promise<FolderCheck> {
  const found = await invoke<{ exists: boolean; writable: boolean; synced_by: string | null }>("backup_folder_check", {
    dir,
  });
  return { exists: found.exists, writable: found.writable, syncedBy: found.synced_by };
}

/** Lets the manager pick the folder of the daily copy. Null when he backs out. */
export async function chooseBackupFolder(title: string): Promise<{ dir: string; check: FolderCheck } | null> {
  const dir = await openDialog({ title, directory: true, multiple: false });
  if (!dir || Array.isArray(dir)) return null;
  return { dir, check: await checkBackupFolder(dir) };
}

/**
 * One copy, start to finish: the anchor first (it must not be behind the copy
 * it sits beside); then who asks is checked and the copy is logged as a
 * disclosure, before a byte moves (`beginBackup`, audit LOG-3); the
 * checkpoint, the copy, its manifest, then its row. A copy that fails is
 * recorded as tried.
 */
async function copyDatabase(kind: BackupKind, target: string): Promise<BackupOutcome> {
  const automatic = kind === "AUTO";
  const startedAt = programClock().now().toISOString();
  const begin = automatic ? backupAsProgram.begin : beginBackupAction;
  const record = automatic ? backupAsProgram.record : recordBackupRunAction;

  let runId: string;
  let manifest: BackupManifest;
  try {
    await anchorNow();
    const begun = await begin({ kind, targetPath: target, appVersion: APP_CONFIG.version });
    if (!begun.success) return { done: false, cancelled: false, error: begun.error };
    ({ runId, manifest } = begun.data);
  } catch (error) {
    return { done: false, cancelled: false, error: messageOf(error) };
  }
  try {
    // Fold the write-ahead log into the main file first, or the copy would be
    // missing everything written this session.
    await invoke("db_checkpoint");
    const copy = await invoke<{ size_bytes: number; sha256: string }>("backup_to", { target });
    manifest.sha256 = copy.sha256;
    await invoke("save_text_file", {
      target: target.replace(/\.db$/i, "") + ".json",
      contents: `${JSON.stringify(manifest, null, 2)}\n`,
    });
    const saved = await record({
      runId,
      kind,
      targetPath: target,
      startedAt,
      manifest,
      result: { ok: true, sizeBytes: copy.size_bytes },
    });
    if (!saved.success) return { done: false, cancelled: false, error: saved.error };
    return { done: true, path: target };
  } catch (error) {
    const reason = messageOf(error);
    await record({ runId, kind, targetPath: target, startedAt, manifest, result: { ok: false, error: reason } });
    return { done: false, cancelled: false, error: sentenceOf(reason) };
  }
}

/**
 * What stopped a copy, as a sentence the window translates (`Errors` in core's
 * messages): Rust answers `FOLDER_SYNCED:<client>` when a cloud client
 * synchronises the folder. Anything else is passed on as it is.
 */
function sentenceOf(reason: string): string {
  if (reason.startsWith("FOLDER_SYNCED:")) {
    const client = reason.slice("FOLDER_SYNCED:".length);
    return `This folder is synchronised by ${client}. Choose a folder that stays on this PC or on a USB drive.`;
  }
  return reason;
}

/** «نسخة احتياطية الآن»: a copy where the user says, never into a folder a cloud client synchronises. */
export async function backupDatabase(labels: DialogLabels): Promise<BackupOutcome> {
  try {
    const settings = await readBackupSettingsQuery(undefined).catch(() => null);
    const name = `inmaa-backup-${stamp()}.db`;
    const target = await save({
      title: labels.title,
      defaultPath: settings?.targetDir ? await join(settings.targetDir, name) : name,
      filters: [{ name: labels.filterName, extensions: ["db"] }],
    });
    if (!target) return { done: false, cancelled: true };
    // Checked before anything is written; Rust refuses it again in `backup_to`, for every caller.
    const check = await checkBackupFolder(await dirname(target));
    if (check.syncedBy) return { done: false, cancelled: false, error: sentenceOf(`FOLDER_SYNCED:${check.syncedBy}`) };
    return await copyDatabase("MANUAL", target);
  } catch (error) {
    return { done: false, cancelled: false, error: messageOf(error) };
  }
}

/** What stopped today's automatic copy, kept so that an hourly retry does not write the same line again. */
let lastAutomaticFailure: string | null = null;

/**
 * The daily copy: made once a day into the folder the manager chose, then the
 * oldest automatic copies beyond `backup.keepCount` are removed. The folder is
 * checked again every time: a USB stick that is not plugged in, or a folder a
 * cloud client has started to synchronise, stops the copy and is recorded.
 */
export async function runAutomaticBackup(): Promise<"done" | "not-due" | "failed"> {
  let plan: Awaited<ReturnType<typeof backupAsProgram.plan>>;
  try {
    plan = await backupAsProgram.plan(undefined);
  } catch (error) {
    console.error("backup: the plan could not be read", error);
    return "failed";
  }
  if (!plan.due) return "not-due";

  const target = await join(plan.targetDir, plan.fileName);
  let refusal: string | null = null;
  try {
    const check = await checkBackupFolder(plan.targetDir);
    if (check.syncedBy) refusal = `FOLDER_SYNCED:${check.syncedBy}`;
    else if (!check.exists) refusal = "FOLDER_MISSING";
    else if (!check.writable) refusal = "FOLDER_READ_ONLY";
  } catch (error) {
    refusal = messageOf(error);
  }
  if (refusal) {
    const today = `${plan.fileName}:${refusal}`;
    if (lastAutomaticFailure !== today) {
      lastAutomaticFailure = today;
      const manifest = await backupAsProgram.describe({ appVersion: APP_CONFIG.version });
      await backupAsProgram.record({
        kind: "AUTO",
        targetPath: target,
        startedAt: programClock().now().toISOString(),
        manifest,
        result: { ok: false, error: refusal },
      });
    }
    return "failed";
  }

  const outcome = await copyDatabase("AUTO", target);
  if (!outcome.done) return "failed";
  lastAutomaticFailure = null;
  try {
    await invoke("backup_rotate", { dir: plan.targetDir, keep: plan.keepCount });
  } catch (error) {
    // The copy is made. Old copies left behind cost room, not safety.
    console.error("backup: rotation failed", error);
  }
  return "done";
}

// ── Restore ─────────────────────────────────────────────────────────────────

export interface RestoreCandidate {
  source: string;
  manifest: BackupManifest | null;
  assessment: Awaited<ReturnType<typeof assessRestoreQuery>>;
}

/** The manager picks a copy; the program says what restoring it would cost. Nothing is touched yet. */
export async function chooseRestoreSource(labels: DialogLabels): Promise<RestoreCandidate | null> {
  const source = await openDialog({
    title: labels.title,
    multiple: false,
    directory: false,
    filters: [{ name: labels.filterName, extensions: ["db"] }],
  });
  if (!source || Array.isArray(source)) return null;
  let manifest: BackupManifest | null = null;
  try {
    const text = await invoke<string | null>("backup_manifest", { source });
    const parsed = text ? (JSON.parse(text) as Partial<BackupManifest>) : null;
    if (parsed && typeof parsed.databaseId === "string" && parsed.legal && parsed.heads) {
      manifest = parsed as BackupManifest;
    }
  } catch {
    manifest = null; // A manifest that cannot be read says nothing: the screen warns.
  }
  return { source, manifest, assessment: await assessRestoreQuery({ manifest }) };
}

/** What a restore leaves for the next start (Rust keeps it beside the database). */
export interface RestoreNote {
  restoredFromPath: string;
  preRestorePath: string | null;
  reason: string;
  at: string;
  byUserName: string;
}

/**
 * The guarded restore: a protected copy of the database as it is now, then the
 * replacement, then a restart. The restored database cannot say that it was
 * restored, so a note is left for the next start, which asks the manager when
 * the anchor does not agree and records the act in the restored database.
 */
export async function restoreDatabase(input: {
  source: string;
  reason: string;
}): Promise<{ done: false; error: string | null }> {
  try {
    const settings = await readBackupSettingsQuery(undefined);
    const folder = settings.targetDir.trim() || (await join(await appDataDir(), "pre-restore"));
    const preRestore = await copyDatabase("PRE_RESTORE", await join(folder, `inmaa-pre-restore-${stamp()}.db`));
    // No copy of what is about to be replaced, no restore.
    if (!preRestore.done) return { done: false, error: preRestore.cancelled ? null : preRestore.error };
    const note: RestoreNote = {
      restoredFromPath: input.source,
      preRestorePath: preRestore.path,
      reason: input.reason.trim(),
      at: programClock().now().toISOString(),
      byUserName: currentSession().userName,
    };
    await invoke("db_checkpoint");
    try {
      // Rust checks the file is this program's database before anything is replaced (audit FND-04).
      await invoke("restore_from", { source: input.source, note: JSON.stringify(note) });
    } catch (error) {
      // Refused before anything was touched: say why. Failed after the open database was closed:
      // the files were put back as they were, and the program must start again either way.
      const message = messageOf(error);
      if (!message.startsWith("RESTORE_RELAUNCH:")) return { done: false, error: message };
      console.error("restore: failed after the database was closed", message);
    }
    // The open connection was closed for the swap: start again on the database now in place.
    await relaunch();
    // Only reached while the restart is on its way: there is nothing to report.
    return { done: false, error: null };
  } catch (error) {
    return { done: false, error: messageOf(error) };
  }
}

/** The note the last restore left, or null. Read at start, cleared once the act is recorded. */
export async function readRestoreNote(): Promise<RestoreNote | null> {
  try {
    const text = await invoke<string | null>("restore_pending");
    const note = text ? (JSON.parse(text) as Partial<RestoreNote>) : null;
    return note && typeof note.restoredFromPath === "string" ? (note as RestoreNote) : null;
  } catch {
    return null;
  }
}

export async function clearRestoreNote(): Promise<void> {
  await invoke("restore_pending_clear");
}
