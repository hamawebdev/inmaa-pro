import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logCollect } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, localTime, minutes } from "@/lib/units";

import { isClockTime, minutesOf, weekdaysOfCodes } from "../rules/calendar";
import {
  DEFAULT_COMPLAINT_TARGET_MIN,
  DEFAULT_OFFICE_HOURS,
  complaintCounter,
  complaintDueAt,
  type ComplaintCounter,
  type OfficeHours,
} from "../rules/complaint-counter";

/**
 * Complaints (#18): opening one, the office's first answer, and the counter
 * that measures that answer against his target («خلال ساعتين في أوقات
 * العمل»).
 *
 * A complaint comes in by phone, at the office, through a supervisor or a
 * worker, or on the returned order itself: a client who wrote «غير راضٍ» /
 * «تحتاج إلى تصحيح» opens one when the order is typed in
 * (`openComplaintFromSignoff`, run by the `visit.signedOff` handler).
 *
 * The counter starts when the complaint is received and stops at the first
 * answer to the client; it counts office minutes only (setting `office.hours`
 * on the working days `work.days`). Settling a complaint is not here yet.
 */

export const COMPLAINTS_PATH = "/dashboard/quality";

// The three lists of OPTION-CODES.md. They belong in ../validators/option-codes.ts, with their labels, once the
// complaint screens exist; they are here because nothing on a screen shows them yet.

/** How a complaint reached the centre (COMPLAINT_CHANNEL). */
export const COMPLAINT_CHANNELS = ["PHONE", "AT_OFFICE", "ON_ORDER", "SUPERVISOR", "VIA_WORKER"] as const;
export type ComplaintChannel = (typeof COMPLAINT_CHANNELS)[number];

/** «نوع المشكلة» of his complaints table (COMPLAINT_KIND); OTHER was added. */
export const COMPLAINT_KINDS = [
  "QUALITY",
  "DELAY",
  "BEHAVIOUR",
  "EQUIPMENT_SHORTAGE",
  "DAMAGE",
  "ABSENCE",
  "OTHER",
] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number];

