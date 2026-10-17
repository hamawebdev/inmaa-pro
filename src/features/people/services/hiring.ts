import { addDays, isDate } from "@/features/people/rules/dates";
import {
  HIRING_DECISIONS,
  INTERVIEW_STATUSES,
  TRAINING_MODULES,
  type EngagementStatus,
  type HiringDecision,
  type InterviewStatus,
} from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting, getSettings } from "@/lib/settings";
import { staffName } from "@/lib/text/names";
import { localDate, localTime } from "@/lib/units";

import { announceRefusal, insertStatus, staffOf } from "./staff-shared";
import { STATUS_OF_DECISION } from "./workers";

/**
 * Hiring (feature 37): the candidates, their interview, the administration's
 * decision and the trial. The interview's ten points per criterion are the
 * confidential part of his form, on the worker's file; here is when it took
 * place and what came of it.
 */

export const HIRING_PATH = "/dashboard/hiring";

const isTime = (text: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
const subjectOf = (worker: { id: string; lastName: string; firstName: string }) => ({
  kind: "WORKER" as const,
  id: worker.id,
  label: staffName(worker),
});

function requireHiring(ctx: ServiceContext): void {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
}

export async function scheduleInterview(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    staffId: string;
    date: string;
    time?: string | null;
    interviewerEmployeeId?: string | null;
    note?: string | null;
  },
): Promise<{ id: string }> {
  requireHiring(ctx);
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  const time = input.time?.trim() || null;
  if (time && !isTime(time)) throw new ServiceError("Enter a valid time.");
  const worker = await staffOf(ex, "WORKER", input.staffId);
  if (worker.engagementStatus === "LEFT") throw new ServiceError("This worker has left: readmit her first.");
  const id = newId();
  await ex
    .insertInto("HiringInterview")
    .values({
      id,
      staffId: worker.id,
      scheduledDate: localDate(input.date),
      scheduledTime: time ? localTime(time) : null,
      interviewerEmployeeId: input.interviewerEmployeeId || null,
      status: "SCHEDULED",
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
    entity: "HiringInterview",
    entityId: id,
    entityLabel: `${worker.number} ${staffName(worker)}`,
    subject: subjectOf(worker),
    changes: { scheduledDate: [null, input.date] },
  });
  return { id };
}

/** What came of an interview. A cancelled one says why. */
export async function recordInterviewOutcome(
  ex: Executor,
  ctx: ServiceContext,
  input: { interviewId: string; status: InterviewStatus; note?: string | null },
): Promise<void> {
  requireHiring(ctx);
  if (!(INTERVIEW_STATUSES as readonly string[]).includes(input.status) || input.status === "SCHEDULED") {
    throw new ServiceError("Choose what came of the interview.");
  }
  const interview = await ex
    .selectFrom("HiringInterview")
    .selectAll()
    .where("id", "=", input.interviewId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!interview) throw new ServiceError("This interview does not exist.");
  if (interview.status !== "SCHEDULED") throw new ServiceError("This interview has already been recorded.");
  const note = input.note?.trim() || null;
  if (input.status === "CANCELLED" && !note) throw new ServiceError("Write why the interview is cancelled.");
  const worker = await staffOf(ex, "WORKER", interview.staffId);
  await ex
    .updateTable("HiringInterview")
    .set({ status: input.status, note: note ?? interview.note, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", interview.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: input.status === "CANCELLED" ? "CANCEL" : "STATUS_CHANGE",
    reason: input.status === "CANCELLED" ? (note ?? undefined) : undefined,
    entity: "HiringInterview",
    entityId: interview.id,
    entityLabel: `${worker.number} ${staffName(worker)}`,
    subject: subjectOf(worker),
    changes: { status: ["SCHEDULED", input.status] },
  });
}

/**
 * «قرار الإدارة»: accepted, accepted on trial, or refused. A trial ends on the
 * day given, else after `hiring.trialDays`. The worker's status follows.
 */
