import { isDate } from "@/features/people/rules/dates";
import { TRAINING_ATTENDANCES, type TrainingAttendanceStatus } from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { normaliseName } from "@/lib/text/normalise";
import { staffName } from "@/lib/text/names";
import { localDate } from "@/lib/units";

import { HIRING_PATH } from "./hiring";

/**
 * Training (feature 37): his eight training days (D1), the sessions the centre
 * holds, who attended, and the skills a worker masters (#25 «الخدمات والآلات
 * التي يتقنها»). A worker who attended every required day has her training
 * completed on the day of the last one.
 */

function requireTraining(ctx: ServiceContext): void {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
}

/**
 * The day her training was completed: the day of the last required day she
 * attended, once she attended them all; cleared if a correction undoes it.
 * Only this service writes it.
 */
async function settleCompletion(ex: Executor, ctx: ServiceContext, staffId: string): Promise<void> {
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "trainingCompletedDate"])
    .where("id", "=", staffId)
    .executeTakeFirst();
  if (!worker) return;
  const required = await ex
    .selectFrom("TrainingModule")
    .select("id")
    .where("isRequired", "=", 1)
    .where("isActive", "=", 1)
    .execute();
  if (required.length === 0) return;
  const attended = await ex
    .selectFrom("TrainingAttendance as a")
    .innerJoin("TrainingSession as s", "s.id", "a.sessionId")
    .select(["s.moduleId", "s.date"])
    .where("a.staffId", "=", staffId)
    .where("a.status", "=", "ATTENDED")
    .where("s.deletedAt", "is", null)
    .where("s.date", "<=", ctx.today)
    .execute();
  const done = new Set(attended.map((row) => row.moduleId));
  const complete = required.every((module) => done.has(module.id));
  const date = complete
    ? (attended
        .map((row) => row.date)
        .sort()
        .at(-1) as string)
    : null;
  if (date === worker.trainingCompletedDate) return;
  await ex
    .updateTable("StaffMember")
    .set({ trainingCompletedDate: date ? localDate(date) : null, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", staffId)
    .execute();
}

/** For the day-start job: the workers whose training days came between two dates may have finished. */
export async function settleTrainingCompletions(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: string; to: string },
): Promise<void> {
  const rows = await ex
    .selectFrom("TrainingAttendance as a")
    .innerJoin("TrainingSession as s", "s.id", "a.sessionId")
    .select("a.staffId")
    .distinct()
    .where("s.date", ">=", localDate(input.from))
    .where("s.date", "<=", localDate(input.to))
    .execute();
  for (const row of rows) await settleCompletion(ex, ctx, row.staffId);
}

async function moduleOf(ex: Executor, code: string) {
  const module = await ex
    .selectFrom("TrainingModule")
    .select(["id", "code"])
    .where("code", "=", code)
    .executeTakeFirst();
  if (!module) throw new ServiceError("Choose the training day.");
  return module;
}

/** A training session: the day, which of his days it teaches, and the workers expected. */
export async function planTrainingSession(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    date: string;
    moduleCode: string;
    trainerEmployeeId?: string | null;
    place?: string | null;
    note?: string | null;
    staffIds: readonly string[];
  },
): Promise<{ id: string }> {
  requireTraining(ctx);
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.staffIds.length === 0) throw new ServiceError("Choose at least one worker.");
  const module = await moduleOf(ex, input.moduleCode);
  const id = newId();
  await ex
    .insertInto("TrainingSession")
    .values({
      id,
      date: localDate(input.date),
      moduleId: module.id,
      trainerEmployeeId: input.trainerEmployeeId || null,
      place: input.place?.trim() || null,
      note: input.note?.trim() || null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  for (const staffId of new Set(input.staffIds))
    await setTrainingAttendance(ex, ctx, { sessionId: id, staffId, status: "ATTENDED" });
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "TrainingSession",
    entityId: id,
    entityLabel: `${input.date} ${module.code}`,
    changes: { date: [null, input.date] },
    context: { workers: input.staffIds.length },
  });
  return { id };
}

