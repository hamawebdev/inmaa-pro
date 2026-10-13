import { isDate } from "@/features/people/rules/dates";
import { STAFF_DOCUMENT_TYPES, type StaffDocumentType } from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
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

export const renewStaffDocumentAction = action(renewStaffDocument, {
  revalidate: (_data, input) => [`/dashboard/workers/${input.staffId}`, "/dashboard/workers", "/dashboard/hiring"],
});
