import { addDays, isDate } from "@/features/people/rules/dates";
import { evaluationResult } from "@/features/people/rules/scores";
import {
  EVALUATION_CRITERIA,
  EVALUATION_RECOMMENDATIONS,
  type EvaluationCriterion,
  type EvaluationRecommendation,
} from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { staffName } from "@/lib/text/names";
import { localDate } from "@/lib/units";

import { HIRING_PATH } from "./hiring";
import { workerHours } from "./hours";
import { staffOf } from "./staff-shared";

/**
 * «التقييم الدوري» (article 16 of his regulations): seven criteria, each on
 * the scale of `evaluation.scaleMax`, every `evaluation.periodMonths`, with a
 * recommendation: train her, change her, or nothing. The figures of her
 * period (days worked, lateness, absences, orders not typed) are kept with it,
 * as they were on the day it was written.
 */

export type EvaluationScores = Record<EvaluationCriterion, number>;

/** The total in percent of the most the seven criteria can give (`rules/scores.ts`). */
export function evaluationTotal(scores: EvaluationScores, scaleMax: number): number {
  return evaluationResult(scores, scaleMax).percent ?? 0;
}

export async function recordEvaluation(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    staffId: string;
    periodStart: string;
    periodEnd: string;
    evaluatorEmployeeId?: string | null;
    scores: EvaluationScores;
    comment?: string | null;
    recommendation?: EvaluationRecommendation | null;
  },
): Promise<{ id: string; total: number }> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  if (!isDate(input.periodStart) || !isDate(input.periodEnd)) throw new ServiceError("Enter a valid date.");
  if (input.periodEnd < input.periodStart) throw new ServiceError("The end date must not be before the start date.");
  if (input.periodStart > ctx.today) throw new ServiceError("A period still to come cannot be evaluated yet.");
  const { "evaluation.scaleMax": scaleMax } = await getSettings(ex, ["evaluation.scaleMax"]);
  for (const key of EVALUATION_CRITERIA) {
    const value = input.scores[key];
    if (!Number.isInteger(value) || value < 1 || value > scaleMax) {
      throw new ServiceError("Give each criterion a mark from 1 to {max}.".replace("{max}", String(scaleMax)));
    }
  }
  const recommendation = input.recommendation || null;
  if (recommendation && !(EVALUATION_RECOMMENDATIONS as readonly string[]).includes(recommendation)) {
    throw new ServiceError("Choose the recommendation.");
  }
  const worker = await staffOf(ex, "WORKER", input.staffId);
  const [hours] = await workerHours(ex, ctx, { from: input.periodStart, to: input.periodEnd, workerId: worker.id });
  const figures = hours
    ? {
        daysWorked: hours.totals.daysWorked,
        workedMin: hours.totals.workedMin,
        lateCount: hours.totals.lateCount,
        absenceMin: hours.totals.absenceMin,
        ordersNotTyped: hours.totals.ordersNotTyped,
      }
    : null;
  const total = evaluationTotal(input.scores, scaleMax);
  const id = newId();
  await ex
    .insertInto("PeriodicEvaluation")
    .values({
      id,
      staffId: worker.id,
      periodStart: localDate(input.periodStart),
      periodEnd: localDate(input.periodEnd),
      evaluatorEmployeeId: input.evaluatorEmployeeId || null,
      ...input.scores,
      scaleMax,
      total,
      comment: input.comment?.trim() || null,
      recommendation,
      figuresSnapshot: figures ? JSON.stringify(figures) : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "PeriodicEvaluation",
    entityId: id,
    entityLabel: `${worker.number} ${input.periodStart}–${input.periodEnd}`,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
    changes: { total: [null, total], recommendation: [null, recommendation] },
  });
  return { id, total };
}

