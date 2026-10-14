import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, localTime } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { isClockTime, isIsoDate, type LocalMoment } from "../rules/calendar";
import { PROBLEM_KINDS, type ProblemKind } from "../validators/option-codes";
import {
  COMPLAINT_KINDS,
  COMPLAINTS_PATH,
  openComplaint,
  recordClientTold,
  recordFirstResponse,
  settleComplaint,
  type ComplaintChannel,
  type ComplaintKind,
  type ComplaintWorker,
} from "./complaints";

/**
 * Problem reports (#14): what a worker ticked under «هل توجد مشكلة في
 * الموقع؟» on the returned order (one report per kind, written when the order
 * is typed in), and what the office hears by phone or from a supervisor at any
 * time («فوراً» is lost offline: the office logs it when it hears of it).
 *
 * The office takes a report in hand, hands it to the owner who can act on it
 * (a shortage to the stock, an extra-service lead or an access matter to the
 * client files, an injury or a breakage to HR: `problem.handedOver`), and
 * closes it with what was done. The owner it was handed to closes it through
 * `closeHandedProblem`. A resident's complaint may become a complaint.
 */

export const PROBLEMS_PATH = COMPLAINTS_PATH;

// The lists of OPTION-CODES.md section 4. They belong in ../validators/option-codes.ts with the other lists.

/** Where a report stands (PROBLEM_STATUS). */
export const PROBLEM_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** How the report reached the office (PROBLEM_VIA). ORDER is written by the returned order. */
export const PROBLEM_VIAS = ["ORDER", "PHONE", "SUPERVISOR"] as const;
export type ProblemVia = (typeof PROBLEM_VIAS)[number];
export const TYPED_PROBLEM_VIAS = ["PHONE", "SUPERVISOR"] as const satisfies readonly ProblemVia[];

/** Who a report is handed to (HANDED_TO): the stock, the client files, HR. */
export const HANDED_TO = ["STOCK", "CLIENTS", "PEOPLE"] as const;
export type HandedTo = (typeof HANDED_TO)[number];

/** A filter of the list: the reports not closed yet. */
export const NOT_CLOSED = "NOT_CLOSED";

/** The description of a resident's complaint whose report carries no details. */
export const RESIDENT_COMPLAINT_TEXT = "شكوى من أحد السكان";

