import type { Capability } from "@/lib/access/catalogue";
import { can, requireCapability } from "@/lib/access/session";
import { COLUMN_TAGS } from "@/lib/db/column-tags";
import { newId } from "@/lib/db/rows";
import { logConsult, logDisclose, logErase, type DataSubject, type LogOwner } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { checkUploadFile, MANAGED_UPLOAD_PREFIX, RESTRICTED_SEGMENT, type UploadRule } from "@/lib/uploads";

/**
 * Stored files: photos, scans, PDFs (docs/data-model/DESIGN.md section 10).
 *
 * The bytes live under the program's data folder, at
 * `uploads/<Table>/<column>/<uuid>.<ext>`, and every file is a row of `Upload`.
 * A row that shows ONE file also holds the address in its own `...Url` column;
 * a SET of photos on one row is the `Upload` rows with field `photos`.
 *
 * Where the bytes go is behind `ByteStore`: the program's is the data folder
 * (src/server/uploads.ts), a test's is in memory.
 */
export interface ByteStore {
  /** `path` is relative to the data folder: "uploads/StaffMember/photoUrl/<uuid>.jpg". */
  write(path: string, bytes: Uint8Array): Promise<void>;
  read(path: string): Promise<Uint8Array>;
}

export function memoryByteStore(): ByteStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async write(path, bytes) {
      files.set(path, bytes);
    },
    async read(path) {
      const bytes = files.get(path);
      if (!bytes) throw new ServiceError("This file was not found.");
      return bytes;
    },
  };
}

/** The tables that hold a set of photos, all taken at a client's site. */
export const PHOTO_SET_ENTITIES = ["FirstVisit", "Visit", "Inspection"] as const;
export const PHOTO_SET_FIELD = "photos";

/** The settings whose value is a stored image. */
const SETTING_FILES: ReadonlySet<string> = new Set(["centre.logoUrl", "letterhead.headerUrl", "letterhead.footerUrl"]);

/**
 * Files that are always restricted, whatever the caller says, and the
 * capabilities that open each. The first is what the row stores.
 * (A `StaffDocument` or a sick note is restricted by its type: the owner passes
 * `restrictedCapability` for those.)
 */
const ALWAYS_RESTRICTED: Readonly<Record<string, readonly Capability[]>> = {
  // Pages 1 and 2 of his form: the health answers are on them. The hiring
  // score alone does not open them (audit LOG-1, coordinator's ruling).
  "StaffConfidential.signedFormScanUrl": ["staff.health.read"],
};

/** Whether a table and a column name a place a file can be stored for: a `...Url` column of the model, a photo set, an image setting. */
export function isUploadSlot(entity: string, field: string): boolean {
  if (entity === "Setting") return SETTING_FILES.has(field);
  if (field === PHOTO_SET_FIELD) return (PHOTO_SET_ENTITIES as readonly string[]).includes(entity);
  return COLUMN_TAGS[entity]?.[field] === "url";
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** The path, relative to the data folder, of a stored address. Throws on anything that is not one of ours. */
export function storagePathOf(url: string): string {
  if (!url.startsWith(MANAGED_UPLOAD_PREFIX)) throw new ServiceError("Invalid upload path.");
  const segments = url.slice(MANAGED_UPLOAD_PREFIX.length).split("/");
  const shaped =
    segments.length === 3
      ? segments[0] !== RESTRICTED_SEGMENT
      : segments.length === 4 && segments[0] === RESTRICTED_SEGMENT;
  if (
    !shaped ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\:\0]/.test(segment))
  ) {
    throw new ServiceError("Invalid upload path.");
  }
  return `uploads/${segments.join("/")}`;
}

export interface UploadFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export interface SaveUploadInput {
  /** The table whose row shows the file, and the column that holds its address (or "photos"). */
  entity: string;
  field: string;
  file: UploadFile;
  /** What the field accepts: one of the rules of src/lib/uploads.ts. */
  rule: UploadRule;
  /** Set for a file only some may open; it is then stored where the webview cannot load it. */
  restrictedCapability?: Capability | null;
  /** Required for a photo of a set: taken at a client's site, by a named employee, with the client's agreement. */
  photo?: {
    siteId: string;
    takenByEmployeeId: string;
    kind?: string | null;
    caption?: string | null;
    sortOrder?: number;
  };
}

