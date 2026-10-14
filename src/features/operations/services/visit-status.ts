import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange } from "@/lib/log";
import { nextNumbers } from "@/lib/numbering";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, localTime, type LocalDate, type LocalTime } from "@/lib/units";

import type { VisitStatus } from "../validators/option-codes";
import { insertSeat, judgeSeat, readVisitForSeat, settleVisitTeam, workerForSeat } from "./assignment";
import { OPEN_STATUSES, VISITS_PATH } from "./programme";

/**
 * One visit postponed, cancelled or reopened (#10), with the reason the office
 * gives. A postponed visit with a new date gets its make-up visit, keeping the
 * team where the working-time rules let it. Money follows every change through
 * `visit.statusChanged` (CONTRACTS.md section 4).
 */

/** The reasons the office may give. PROGRAMME_CHANGED is the program's own, written by a programme update. */
export const VISIT_STATUS_REASONS = [
  "CLIENT_REQUEST",
  "CLIENT_ABSENT",
  "LATE_CANCELLATION",
  "NO_WORKER",
  "ACCESS_BLOCKED",
  "MATERIALS_MISSING",
  "CONTRACT_ENDED",
  "CLIENT_SUSPENDED",
  "CENTRE_DECISION",
  "OTHER",
] as const;
export type VisitStatusReason = (typeof VISIT_STATUS_REASONS)[number];

async function openVisit(ex: Executor, visitId: string) {
  const visit = await ex.selectFrom("Visit").selectAll().where("id", "=", visitId).executeTakeFirst();
  if (!visit) throw new ServiceError("This visit does not exist.");
  return visit;
}

function checkReason(reason: string, note: string): string {
  if (!(VISIT_STATUS_REASONS as readonly string[]).includes(reason))
    throw new Error(`operations: unknown reason ${reason}`);
  const typed = note.trim();
  if (!typed) throw new ServiceError("Write why.");
  return typed;
}

export interface PostponeVisitInput {
  visitId: string;
  reason: VisitStatusReason;
  note: string;
  /** The make-up visit's day and start; without a date, the visit waits to be placed. */
  newDate?: LocalDate | null;
  newStartTime?: LocalTime | null;
}

export async function postponeVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: PostponeVisitInput,
): Promise<{ makeupVisitId: string | null; seated: number }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const note = checkReason(input.reason, input.note);
  const visit = await openVisit(ex, input.visitId);
  if (!OPEN_STATUSES.includes(visit.status as VisitStatus)) {
    throw new ServiceError("Only a visit still to happen can be postponed or cancelled.");
  }
  if (input.newDate && input.newDate < ctx.today)
    throw new ServiceError("A make-up visit is planned for today or later.");

  let makeupVisitId: string | null = null;
  let seated = 0;
  if (input.newDate) {
    const [number] = await nextNumbers(ex, ctx, "VISIT", { date: input.newDate, count: 1 });
    makeupVisitId = newId();
    await ex
      .insertInto("Visit")
      .values({
        id: makeupVisitId,
        numberSeq: number.seq,
        numberYear: number.year,
        number: number.display,
        fileId: visit.fileId,
        origin: "MAKEUP",
        sourceVisitId: visit.id,
        visitDate: localDate(input.newDate),
        plannedStartTime: input.newStartTime ? localTime(input.newStartTime) : visit.plannedStartTime,
        plannedDurationMin: visit.plannedDurationMin,
        workersNeeded: visit.workersNeeded,
        zoneId: visit.zoneId,
        supervisorEmployeeId: visit.supervisorEmployeeId,
        status: "AWAITING_CONFIRMATION",
        statusChangedAt: ctx.now,
        statusChangedByUserId: ctx.userId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    // The same team where the rules let each one come; the others' seats stay open.
    const team = await ex
      .selectFrom("VisitWorker")
      .select("workerId")
      .where("visitId", "=", visit.id)
      .where("seatStatus", "=", "ASSIGNED")
      .orderBy("createdAt")
      .execute();
    const makeup = await readVisitForSeat(ex, makeupVisitId);
    for (const { workerId } of team) {
      try {
        const worker = await workerForSeat(ex, ctx, workerId);
        await judgeSeat(ex, ctx, worker, makeup, null);
        await insertSeat(ex, ctx, { visitId: makeupVisitId, worker });
        seated += 1;
      } catch (error) {
        if (!(error instanceof ServiceError)) throw error;
      }
    }
    await settleVisitTeam(ex, ctx, makeupVisitId);
  }

  await ex
    .updateTable("Visit")
    .set({
      status: "POSTPONED",
      statusReason: input.reason,
      statusNote: note,
      statusChangedAt: ctx.now,
      statusChangedByUserId: ctx.userId,
      rescheduledToVisitId: makeupVisitId,
      ...(visit.orderPrintedAt ? { planChangedAt: ctx.now } : {}),
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    reason: note,
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    changes: { status: [visit.status, "POSTPONED"], statusReason: [visit.statusReason, input.reason] },
    context: { makeupVisitId, seated },
  });
  await emit(ex, ctx, "visit.statusChanged", { visitId: visit.id });
  return { makeupVisitId, seated };
}

export async function cancelVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string; reason: VisitStatusReason; note: string },
): Promise<{ status: VisitStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const note = checkReason(input.reason, input.note);
  const visit = await openVisit(ex, input.visitId);
  if (!OPEN_STATUSES.includes(visit.status as VisitStatus)) {
    throw new ServiceError("Only a visit still to happen can be postponed or cancelled.");
  }
  await ex
    .updateTable("Visit")
    .set({
      status: "CANCELLED",
      statusReason: input.reason,
      statusNote: note,
      statusChangedAt: ctx.now,
      statusChangedByUserId: ctx.userId,
      ...(visit.orderPrintedAt ? { planChangedAt: ctx.now } : {}),
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CANCEL",
    reason: note,
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    changes: { status: [visit.status, "CANCELLED"], statusReason: [visit.statusReason, input.reason] },
  });
  await emit(ex, ctx, "visit.statusChanged", { visitId: visit.id });
  return { status: "CANCELLED" };
}

/** A postponed or cancelled visit opened again (behind `visit.reopen`), with the reason. */
export async function reopenVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string; reason: string },
): Promise<{ status: VisitStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  requireCapability(ctx, "visit.reopen");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("Write why.");
  const visit = await openVisit(ex, input.visitId);
  if (visit.status !== "POSTPONED" && visit.status !== "CANCELLED") {
    throw new ServiceError("Only a postponed or cancelled visit can be opened again.");
  }
  if (visit.statusReason === "PROGRAMME_CHANGED")
    throw new ServiceError("This visit was dropped by a programme change.");
  if (visit.rescheduledToVisitId) throw new ServiceError("This visit already has its make-up visit.");
  await ex
    .updateTable("Visit")
    .set({
      status: "AWAITING_CONFIRMATION",
      statusReason: null,
      statusNote: null,
      statusChangedAt: ctx.now,
      statusChangedByUserId: ctx.userId,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  const status = await settleVisitTeam(ex, ctx, visit.id);
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    reason,
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    changes: { status: [visit.status, status] },
  });
  await emit(ex, ctx, "visit.statusChanged", { visitId: visit.id });
  return { status };
}

export const postponeVisitAction = action(postponeVisit, { revalidate: [VISITS_PATH, "/dashboard/files"] });
export const cancelVisitAction = action(cancelVisit, { revalidate: [VISITS_PATH, "/dashboard/files"] });
export const reopenVisitAction = action(reopenVisit, { revalidate: [VISITS_PATH, "/dashboard/files"] });
