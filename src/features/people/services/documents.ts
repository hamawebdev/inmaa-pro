import { isDate } from "@/features/people/rules/dates";
import { STAFF_DOCUMENT_TYPES, type StaffDocumentType } from "@/features/people/validators/staff-codes";
import { can, requireCapability, requireSection } from "@/lib/access/session";
import { linkUpload, listUploads, removeUpload } from "@/lib/attachments";
import { newId } from "@/lib/db/rows";
import { logChange, WITHHELD } from "@/lib/log";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { staffName } from "@/lib/text/names";
import { localDate } from "@/lib/units";

import { staffOf } from "./staff-shared";
import { RESTRICTED_DOCUMENTS } from "./workers";

/**
 * A document handed in again (feature 37, «تواريخ انتهاء الوثائق»): a new
 * certificate replaces the one that expires. The new row is the current one;
 * the old stays, no longer current, so the file keeps what was handed in when.
 */
export async function renewStaffDocument(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    staffId: string;
    type: StaffDocumentType;
    deliveredDate?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    note?: string | null;
  },
): Promise<{ id: string }> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  if (!(STAFF_DOCUMENT_TYPES as readonly string[]).includes(input.type)) throw new ServiceError("Choose the document.");
  const delivered = input.deliveredDate?.trim() || ctx.today;
  const issued = input.issueDate?.trim() || null;
  const expiry = input.expiryDate?.trim() || null;
  for (const date of [delivered, issued, expiry]) {
    if (date !== null && !isDate(date)) throw new ServiceError("Enter a valid date.");
  }
  if (expiry && expiry <= delivered) throw new ServiceError("The expiry date must be after the day it was handed in.");
  const worker = await staffOf(ex, "WORKER", input.staffId);
  const before = await ex
    .selectFrom("StaffDocument")
    .select(["id", "expiryDate"])
    .where("staffId", "=", worker.id)
    .where("type", "=", input.type)
    .where("isCurrent", "=", 1)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (before) {
    await ex
      .updateTable("StaffDocument")
      .set({ isCurrent: 0, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
  }
  const id = newId();
  await ex
    .insertInto("StaffDocument")
    .values({
      id,
      staffId: worker.id,
      type: input.type,
      isCurrent: 1,
      isRestricted: RESTRICTED_DOCUMENTS.has(input.type) ? 1 : 0,
      delivered: 1,
      deliveredDate: localDate(delivered),
      issueDate: issued ? localDate(issued) : null,
      expiryDate: expiry ? localDate(expiry) : null,
      note: input.note?.trim() || null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "StaffDocument",
    entityId: id,
    entityLabel: `${worker.number} ${input.type}`,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
    changes: { expiryDate: [before?.expiryDate ?? null, expiry] },
  });
  return { id };
}

/**
 * Who files and opens the scan of a staff member's document. The documents of
 * his form (identity, birth, residence, medical certificate, criminal record)
 * are kept by HR: until Foundation names a capability of their own
 * (`staff.documents.read` is asked for), the one HR holds for the signed form.
 */
export const DOCUMENT_FILE_CAPABILITY = "staff.health.read";

/**
 * Puts the scan of a document on the worker's current row of that type, or
 * takes it off (`url` null). The file is stored restricted by the screen; the
 * old one leaves with its line in the log. A document never handed in gets its
 * row, handed in today.
 */
export async function setStaffDocumentFile(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string; type: StaffDocumentType; url: string | null },
): Promise<void> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  if (!can(ctx, DOCUMENT_FILE_CAPABILITY)) throw new ServiceError("You do not have permission to do this.");
  if (!(STAFF_DOCUMENT_TYPES as readonly string[]).includes(input.type)) throw new ServiceError("Choose the document.");
  const worker = await staffOf(ex, "WORKER", input.staffId);
  const subject = { kind: "WORKER" as const, id: worker.id, label: staffName(worker) };
  let row = await ex
    .selectFrom("StaffDocument")
    .select(["id", "fileUrl"])
    .where("staffId", "=", worker.id)
    .where("type", "=", input.type)
    .where("isCurrent", "=", 1)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!row) {
    if (!input.url) return;
    row = { id: (await renewStaffDocument(ex, ctx, { staffId: worker.id, type: input.type })).id, fileUrl: null };
  }
  const [current] = await listUploads(ex, { entity: "StaffDocument", ownerId: row.id, field: "fileUrl" });
  if ((current?.url ?? row.fileUrl) === input.url) return;
  if (current) await removeUpload(ex, ctx, { url: current.url, owner: "PEOPLE", subject });
  if (input.url) await linkUpload(ex, ctx, input.url, row.id);
  await ex
    .updateTable("StaffDocument")
    .set({ fileUrl: input.url, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", row.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "StaffDocument",
    entityId: row.id,
    entityLabel: `${worker.number} ${input.type}`,
    subject,
    changes: { fileUrl: [row.fileUrl ? WITHHELD : null, input.url ? WITHHELD : null] },
  });
}

export const setStaffDocumentFileAction = action(setStaffDocumentFile, {
  revalidate: (_data, input) => [`/dashboard/workers/${input.staffId}`],
});
export const renewStaffDocumentAction = action(renewStaffDocument, {
  revalidate: (_data, input) => [`/dashboard/workers/${input.staffId}`, "/dashboard/workers", "/dashboard/hiring"],
});