/**
 * Stores a file and writes its `Upload` row.
 *
 * Call it BEFORE the transaction that saves the record, with the program's
 * database handle: writing bytes is not a database call and cannot be rolled
 * back. Inside the transaction, `linkUpload` then ties the file to its row. A
 * file whose row never arrived keeps an empty `ownerId` and is swept later.
 */
export async function saveUpload(
  ex: Executor,
  ctx: ServiceContext,
  store: ByteStore,
  input: SaveUploadInput,
): Promise<{ id: string; url: string }> {
  if (!isUploadSlot(input.entity, input.field))
    throw new Error(`uploads: ${input.entity}.${input.field} is not a place a file is stored for`);

  // The form already said so beside the field, in its own words; this is the last check.
  const problem = checkUploadFile({ type: input.file.type, size: input.file.bytes.byteLength }, input.rule);
  const extension = EXTENSIONS[input.file.type];
  if (problem === "type" || !extension) throw new ServiceError("This type of file is not accepted here.");
  if (problem === "size") throw new ServiceError("This file is too large.");

  const isPhotoOfSet = input.field === PHOTO_SET_FIELD;
  if (isPhotoOfSet) {
    // Article 8 of his worker form: photos at a client's place only by the supervisor, only when the client agreed.
    if (!input.photo) throw new Error("uploads: a photo of a set needs `photo` (the site and who took it)");
    const site = await ex
      .selectFrom("Site")
      .select("photoConsent")
      .where("id", "=", input.photo.siteId)
      .executeTakeFirst();
    if (!site?.photoConsent) throw new ServiceError("The client has not agreed to photos at this site.");
    // Taken by one of the centre's employees (a supervisor, the office), never by a cleaning worker.
    const taker = await ex
      .selectFrom("StaffMember")
      .select(["kind", "engagementStatus", "deletedAt"])
      .where("id", "=", input.photo.takenByEmployeeId)
      .executeTakeFirst();
    if (!taker || taker.kind !== "EMPLOYEE" || taker.deletedAt !== null || taker.engagementStatus === "LEFT") {
      throw new ServiceError("A photo at a client's site is taken by one of the centre's employees.");
    }
  }

  const forced = ALWAYS_RESTRICTED[`${input.entity}.${input.field}`];
  const restrictedCapability = forced ? forced[0] : (input.restrictedCapability ?? null);

  const id = newId();
  const name = `${id}.${extension}`;
  const segments = restrictedCapability
    ? [RESTRICTED_SEGMENT, input.entity, input.field, name]
    : [input.entity, input.field, name];
  const url = `${MANAGED_UPLOAD_PREFIX}${segments.join("/")}`;

  await store.write(storagePathOf(url), input.file.bytes);
  await ex
    .insertInto("Upload")
    .values({
      id,
      url,
      entity: input.entity,
      field: input.field,
      ownerId: null,
      kind: input.photo?.kind ?? null,
      caption: input.photo?.caption ?? null,
      takenByEmployeeId: input.photo?.takenByEmployeeId ?? null,
      sortOrder: input.photo?.sortOrder ?? 0,
      restrictedCapability,
      originalName: input.file.name || null,
      mimeType: input.file.type,
      sizeBytes: input.file.bytes.byteLength,
      sha256: await sha256Bytes(input.file.bytes),
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    })
    .execute();
  return { id, url };
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The site a photo of a set is taken at, read from the row it belongs to: a
 * first visit, a visit or an inspection all belong to a file, and a file to
 * one site. Null when the row does not exist.
 */
async function siteOfPhotoOwner(ex: Executor, entity: string, ownerId: string): Promise<string | null> {
  const table = PHOTO_OWNERS[entity];
  if (!table) return null;
  const row = await ex
    .selectFrom(`${table} as o` as "Visit as o")
    .innerJoin("File as f", "f.id", "o.fileId")
    .select("f.siteId")
    .where("o.id", "=", ownerId)
    .executeTakeFirst();
  return row?.siteId ?? null;
}

/** The tables whose rows hold a set of photos, each a file's (DESIGN.md section 10). */
const PHOTO_OWNERS: Readonly<Record<string, "FirstVisit" | "Visit" | "Inspection">> = {
  FirstVisit: "FirstVisit",
  Visit: "Visit",
  Inspection: "Inspection",
};

/**
 * Ties a stored file to the row that shows it. Inside the transaction that
 * saves that row. A photo of a set is checked again here, against the row's
 * own site: the site named when the bytes were stored is the caller's word,
 * the row's file is the database's.
 */
export async function linkUpload(ex: Executor, _ctx: ServiceContext, url: string, ownerId: string): Promise<void> {
  const upload = await ex
    .selectFrom("Upload")
    .select(["id", "entity", "field", "ownerId", "removedAt"])
    .where("url", "=", url)
    .executeTakeFirst();
  if (!upload || upload.removedAt) throw new ServiceError("This file was not found.");
  if (upload.ownerId === ownerId) return;
  if (upload.ownerId !== null) throw new ServiceError("This file already belongs to another record.");
  if (upload.field === PHOTO_SET_FIELD) {
    const siteId = await siteOfPhotoOwner(ex, upload.entity, ownerId);
    if (!siteId) throw new Error(`uploads: ${upload.entity} ${ownerId} has no file to take its site from`);
    const site = await ex.selectFrom("Site").select("photoConsent").where("id", "=", siteId).executeTakeFirst();
    if (!site?.photoConsent) throw new ServiceError("The client has not agreed to photos at this site.");
  }
  await ex.updateTable("Upload").set({ ownerId }).where("id", "=", upload.id).execute();
}

/**
 * Takes a file off its row: a replaced photo, a removed scan. The bytes stay
 * (ten years); the log keeps the removal as an ERASE. The caller clears its own
 * `...Url` column in the same transaction.
 */
export async function removeUpload(
  ex: Executor,
  ctx: ServiceContext,
  input: { url: string; owner: LogOwner; reason?: string; subject?: { kind: DataSubject; id: string; label?: string } },
): Promise<void> {
  const upload = await ex
    .selectFrom("Upload")
    .select(["id", "entity", "field", "ownerId", "removedAt"])
    .where("url", "=", input.url)
    .executeTakeFirst();
  if (!upload || upload.removedAt) return;
  await ex
    .updateTable("Upload")
    .set({ removedAt: ctx.now, removedByUserId: ctx.userId })
    .where("id", "=", upload.id)
    .execute();
  await logErase(ex, ctx, {
    owner: input.owner,
    action: "UPLOAD_REMOVE",
    reason: input.reason,
    entity: upload.entity,
    entityId: upload.ownerId ?? undefined,
    subject: input.subject,
    context: { field: upload.field, uploadId: upload.id },
  });
}

/** The files of a row that are still on it: one for a `...Url` column, several for a photo set, in their order. */
export async function listUploads(ex: Executor, input: { entity: string; ownerId: string; field?: string }) {
  let query = ex
    .selectFrom("Upload")
    .select([
      "id",
      "url",
      "field",
      "kind",
      "caption",
      "takenByEmployeeId",
      "sortOrder",
      "restrictedCapability",
      "originalName",
      "mimeType",
      "sizeBytes",
      "createdAt",
    ])
    .where("entity", "=", input.entity)
    .where("ownerId", "=", input.ownerId)
    .where("removedAt", "is", null);
  if (input.field) query = query.where("field", "=", input.field);
  return query.orderBy("sortOrder").orderBy("createdAt").execute();
}

/** Whether this user may open a restricted file. An ordinary file is open to whoever can see its row. */
export function canOpenUpload(
  ctx: ServiceContext,
  upload: { entity: string; field: string; restrictedCapability: string | null },
): boolean {
  if (!upload.restrictedCapability) return true;
  const opens = ALWAYS_RESTRICTED[`${upload.entity}.${upload.field}`] ?? [upload.restrictedCapability as Capability];
  return opens.some((capability) => can(ctx, capability));
}

/**
 * Opens a restricted file: checks the capability, writes the CONSULT entry,
 * and only then returns the bytes. The only way to read one: the webview
 * cannot load anything under `uploads/restricted/`.
 */
export async function readRestrictedUpload(
  ex: Executor,
  ctx: ServiceContext,
  store: ByteStore,
  input: { url: string; owner: LogOwner; reason?: string; subject?: { kind: DataSubject; id: string; label?: string } },
): Promise<{ bytes: Uint8Array; mimeType: string; originalName: string | null }> {
  const upload = await ex
    .selectFrom("Upload")
    .select([
      "id",
      "entity",
      "field",
      "ownerId",
      "restrictedCapability",
      "mimeType",
      "originalName",
      "removedAt",
      "purgedAt",
    ])
    .where("url", "=", input.url)
    .executeTakeFirst();
  if (!upload || upload.purgedAt) throw new ServiceError("This file was not found.");
  if (!upload.restrictedCapability) throw new Error("uploads: this file is not restricted; show it with useUploadSrc");
  if (!canOpenUpload(ctx, upload)) throw new ServiceError("You do not have permission to do this.");

  await logConsult(ex, ctx, {
    owner: input.owner,
    action: "VIEW_RESTRICTED",
    reason: input.reason,
    entity: upload.entity,
    entityId: upload.ownerId ?? undefined,
    subject: input.subject,
    context: { field: upload.field, uploadId: upload.id },
  });
  return {
    bytes: await store.read(storagePathOf(input.url)),
    mimeType: upload.mimeType,
    originalName: upload.originalName,
  };
}

/** The signed worker form: a copy leaves only as the printed form does (ruling 31). */
const SIGNED_FORM = "StaffConfidential.signedFormScanUrl";

/**
 * Records a copy of a stored file saved outside the program (`saveUploadCopy`
 * in src/server/uploads.ts), before a byte is copied: every export is a
 * disclosure (DESIGN.md section 9; audit LOG-5).
 *
 *  - Any stored file but the program's own pictures (logo, letterhead): a
 *    DISCLOSE entry, `EXPORT`, to the place chosen, with the person it
 *    concerns when the caller names him.
 *  - A restricted file: only for a capability that opens it.
 *  - The signed worker form (his pages 1 and 2, health answers on them): as
 *    for printing the filled form, `staff.printFilledForm` and the reason the
 *    user typed.
 */
export async function recordUploadCopy(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    url: string;
    /** Where the copy goes: the disclosure's recipient. */
    target: string;
    owner?: LogOwner;
    reason?: string;
    subject?: { kind: DataSubject; id: string; label?: string };
  },
): Promise<void> {
  const upload = await ex
    .selectFrom("Upload")
    .select(["id", "entity", "field", "ownerId", "restrictedCapability", "purgedAt"])
    .where("url", "=", input.url)
    .executeTakeFirst();
  if (!upload || upload.purgedAt) throw new ServiceError("This file was not found.");
  if (!canOpenUpload(ctx, upload)) throw new ServiceError("You do not have permission to do this.");
  const reason = input.reason?.trim() || undefined;
  if (`${upload.entity}.${upload.field}` === SIGNED_FORM) {
    requireCapability(ctx, "staff.printFilledForm");
    if (!reason) throw new ServiceError("A reason is required.");
  }
  if (upload.entity === "Setting") return;
  await logDisclose(ex, ctx, {
    owner: input.owner ?? "FOUNDATION",
    action: "EXPORT",
    disclosure: "EXPORT",
    recipient: input.target,
    reason,
    entity: upload.entity,
    entityId: upload.ownerId ?? undefined,
    subject: input.subject,
    context: { field: upload.field, uploadId: upload.id },
  });
}
