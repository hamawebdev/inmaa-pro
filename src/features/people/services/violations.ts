import { isDate } from "@/features/people/rules/dates";
import {
  ARTICLE_14_ITEMS,
  REGULATION_ARTICLES,
  VIOLATION_ACTIONS,
  VIOLATION_SEVERITIES,
  VIOLATION_SOURCES,
  type ViolationAction,
  type ViolationSeverity,
  type ViolationSource,
  type ViolationStatus,
} from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { staffName } from "@/lib/text/names";
import { localDate } from "@/lib/units";

import { HIRING_PATH } from "./hiring";
import { addDebtEntry, mayWriteLedger, type DeferredDebt } from "./payouts";
import { setSanction } from "./sanctions";
import { recordLeaving, staffOf } from "./staff-shared";

/**
 * «توثيق المخالفات الجسيمة» (article 17 of his regulations). A violation is
 * written by the office, or handed over by Operations from a complaint, an
 * inspection, a visit or a problem report (`createViolationFromSource`), and
 * waits OPEN until HR or the manager decides what follows: nothing, a
 * warning, a deduction (a line in the ledger), a suspension or a penalty (a
 * sanction, the manager's), or the end of the registration. Numbered, never
 * deleted: cancelled with a reason.
 */

const SOURCE_COLUMN: Record<
  Exclude<ViolationSource, "OFFICE">,
  "complaintId" | "inspectionId" | "visitId" | "problemReportId"
> = {
  COMPLAINT: "complaintId",
  INSPECTION: "inspectionId",
  VISIT: "visitId",
  PROBLEM_REPORT: "problemReportId",
};

function requireConduct(ctx: ServiceContext): void {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
}

interface NewViolation {
  workerId: string;
  date: string;
  severity: ViolationSeverity;
  description: string;
  article?: string | null;
  article14Item?: string | null;
  reportedByEmployeeId?: string | null;
  staffStatement?: string | null;
  sourceKind: ViolationSource;
  sourceId?: string | null;
}

async function insertViolation(
  ex: Executor,
  ctx: ServiceContext,
  input: NewViolation,
): Promise<{ id: string; number: string }> {
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date > ctx.today) throw new ServiceError("The date cannot be after today.");
  const description = input.description.trim();
  if (description === "") throw new ServiceError("Describe the violation.");
  if (!(VIOLATION_SEVERITIES as readonly string[]).includes(input.severity))
    throw new ServiceError("Choose how serious it is.");
  const article = input.article || null;
  if (article && !(REGULATION_ARTICLES as readonly string[]).includes(article))
    throw new ServiceError("Choose the article.");
  const item = article === "ART_14" ? input.article14Item || null : null;
  if (item && !(ARTICLE_14_ITEMS as readonly string[]).includes(item)) throw new ServiceError("Choose the article.");
  if (!(VIOLATION_SOURCES as readonly string[]).includes(input.sourceKind))
    throw new Error("people: unknown violation source");
  const worker = await staffOf(ex, "WORKER", input.workerId);
  const number = await nextNumber(ex, ctx, "VIOLATION", { date: localDate(input.date) });
  const id = newId();
  const source = input.sourceKind === "OFFICE" ? null : SOURCE_COLUMN[input.sourceKind];
  await ex
    .insertInto("Violation")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      staffId: worker.id,
      date: localDate(input.date),
      article,
      article14Item: item,
      severity: input.severity,
      description,
      reportedByEmployeeId: input.reportedByEmployeeId || null,
      sourceKind: input.sourceKind,
      complaintId: source === "complaintId" ? (input.sourceId ?? null) : null,
      inspectionId: source === "inspectionId" ? (input.sourceId ?? null) : null,
      visitId: source === "visitId" ? (input.sourceId ?? null) : null,
      problemReportId: source === "problemReportId" ? (input.sourceId ?? null) : null,
      staffStatement: input.staffStatement?.trim() || null,
      status: "OPEN",
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "Violation",
    entityId: id,
    entityLabel: number.display,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
    changes: { status: [null, "OPEN"] },
    context: { source: input.sourceKind, severity: input.severity, article },
  });
  return { id, number: number.display };
}

