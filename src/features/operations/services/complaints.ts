import { createViolationFromSource } from "@/features/people/services/violations";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logCollect } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, localTime, minutes, money } from "@/lib/units";

import { addDays, isClockTime, isIsoDate, minutesOf, weekdaysOfCodes, type LocalMoment } from "../rules/calendar";
import {
  DEFAULT_COMPLAINT_TARGET_MIN,
  DEFAULT_OFFICE_HOURS,
  complaintCounter,
  complaintDueAt,
  type ComplaintCounter,
  type OfficeHours,
} from "../rules/complaint-counter";
import { closeJobIfFinished, planExtraVisit } from "./extra-visits";
import { VISITS_PATH } from "./programme";

/**
 * Complaints (#18), from the call to the closing: opening one, the office's
 * first answer and the counter that measures it against his target («خلال
 * ساعتين في أوقات العمل»), then the settlement («سياسة التعويض») or the
 * rejection, and the day the client was told.
 *
 * A complaint comes in by phone, at the office, through a supervisor or a
 * worker, or on the returned order itself: a client who wrote «غير راضٍ» /
 * «تحتاج إلى تصحيح» opens one when the order is typed in
 * (`openComplaintFromSignoff`, run by the `visit.signedOff` handler).
 *
 * The counter starts when the complaint is received and stops at the first
 * answer to the client; it counts office minutes only (setting `office.hours`
 * on the working days `work.days`). Closing a complaint that was never
 * answered is its answer: the counter stops there.
 *
 * Settling it: whether the centre was at fault (FAULT), and his policy, «إعادة
 * الخدمة» (a redo visit planned at once through `planExtraVisit`: origin EXTRA
 * stands in for REDO) or «خصم متفق عليه» (an amount behind
 * `complaint.settleDiscount`; Money's next invoice run proposes it, from
 * `listComplaintCredits`), or none, or another way written out. A worker the
 * complaint names may be handed to HR as a violation to decide on (People's
 * `createViolationFromSource`).
 */

export const COMPLAINTS_PATH = "/dashboard/quality";

/** One complaint's page. */
export const complaintPath = (complaintId: string) => `${COMPLAINTS_PATH}/complaints/${complaintId}`;

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

/** A complaint the office closed: settled, or rejected. */
export const CLOSED_COMPLAINT_STATUSES: readonly ComplaintStatus[] = ["SETTLED", "REJECTED"];

/** «إذا كانت المشكلة بسبب المؤسسة» (FAULT): yes, no, or not decided. */
export const COMPLAINT_FAULTS = ["YES", "NO", "UNDECIDED"] as const;
export type ComplaintFault = (typeof COMPLAINT_FAULTS)[number];

/** «سياسة التعويض» (SETTLEMENT): his two, «إعادة الخدمة» and «خصم متفق عليه»; none and another way were added. */
export const COMPLAINT_SETTLEMENTS = ["REDO_SERVICE", "DISCOUNT", "NONE", "OTHER"] as const;
export type ComplaintSettlement = (typeof COMPLAINT_SETTLEMENTS)[number];

/** The lists of the complaints view: not closed, unanswered past their target, closed, every one. */
export const COMPLAINT_LIST_STATES = ["open", "late", "settled", "all"] as const;
export type ComplaintListState = (typeof COMPLAINT_LIST_STATES)[number];

/** The ways in the office types a complaint itself: one on the order is opened by the returned order. */
export const TYPED_COMPLAINT_CHANNELS = [
  "PHONE",
  "AT_OFFICE",
  "SUPERVISOR",
  "VIA_WORKER",
] as const satisfies readonly ComplaintChannel[];

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

// ── The lists ───────────────────────────────────────────────────────────────

/** A worker as a complaint names her. */
export interface ComplaintWorker {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
}

/** One complaint as the list shows it. Moments are the centre's date and time. */
export interface ComplaintLine {
  id: string;
  number: string;
  received: LocalMoment;
  channel: ComplaintChannel;
  kind: ComplaintKind;
  status: ComplaintStatus;
  description: string;
  client: { id: string; number: string; name: string };
  file: { id: string; number: string; division: string; siteName: string | null } | null;
  visit: { id: string; number: string; visitDate: string } | null;
  worker: ComplaintWorker | null;
  /** A resident who complained; the client otherwise. */
  complainantName: string | null;
  counter: ComplaintCounter;
  settlement: ComplaintSettlement | null;
  /** Centimes; a DISCOUNT only. */
  settlementAmount: number | null;
  /** When it was settled or rejected. */
  closed: LocalMoment | null;
}