/**
 * Whether a worker attended a session. Planned workers are written as
 * attending; after the day, the office marks who was absent or excused.
 */
export async function setTrainingAttendance(
  ex: Executor,
  ctx: ServiceContext,
  input: { sessionId: string; staffId: string; status: TrainingAttendanceStatus; note?: string | null },
): Promise<void> {
  requireTraining(ctx);
  if (!(TRAINING_ATTENDANCES as readonly string[]).includes(input.status))
    throw new ServiceError("Choose attended or not.");
  const session = await ex
    .selectFrom("TrainingSession")
    .select(["id", "date"])
    .where("id", "=", input.sessionId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!session) throw new ServiceError("This training session does not exist.");
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "firstName", "lastName", "engagementStatus"])
    .where("id", "=", input.staffId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!worker || worker.kind !== "WORKER") throw new ServiceError("This worker does not exist.");
  const before = await ex
    .selectFrom("TrainingAttendance")
    .select(["id", "status"])
    .where("sessionId", "=", session.id)
    .where("staffId", "=", worker.id)
    .executeTakeFirst();
  if (before) {
    if (before.status === input.status) return;
    await ex
      .updateTable("TrainingAttendance")
      .set({ status: input.status, note: input.note?.trim() || null, updatedAt: ctx.now })
      .where("id", "=", before.id)
      .execute();
  } else {
    await ex
      .insertInto("TrainingAttendance")
      .values({
        id: newId(),
        sessionId: session.id,
        staffId: worker.id,
        status: input.status,
        note: input.note?.trim() || null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: before ? "UPDATE" : "CREATE",
    entity: "TrainingAttendance",
    entityId: session.id,
    entityLabel: `${session.date} ${worker.number}`,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
    changes: { status: [before?.status ?? null, input.status] },
  });
  await settleCompletion(ex, ctx, worker.id);
}

/** Takes a planned session away, with the reason; its attendance no longer counts. */
export async function cancelTrainingSession(
  ex: Executor,
  ctx: ServiceContext,
  input: { sessionId: string; reason: string },
): Promise<void> {
  requireTraining(ctx);
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the change.");
  const session = await ex
    .selectFrom("TrainingSession")
    .select(["id", "date"])
    .where("id", "=", input.sessionId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!session) throw new ServiceError("This training session does not exist.");
  await ex
    .updateTable("TrainingSession")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now })
    .where("id", "=", session.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "PEOPLE",
    action: "SOFT_DELETE",
    reason,
    entity: "TrainingSession",
    entityId: session.id,
    entityLabel: session.date,
  });
}

export interface TrainingSessionRow {
  id: string;
  date: string;
  moduleCode: string;
  place: string | null;
  note: string | null;
  trainerName: string | null;
  attendees: Array<{ staffId: string; number: string; name: string; status: TrainingAttendanceStatus }>;
}

/** The sessions of a period, the latest first. */
export async function listTrainingSessions(
  ex: Executor,
  ctx: ServiceContext,
  input: { from?: string; to?: string } = {},
): Promise<TrainingSessionRow[]> {
  requireSection(ctx, "WORKERS", "READ");
  let rows = ex
    .selectFrom("TrainingSession as s")
    .innerJoin("TrainingModule as m", "m.id", "s.moduleId")
    .leftJoin("StaffMember as t", "t.id", "s.trainerEmployeeId")
    .select(["s.id", "s.date", "s.place", "s.note", "m.code", "t.firstName", "t.lastName"])
    .where("s.deletedAt", "is", null);
  if (input.from && isDate(input.from)) rows = rows.where("s.date", ">=", localDate(input.from));
  if (input.to && isDate(input.to)) rows = rows.where("s.date", "<=", localDate(input.to));
  const sessions = await rows.orderBy("s.date", "desc").execute();
  const ids = sessions.map((session) => session.id);
  const attendees = ids.length
    ? await ex
        .selectFrom("TrainingAttendance as a")
        .innerJoin("StaffMember as w", "w.id", "a.staffId")
        .select(["a.sessionId", "a.staffId", "a.status", "w.number", "w.numberSeq", "w.firstName", "w.lastName"])
        .where("a.sessionId", "in", ids)
        .orderBy("w.numberSeq")
        .execute()
    : [];
  return sessions.map((session) => ({
    id: session.id,
    date: session.date,
    moduleCode: session.code,
    place: session.place,
    note: session.note,
    trainerName: session.lastName || session.firstName ? staffName(session) : null,
    attendees: attendees
      .filter((row) => row.sessionId === session.id)
      .map((row) => ({
        staffId: row.staffId,
        number: row.number,
        name: staffName(row),
        status: row.status as TrainingAttendanceStatus,
      })),
  }));
}

