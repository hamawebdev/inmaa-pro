import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Backup and restore.
 *
 * New in the desktop build. The web app never needed it — its data lived in a
 * managed PostgreSQL instance — but an offline system with everything in one
 * local file has no other recovery path if that file is lost.
 *
 * A backup is the SQLite file plus a sibling folder of uploads. The copying
 * runs in Rust (src-tauri/src/backup.rs): the destination is wherever the user
 * points the dialog, and tauri-plugin-fs scopes have to be declared up front,
 * so doing it here would mean granting the webview blanket disk access.
 */

/**
 * Dialog chrome is user-visible, so the labels come from the caller's
 * translations rather than being hardcoded here — this module has no hooks.
 */
export type DialogLabels = { title: string; filterName: string };

/**
 * `cancelled` is a distinct outcome rather than an error string: the caller has
 * to tell "the user backed out" apart from "it failed", and comparing against a
 * message would break the moment that message is translated.
 */
export type BackupResult =
  | { success: true; path: string }
  | { success: false; cancelled: true }
  | { success: false; cancelled: false; error: string };
export type RestoreResult =
  | { success: true }
  | { success: false; cancelled: true }
  | { success: false; cancelled: false; error: string };

export async function backupDatabase(labels: DialogLabels): Promise<BackupResult> {
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const target = await save({
      title: labels.title,
      defaultPath: `inmaa-backup-${stamp}.db`,
      filters: [{ name: labels.filterName, extensions: ["db"] }],
    });
    if (!target) return { success: false, cancelled: true };

    // Fold the write-ahead log into the main file first, or the copy would be
    // missing everything written this session.
    await invoke("db_checkpoint");
    await invoke("backup_to", { target });

    return { success: true, path: target };
  } catch (error) {
    return { success: false, cancelled: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function restoreDatabase(labels: DialogLabels): Promise<RestoreResult> {
  try {
    const source = await openDialog({
      title: labels.title,
      multiple: false,
      directory: false,
      filters: [{ name: labels.filterName, extensions: ["db"] }],
    });
    if (!source || Array.isArray(source)) return { success: false, cancelled: true };

    await invoke("db_checkpoint");
    await invoke("restore_from", { source });

    // The open connection still has the replaced file mapped, so continuing
    // in-process would serve stale pages. Relaunch against the restored data.
    await relaunch();
    return { success: true };
  } catch (error) {
    return { success: false, cancelled: false, error: error instanceof Error ? error.message : String(error) };
  }
}