const blankToNull = (text: string | null | undefined) => {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

// ── The list ────────────────────────────────────────────────────────────────

export interface ProblemLine {
  id: string;
  kind: ProblemKind;
  details: string | null;
  status: ProblemStatus;
  reportedVia: ProblemVia;
  occurredDate: string;
  occurredTime: string | null;
  logged: LocalMoment;
  file: { id: string; number: string; division: string };
  site: { name: string | null; address: string };
  client: { id: string; name: string };
  visit: { id: string; number: string } | null;
  /** The worker who reported it, when known. */
  reporter: ComplaintWorker | null;
  /** The employee dealing with it. */
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  handedTo: HandedTo | null;
  actionTaken: string | null;
  closed: LocalMoment | null;
  /** The complaint it became. */
  complaint: { id: string; number: string } | null;
  correctiveTaskId: string | null;
}

/**
 * The reports, those not closed first, latest first. `status` keeps one status
 * (or `NOT_CLOSED`), `kind` one kind, `handedTo` those handed to one owner.
 */
export async function listProblemReports(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    status?: ProblemStatus | typeof NOT_CLOSED | null;
    kind?: ProblemKind | null;
    handedTo?: HandedTo | null;
    fileId?: string | null;
  } = {},
): Promise<ProblemLine[]> {
  requireSection(ctx, "REQUESTS", "READ");
  let rows = ex
    .selectFrom("ProblemReport")
    .innerJoin("File", "File.id", "ProblemReport.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .leftJoin("Visit", "Visit.id", "ProblemReport.visitId")
    .leftJoin("StaffMember as Reporter", "Reporter.id", "ProblemReport.reportedByWorkerId")
    .leftJoin("StaffMember as Assignee", "Assignee.id", "ProblemReport.assignedToEmployeeId")
    .leftJoin("Complaint", "Complaint.id", "ProblemReport.complaintId")
    .select([
      "ProblemReport.id",
      "ProblemReport.kind",
      "ProblemReport.details",
      "ProblemReport.status",
      "ProblemReport.reportedVia",
      "ProblemReport.occurredDate",
      "ProblemReport.occurredTime",
      "ProblemReport.loggedAt",
      "ProblemReport.handedTo",
      "ProblemReport.actionTaken",
      "ProblemReport.closedAt",
      "ProblemReport.correctiveTaskId",
      "File.id as fileId",
      "File.number as fileNumber",
      "File.division as fileDivision",
      "Site.commonName as siteName",
      "Site.address as siteAddress",
      "Client.id as clientId",
      "Client.name as clientName",
      "Visit.id as visitId",
      "Visit.number as visitNumber",
      "Reporter.id as reporterId",
      "Reporter.number as reporterNumber",
      "Reporter.firstName as reporterFirstName",
      "Reporter.lastName as reporterLastName",
      "Assignee.id as assigneeId",
      "Assignee.firstName as assigneeFirstName",
      "Assignee.lastName as assigneeLastName",
      "Complaint.id as complaintId",
      "Complaint.number as complaintNumber",
    ]);
  if (input.status === NOT_CLOSED) rows = rows.where("ProblemReport.status", "!=", "CLOSED");
  else if (input.status) rows = rows.where("ProblemReport.status", "=", input.status);
  if (input.kind) rows = rows.where("ProblemReport.kind", "=", input.kind);
  if (input.handedTo) rows = rows.where("ProblemReport.handedTo", "=", input.handedTo);
  if (input.fileId) rows = rows.where("ProblemReport.fileId", "=", input.fileId);

  const found = await rows
    .orderBy((eb) => eb.case().when("ProblemReport.status", "=", "CLOSED").then(1).else(0).end())
    .orderBy("ProblemReport.occurredDate", "desc")
    .orderBy("ProblemReport.loggedAt", "desc")
    .execute();
  return found.map((row) => ({
    id: row.id,
    kind: row.kind as ProblemKind,
    details: row.details,
    status: row.status as ProblemStatus,
    reportedVia: row.reportedVia as ProblemVia,
    occurredDate: row.occurredDate,
    occurredTime: row.occurredTime,
    logged: ctx.toLocal(row.loggedAt),
    file: { id: row.fileId, number: row.fileNumber, division: row.fileDivision },
    site: { name: row.siteName, address: row.siteAddress },
    client: { id: row.clientId, name: row.clientName },
    visit: row.visitId && row.visitNumber ? { id: row.visitId, number: row.visitNumber } : null,
    reporter:
      row.reporterId && row.reporterNumber
        ? {
            id: row.reporterId,
            number: row.reporterNumber,
            firstName: row.reporterFirstName ?? "",
            lastName: row.reporterLastName ?? "",
          }
        : null,
    assignedTo: row.assigneeId
      ? { id: row.assigneeId, firstName: row.assigneeFirstName ?? "", lastName: row.assigneeLastName ?? "" }
      : null,
    handedTo: (row.handedTo as HandedTo | null) ?? null,
    actionTaken: row.actionTaken,
    closed: row.closedAt ? ctx.toLocal(row.closedAt) : null,
    complaint: row.complaintId && row.complaintNumber ? { id: row.complaintId, number: row.complaintNumber } : null,
    correctiveTaskId: row.correctiveTaskId,
  }));
}

// ── A report phoned in ──────────────────────────────────────────────────────

export interface LogProblemReportInput {
  fileId: string;
  visitId?: string | null;
  reportedVia: ProblemVia;
  reportedByWorkerId?: string | null;
  occurredDate: string;
  occurredTime?: string | null;
  kind: ProblemKind;
  details?: string | null;
}

/** The office logs a problem it heard of by phone or from a supervisor: one report, open. */
export async function logProblemReport(
  ex: Executor,
  ctx: ServiceContext,
  input: LogProblemReportInput,
): Promise<{ problemReportId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(PROBLEM_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`operations: unknown problem kind ${input.kind}`);
  }
  if (!(TYPED_PROBLEM_VIAS as readonly string[]).includes(input.reportedVia)) {
    throw new Error(`operations: a typed report comes by phone or from a supervisor, not ${input.reportedVia}`);
  }
  const file = await ex
    .selectFrom("File")
    .select(["id", "number"])
    .where("id", "=", input.fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This client file does not exist.");
  const visitId = blankToNull(input.visitId);
  if (visitId) {
    const visit = await ex.selectFrom("Visit").select("fileId").where("id", "=", visitId).executeTakeFirst();
    if (!visit) throw new ServiceError("This visit does not exist.");
    if (visit.fileId !== file.id) throw new ServiceError("This visit belongs to another client file.");
  }
  const workerId = blankToNull(input.reportedByWorkerId);
  if (workerId) {
    const worker = await ex
      .selectFrom("StaffMember")
      .select("id")
      .where("id", "=", workerId)
      .where("kind", "=", "WORKER")
      .executeTakeFirst();
    if (!worker) throw new ServiceError("This worker does not exist.");
  }
  if (!isIsoDate(input.occurredDate)) throw new ServiceError("Enter a valid date.");
  if (input.occurredDate > ctx.today) throw new ServiceError("The date cannot be after today.");
  const time = blankToNull(input.occurredTime);
  if (time && !isClockTime(time)) throw new ServiceError("Enter a time as HH:MM.");

  const id = newId();
  const details = blankToNull(input.details);
  await ex
    .insertInto("ProblemReport")
    .values({
      id,
      fileId: file.id,
      visitId,
      reportedByWorkerId: workerId,
      reportedVia: input.reportedVia,
      occurredDate: localDate(input.occurredDate),
      occurredTime: time ? localTime(time) : null,
      loggedAt: ctx.now,
      loggedByUserId: ctx.userId,
      kind: input.kind,
      details,
      status: "OPEN",
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "ProblemReport",
    entityId: id,
    entityLabel: file.number,
    changes: { status: [null, "OPEN"], kind: [null, input.kind], reportedVia: [null, input.reportedVia] },
    context: { fileId: file.id, visitId, occurredDate: input.occurredDate },
  });
  return { problemReportId: id };
}

// ── Dealing with a report ───────────────────────────────────────────────────

async function reportForChange(ex: Executor, problemReportId: string) {
  const report = await ex
    .selectFrom("ProblemReport")
    .innerJoin("File", "File.id", "ProblemReport.fileId")
    .select([
      "ProblemReport.id",
      "ProblemReport.fileId",
      "ProblemReport.visitId",
      "ProblemReport.kind",
      "ProblemReport.details",
      "ProblemReport.reportedVia",
      "ProblemReport.status",
      "ProblemReport.assignedToEmployeeId",
      "ProblemReport.handedTo",
      "ProblemReport.actionTaken",
      "ProblemReport.closedAt",
      "ProblemReport.closedByUserId",
      "ProblemReport.complaintId",
      "File.number as fileNumber",
      "File.clientId",
    ])
    .where("ProblemReport.id", "=", problemReportId)
    .executeTakeFirst();
  if (!report) throw new ServiceError("This report does not exist.");
  return report;
}

type ReportForChange = Awaited<ReturnType<typeof reportForChange>>;

/** The columns dealing with a report writes. */
type ReportPatch = Partial<
  Pick<
    ReportForChange,
    "status" | "assignedToEmployeeId" | "handedTo" | "actionTaken" | "closedAt" | "closedByUserId" | "complaintId"
  >
>;

function refuseClosed(report: ReportForChange): void {
  if (report.status === "CLOSED") throw new ServiceError("This report is closed.");
}

async function writeReport(
  ex: Executor,
  ctx: ServiceContext,
  report: ReportForChange,
  patch: ReportPatch,
  log: { action: "STATUS_CHANGE" | "UPDATE"; context?: Record<string, unknown> },
): Promise<void> {
  const { set, changes } = changedColumns(report, patch);
  if (!changes) return;
  await ex
    .updateTable("ProblemReport")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", report.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: set.status !== undefined ? log.action : "UPDATE",
    entity: "ProblemReport",
    entityId: report.id,
    entityLabel: report.fileNumber,
    changes,
    context: log.context,
  });
}