function complaintRows(ex: Executor) {
  return ex
    .selectFrom("Complaint")
    .innerJoin("Client", "Client.id", "Complaint.clientId")
    .leftJoin("File", "File.id", "Complaint.fileId")
    .leftJoin("Site", "Site.id", "File.siteId")
    .leftJoin("Visit", "Visit.id", "Complaint.visitId")
    .leftJoin("StaffMember as Worker", "Worker.id", "Complaint.workerId")
    .select([
      "Complaint.id",
      "Complaint.number",
      "Complaint.receivedAt",
      "Complaint.channel",
      "Complaint.kind",
      "Complaint.status",
      "Complaint.description",
      "Complaint.targetMin",
      "Complaint.firstResponseAt",
      "Complaint.complainantName",
      "Complaint.settlement",
      "Complaint.settlementAmount",
      "Complaint.settledAt",
      "Client.id as clientId",
      "Client.number as clientNumber",
      "Client.name as clientName",
      "File.id as fileId",
      "File.number as fileNumber",
      "File.division as fileDivision",
      "Site.commonName as siteName",
      "Visit.id as visitId",
      "Visit.number as visitNumber",
      "Visit.visitDate as visitDate",
      "Worker.id as workerId",
      "Worker.number as workerNumber",
      "Worker.firstName as workerFirstName",
      "Worker.lastName as workerLastName",
    ]);
}

type ComplaintRow = Awaited<ReturnType<ReturnType<typeof complaintRows>["executeTakeFirstOrThrow"]>>;

function lineOf(ctx: ServiceContext, row: ComplaintRow, office: OfficeHours): ComplaintLine {
  return {
    id: row.id,
    number: row.number,
    received: ctx.toLocal(row.receivedAt),
    channel: row.channel as ComplaintChannel,
    kind: row.kind as ComplaintKind,
    status: row.status as ComplaintStatus,
    description: row.description,
    client: { id: row.clientId, number: row.clientNumber, name: row.clientName },
    file:
      row.fileId && row.fileNumber && row.fileDivision
        ? { id: row.fileId, number: row.fileNumber, division: row.fileDivision, siteName: row.siteName }
        : null,
    visit:
      row.visitId && row.visitNumber && row.visitDate
        ? { id: row.visitId, number: row.visitNumber, visitDate: row.visitDate }
        : null,
    worker:
      row.workerId && row.workerNumber
        ? {
            id: row.workerId,
            number: row.workerNumber,
            firstName: row.workerFirstName ?? "",
            lastName: row.workerLastName ?? "",
          }
        : null,
    complainantName: row.complainantName,
    counter: counterOf(ctx, row, office),
    settlement: (row.settlement as ComplaintSettlement | null) ?? null,
    settlementAmount: row.settlementAmount,
    closed: row.settledAt ? ctx.toLocal(row.settledAt) : null,
  };
}

/** The instant a centre date starts. */
const startOf = (ctx: ServiceContext, date: string) => ctx.toInstant(localDate(date), localTime("00:00"));

/**
 * The complaints of one list, each with its counter: those not closed (most
 * urgent first), those past their target with no answer yet, those closed
 * (settled or rejected; last closed first), or all (last received first).
 * `from` and `to` keep those received in that range of days.
 */
