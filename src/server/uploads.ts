import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, exists, mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";

import type * as clientsUploads from "@/features/clients/uploads";
import type * as coreUploads from "@/features/core/uploads";
import type * as moneyUploads from "@/features/money/uploads";
import type * as operationsUploads from "@/features/operations/uploads";
import type * as peopleUploads from "@/features/people/uploads";
import type * as stockUploads from "@/features/stock/uploads";
import {
  getMediaFileName,
  getManagedUploadPathSegments,
  isManagedUploadUrl,
  MANAGED_UPLOAD_PREFIX,
  type UploadRule,
  validateUploadFile,
} from "@/lib/uploads";

/**
 * Managed file storage, backed by the app data directory.
 *
 * The web app wrote these under an uploads root on the server and served them
 * through an /api/uploads route. Here they live in {appDataDir}/uploads/ and are
 * read through Tauri's asset protocol. The stored URL keeps the exact same
 * `/api/uploads/{adminId}/{entity}/{field}/{file}` shape, so existing photoUrl /
 * cvUrl / receiptUrl values and all the helpers in src/lib/uploads.ts still work
 * — only `resolveUploadSrc` is new, to turn one into something <img> can load.
 */

const UPLOADS_DIR = "uploads";

type FolderUploads =
  | typeof coreUploads
  | typeof peopleUploads
  | typeof clientsUploads
  | typeof operationsUploads
  | typeof moneyUploads
  | typeof stockUploads;

/**
 * The kinds of record that can have files, and the kinds of file. Each feature
 * folder names its own in `src/features/<folder>/uploads.ts`; nobody edits this
 * file to add one.
 */
export type UploadEntity = FolderUploads["uploadEntities"][number];
export type UploadField = FolderUploads["uploadFields"][number];

function getExtensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

/**
 * Guards against a crafted URL escaping the uploads directory. The segments come
 * from stored values, but those values are only ever as trustworthy as the
 * database file, which the user can edit.
 */
function assertSafeSegments(segments: string[]): asserts segments is [string, string, string, string] {
  if (segments.length !== 4) {
    throw new Error("Invalid upload path.");
  }
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")) {
      throw new Error("Invalid upload path.");
    }
  }
}

function relativePath(segments: string[]): string {
  assertSafeSegments(segments);
  return [UPLOADS_DIR, ...segments].join("/");
}

function toManagedUrl(segments: string[]): string {
  return `${MANAGED_UPLOAD_PREFIX}${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export async function saveManagedUpload({
  adminId,
  entity,
  field,
  file,
  rule,
  label,
}: {
  adminId: string;
  entity: UploadEntity;
  field: UploadField;
  file: File;
  rule: UploadRule;
  label: string;
}): Promise<string> {
  const validationError = validateUploadFile(file, rule, label);
  if (validationError) {
    throw new Error(validationError);
  }

  const extension = getExtensionForMimeType(file.type);
  if (!extension) {
    throw new Error(`${label} must be a supported file type.`);
  }

  const segments = [adminId, entity, field, `${crypto.randomUUID()}.${extension}`];
  const path = relativePath(segments);

  await mkdir([UPLOADS_DIR, adminId, entity, field].join("/"), {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  });
  await writeFile(path, new Uint8Array(await file.arrayBuffer()), { baseDir: BaseDirectory.AppData });

  return toManagedUrl(segments);
}

export async function deleteManagedUpload(url?: string | null): Promise<void> {
  if (!isManagedUploadUrl(url)) return;

  const segments = getManagedUploadPathSegments(url);
  if (!segments) return;

  const path = relativePath(segments);
  // Deleting an upload that is already gone is not an error — callers use this
  // to clean up after a failed write.
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return;
  await remove(path, { baseDir: BaseDirectory.AppData });
}

export async function deleteManagedUploads(urls: Array<string | null | undefined>): Promise<void> {
  for (const url of urls) {
    await deleteManagedUpload(url);
  }
}

export async function readManagedUpload(segments: string[]): Promise<Uint8Array> {
  return readFile(relativePath(segments), { baseDir: BaseDirectory.AppData });
}

/** A picture that is already in the page: a file just picked, or an inline image. */
export function isInlineImageSrc(url: string): boolean {
  return url.startsWith("blob:") || url.startsWith("data:image/");
}

/**
 * Turn a stored managed-upload URL into one the webview can actually load.
 *
 * Anything that is not one of this program's own stored uploads resolves to
 * nothing. A web address that found its way into the data (an edited database,
 * an imported row) is not something to go and fetch: the program is offline.
 */
export async function resolveUploadSrc(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (isInlineImageSrc(url)) return url;
  if (!isManagedUploadUrl(url)) return null;

  const segments = getManagedUploadPathSegments(url);
  if (!segments) return null;

  assertSafeSegments(segments);
  return convertFileSrc(await join(await appDataDir(), UPLOADS_DIR, ...segments));
}

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
 * The copying runs in Rust (`export_upload` in src-tauri/src/backup.rs), for the
 * same reason backup does: the destination is wherever the dialog points.
 */
export async function saveUploadCopy(url: string | null | undefined, dialogTitle: string): Promise<SaveCopyResult> {
  try {
    const segments = getManagedUploadPathSegments(url);
    if (!segments) return { success: false, cancelled: false, error: "Invalid upload path." };
    assertSafeSegments(segments);

    const target = await save({ title: dialogTitle, defaultPath: getMediaFileName(url) });
    if (!target) return { success: false, cancelled: true };

    await invoke("export_upload", { segments, target });
    return { success: true, path: target };
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return { success: false, cancelled: false, error: message ?? String(error) };
  }
}