export async function decideHiring(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    staffId: string;
    decision: HiringDecision;
    date?: string | null;
    trialEndDate?: string | null;
    note?: string | null;
  },
): Promise<void> {
  // «قرار الإدارة» is the administration's: hiring.decide alone, reading the workers' section (ACC-13).
  requireSection(ctx, "WORKERS", "READ");
  requireCapability(ctx, "hiring.decide");
  if (!(HIRING_DECISIONS as readonly string[]).includes(input.decision)) throw new ServiceError("Choose the decision.");
  const date = input.date?.trim() || ctx.today;
  if (!isDate(date)) throw new ServiceError("Enter a valid date.");
  const worker = await staffOf(ex, "WORKER", input.staffId);
  if (worker.engagementStatus === "LEFT") throw new ServiceError("This worker has left: readmit her first.");
  // A refused worker comes back by readmission, which asks the manager about her sanction (PEO-10).
  if (worker.engagementStatus === "REFUSED") throw new ServiceError("This worker was refused: readmit her first.");
  let trialEndDate: string | null = null;
  if (input.decision === "ACCEPTED_ON_TRIAL") {
    trialEndDate = input.trialEndDate?.trim() || addDays(date, await getSetting(ex, "hiring.trialDays"));
    if (!isDate(trialEndDate) || trialEndDate <= date) throw new ServiceError("The trial must end after the decision.");
  }
  if (!ctx.userId) throw new Error("people: a hiring decision needs the user who took it");
  await ex
    .insertInto("HiringDecision")
    .values({
      id: newId(),
      staffId: worker.id,
      decision: input.decision,
      decisionDate: localDate(date),
      decidedByUserId: ctx.userId,
      trialEndDate: trialEndDate ? localDate(trialEndDate) : null,
      note: input.note?.trim() || null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .execute();
  const status: EngagementStatus = STATUS_OF_DECISION[input.decision];
  const { set, changes } = changedColumns(worker, { engagementStatus: status });
  if (changes) {
    await ex
      .updateTable("StaffMember")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", worker.id)
      .execute();
    await insertStatus(ex, ctx, {
      staffId: worker.id,
      date: localDate(date),
      from: worker.engagementStatus,
      to: status,
    });
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "STATUS_CHANGE",
    entity: "StaffMember",
    entityId: worker.id,
    entityLabel: `${worker.number} ${staffName(worker)}`,
    subject: subjectOf(worker),
    changes: changes ?? { engagementStatus: [worker.engagementStatus, status] },
    context: { decision: input.decision, trialEndDate },
  });
  if (status === "REFUSED") {
    await announceRefusal(ex, ctx, { workerId: worker.id, date: localDate(date), note: input.note?.trim() || null });
  }
}

export interface CandidateRow {
  id: string;
  number: string;
  name: string;
  sex: string;
  phone: string;
  status: EngagementStatus;
  registrationDate: string;
  interview: { id: string; date: string; time: string | null; status: InterviewStatus } | null;
  decision: { decision: HiringDecision; date: string; trialEndDate: string | null } | null;
  /** The trial ends within `alerts.trialEndLeadDays`, or has ended with no later decision. */
  trialEnding: boolean;
  training: { done: number; required: number; completedDate: string | null };
}

/** Candidates and workers on trial, with their interview, the decision and the training days done. */
export async function listCandidates(ex: Executor, ctx: ServiceContext): Promise<CandidateRow[]> {
  requireSection(ctx, "WORKERS", "READ");
  const workers = await ex
    .selectFrom("StaffMember")
    .select(["id", "number", "numberSeq", "firstName", "lastName", "sex", "phone", "engagementStatus"])
    .select(["registrationDate", "trainingCompletedDate"])
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .where("engagementStatus", "in", ["CANDIDATE", "ON_TRIAL"])
    .orderBy("numberSeq", "desc")
    .execute();
  const ids = workers.map((worker) => worker.id);
  if (ids.length === 0) return [];
  const [interviews, decisions, attended, required, settings] = await Promise.all([
    ex
      .selectFrom("HiringInterview")
      .select(["id", "staffId", "scheduledDate", "scheduledTime", "status"])
      .where("staffId", "in", ids)
      .where("deletedAt", "is", null)
      .orderBy("scheduledDate")
      .execute(),
    ex
      .selectFrom("HiringDecision")
      .select(["staffId", "decision", "decisionDate", "trialEndDate"])
      .where("staffId", "in", ids)
      .orderBy("decisionDate")
      .orderBy("createdAt")
      .execute(),
    ex
      .selectFrom("TrainingAttendance as a")
      .innerJoin("TrainingSession as s", "s.id", "a.sessionId")
      .innerJoin("TrainingModule as m", "m.id", "s.moduleId")
      .select(["a.staffId", "m.code"])
      .where("a.staffId", "in", ids)
      .where("a.status", "=", "ATTENDED")
      .where("s.deletedAt", "is", null)
      .where("s.date", "<=", ctx.today)
      .where("m.isRequired", "=", 1)
      .execute(),
    ex.selectFrom("TrainingModule").select("code").where("isRequired", "=", 1).where("isActive", "=", 1).execute(),
    getSettings(ex, ["alerts.trialEndLeadDays"]),
  ]);
  const lead = addDays(ctx.today, settings["alerts.trialEndLeadDays"]);
  return workers.map((worker) => {
    const own = interviews.filter((interview) => interview.staffId === worker.id);
    const interview = own.find((each) => each.status === "SCHEDULED") ?? own.at(-1) ?? null;
    const decision = decisions.filter((each) => each.staffId === worker.id).at(-1) ?? null;
    const done = new Set(attended.filter((row) => row.staffId === worker.id).map((row) => row.code));
    return {
      id: worker.id,
      number: worker.number,
      name: staffName(worker),
      sex: worker.sex,
      phone: worker.phone,
      status: worker.engagementStatus as EngagementStatus,
      registrationDate: worker.registrationDate,
      interview: interview
        ? {
            id: interview.id,
            date: interview.scheduledDate,
            time: interview.scheduledTime,
            status: interview.status as InterviewStatus,
          }
        : null,
      decision: decision
        ? {
            decision: decision.decision as HiringDecision,
            date: decision.decisionDate,
            trialEndDate: decision.trialEndDate,
          }
        : null,
      trialEnding:
        decision?.decision === "ACCEPTED_ON_TRIAL" && decision.trialEndDate !== null && decision.trialEndDate <= lead,
      training: {
        done: [...done].length,
        required: required.length || TRAINING_MODULES.length,
        completedDate: worker.trainingCompletedDate,
      },
    };
  });
}

// What the screens import.
const REFRESH = [HIRING_PATH, "/dashboard/workers"];
export const listCandidatesQuery = query((ex: Executor, ctx: ServiceContext) => listCandidates(ex, ctx));
export const scheduleInterviewAction = action(scheduleInterview, { revalidate: REFRESH });
export const recordInterviewOutcomeAction = action(recordInterviewOutcome, { revalidate: REFRESH });
export const decideHiringAction = action(decideHiring, { revalidate: REFRESH });