/** A violation written by the office. */
export async function recordViolation(
  ex: Executor,
  ctx: ServiceContext,
  input: Omit<NewViolation, "sourceKind" | "sourceId">,
): Promise<{ id: string; number: string }> {
  requireConduct(ctx);
  return insertViolation(ex, ctx, { ...input, sourceKind: "OFFICE" });
}

/**
 * For Operations (CONTRACTS section 3): a violation found in one of its rows,
 * OPEN with no action, for HR or the manager to decide. Its seriousness is
 * HR's to judge when deciding; it arrives as minor unless said.
 */
export async function createViolationFromSource(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    workerId: string;
    date: string;
    sourceKind: Exclude<ViolationSource, "OFFICE">;
    sourceId: string;
    description: string;
    article?: string | null;
    severity?: ViolationSeverity;
  },
): Promise<{ id: string; number: string }> {
  if (!(input.sourceKind in SOURCE_COLUMN)) throw new Error("people: a violation from a source names its source");
  return insertViolation(ex, ctx, { ...input, severity: input.severity ?? "MINOR" });
}

export interface DecideViolationInput {
  violationId: string;
  action: ViolationAction;
  /** The day the action takes effect; today when left out. */
  actionDate?: string | null;
  severity?: ViolationSeverity;
  /** DEDUCTION: centimes. */
  amount?: number | null;
  /** SUSPENSION, PENALTY: the last day, empty until lifted. */
  endDate?: string | null;
  staffStatement?: string | null;
}

/** What follows a violation. A suspension or a penalty is a sanction, and so the manager's. */
export async function decideViolation(ex: Executor, ctx: ServiceContext, input: DecideViolationInput): Promise<void> {
  requireConduct(ctx);
  if (!(VIOLATION_ACTIONS as readonly string[]).includes(input.action)) throw new ServiceError("Choose what follows.");
  const violation = await ex.selectFrom("Violation").selectAll().where("id", "=", input.violationId).executeTakeFirst();
  if (!violation) throw new ServiceError("This violation does not exist.");
  if (violation.status !== "OPEN") throw new ServiceError("This violation has already been decided.");
  const date = input.actionDate?.trim() || ctx.today;
  if (!isDate(date)) throw new ServiceError("Enter a valid date.");
  const worker = await staffOf(ex, "WORKER", violation.staffId);
  const reason = `${violation.number}: ${violation.description}`;
  let debtPending: DeferredDebt[] | null = null;

  switch (input.action) {
    case "DEDUCTION": {
      if (!input.amount || !Number.isSafeInteger(input.amount) || input.amount <= 0) {
        throw new ServiceError("Enter an amount above zero.");
      }
      const line = {
        staffId: worker.id,
        date,
        direction: "INCREASE" as const,
        reason: "OTHER" as const,
        amount: input.amount,
        violationId: violation.id,
        note: reason,
      };
      // Two laptops: where the books are not, the line goes with the decision's log entry, for the books' laptop.
      if (await mayWriteLedger(ex, ctx)) await addDebtEntry(ex, ctx, line);
      else debtPending = [line];
      break;
    }
    case "SUSPENSION":
    case "PENALTY":
      await setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: worker.id,
        state: input.action === "SUSPENSION" ? "SUSPENDED" : "PENALISED",
        reason,
        startDate: date,
        endDate: input.endDate || null,
        violationId: violation.id,
      });
      break;
    case "END_REGISTRATION":
      await recordLeaving(ex, ctx, "WORKER", { id: worker.id, leftDate: date, reason });
      break;
    default:
      break;
  }

  const severity = input.severity ?? (violation.severity as ViolationSeverity);
  await ex
    .updateTable("Violation")
    .set({
      action: input.action,
      status: "DECIDED",
      actionDate: localDate(date),
      decidedByUserId: ctx.userId,
      ...(severity !== violation.severity ? { severity } : {}),
      ...(input.staffStatement?.trim() ? { staffStatement: input.staffStatement.trim() } : {}),
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", violation.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "STATUS_CHANGE",
    entity: "Violation",
    entityId: violation.id,
    entityLabel: violation.number,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
    changes: { status: ["OPEN", "DECIDED"], action: [null, input.action] },
    context: debtPending ? { debtPending } : undefined,
  });
}