/**
 * The office takes a report in hand: it is being dealt with, by the employee
 * named (the one signed in, when he is an employee of the centre).
 */
export async function takeProblemInHand(
  ex: Executor,
  ctx: ServiceContext,
  input: { problemReportId: string; assignedToEmployeeId?: string | null },
): Promise<{ status: ProblemStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const report = await reportForChange(ex, input.problemReportId);
  refuseClosed(report);
  if (report.status === "IN_PROGRESS") throw new ServiceError("This report is already being dealt with.");
  const employeeId = blankToNull(input.assignedToEmployeeId) ?? ctx.staffMemberId;
  if (employeeId) {
    const employee = await ex
      .selectFrom("StaffMember")
      .select("id")
      .where("id", "=", employeeId)
      .where("kind", "=", "EMPLOYEE")
      .executeTakeFirst();
    if (!employee) throw new ServiceError("This employee does not exist.");
  }
  const status: ProblemStatus = "IN_PROGRESS";
  await writeReport(
    ex,
    ctx,
    report,
    { status, ...(employeeId ? { assignedToEmployeeId: employeeId } : {}) },
    { action: "STATUS_CHANGE" },
  );
  return { status };
}

/**
 * The report goes to the owner who can act on it: a shortage to the stock, an
 * extra-service lead or an access matter to the client files, an injury or a
 * breakage to HR. That owner lists it (`problem.handedOver`) and closes it
 * through `closeHandedProblem`. Handed over once.
 */