// ── Skills (#25, س12): a list the centre keeps, empty at first ─────────────────

export async function listSkills(ex: Executor) {
  return ex
    .selectFrom("Skill")
    .select(["id", "code", "labelAr", "labelFr", "labelEn"])
    .where("isActive", "=", 1)
    .orderBy("sortOrder")
    .orderBy("labelAr")
    .execute();
}

/** A skill added to the centre's list, once: two spellings of one name are one skill. */
export async function addSkill(
  ex: Executor,
  ctx: ServiceContext,
  input: { labelAr: string; labelFr?: string | null },
): Promise<{ code: string }> {
  requireTraining(ctx);
  const labelAr = input.labelAr.trim().replace(/\s+/g, " ");
  if (labelAr === "") throw new ServiceError("Write the name of the skill.");
  const skills = await ex.selectFrom("Skill").select(["code", "labelAr", "sortOrder"]).execute();
  const same = skills.find((skill) => normaliseName(skill.labelAr) === normaliseName(labelAr));
  if (same) return { code: same.code };
  const number = skills.length + 1;
  const code = `SKILL_${String(number).padStart(3, "0")}`;
  await ex
    .insertInto("Skill")
    .values({
      id: newId(),
      code,
      labelAr,
      labelFr: input.labelFr?.trim() || null,
      sortOrder: number,
      isActive: 1,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "Skill",
    entityId: code,
    entityLabel: labelAr,
  });
  return { code };
}

/** The skills a worker masters, as codes of the list. */
export async function setWorkerSkills(
  ex: Executor,
  ctx: ServiceContext,
  input: { workerId: string; skillCodes: readonly string[] },
): Promise<void> {
  requireTraining(ctx);
  const known = new Set((await listSkills(ex)).map((skill) => skill.code));
  const codes = [...new Set(input.skillCodes)].filter((code) => known.has(code)).sort();
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "firstName", "lastName", "skillCodes"])
    .where("id", "=", input.workerId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!worker || worker.kind !== "WORKER") throw new ServiceError("This worker does not exist.");
  const next = codes.length ? JSON.stringify(codes) : null;
  if (next === worker.skillCodes) return;
  await ex
    .updateTable("StaffMember")
    .set({ skillCodes: next, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", worker.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "StaffMember",
    entityId: worker.id,
    entityLabel: `${worker.number} ${staffName(worker)}`,
    subject: { kind: "WORKER", id: worker.id, label: staffName(worker) },
    changes: { skillCodes: [worker.skillCodes, next] },
  });
}

// What the screens import.
const REFRESH = [HIRING_PATH, "/dashboard/workers"];
export const listTrainingSessionsQuery = query(listTrainingSessions);
export const listSkillsQuery = query((ex: Executor) => listSkills(ex));
export const planTrainingSessionAction = action(planTrainingSession, { revalidate: REFRESH });
export const setTrainingAttendanceAction = action(setTrainingAttendance, { revalidate: REFRESH });
export const cancelTrainingSessionAction = action(cancelTrainingSession, { revalidate: REFRESH });
export const addSkillAction = action(addSkill, { revalidate: REFRESH });
export const setWorkerSkillsAction = action(setWorkerSkills, { revalidate: REFRESH });
