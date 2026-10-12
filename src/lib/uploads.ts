const MB = 1024 * 1024;

/**
 * A stored file's address, as the database holds it:
 *
 *     /uploads/<Table>/<column>/<uuid>.<ext>
 *     /uploads/restricted/<Table>/<column>/<uuid>.<ext>      opened only through readRestrictedUpload
 *
 * Never a web address: see `pathnameOf` below.
 */
export const MANAGED_UPLOAD_PREFIX = "/uploads/";
export const RESTRICTED_SEGMENT = "restricted";

export type UploadRule = {
  accept: string;
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
};

export const PHOTO_UPLOAD_RULE: UploadRule = {
  accept: "image/jpeg,image/png,image/webp",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSizeBytes: 10 * MB,
};

export const LOGO_UPLOAD_RULE: UploadRule = {
  accept: "image/jpeg,image/png,image/webp",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSizeBytes: 5 * MB,
};

export const CV_UPLOAD_RULE: UploadRule = {
  accept: "application/pdf",
  allowedMimeTypes: ["application/pdf"],
  maxSizeBytes: 20 * MB,
};

export const RECEIPT_UPLOAD_RULE: UploadRule = {
  accept: "image/jpeg,image/png,image/webp,application/pdf",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  maxSizeBytes: 20 * MB,
};

/**
 * A size as the number and the unit it is shown in. The unit is a code rather
 * than a word, so a screen can word it in the reader's language ("Mo",
 * "ميغابايت") — see `MediaUploadField`.
 */
export function getFileSizeParts(bytes: number): { value: number; unit: "MB" | "KB" } {
  if (bytes >= MB) {
    return { value: Math.round((bytes / MB) * 10) / 10, unit: "MB" };
  }

  return { value: Math.round(bytes / 1024), unit: "KB" };
}

export function formatFileSize(bytes: number) {
  const { value, unit } = getFileSizeParts(bytes);
  return `${value} ${unit}`;
}

/** The file types a rule accepts, named the way users know them (JPG, PDF…). */
export function getAllowedExtensions(rule: UploadRule): string[] {
  return rule.allowedMimeTypes.map((mimeType) => {
    switch (mimeType) {
      case "image/jpeg":
        return "JPG";
      case "image/png":
        return "PNG";
      case "image/webp":
        return "WebP";
      case "application/pdf":
        return "PDF";
      default:
        return mimeType;
    }
  });
}

export function getAllowedExtensionsLabel(rule: UploadRule) {
  return getAllowedExtensions(rule).join(", ");
}

export type UploadProblem = "type" | "size";

/** What a rule looks at: a `File` has both. */
export type UploadMeta = { type: string; size: number };

/**
 * What is wrong with a file under `rule`, if anything — as a code, so the screen
 * can word it in the active language. `validateUploadFile` is the same check
 * worded in English, for the server side of an upload.
 */
export function checkUploadFile(file: UploadMeta, rule: UploadRule): UploadProblem | undefined {
  if (!rule.allowedMimeTypes.includes(file.type)) {
    return "type";
  }

  if (file.size > rule.maxSizeBytes) {
    return "size";
  }

  return undefined;
}

export function validateUploadFile(file: UploadMeta, rule: UploadRule, label: string) {
  switch (checkUploadFile(file, rule)) {
    case "type":
      return `${label} must be ${getAllowedExtensionsLabel(rule)}.`;
    case "size":
      return `${label} must be ${formatFileSize(rule.maxSizeBytes)} or smaller.`;
    default:
      return undefined;
  }
}

/**
 * The path part of a stored address: everything before a `?` or a `#`.
 *
 * Stored addresses are always paths of this program's own (`/uploads/…`),
 * never web addresses, so this is plain text handling. It deliberately does not
 * go through `new URL()`, which would need a made-up web address as its base —
 * and no web address belongs in a program that is offline by rule.
 */
function pathnameOf(value: string): string {
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

export function isManagedUploadUrl(url?: string | null) {
  if (!url) return false;

  try {
    const pathname = pathnameOf(url);
    return pathname.startsWith(MANAGED_UPLOAD_PREFIX);
  } catch {
    return false;
  }
}

export function getManagedUploadPathSegments(url?: string | null) {
  if (!url) return null;

  try {
    const pathname = pathnameOf(url);
    if (!pathname.startsWith(MANAGED_UPLOAD_PREFIX)) return null;

    return pathname
      .slice(MANAGED_UPLOAD_PREFIX.length)
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

/** Whether an address names a file only some may open. Such a file is never shown by its address. */
export function isRestrictedUploadUrl(url?: string | null) {
  return getManagedUploadPathSegments(url)?.[0] === RESTRICTED_SEGMENT;
}

export function isPdfUrl(url?: string | null) {
  if (!url) return false;

  try {
    const pathname = pathnameOf(url).toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return false;
  }
}

export function getMediaFileName(value?: string | File | null) {
  if (!value) return "";

  if (value instanceof File) {
    return value.name;
  }

  try {
    const pathname = pathnameOf(value);
    const segment = pathname.split("/").filter(Boolean).at(-1);
    return segment ? decodeURIComponent(segment) : value;
  } catch {
    return value;
  }
}
