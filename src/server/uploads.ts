import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";

import { currentSession } from "@/lib/access/session";
import {
  readRestrictedUpload,
  recordUploadCopy,
  saveUpload,
  storagePathOf,
  type ByteStore,
  type SaveUploadInput,
} from "@/lib/attachments";
import { db } from "@/lib/db";
import type { DataSubject, LogOwner } from "@/lib/log";
import { transact } from "@/lib/service/action";
import { buildContext } from "@/lib/service/context";
import { describeError } from "@/lib/service/errors";
import { programClock } from "@/lib/service/program";
import {
  getMediaFileName,
  getManagedUploadPathSegments,
  isManagedUploadUrl,
  isRestrictedUploadUrl,
} from "@/lib/uploads";

export { linkUpload, listUploads, removeUpload } from "@/lib/attachments";

/**
 * Stored files in the running program: the bytes go under the program's data
 * folder, `{appDataDir}/uploads/`, and ordinary ones are shown through Tauri's
 * asset protocol. The rules (the `Upload` row, restricted files, photo consent)
 * are in src/lib/attachments, which a test drives with a store in memory; this
 * file only binds them to the data folder, the database and whoever is signed in.
 */
const programStore: ByteStore = {
  async write(path, bytes) {
    await mkdir(path.slice(0, path.lastIndexOf("/")), { baseDir: BaseDirectory.AppData, recursive: true });
    await writeFile(path, bytes, { baseDir: BaseDirectory.AppData });
  },
  read(path) {
    return readFile(path, { baseDir: BaseDirectory.AppData });
  },
};

/**
 * Stores a file the user picked and returns its address.
 *
 * Call it BEFORE the action that saves the record, never inside a service:
 * writing bytes cannot be rolled back, and inside a transaction this would
 * wait for the transaction's own connection. The service then calls
 * `linkUpload(ex, ctx, url, rowId)` and writes the address in its own column.
 * It throws a `ServiceError` whose sentence has a translation.
 */
export async function saveManagedUpload(input: Omit<SaveUploadInput, "file"> & { file: File }): Promise<string> {
  const ctx = buildContext(currentSession(), programClock());
  const file = { name: input.file.name, type: input.file.type, bytes: new Uint8Array(await input.file.arrayBuffer()) };
  const { url } = await saveUpload(db, ctx, programStore, { ...input, file });
  return url;
}

/** A picture that is already in the page: a file just picked, or an inline image. */
export function isInlineImageSrc(url: string): boolean {
  return url.startsWith("blob:") || url.startsWith("data:image/");
}

/**
 * Turn a stored address into one the webview can load.
 *
 * Anything that is not one of this program's own stored uploads resolves to
 * nothing. A web address that found its way into the data (an edited database,
 * an imported row) is not something to go and fetch: the program is offline.
 * A restricted file resolves to nothing too: it is opened with
 * `openRestrictedUpload`, which checks who asks and writes the log.
 */
export async function resolveUploadSrc(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (isInlineImageSrc(url)) return url;
  if (!isManagedUploadUrl(url) || isRestrictedUploadUrl(url)) return null;

  try {
    return convertFileSrc(await join(await appDataDir(), storagePathOf(url)));
  } catch {
    return null;
  }
}

export interface RestrictedUploadRequest {
  url: string;
  /** Which part of the program asks, and whose data it is: both go in the log. */
  owner: LogOwner;
  subject?: { kind: DataSubject; id: string; label?: string };
  reason?: string;
}

/**
 * Opens a restricted file for the signed-in user and returns something an
 * `<img>` can show (a `blob:` address; the caller revokes it when done).
 * Every call is one line of the log. Throws a `ServiceError`.
 */
export async function openRestrictedUpload(
  request: RestrictedUploadRequest,
): Promise<{ src: string; mimeType: string }> {
  const { bytes, mimeType } = await transact((ex, ctx) => readRestrictedUpload(ex, ctx, programStore, request));
  return { src: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType })), mimeType };
}

/** What the log says of a copy: which part of the program asks, whose data it is, and the reason typed where one is needed. */
export type UploadCopyLog = Partial<Omit<RestrictedUploadRequest, "url">>;

export type SaveCopyResult =
  | { success: true; path: string }
  | { success: false; cancelled: true }
  | { success: false; cancelled: false; error: string };

/**
 * Hands the user a copy of a stored upload, in a place they choose.
 *
 * This is how a stored PDF is read. The program opens no browser and follows no
 * link out of its window, so a scan, a CV or a receipt is saved somewhere and
 * opened with whatever the PC reads PDFs with. Images are shown in the program
 * itself; a copy of one can be saved the same way.
 *
 * The copy is a disclosure: it is checked and logged (`recordUploadCopy`,
 * src/lib/attachments) after the place is chosen and before anything leaves
 * the data folder. Name the person the file concerns in `log.subject`. The
 * signed worker form also needs `log.reason`, typed by the user, and
 * `staff.printFilledForm`, as its printing does.
 *
 * The copying runs in Rust (`export_upload` in src-tauri/src/backup.rs), for the
 * same reason backup does: the destination is wherever the dialog points.
 */
export async function saveUploadCopy(
  url: string | null | undefined,
  dialogTitle: string,
  log: UploadCopyLog = {},
): Promise<SaveCopyResult> {
  try {
    const segments = getManagedUploadPathSegments(url);
    if (!url || !segments) return { success: false, cancelled: false, error: "Invalid upload path." };
    storagePathOf(url);

    const target = await save({ title: dialogTitle, defaultPath: getMediaFileName(url) });
    if (!target) return { success: false, cancelled: true };

    await transact((ex, ctx) => recordUploadCopy(ex, ctx, { ...log, url, target }));
    await invoke("export_upload", { segments, target });
    return { success: true, path: target };
  } catch (error) {
    return { success: false, cancelled: false, error: describeError(error) };
  }
}