export async function handOverProblem(
  ex: Executor,
  ctx: ServiceContext,
  input: { problemReportId: string; to: HandedTo },
): Promise<{ status: ProblemStatus; handedTo: HandedTo }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(HANDED_TO as readonly string[]).includes(input.to)) throw new Error(`operations: cannot hand over to ${input.to}`);
  const report = await reportForChange(ex, input.problemReportId);
  refuseClosed(report);
  if (report.handedTo) throw new ServiceError("This report is already handed over.");
  const status: ProblemStatus = "IN_PROGRESS";
  await writeReport(ex, ctx, report, { status, handedTo: input.to }, { action: "STATUS_CHANGE" });
  await emit(ex, ctx, "problem.handedOver", { problemReportId: report.id, to: input.to });
  return { status, handedTo: input.to };
}

async function closeReport(
  ex: Executor,
  ctx: ServiceContext,
  report: ReportForChange,
  actionTaken: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const status: ProblemStatus = "CLOSED";
  await writeReport(
    ex,
    ctx,
    report,
    { status, actionTaken, closedAt: ctx.now, closedByUserId: ctx.userId },
    { action: "STATUS_CHANGE", context },
  );
}

/** The office closes a report with what was done («الإجراء المتخذ»). */
export async function closeProblemReport(
  ex: Executor,
  ctx: ServiceContext,
  input: { problemReportId: string; actionTaken: string },
): Promise<{ status: ProblemStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const actionTaken = blankToNull(input.actionTaken);
  if (!actionTaken) throw new ServiceError("Write what was done.");
  const report = await reportForChange(ex, input.problemReportId);
  refuseClosed(report);
  await closeReport(ex, ctx, report, actionTaken);
  return { status: "CLOSED" };
}