export async function listComplaints(
  ex: Executor,
  ctx: ServiceContext,
  input: { state?: ComplaintListState; from?: string | null; to?: string | null } = {},
): Promise<ComplaintLine[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const state = input.state ?? "open";
  if (!(COMPLAINT_LIST_STATES as readonly string[]).includes(state)) {
    throw new Error(`operations: unknown complaint list ${state}`);
  }
  const from = blankToNull(input.from);
  const to = blankToNull(input.to);
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) throw new ServiceError("Enter a valid date.");
  if (from && to && to < from) throw new ServiceError("The end date must not be before the start date.");

  let rows = complaintRows(ex);
  if (state === "open" || state === "late") rows = rows.where("Complaint.status", "in", [...OPEN_COMPLAINT_STATUSES]);
  // Late: no answer, and its due moment passed (the counter's LATE).
  if (state === "late")
    rows = rows.where("Complaint.firstResponseAt", "is", null).where("Complaint.dueAt", "<", ctx.now);
  if (state === "settled") rows = rows.where("Complaint.status", "in", [...CLOSED_COMPLAINT_STATUSES]);
  if (from) rows = rows.where("Complaint.receivedAt", ">=", startOf(ctx, from));
  if (to) rows = rows.where("Complaint.receivedAt", "<", startOf(ctx, addDays(to, 1)));

  rows =
    state === "settled"
      ? rows.orderBy("Complaint.settledAt", "desc")
      : state === "all"
        ? rows.orderBy("Complaint.receivedAt", "desc")
        : rows.orderBy("Complaint.dueAt");
  const office = await officeHours(ex);
  return (await rows.orderBy("Complaint.number", "desc").execute()).map((row) => lineOf(ctx, row, office));
}

// ── One complaint ───────────────────────────────────────────────────────────

/** Everything the complaint's page shows. */
export interface ComplaintDetail extends ComplaintLine {
  receivedBy: string | null;
  complainantPhone: string | null;
  clientPhones: string[];
  siteAddress: string | null;
  visitStatus: string | null;
  targetMin: number;
  /** The office's first answer: when, by whom, what was said. */
  firstResponse: { at: LocalMoment; by: string | null; note: string | null } | null;
  centreAtFault: ComplaintFault | null;
  resolutionNote: string | null;
  closedBy: string | null;
  clientTold: LocalMoment | null;
  redoVisit: { id: string; number: string; visitDate: string; status: string } | null;
  correctiveTaskId: string | null;
  /** Violations handed to HR from this complaint (People decides on them). */
  violations: Array<{ id: string; number: string; status: string }>;
  /** Problem reports of a returned order that became this complaint. */
  problemReports: Array<{ id: string; kind: string; occurredDate: string }>;
  /** The visits a redo may repeat, latest first: the complaint's own visit alone when it names one. */
  repeatableVisits: Array<{ id: string; number: string; visitDate: string }>;
}

/** The complaint's page: the facts, the counter, the answer, the settlement and what it led to. */
export async function getComplaint(
  ex: Executor,
  ctx: ServiceContext,
  input: { complaintId: string },
): Promise<ComplaintDetail> {
  requireSection(ctx, "REQUESTS", "READ");
  const row = await complaintRows(ex)
    .leftJoin("User as Receiver", "Receiver.id", "Complaint.receivedByUserId")
    .leftJoin("User as Responder", "Responder.id", "Complaint.firstResponseByUserId")
    .leftJoin("User as Closer", "Closer.id", "Complaint.settledByUserId")
    .leftJoin("Visit as Redo", "Redo.id", "Complaint.redoVisitId")
    .select([
      "Complaint.complainantPhone",
      "Complaint.firstResponseAt",
      "Complaint.responseNote",
      "Complaint.centreAtFault",
      "Complaint.resolutionNote",
      "Complaint.clientToldAt",
      "Complaint.correctiveTaskId",
      "Client.phone1 as clientPhone1",
      "Client.phone2 as clientPhone2",
      "Site.address as siteAddress",
      "Visit.status as visitStatus",
      "Receiver.displayName as receivedBy",
      "Responder.displayName as respondedBy",
      "Closer.displayName as closedBy",
      "Redo.id as redoId",
      "Redo.number as redoNumber",
      "Redo.visitDate as redoDate",
      "Redo.status as redoStatus",
    ])
    .where("Complaint.id", "=", input.complaintId)
    .executeTakeFirst();
  if (!row) throw new ServiceError("This complaint does not exist.");

  const violations = await ex
    .selectFrom("Violation")
    .select(["id", "number", "status"])
    .where("complaintId", "=", row.id)
    .orderBy("numberYear")
    .orderBy("numberSeq")
    .execute();
  const problemReports = await ex
    .selectFrom("ProblemReport")
    .select(["id", "kind", "occurredDate"])
    .where("complaintId", "=", row.id)
    .where("deletedAt", "is", null)
    .orderBy("occurredDate")
    .execute();
  const repeatableVisits = row.visitId
    ? row.visitNumber && row.visitDate
      ? [{ id: row.visitId, number: row.visitNumber, visitDate: row.visitDate }]
      : []
    : row.fileId
      ? await ex
          .selectFrom("Visit")
          .select(["id", "number", "visitDate"])
          .where("fileId", "=", row.fileId)
          .where("status", "=", "DONE")
          .where("visitDate", "<=", ctx.today)
          .orderBy("visitDate", "desc")
          .orderBy("number", "desc")
          .limit(10)
          .execute()
      : [];

  return {
    ...lineOf(ctx, row, await officeHours(ex)),
    receivedBy: row.receivedBy,
    complainantPhone: row.complainantPhone,
    clientPhones: [row.clientPhone1, row.clientPhone2].filter((phone): phone is string => !!phone?.trim()),
    siteAddress: row.siteAddress,
    visitStatus: row.visitStatus,
    targetMin: row.targetMin,
    firstResponse: row.firstResponseAt
      ? { at: ctx.toLocal(row.firstResponseAt), by: row.respondedBy, note: row.responseNote }
      : null,
    centreAtFault: (row.centreAtFault as ComplaintFault | null) ?? null,
    resolutionNote: row.resolutionNote,
    closedBy: row.closedBy,
    clientTold: row.clientToldAt ? ctx.toLocal(row.clientToldAt) : null,
    redoVisit:
      row.redoId && row.redoNumber && row.redoDate && row.redoStatus
        ? { id: row.redoId, number: row.redoNumber, visitDate: row.redoDate, status: row.redoStatus }
        : null,
    correctiveTaskId: row.correctiveTaskId,
    violations,
    problemReports,
    repeatableVisits,
  };
}

