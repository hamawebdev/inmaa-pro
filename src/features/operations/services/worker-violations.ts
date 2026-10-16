import { createViolationFromSource } from "@/features/people/services/violations";
import { requireSection } from "@/lib/access/session";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { staffName } from "@/lib/text/names";
import { localDate, type LocalDate } from "@/lib/units";

import { INSPECTIONS_PATH } from "./inspections";

/**
 * «تسجيل مخالفة» (#14, #16, #18 with People's #37): where one of this folder's
 * records finds a named worker at fault, the office hands her to HR as a
 * violation, through People's `createViolationFromSource`, in the same
 * transaction. It arrives OPEN, minor unless said otherwise; HR or the manager
 * decides what follows.
 *
 * - a complaint settled with the centre at fault, which names a worker;
 * - a supervisor's inspection done, for each worker he noted with a remark
 *   or found absent;
 * - a «تلف أو كسر» report, for each worker of the visit it is about.
 *
 * A worker is handed over once per record.
 */

export const VIOLATION_RECORD_KINDS = ["COMPLAINT", "INSPECTION", "PROBLEM_REPORT"] as const;
export type ViolationRecordKind = (typeof VIOLATION_RECORD_KINDS)[number];

export interface ViolationCandidate {
  workerId: string;
  name: string;
  /** The day of the fault: the violation's date. */
  date: LocalDate;
  /** What the record says about her: the description offered. */
  description: string;
  /** The violation already recorded for her on this record, if any. */
  violation: { id: string; number: string; status: string } | null;
}

const SOURCE_COLUMN = {
  COMPLAINT: "complaintId",
  INSPECTION: "inspectionId",
  PROBLEM_REPORT: "problemReportId",
} as const satisfies Record<ViolationRecordKind, string>;

async function candidatesOf(
  ex: Executor,
  ctx: ServiceContext,
  kind: ViolationRecordKind,
  sourceId: string,
): Promise<ViolationCandidate[]> {
  let found: Array<Omit<ViolationCandidate, "name" | "violation">> = [];
  if (kind === "COMPLAINT") {
    const complaint = await ex
      .selectFrom("Complaint")
      .leftJoin("Visit", "Visit.id", "Complaint.visitId")
      .select([
        "Complaint.workerId",
        "Complaint.status",
        "Complaint.centreAtFault",
        "Complaint.receivedAt",
        "Complaint.description",
        "Visit.visitDate",
      ])
      .where("Complaint.id", "=", sourceId)
      .executeTakeFirst();
    if (!complaint) throw new ServiceError("This complaint does not exist.");
    if (complaint.workerId && complaint.status === "SETTLED" && complaint.centreAtFault === "YES") {
      const received = ctx.toLocal(complaint.receivedAt).date;
      // The day it happened: the visit's, unless the complaint names none (or one still to come).
      const date = complaint.visitDate && complaint.visitDate <= received ? localDate(complaint.visitDate) : received;
      found = [{ workerId: complaint.workerId, date, description: complaint.description }];
    }
  } else if (kind === "INSPECTION") {
    const inspection = await ex
      .selectFrom("Inspection")
      .select(["id", "number", "status", "doneDate"])
      .where("id", "=", sourceId)
      .executeTakeFirst();
    if (!inspection) throw new ServiceError("This inspection does not exist.");
    if (inspection.status === "DONE" && inspection.doneDate) {
      const notes = await ex
        .selectFrom("InspectionWorkerNote")
        .select(["workerId", "present", "remark"])
        .where("inspectionId", "=", inspection.id)
        .orderBy("createdAt")
        .execute();
      const doneDate = localDate(inspection.doneDate);
      found = notes.flatMap((note) => {
        const remark = note.remark?.trim() ?? "";
        if (remark === "" && note.present !== 0) return [];
        const absent = `غائب(ة) عند زيارة التفتيش ${inspection.number}`;
        return [{ workerId: note.workerId, date: doneDate, description: remark || absent }];
      });
    }
  } else {
    const report = await ex
      .selectFrom("ProblemReport")
      .select(["id", "kind", "visitId", "occurredDate", "details"])
      .where("id", "=", sourceId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!report) throw new ServiceError("This report does not exist.");
    if (report.kind === "DAMAGE_DURING_WORK" && report.visitId) {
      const seats = await ex
        .selectFrom("VisitWorker")
        .select("workerId")
        .where("visitId", "=", report.visitId)
        .where("seatStatus", "=", "ASSIGNED")
        .orderBy("createdAt")
        .execute();
      const description = report.details?.trim() || "تلف أو كسر أثناء العمل";
      found = seats.map((seat) => ({ workerId: seat.workerId, date: localDate(report.occurredDate), description }));
    }
  }
  if (found.length === 0) return [];

  const ids = found.map((each) => each.workerId);
  const [people, recorded] = await Promise.all([
    ex.selectFrom("StaffMember").select(["id", "firstName", "lastName"]).where("id", "in", ids).execute(),
    ex
      .selectFrom("Violation")
      .select(["id", "number", "status", "staffId"])
      .where(SOURCE_COLUMN[kind], "=", sourceId)
      .where("staffId", "in", ids)
      .where("status", "!=", "CANCELLED")
      .execute(),
  ]);
  return found.map((each) => {
    const person = people.find((row) => row.id === each.workerId);
    const violation = recorded.find((row) => row.staffId === each.workerId);
    return {
      ...each,
      date: each.date > ctx.today ? ctx.today : each.date,
      name: person ? staffName(person) : "",
      violation: violation ? { id: violation.id, number: violation.number, status: violation.status } : null,
    };
  });
}

/** The workers a record finds at fault, each with the violation already recorded for her, if any. */
export async function listViolationCandidates(
  ex: Executor,
  ctx: ServiceContext,
  input: { kind: ViolationRecordKind; sourceId: string },
): Promise<ViolationCandidate[]> {
  requireSection(ctx, "REQUESTS", "READ");
  if (!(VIOLATION_RECORD_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`operations: unknown violation record ${input.kind}`);
  }
  return candidatesOf(ex, ctx, input.kind, input.sourceId);
}

/** Hands one worker a record finds at fault to HR as a violation (People's `createViolationFromSource`). */
export async function recordWorkerViolation(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    kind: ViolationRecordKind;
    sourceId: string;
    workerId: string;
    description: string;
    serious?: boolean;
  },
): Promise<{ id: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(VIOLATION_RECORD_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`operations: unknown violation record ${input.kind}`);
  }
  const candidate = (await candidatesOf(ex, ctx, input.kind, input.sourceId)).find(
    (each) => each.workerId === input.workerId,
  );
  if (!candidate) throw new ServiceError("This record does not find this worker at fault.");
  if (candidate.violation) throw new ServiceError("A violation is already recorded for this worker on this record.");
  return createViolationFromSource(ex, ctx, {
    workerId: candidate.workerId,
    date: candidate.date,
    sourceKind: input.kind,
    sourceId: input.sourceId,
    description: input.description.trim() || candidate.description,
    severity: input.serious ? "SERIOUS" : "MINOR",
  });
}

export const listViolationCandidatesQuery = query(listViolationCandidates);
export const recordWorkerViolationAction = action(recordWorkerViolation, {
  revalidate: [INSPECTIONS_PATH, "/dashboard/workers", "/dashboard/hiring"],
});