/**
 * For the owner a report was handed to (CONTRACTS section 3): it closes the
 * report with what that owner did, so the handed-over lists empty. A report
 * the office closed already is left as it is. The caller checks its own
 * section; this checks none.
 */
export async function closeHandedProblem(
  ex: Executor,
  ctx: ServiceContext,
  problemReportId: string,
  input: { actionTaken: string },
): Promise<{ closed: boolean }> {
  const actionTaken = blankToNull(input.actionTaken);
  if (!actionTaken) throw new ServiceError("Write what was done.");
  const report = await reportForChange(ex, problemReportId);
  if (!report.handedTo) throw new ServiceError("This report was not handed over.");
  if (report.status === "CLOSED") return { closed: false };
  await closeReport(ex, ctx, report, actionTaken, { closedBy: report.handedTo });
  return { closed: true };
}

// ── A resident's complaint ──────────────────────────────────────────────────

/** How a complaint that came as a report reached the office. */
const CHANNEL_OF_VIA: Record<ProblemVia, ComplaintChannel> = {
  ORDER: "VIA_WORKER",
  PHONE: "PHONE",
  SUPERVISOR: "SUPERVISOR",
};

export interface ProblemToComplaintInput {
  problemReportId: string;
  kind: ComplaintKind;
  /** Defaults to the report's details. */
  description?: string | null;
  complainantName?: string | null;
  complainantPhone?: string | null;
}

/**
 * «شكوى من أحد السكان» becomes a complaint of the file's client, about the
 * report's visit, with its counter running from now. The report is then
 * closed: the complaint carries it on.
 */
export async function problemToComplaint(
  ex: Executor,
  ctx: ServiceContext,
  input: ProblemToComplaintInput,
): Promise<{ complaintId: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(COMPLAINT_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`operations: unknown complaint kind ${input.kind}`);
  }
  const report = await reportForChange(ex, input.problemReportId);
  if (report.kind !== "RESIDENT_COMPLAINT") throw new ServiceError("Only a resident's complaint becomes a complaint.");
  if (report.complaintId) throw new ServiceError("This report is already a complaint.");
  refuseClosed(report);

  const complaint = await openComplaint(ex, ctx, {
    channel: CHANNEL_OF_VIA[report.reportedVia as ProblemVia] ?? "PHONE",
    clientId: report.clientId,
    fileId: report.fileId,
    visitId: report.visitId,
    complainantName: input.complainantName,
    complainantPhone: input.complainantPhone,
    kind: input.kind,
    description: blankToNull(input.description) ?? report.details ?? RESIDENT_COMPLAINT_TEXT,
  });
  const status: ProblemStatus = "CLOSED";
  await writeReport(
    ex,
    ctx,
    report,
    { status, complaintId: complaint.complaintId, closedAt: ctx.now, closedByUserId: ctx.userId },
    { action: "STATUS_CHANGE", context: { complaint: complaint.number } },
  );
  return complaint;
}

// ── Demo data ───────────────────────────────────────────────────────────────

/**
 * The complaints and reports of the demo, through the services, on top of
 * Operations' returned orders: a complaint received this morning about the
 * order signed off with notes (open, inside its target), one about the other
 * returned order settled with an agreed discount and the client told, and the
 * shortage a supervisor phoned in handed to the stock. Run twice, it adds
 * nothing.
 */