// ── Closing ─────────────────────────────────────────────────────────────────

/** The columns a closing reads and may write. */
async function complaintForChange(ex: Executor, complaintId: string) {
  return ex
    .selectFrom("Complaint")
    .innerJoin("Client", "Client.id", "Complaint.clientId")
    .leftJoin("Visit", "Visit.id", "Complaint.visitId")
    .select([
      "Complaint.id",
      "Complaint.number",
      "Complaint.status",
      "Complaint.clientId",
      "Complaint.fileId",
      "Complaint.visitId",
      "Complaint.workerId",
      "Complaint.kind",
      "Complaint.description",
      "Complaint.receivedAt",
      "Complaint.firstResponseAt",
      "Complaint.firstResponseByUserId",
      "Complaint.centreAtFault",
      "Complaint.settlement",
      "Complaint.settlementAmount",
      "Complaint.redoVisitId",
      "Complaint.resolutionNote",
      "Complaint.settledAt",
      "Complaint.settledByUserId",
      "Complaint.clientToldAt",
      "Client.name as clientName",
      "Visit.visitDate as visitDate",
    ])
    .where("Complaint.id", "=", complaintId)
    .executeTakeFirst();
}

type ComplaintForChange = NonNullable<Awaited<ReturnType<typeof complaintForChange>>>;

async function openComplaintForChange(ex: Executor, complaintId: string): Promise<ComplaintForChange> {
  const complaint = await complaintForChange(ex, complaintId);
  if (!complaint) throw new ServiceError("This complaint does not exist.");
  if (!(OPEN_COMPLAINT_STATUSES as readonly string[]).includes(complaint.status)) {
    throw new ServiceError("This complaint is closed.");
  }
  return complaint;
}

/** What every closing writes: who closed it and when, and the first answer when none was recorded. */
function closingColumns(ctx: ServiceContext, complaint: ComplaintForChange) {
  return {
    settledAt: ctx.now,
    settledByUserId: ctx.userId,
    ...(complaint.firstResponseAt ? {} : { firstResponseAt: ctx.now, firstResponseByUserId: ctx.userId }),
  };
}

/**
 * The visit a redo repeats: the one chosen, else the complaint's own, else
 * the file's last visit done. It must be of the complaint's file (of its
 * client when it names no file).
 */