/** Where a complaint stands (COMPLAINT_STATUS). */
export const COMPLAINT_STATUSES = ["NEW", "IN_PROGRESS", "SETTLED", "REJECTED"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

/** A complaint the office has not closed: it keeps an on-demand job open. */
export const OPEN_COMPLAINT_STATUSES: readonly ComplaintStatus[] = ["NEW", "IN_PROGRESS"];

/** The description of a complaint opened from a sign-off whose client wrote no note. */
export const SIGNOFF_COMPLAINT_TEXT = "الخدمة غير مقبولة عند الاستلام";

const blankToNull = (text: string | null | undefined) => {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * The office hours the counter runs in: `office.hours` on the days of
 * `work.days`. Settings that leave no time to count fall back to the defaults,
 * so a complaint is never refused, nor a returned order, for a setting.
 */
export async function officeHours(ex: Executor): Promise<OfficeHours> {
  const settings = await getSettings(ex, ["office.hours", "work.days"]);
  const { from, to } = settings["office.hours"];
  const workingWeekdays = weekdaysOfCodes(settings["work.days"]);
  if (!isClockTime(from) || !isClockTime(to) || minutesOf(to) <= minutesOf(from) || workingWeekdays.length === 0) {
    return DEFAULT_OFFICE_HOURS;
  }
  return { openTime: from, closeTime: to, workingWeekdays };
}

/** `complaint.targetMin`, frozen on each complaint when it is received. */
async function targetMinutes(ex: Executor): Promise<number> {
  const value = (await getSettings(ex, ["complaint.targetMin"]))["complaint.targetMin"];
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_COMPLAINT_TARGET_MIN;
}

// ── Opening ─────────────────────────────────────────────────────────────────

interface NewComplaint {
  channel: ComplaintChannel;
  kind: ComplaintKind;
  client: { id: string; name: string };
  fileId: string | null;
  visitId: string | null;
  workerId: string | null;
  complainantName: string | null;
  complainantPhone: string | null;
  description: string;
}

/** Writes the complaint, received now, with its number, its target and when it is due; and logs it. */
async function insertComplaint(
  ex: Executor,
  ctx: ServiceContext,
  complaint: NewComplaint,
): Promise<{ complaintId: string; number: string }> {
  const number = await nextNumber(ex, ctx, "COMPLAINT", { date: ctx.today });
  const targetMin = await targetMinutes(ex);
  const due = complaintDueAt({ date: ctx.today, time: ctx.nowTime }, targetMin, await officeHours(ex));
  const id = newId();
  await ex
    .insertInto("Complaint")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      receivedAt: ctx.now,
      receivedByUserId: ctx.userId,
      channel: complaint.channel,
      clientId: complaint.client.id,
      fileId: complaint.fileId,
      visitId: complaint.visitId,
      workerId: complaint.workerId,
      complainantName: complaint.complainantName,
      complainantPhone: complaint.complainantPhone,
      kind: complaint.kind,
      description: complaint.description,
      targetMin: minutes(targetMin),
      dueAt: ctx.toInstant(localDate(due.date), localTime(due.time)),
      status: "NEW",
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();

  const entry = {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "Complaint",
    entityId: id,
    entityLabel: number.display,
    changes: { status: [null, "NEW"], channel: [null, complaint.channel], kind: [null, complaint.kind] },
    context: { fileId: complaint.fileId, visitId: complaint.visitId, workerId: complaint.workerId, targetMin },
  } as const;
  if (complaint.complainantName || complaint.complainantPhone) {
    // A resident who complains is a third party: his name and phone are personal data collected here.
    await logCollect(ex, ctx, {
      ...entry,
      subject: { kind: "RESIDENT", id, label: complaint.complainantName ?? complaint.complainantPhone ?? undefined },
    });
  } else {
    await logChange(ex, ctx, {
      ...entry,
      subject: { kind: "CLIENT", id: complaint.client.id, label: complaint.client.name },
    });
  }
  return { complaintId: id, number: number.display };
}

export interface OpenComplaintInput {
  channel: ComplaintChannel;
  clientId: string;
  fileId?: string | null;
  /** «مرتبطة بالمهمة»: the visit complained about. Its file is the complaint's file. */
  visitId?: string | null;
  /** «والعامل». */
  workerId?: string | null;
  /** Somebody other than the client (a resident): optional, and logged as collected when given. */
  complainantName?: string | null;
  complainantPhone?: string | null;
  kind: ComplaintKind;
  description: string;
}

/** The office records a complaint as it comes in. */
export async function openComplaint(
  ex: Executor,
  ctx: ServiceContext,
  input: OpenComplaintInput,
): Promise<{ complaintId: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(COMPLAINT_CHANNELS as readonly string[]).includes(input.channel)) {
    throw new Error(`operations: unknown complaint channel ${input.channel}`);
  }
  if (!(COMPLAINT_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`operations: unknown complaint kind ${input.kind}`);
  }
  const description = blankToNull(input.description);
  if (!description) throw new ServiceError("Write what the complaint is about.");

  const client = await ex
    .selectFrom("Client")
    .select(["id", "name"])
    .where("id", "=", input.clientId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!client) throw new ServiceError("This client does not exist.");

  let fileId = blankToNull(input.fileId);
  const visitId = blankToNull(input.visitId);
  if (visitId) {
    const visit = await ex.selectFrom("Visit").select("fileId").where("id", "=", visitId).executeTakeFirst();
    if (!visit) throw new ServiceError("This visit does not exist.");
    if (fileId && fileId !== visit.fileId) throw new ServiceError("This file or visit belongs to another client.");
    fileId = visit.fileId;
  }
  if (fileId) {
    const file = await ex
      .selectFrom("File")
      .select("clientId")
      .where("id", "=", fileId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!file) throw new ServiceError("This client file does not exist.");
    if (file.clientId !== client.id) throw new ServiceError("This file or visit belongs to another client.");
  }
  const workerId = blankToNull(input.workerId);
  if (workerId) {
    const worker = await ex
      .selectFrom("StaffMember")
      .select("id")
      .where("id", "=", workerId)
      .where("kind", "=", "WORKER")
      .executeTakeFirst();
    if (!worker) throw new ServiceError("This worker does not exist.");
  }

  return insertComplaint(ex, ctx, {
    channel: input.channel,
    kind: input.kind,
    client,
    fileId,
    visitId,
    workerId,
    complainantName: blankToNull(input.complainantName),
    complainantPhone: blankToNull(input.complainantPhone),
    description,
  });
}

/**
 * The reaction to a sign-off: a client who did not accept the service
 * (`signoffStatus` NOT_ACCEPTED) has complained on the order itself. One
 * complaint per visit: typing the same order in again opens nothing more.
 * Returns the complaint opened, or null. Checks no permission: it runs inside
 * the action that saved the returned order.
 */
export async function openComplaintFromSignoff(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<{ complaintId: string; number: string } | null> {
  const signoff = await ex
    .selectFrom("VisitReport")
    .innerJoin("Visit", "Visit.id", "VisitReport.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select([
      "VisitReport.signoffStatus",
      "VisitReport.signoffNotes",
      "Visit.id as visitId",
      "File.id as fileId",
      "Client.id as clientId",
      "Client.name as clientName",
    ])
    .where("VisitReport.visitId", "=", input.visitId)
    .executeTakeFirst();
  if (!signoff || signoff.signoffStatus !== "NOT_ACCEPTED") return null;
  const already = await ex
    .selectFrom("Complaint")
    .select("id")
    .where("visitId", "=", signoff.visitId)
    .executeTakeFirst();
  if (already) return null;

  return insertComplaint(ex, ctx, {
    channel: "ON_ORDER",
    kind: "QUALITY",
    client: { id: signoff.clientId, name: signoff.clientName },
    fileId: signoff.fileId,
    visitId: signoff.visitId,
    workerId: null,
    complainantName: null,
    complainantPhone: null,
    description: blankToNull(signoff.signoffNotes) ?? SIGNOFF_COMPLAINT_TEXT,
  });
}

// ── The answer and the counter ──────────────────────────────────────────────

function counterOf(
  ctx: ServiceContext,
  complaint: { receivedAt: string; firstResponseAt: string | null; targetMin: number },
  office: OfficeHours,
): ComplaintCounter {
  return complaintCounter({
    received: ctx.toLocal(complaint.receivedAt),
    firstResponse: complaint.firstResponseAt ? ctx.toLocal(complaint.firstResponseAt) : null,
    now: { date: ctx.today, time: ctx.nowTime },
    targetMin: complaint.targetMin,
    office,
  });
}

/**
 * The office answered the client for the first time: the counter stops, and a
 * new complaint is now being dealt with. Recorded once.
 */
export async function recordFirstResponse(
  ex: Executor,
  ctx: ServiceContext,
  input: { complaintId: string; note?: string | null },
): Promise<{ status: ComplaintStatus; counter: ComplaintCounter }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const before = await ex
    .selectFrom("Complaint")
    .innerJoin("Client", "Client.id", "Complaint.clientId")
    .select([
      "Complaint.id",
      "Complaint.number",
      "Complaint.status",
      "Complaint.receivedAt",
      "Complaint.targetMin",
      "Complaint.firstResponseAt",
      "Complaint.firstResponseByUserId",
      "Complaint.responseNote",
      "Client.id as clientId",
      "Client.name as clientName",
    ])
    .where("Complaint.id", "=", input.complaintId)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This complaint does not exist.");
  if (before.firstResponseAt) throw new ServiceError("The first answer to this complaint is already recorded.");
  if (!(OPEN_COMPLAINT_STATUSES as readonly string[]).includes(before.status)) {
    throw new ServiceError("This complaint is closed.");
  }

  const status: ComplaintStatus = "IN_PROGRESS";
  const { set, changes } = changedColumns(before, {
    firstResponseAt: ctx.now,
    firstResponseByUserId: ctx.userId,
    responseNote: blankToNull(input.note),
    status,
  });
  await ex
    .updateTable("Complaint")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: set.status !== undefined ? "STATUS_CHANGE" : "UPDATE",
    entity: "Complaint",
    entityId: before.id,
    entityLabel: before.number,
    subject: { kind: "CLIENT", id: before.clientId, label: before.clientName },
    changes: changes ?? undefined,
  });
  return { status, counter: counterOf(ctx, { ...before, firstResponseAt: ctx.now }, await officeHours(ex)) };
}

/** Where the complaint stands against its target now: running, close to it, late, or answered in time or late. */
export async function getComplaintCounter(
  ex: Executor,
  ctx: ServiceContext,
  input: { complaintId: string },
): Promise<ComplaintCounter> {
  requireSection(ctx, "REQUESTS", "READ");
  const complaint = await ex
    .selectFrom("Complaint")
    .select(["receivedAt", "firstResponseAt", "targetMin"])
    .where("id", "=", input.complaintId)
    .executeTakeFirst();
  if (!complaint) throw new ServiceError("This complaint does not exist.");
  return counterOf(ctx, complaint, await officeHours(ex));
}

export const openComplaintAction = action(openComplaint, { revalidate: [COMPLAINTS_PATH, "/dashboard/clients"] });
export const recordFirstResponseAction = action(recordFirstResponse, {
  revalidate: [COMPLAINTS_PATH, "/dashboard/clients"],
});
export const getComplaintCounterQuery = query(getComplaintCounter);