export async function demoComplaints(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  // Both demo complaints came by phone; a complaint on an order is the sign-off's own.
  const already = await ex.selectFrom("Complaint").select("id").where("channel", "=", "PHONE").executeTakeFirst();
  if (already) return names;

  const returned = await ex
    .selectFrom("VisitReport")
    .innerJoin("Visit", "Visit.id", "VisitReport.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .select(["Visit.id", "Visit.fileId", "Visit.visitDate", "File.clientId", "VisitReport.signoffStatus"])
    .where("VisitReport.entryState", "=", "COMPLETE")
    .where("Visit.visitDate", "<", ctx.today)
    .orderBy("Visit.visitDate", "desc")
    .orderBy("Visit.number", "desc")
    .limit(2)
    .execute();
  const teamOf = async (visitId: string) =>
    (
      await ex
        .selectFrom("VisitWorker")
        .select("workerId")
        .where("visitId", "=", visitId)
        .where("seatStatus", "=", "ASSIGNED")
        .orderBy("createdAt")
        .executeTakeFirst()
    )?.workerId ?? null;

  const withNotes = returned.find((visit) => visit.signoffStatus === "ACCEPTED_WITH_NOTES") ?? returned[0];
  const other = returned.find((visit) => visit !== withNotes);

  // Settled: the client phoned the evening of the visit; answered at once, a discount agreed the next morning.
  if (other) {
    const evening = tools.at(ctx.toInstant(localDate(other.visitDate), localTime("16:00")));
    const { complaintId } = await openComplaint(ex, evening, {
      channel: "PHONE",
      clientId: other.clientId,
      visitId: other.id,
      workerId: await teamOf(other.id),
      kind: "DELAY",
      description: "وصل الفريق متأخراً عن الموعد المتفق عليه.",
    });
    await recordFirstResponse(ex, tools.at(ctx.toInstant(localDate(other.visitDate), localTime("16:20"))), {
      complaintId,
      note: "اعتذرنا للعميل ووعدناه بالرد بعد مراجعة أمر المهمة.",
    });
    const morning = tools.at(ctx.toInstant(ctx.today, localTime("08:15")));
    await settleComplaint(ex, morning, {
      complaintId,
      centreAtFault: "YES",
      settlement: "DISCOUNT",
      amount: 150_000,
      resolutionNote: "خصم متفق عليه مع العميل على الفاتورة القادمة.",
    });
    await recordClientTold(ex, tools.at(ctx.toInstant(ctx.today, localTime("08:30"))), { complaintId });
    names.complaintSettled = complaintId;
  }

  // Open: received now, about the order signed off with notes, two office hours to answer.
  if (withNotes) {
    const { complaintId } = await openComplaint(ex, ctx, {
      channel: "PHONE",
      clientId: withNotes.clientId,
      visitId: withNotes.id,
      workerId: await teamOf(withNotes.id),
      kind: "QUALITY",
      description: "المكان المغلق لم يُنظَّف، والعميل يطلب إعادة تنظيفه هذا الأسبوع.",
    });
    names.complaintOpen = complaintId;
  }

  // Handed over: a supervisor phoned in a shortage of products on the latest file; the stock deals with it.
  const fileId = withNotes?.fileId ?? other?.fileId;
  if (fileId) {
    const { problemReportId } = await logProblemReport(ex, ctx, {
      fileId,
      visitId: withNotes?.id ?? null,
      reportedVia: "SUPERVISOR",
      occurredDate: withNotes?.visitDate ?? ctx.today,
      kind: "MATERIAL_SHORTAGE",
      details: "نفد منظف الزجاج قبل نهاية العمل.",
    });
    await handOverProblem(ex, ctx, { problemReportId, to: "STOCK" });
    names.problemHandedOver = problemReportId;
  }
  return names;
}

export const listProblemReportsQuery = query(listProblemReports);
export const logProblemReportAction = action(logProblemReport, { revalidate: [PROBLEMS_PATH] });
export const takeProblemInHandAction = action(takeProblemInHand, { revalidate: [PROBLEMS_PATH] });
export const handOverProblemAction = action(handOverProblem, {
  revalidate: [PROBLEMS_PATH, "/dashboard/inventory", "/dashboard/files", "/dashboard/workers"],
});
export const closeProblemReportAction = action(closeProblemReport, { revalidate: [PROBLEMS_PATH] });
export const problemToComplaintAction = action(problemToComplaint, {
  revalidate: [PROBLEMS_PATH, "/dashboard/clients"],
});