async function visitToRepeat(
  ex: Executor,
  ctx: ServiceContext,
  complaint: ComplaintForChange,
  chosen: string | null,
): Promise<string> {
  const picked = chosen ?? complaint.visitId;
  if (picked) {
    const visit = await ex
      .selectFrom("Visit")
      .innerJoin("File", "File.id", "Visit.fileId")
      .select(["Visit.id", "Visit.fileId", "File.clientId"])
      .where("Visit.id", "=", picked)
      .executeTakeFirst();
    if (!visit) throw new ServiceError("This visit does not exist.");
    if (complaint.fileId ? visit.fileId !== complaint.fileId : visit.clientId !== complaint.clientId) {
      throw new ServiceError("This visit belongs to another client file.");
    }
    return visit.id;
  }
  const last = complaint.fileId
    ? await ex
        .selectFrom("Visit")
        .select("id")
        .where("fileId", "=", complaint.fileId)
        .where("status", "=", "DONE")
        .where("visitDate", "<=", ctx.today)
        .orderBy("visitDate", "desc")
        .orderBy("number", "desc")
        .executeTakeFirst()
    : undefined;
  if (!last) throw new ServiceError("A redo visit needs a visit of this client file to repeat.");
  return last.id;
}

export interface SettleComplaintInput {
  complaintId: string;
  centreAtFault: ComplaintFault;
  settlement: ComplaintSettlement;
  /** DISCOUNT: the amount agreed with the client, in centimes. */
  amount?: number | null;
  /** REDO_SERVICE: the day (and time) of the redo visit; the visit repeated defaults to the complaint's. */
  redo?: { date: string; startTime?: string | null; sourceVisitId?: string | null } | null;
  /** What was decided and done; required for OTHER. */
  resolutionNote?: string | null;
  /** Hands the worker the complaint names to HR, as a violation for HR or the manager to decide on. */
  referWorker?: boolean;
}

export interface SettledComplaint {
  status: ComplaintStatus;
  redoVisit: { visitId: string; number: string } | null;
  violation: { id: string; number: string } | null;
}

/**
 * The office settles a complaint: whether the centre was at fault, and how it
 * makes up for it. «إعادة الخدمة» plans the redo visit now (a visit of origin
 * EXTRA repeating the visit complained about, waiting for its team); «خصم
 * متفق عليه» is the manager's (`complaint.settleDiscount`) and is announced
 * to Money (`complaint.settled`), whose next invoice of the file proposes the
 * discount line. The counter stops here if it was still running.
 */
export async function settleComplaint(
  ex: Executor,
  ctx: ServiceContext,
  input: SettleComplaintInput,
): Promise<SettledComplaint> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(COMPLAINT_FAULTS as readonly string[]).includes(input.centreAtFault)) {
    throw new Error(`operations: unknown fault ${input.centreAtFault}`);
  }
  if (!(COMPLAINT_SETTLEMENTS as readonly string[]).includes(input.settlement)) {
    throw new Error(`operations: unknown settlement ${input.settlement}`);
  }
  if (input.settlement === "DISCOUNT") requireCapability(ctx, "complaint.settleDiscount");
  const before = await openComplaintForChange(ex, input.complaintId);
  const note = blankToNull(input.resolutionNote);

  let amount: number | null = null;
  if (input.settlement === "DISCOUNT") {
    if (!before.fileId) throw new ServiceError("A discount needs the client file the complaint is about.");
    if (!Number.isSafeInteger(input.amount) || (input.amount ?? 0) <= 0) {
      throw new ServiceError("Enter an amount above zero.");
    }
    amount = input.amount ?? null;
  }
  if (input.settlement === "OTHER" && !note) throw new ServiceError("Write how the complaint was settled.");

  let redoVisit: SettledComplaint["redoVisit"] = null;
  if (input.settlement === "REDO_SERVICE") {
    const sourceVisitId = await visitToRepeat(ex, ctx, before, blankToNull(input.redo?.sourceVisitId));
    redoVisit = await planExtraVisit(ex, ctx, {
      sourceVisitId,
      date: input.redo?.date ?? "",
      startTime: input.redo?.startTime ?? null,
    });
  }

  let violation: SettledComplaint["violation"] = null;
  if (input.referWorker) {
    if (!before.workerId) throw new ServiceError("This complaint names no worker.");
    const received = ctx.toLocal(before.receivedAt).date;
    violation = await createViolationFromSource(ex, ctx, {
      workerId: before.workerId,
      // The day it happened: the visit's, unless the complaint names none (or a visit still to come).
      date: before.visitDate && before.visitDate <= ctx.today ? before.visitDate : received,
      sourceKind: "COMPLAINT",
      sourceId: before.id,
      description: `${before.number}: ${before.description}`,
    });
  }

  const status: ComplaintStatus = "SETTLED";
  const { set, changes } = changedColumns(before, {
    status,
    centreAtFault: input.centreAtFault,
    settlement: input.settlement,
    settlementAmount: amount === null ? null : money(amount),
    redoVisitId: redoVisit?.visitId ?? null,
    resolutionNote: note,
    ...closingColumns(ctx, before),
  });
  await ex
    .updateTable("Complaint")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    entity: "Complaint",
    entityId: before.id,
    entityLabel: before.number,
    subject: { kind: "CLIENT", id: before.clientId, label: before.clientName },
    changes: changes ?? undefined,
    context: {
      ...(redoVisit ? { redoVisit: redoVisit.number } : {}),
      ...(violation ? { violation: violation.number } : {}),
    },
  });
  if (input.settlement === "DISCOUNT") await emit(ex, ctx, "complaint.settled", { complaintId: before.id });
  // An on-demand job waiting only for this complaint ends with it (INT-6).
  if (before.fileId) await closeJobIfFinished(ex, ctx, before.fileId);
  return { status, redoVisit, violation };
}