/** An evaluation written in error, taken off with the reason. */
export async function deleteEvaluation(
  ex: Executor,
  ctx: ServiceContext,
  input: { evaluationId: string; reason: string },
): Promise<void> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the change.");
  const evaluation = await ex
    .selectFrom("PeriodicEvaluation")
    .select(["id", "staffId", "periodStart", "periodEnd"])
    .where("id", "=", input.evaluationId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!evaluation) throw new ServiceError("This evaluation does not exist.");
  const worker = await staffOf(ex, "WORKER", evaluation.staffId);
  await ex
    .updateTable("PeriodicEvaluation")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", evaluation.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "PEOPLE",
    action: "SOFT_DELETE",
    reason,
    entity: "PeriodicEvaluation",
    entityId: evaluation.id,
    entityLabel: `${worker.number} ${evaluation.periodStart}–${evaluation.periodEnd}`,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
  });
}

export interface EvaluationRow {
  id: string;
  staffId: string;
  staffNumber: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  scores: EvaluationScores;
  scaleMax: number;
  total: number;
  comment: string | null;
  recommendation: EvaluationRecommendation | null;
  figures: Record<string, number> | null;
}

export async function listEvaluations(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId?: string | null } = {},
): Promise<EvaluationRow[]> {
  requireSection(ctx, "WORKERS", "READ");
  let rows = ex
    .selectFrom("PeriodicEvaluation as e")
    .innerJoin("StaffMember as w", "w.id", "e.staffId")
    .selectAll("e")
    .select(["w.number as staffNumber", "w.firstName", "w.lastName"])
    .where("e.deletedAt", "is", null);
  if (input.staffId) rows = rows.where("e.staffId", "=", input.staffId);
  const found = await rows.orderBy("e.periodEnd", "desc").execute();
  return found.map((row) => {
    let figures: Record<string, number> | null = null;
    try {
      figures = row.figuresSnapshot ? (JSON.parse(row.figuresSnapshot) as Record<string, number>) : null;
    } catch {
      figures = null;
    }
    return {
      id: row.id,
      staffId: row.staffId,
      staffNumber: row.staffNumber,
      staffName: staffName(row),
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      scores: Object.fromEntries(EVALUATION_CRITERIA.map((key) => [key, row[key]])) as EvaluationScores,
      scaleMax: row.scaleMax,
      total: row.total,
      comment: row.comment,
      recommendation: row.recommendation as EvaluationRecommendation | null,
      figures,
    };
  });
}

export interface EvaluationDue {
  staffId: string;
  number: string;
  name: string;
  /** The day the next period starts: the end of the last one, or her first day. */
  since: string;
  lastTotal: number | null;
}

/**
 * Workers in post whose evaluation is due: `evaluation.periodMonths` have
 * passed since the end of the last one, or since they started.
 */
export async function listEvaluationsDue(ex: Executor, ctx: ServiceContext): Promise<EvaluationDue[]> {
  requireSection(ctx, "WORKERS", "READ");
  const { "evaluation.periodMonths": months } = await getSettings(ex, ["evaluation.periodMonths"]);
  const workers = await ex
    .selectFrom("StaffMember")
    .select(["id", "number", "numberSeq", "firstName", "lastName", "startDate", "registrationDate"])
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .where("engagementStatus", "in", ["ACCEPTED", "ON_TRIAL"])
    .orderBy("numberSeq")
    .execute();
  const last = await ex
    .selectFrom("PeriodicEvaluation")
    .select(["staffId", "periodEnd", "total"])
    .where("deletedAt", "is", null)
    .orderBy("periodEnd")
    .execute();
  const due: EvaluationDue[] = [];
  for (const worker of workers) {
    const latest = last.filter((row) => row.staffId === worker.id).at(-1);
    const since = latest ? addDays(latest.periodEnd, 1) : (worker.startDate ?? worker.registrationDate);
    const [year, month, day] = since.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
    if (next <= ctx.today) {
      due.push({
        staffId: worker.id,
        number: worker.number,
        name: staffName(worker),
        since,
        lastTotal: latest?.total ?? null,
      });
    }
  }
  return due;
}

// What the screens import.
const REFRESH = [HIRING_PATH, "/dashboard/workers"];
export const listEvaluationsQuery = query(listEvaluations);
export const listEvaluationsDueQuery = query((ex: Executor, ctx: ServiceContext) => listEvaluationsDue(ex, ctx));
export const recordEvaluationAction = action(recordEvaluation, { revalidate: REFRESH });
export const deleteEvaluationAction = action(deleteEvaluation, { revalidate: REFRESH });