/** An open violation found to be no violation, with the reason. */
export async function cancelViolation(
  ex: Executor,
  ctx: ServiceContext,
  input: { violationId: string; reason: string },
): Promise<void> {
  requireConduct(ctx);
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the change.");
  const violation = await ex.selectFrom("Violation").selectAll().where("id", "=", input.violationId).executeTakeFirst();
  if (!violation) throw new ServiceError("This violation does not exist.");
  if (violation.status !== "OPEN") throw new ServiceError("This violation has already been decided.");
  const worker = await staffOf(ex, "WORKER", violation.staffId);
  await ex
    .updateTable("Violation")
    .set({ status: "CANCELLED", cancelReason: reason, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", violation.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CANCEL",
    reason,
    entity: "Violation",
    entityId: violation.id,
    entityLabel: violation.number,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
    changes: { status: ["OPEN", "CANCELLED"] },
  });
}

export interface ViolationRow {
  id: string;
  number: string;
  staffId: string;
  staffNumber: string;
  staffName: string;
  date: string;
  article: string | null;
  article14Item: string | null;
  severity: ViolationSeverity;
  description: string;
  sourceKind: ViolationSource;
  staffStatement: string | null;
  action: ViolationAction | null;
  status: ViolationStatus;
  actionDate: string | null;
  cancelReason: string | null;
}

export async function listViolations(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId?: string | null; status?: ViolationStatus | null } = {},
): Promise<ViolationRow[]> {
  requireSection(ctx, "WORKERS", "READ");
  let rows = ex
    .selectFrom("Violation as v")
    .innerJoin("StaffMember as w", "w.id", "v.staffId")
    .selectAll("v")
    .select(["w.number as staffNumber", "w.firstName", "w.lastName"]);
  if (input.staffId) rows = rows.where("v.staffId", "=", input.staffId);
  if (input.status) rows = rows.where("v.status", "=", input.status);
  const found = await rows.orderBy("v.date", "desc").orderBy("v.numberSeq", "desc").execute();
  return found.map((row) => ({
    id: row.id,
    number: row.number,
    staffId: row.staffId,
    staffNumber: row.staffNumber,
    staffName: staffName(row),
    date: row.date,
    article: row.article,
    article14Item: row.article14Item,
    severity: row.severity as ViolationSeverity,
    description: row.description,
    sourceKind: row.sourceKind as ViolationSource,
    staffStatement: row.staffStatement,
    action: row.action as ViolationAction | null,
    status: row.status as ViolationStatus,
    actionDate: row.actionDate,
    cancelReason: row.cancelReason,
  }));
}

/** How many violations wait for a decision: the home screen's tile. */
export async function countOpenViolations(ex: Executor): Promise<number> {
  const row = await ex
    .selectFrom("Violation")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "=", "OPEN")
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

// What the screens import.
const REFRESH = [HIRING_PATH, "/dashboard/workers"];
export const listViolationsQuery = query(listViolations);
export const recordViolationAction = action(recordViolation, { revalidate: REFRESH });
export const decideViolationAction = action(decideViolation, { revalidate: [...REFRESH, "/dashboard/hours-pay"] });
export const cancelViolationAction = action(cancelViolation, { revalidate: REFRESH });