/** The office rejects a complaint, with the reason the user typed (kept as its resolution, and in the log). */
export async function rejectComplaint(
  ex: Executor,
  ctx: ServiceContext,
  input: { complaintId: string; reason: string },
): Promise<{ status: ComplaintStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const reason = blankToNull(input.reason);
  if (!reason) throw new ServiceError("Write why the complaint is rejected.");
  const before = await openComplaintForChange(ex, input.complaintId);
  const status: ComplaintStatus = "REJECTED";
  const { set, changes } = changedColumns(before, {
    status,
    resolutionNote: reason,
    ...closingColumns(ctx, before),
  });
  await ex
    .updateTable("Complaint")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "REFUSE",
    reason,
    entity: "Complaint",
    entityId: before.id,
    entityLabel: before.number,
    subject: { kind: "CLIENT", id: before.clientId, label: before.clientName },
    changes: changes ?? undefined,
  });
  // An on-demand job waiting only for this complaint ends with it (INT-6).
  if (before.fileId) await closeJobIfFinished(ex, ctx, before.fileId);
  return { status };
}

/** The client was told how his complaint was closed. Once, after the closing. */
export async function recordClientTold(
  ex: Executor,
  ctx: ServiceContext,
  input: { complaintId: string },
): Promise<{ clientTold: LocalMoment }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const before = await complaintForChange(ex, input.complaintId);
  if (!before) throw new ServiceError("This complaint does not exist.");
  if ((OPEN_COMPLAINT_STATUSES as readonly string[]).includes(before.status)) {
    throw new ServiceError("Settle or reject the complaint first.");
  }
  if (before.clientToldAt) throw new ServiceError("The client has already been told.");
  await ex
    .updateTable("Complaint")
    .set({ clientToldAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "Complaint",
    entityId: before.id,
    entityLabel: before.number,
    subject: { kind: "CLIENT", id: before.clientId, label: before.clientName },
    changes: { clientToldAt: [null, ctx.now] },
  });
  return { clientTold: ctx.toLocal(ctx.now) };
}

// ── For Money (CONTRACTS section 3) ─────────────────────────────────────────

/**
 * `listComplaintCredits(fileId)`: the file's complaints settled with an agreed
 * discount, oldest first, with their amount in centimes. Money knows which
 * are already on an invoice line (`InvoiceLine.complaintId`). Checks no
 * permission: Money's own service does.
 */
export async function listComplaintCredits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<Array<{ complaintId: string; number: string; settledDate: string; amount: number; kind: ComplaintKind }>> {
  const rows = await ex
    .selectFrom("Complaint")
    .select(["id", "number", "settledAt", "settlementAmount", "kind"])
    .where("fileId", "=", input.fileId)
    .where("status", "=", "SETTLED")
    .where("settlement", "=", "DISCOUNT")
    .where("settlementAmount", "is not", null)
    .orderBy("settledAt")
    .orderBy("number")
    .execute();
  return rows.map((row) => ({
    complaintId: row.id,
    number: row.number,
    settledDate: row.settledAt ? ctx.toLocal(row.settledAt).date : ctx.today,
    amount: row.settlementAmount ?? 0,
    kind: row.kind as ComplaintKind,
  }));
}

// ── What the new-complaint dialog offers ────────────────────────────────────

export interface ComplaintChoiceFile {
  id: string;
  number: string;
  division: string;
  siteName: string | null;
  /** Contracted and not closed: listed first. */
  current: boolean;
}

export interface ComplaintChoiceClient {
  id: string;
  number: string;
  name: string;
  files: ComplaintChoiceFile[];
}

/** The clients a complaint may be about, by name, each with its files (current ones first). */
export async function listComplaintChoices(
  ex: Executor,
  ctx: ServiceContext,
  _input: Record<string, never> = {},
): Promise<ComplaintChoiceClient[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const clients = await ex
    .selectFrom("Client")
    .select(["id", "number", "name"])
    .where("deletedAt", "is", null)
    .orderBy("name")
    .orderBy("number")
    .execute();
  const files = await ex
    .selectFrom("File")
    .leftJoin("Site", "Site.id", "File.siteId")
    .select([
      "File.id",
      "File.clientId",
      "File.number",
      "File.division",
      "File.stage",
      "File.closedAt",
      "Site.commonName as siteName",
    ])
    .where("File.deletedAt", "is", null)
    .orderBy("File.registrationDate", "desc")
    .orderBy("File.number")
    .execute();
  const byClient = new Map<string, ComplaintChoiceFile[]>();
  for (const file of files) {
    const list = byClient.get(file.clientId) ?? [];
    list.push({
      id: file.id,
      number: file.number,
      division: file.division,
      siteName: file.siteName,
      current: file.stage === "CONTRACTED" && file.closedAt === null,
    });
    byClient.set(file.clientId, list);
  }
  return clients.map((client) => ({
    ...client,
    files: (byClient.get(client.id) ?? []).sort((a, b) => Number(b.current) - Number(a.current)),
  }));
}

export interface ComplaintChoiceVisit {
  id: string;
  number: string;
  visitDate: string;
  status: string;
  /** Who worked on it: the seats held. */
  workers: ComplaintWorker[];
}

/** The file's visits up to today, latest first, each with its team: what a complaint may name. */
export async function listComplaintVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<ComplaintChoiceVisit[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "number", "visitDate", "status"])
    .where("fileId", "=", input.fileId)
    .where("visitDate", "<=", ctx.today)
    .where("status", "!=", "CANCELLED")
    .orderBy("visitDate", "desc")
    .orderBy("number", "desc")
    .limit(30)
    .execute();
  if (visits.length === 0) return [];
  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
    .select([
      "VisitWorker.visitId",
      "StaffMember.id",
      "StaffMember.number",
      "StaffMember.firstName",
      "StaffMember.lastName",
    ])
    .where(
      "VisitWorker.visitId",
      "in",
      visits.map((visit) => visit.id),
    )
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .orderBy("StaffMember.lastName")
    .orderBy("StaffMember.firstName")
    .execute();
  return visits.map((visit) => ({
    ...visit,
    workers: seats
      .filter((seat) => seat.visitId === visit.id)
      .map(({ id, number, firstName, lastName }) => ({ id, number, firstName, lastName })),
  }));
}

const COMPLAINT_PATHS = [COMPLAINTS_PATH, "/dashboard/clients"];

export const openComplaintAction = action(openComplaint, { revalidate: COMPLAINT_PATHS });
export const recordFirstResponseAction = action(recordFirstResponse, { revalidate: COMPLAINT_PATHS });
export const settleComplaintAction = action(settleComplaint, {
  revalidate: [...COMPLAINT_PATHS, VISITS_PATH, "/dashboard/files", "/dashboard/workers"],
});
export const rejectComplaintAction = action(rejectComplaint, { revalidate: COMPLAINT_PATHS });
export const recordClientToldAction = action(recordClientTold, { revalidate: COMPLAINT_PATHS });
export const getComplaintCounterQuery = query(getComplaintCounter);
export const listComplaintsQuery = query(listComplaints);
export const getComplaintQuery = query(getComplaint);
export const listComplaintChoicesQuery = query(listComplaintChoices);
export const listComplaintVisitsQuery = query(listComplaintVisits);
