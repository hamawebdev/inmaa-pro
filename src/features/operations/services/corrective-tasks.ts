import { listEmployees } from "@/features/people/services/employees";
import { ACTIVE_STATUSES } from "@/features/people/services/staff-exports";
import type { JobPosition } from "@/features/people/validators/staff-codes";
import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { staffName } from "@/lib/text/names";
import { localDate, type LocalDate } from "@/lib/units";

import { addDays, isIsoDate } from "../rules/calendar";
import { DEFAULT_CORRECTIVE_DUE_DAYS } from "../rules/inspection-score";
import {
  CORRECTIVE_SOURCES,
  OPEN_TASK_STATUSES,
  type CorrectiveSource,
  type TaskStatus,
} from "../validators/inspection";
import { CORRECTIVE_ACTIONS, type CorrectiveAction } from "../validators/option-codes";

/**
 * Corrective tasks (#17 «إجراء تصحيحي بموعد ومسؤول»): what must be put right
 * after a low inspection, a complaint, a problem report or a sign-off «تحتاج
 * إلى تصحيح», by when, and who answers for it.
 *
 * A task is born OPEN, may be started (IN_PROGRESS), and ends DONE with what
 * was done, or CANCELLED with the reason. Nobody may take it out of OPEN
 * without a person responsible. A task is never deleted.
 */

export const CORRECTIVE_TASKS_PATH = "/dashboard/quality";

const blankToNull = (text: string | null | undefined) => {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const isOpen = (status: string) => (OPEN_TASK_STATUSES as readonly string[]).includes(status);

// ── Checks shared by the writes ─────────────────────────────────────────────

/** The person responsible must be one of the centre's employees. */
async function checkAssignee(ex: Executor, employeeId: string | null | undefined): Promise<void> {
  if (!employeeId) return;
  const person = await ex
    .selectFrom("StaffMember")
    .select(["kind"])
    .where("id", "=", employeeId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (person?.kind !== "EMPLOYEE") throw new ServiceError("Choose an employee as the person responsible.");
}

/** The worker a training or a change is about. */
async function workerOf(ex: Executor, workerId: string | null | undefined) {
  if (!workerId) return null;
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number"])
    .where("id", "=", workerId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (worker?.kind !== "WORKER") throw new ServiceError("This worker does not exist.");
  return worker;
}

/** A visit named on a task (the one at fault, the re-service) must be one of the file's. */
async function checkVisits(ex: Executor, fileId: string, visitIds: readonly (string | null | undefined)[]) {
  const wanted = [...new Set(visitIds.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return;
  const found = await ex.selectFrom("Visit").select(["id", "fileId"]).where("id", "in", wanted).execute();
  if (found.length !== wanted.length || found.some((visit) => visit.fileId !== fileId)) {
    throw new ServiceError("This visit is not one of this file's visits.");
  }
}

function checkDate(date: string): LocalDate {
  if (!isIsoDate(date)) throw new ServiceError("Enter a valid date.");
  return localDate(date);
}

/** When a task is due if nobody says: `corrective.dueDays` after today. */
export async function defaultDueDate(ex: Executor, ctx: ServiceContext): Promise<LocalDate> {
  const days = await getSetting(ex, "corrective.dueDays");
  const delay = Number.isSafeInteger(days) && days >= 0 ? days : DEFAULT_CORRECTIVE_DUE_DAYS;
  return localDate(addDays(ctx.today, delay));
}

// ── Creating ────────────────────────────────────────────────────────────────

export interface NewCorrectiveTask {
  source: CorrectiveSource;
  fileId: string;
  /** What is to be put right, in words. */
  description: string;
  action: CorrectiveAction;
  /** Left out: `corrective.dueDays` after today. */
  dueDate?: string | null;
  /** «ومسؤول». May stay empty until the task is started. */
  assignedToEmployeeId?: string | null;
  /** The worker a training or a change is about. */
  workerId?: string | null;
  /** The row the task comes from: the one its source names is required. */
  inspectionId?: string | null;
  complaintId?: string | null;
  problemReportId?: string | null;
  /** The visit at fault (required for a sign-off). */
  visitId?: string | null;
  /** The re-service visit, once planned. */
  redoVisitId?: string | null;
}

const SOURCE_ROW: Record<CorrectiveSource, "inspectionId" | "complaintId" | "problemReportId" | "visitId" | null> = {
  INSPECTION: "inspectionId",
  COMPLAINT: "complaintId",
  PROBLEM_REPORT: "problemReportId",
  SIGNOFF: "visitId",
  MANUAL: null,
};

/**
 * Writes one OPEN task. Complaints and inspections call it inside their own
 * action; `log: false` leaves the entry to the caller's own (one entry per
 * user action), which then names the task in its context.
 */
export async function createCorrectiveTask(
  ex: Executor,
  ctx: ServiceContext,
  input: NewCorrectiveTask,
  options: { log?: boolean } = {},
): Promise<{ id: string; dueDate: LocalDate }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!CORRECTIVE_SOURCES.includes(input.source) || !CORRECTIVE_ACTIONS.includes(input.action)) {
    throw new ServiceError("This corrective task cannot be saved as it is typed.");
  }
  const sourceRow = SOURCE_ROW[input.source];
  if (sourceRow && !input[sourceRow]) {
    throw new Error(`operations: a corrective task from ${input.source} needs its ${sourceRow}`);
  }
  const description = blankToNull(input.description);
  if (!description) throw new ServiceError("Write what is to be corrected.");

  const file = await ex
    .selectFrom("File")
    .select(["id", "number"])
    .where("id", "=", input.fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This client file does not exist.");
  const dueDate = input.dueDate ? checkDate(input.dueDate) : await defaultDueDate(ex, ctx);
  await checkAssignee(ex, input.assignedToEmployeeId);
  const worker = await workerOf(ex, input.workerId);
  await checkVisits(ex, file.id, [input.visitId, input.redoVisitId]);

  const id = newId();
  await ex
    .insertInto("CorrectiveTask")
    .values({
      id,
      source: input.source,
      inspectionId: input.inspectionId ?? null,
      complaintId: input.complaintId ?? null,
      problemReportId: input.problemReportId ?? null,
      visitId: input.visitId ?? null,
      fileId: file.id,
      description,
      action: input.action,
      dueDate,
      assignedToEmployeeId: input.assignedToEmployeeId ?? null,
      workerId: worker?.id ?? null,
      redoVisitId: input.redoVisitId ?? null,
      status: "OPEN",
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  if (options.log !== false) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "CREATE",
      entity: "CorrectiveTask",
      entityId: id,
      entityLabel: file.number,
      subject: worker ? { kind: "WORKER", id: worker.id, label: worker.number } : undefined,
      context: { source: input.source, action: input.action, dueDate },
    });
  }
  return { id, dueDate };
}

// ── Reading ─────────────────────────────────────────────────────────────────

export interface CorrectiveTaskLine {
  id: string;
  source: CorrectiveSource;
  status: TaskStatus;
  action: CorrectiveAction;
  description: string;
  dueDate: LocalDate;
  /** Still to be done and its date is past. */
  overdue: boolean;
  file: { id: string; number: string; division: string };
  /** The site as the office knows it: its common name, else its address. */
  site: string;
  clientName: string;
  inspection: { id: string; number: string } | null;
  complaint: { id: string; number: string } | null;
  visit: { id: string; number: string } | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  worker: { id: string; firstName: string; lastName: string; number: string } | null;
  /** What was done, or why the task was cancelled. */
  resultNote: string | null;
  doneAt: string | null;
  createdAt: string;
}

/**
 * The corrective tasks, with what they come from. `overdue` keeps those still
 * to be done whose date is past (the alert `corrective.overdue`). Earliest due
 * first, or latest first with `latestFirst`.
 */
export async function listCorrectiveTasks(
  ex: Executor,
  ctx: ServiceContext,
  input: { status?: TaskStatus | readonly TaskStatus[]; overdue?: boolean; latestFirst?: boolean } = {},
): Promise<CorrectiveTaskLine[]> {
  requireSection(ctx, "REQUESTS", "READ");
  let rows = ex
    .selectFrom("CorrectiveTask")
    .innerJoin("File", "File.id", "CorrectiveTask.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .leftJoin("Inspection", "Inspection.id", "CorrectiveTask.inspectionId")
    .leftJoin("Complaint", "Complaint.id", "CorrectiveTask.complaintId")
    .leftJoin("Visit", "Visit.id", "CorrectiveTask.visitId")
    .leftJoin("StaffMember as Assignee", "Assignee.id", "CorrectiveTask.assignedToEmployeeId")
    .leftJoin("StaffMember as Worker", "Worker.id", "CorrectiveTask.workerId")
    .select([
      "CorrectiveTask.id",
      "CorrectiveTask.source",
      "CorrectiveTask.status",
      "CorrectiveTask.action",
      "CorrectiveTask.description",
      "CorrectiveTask.dueDate",
      "CorrectiveTask.resultNote",
      "CorrectiveTask.doneAt",
      "CorrectiveTask.createdAt",
      "CorrectiveTask.inspectionId",
      "CorrectiveTask.complaintId",
      "CorrectiveTask.visitId",
      "CorrectiveTask.assignedToEmployeeId",
      "CorrectiveTask.workerId",
      "File.id as fileId",
      "File.number as fileNumber",
      "File.division",
      "Site.commonName",
      "Site.address",
      "Client.name as clientName",
      "Inspection.number as inspectionNumber",
      "Complaint.number as complaintNumber",
      "Visit.number as visitNumber",
      "Assignee.firstName as assigneeFirstName",
      "Assignee.lastName as assigneeLastName",
      "Worker.firstName as workerFirstName",
      "Worker.lastName as workerLastName",
      "Worker.number as workerNumber",
    ]);
  const statuses = input.status === undefined ? null : typeof input.status === "string" ? [input.status] : input.status;
  if (statuses) rows = rows.where("CorrectiveTask.status", "in", statuses.length > 0 ? [...statuses] : [""]);
  if (input.overdue) {
    rows = rows
      .where("CorrectiveTask.status", "in", [...OPEN_TASK_STATUSES])
      .where("CorrectiveTask.dueDate", "<", ctx.today);
  }
  const direction = input.latestFirst ? "desc" : "asc";
  const found = await rows
    .orderBy("CorrectiveTask.dueDate", direction)
    .orderBy("CorrectiveTask.createdAt", direction)
    .execute();

  return found.map((row) => ({
    id: row.id,
    source: row.source as CorrectiveSource,
    status: row.status as TaskStatus,
    action: row.action as CorrectiveAction,
    description: row.description,
    dueDate: row.dueDate,
    overdue: isOpen(row.status) && row.dueDate < ctx.today,
    file: { id: row.fileId, number: row.fileNumber, division: row.division },
    site: row.commonName ?? row.address,
    clientName: row.clientName,
    inspection: row.inspectionId && row.inspectionNumber ? { id: row.inspectionId, number: row.inspectionNumber } : null,
    complaint: row.complaintId && row.complaintNumber ? { id: row.complaintId, number: row.complaintNumber } : null,
    visit: row.visitId && row.visitNumber ? { id: row.visitId, number: row.visitNumber } : null,
    assignee:
      row.assignedToEmployeeId && row.assigneeLastName !== null
        ? {
            id: row.assignedToEmployeeId,
            firstName: row.assigneeFirstName ?? "",
            lastName: row.assigneeLastName,
          }
        : null,
    worker:
      row.workerId && row.workerLastName !== null
        ? {
            id: row.workerId,
            firstName: row.workerFirstName ?? "",
            lastName: row.workerLastName,
            number: row.workerNumber ?? "",
          }
        : null,
    resultNote: row.resultNote,
    doneAt: row.doneAt,
    createdAt: row.createdAt,
  }));
}

/** How many tasks still to be done are past their date: the count of the alert `corrective.overdue`. */
export async function countOverdueCorrectiveTasks(ex: Executor, ctx: ServiceContext): Promise<number> {
  const row = await ex
    .selectFrom("CorrectiveTask")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "in", [...OPEN_TASK_STATUSES])
    .where("dueDate", "<", ctx.today)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/** An employee who can be named responsible for a task, or as the supervisor of an inspection. */
export interface EmployeeChoice {
  id: string;
  firstName: string;
  lastName: string;
  number: string;
  jobPosition: JobPosition | null;
  /** Supervises a zone today, or holds the post of supervisor. */
  supervisor: boolean;
}

/** The centre's employees in post (People's list), supervisors first. */
export async function listEmployeeChoices(ex: Executor, ctx: ServiceContext): Promise<EmployeeChoice[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const [employees, zoneSupervisors] = await Promise.all([
    listEmployees(ex, ctx),
    ex
      .selectFrom("SupervisorAssignment")
      .select("supervisorEmployeeId")
      .where("zoneId", "is not", null)
      .where("fromDate", "<=", ctx.today)
      .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", ctx.today)]))
      .execute(),
  ]);
  const supervising = new Set(zoneSupervisors.map((row) => row.supervisorEmployeeId));
  return employees
    .filter((employee) => ACTIVE_STATUSES.has(employee.status))
    .map((employee) => ({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      number: employee.number,
      jobPosition: employee.jobPosition,
      supervisor: employee.jobPosition === "SUPERVISOR" || supervising.has(employee.id),
    }))
    .sort(
      (a, b) =>
        Number(b.supervisor) - Number(a.supervisor) || staffName(a).localeCompare(staffName(b), "ar"),
    );
}

// ── Changing ────────────────────────────────────────────────────────────────

async function taskOf(ex: Executor, taskId: string) {
  const task = await ex
    .selectFrom("CorrectiveTask")
    .innerJoin("File", "File.id", "CorrectiveTask.fileId")
    .selectAll("CorrectiveTask")
    .select("File.number as fileNumber")
    .where("CorrectiveTask.id", "=", taskId)
    .executeTakeFirst();
  if (!task) throw new ServiceError("This corrective task does not exist.");
  return task;
}

function stillOpen(task: { status: string }) {
  if (!isOpen(task.status)) throw new ServiceError("This corrective task is already closed.");
}

/** What the office may change on a task still to be done. A field left out is kept. */
export interface CorrectiveTaskChanges {
  taskId: string;
  description?: string;
  action?: CorrectiveAction;
  dueDate?: string;
  assignedToEmployeeId?: string | null;
  workerId?: string | null;
  redoVisitId?: string | null;
}

export async function saveCorrectiveTask(
  ex: Executor,
  ctx: ServiceContext,
  input: CorrectiveTaskChanges,
): Promise<{ id: string; changed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const task = await taskOf(ex, input.taskId);
  stillOpen(task);
  if (input.action !== undefined && !CORRECTIVE_ACTIONS.includes(input.action)) {
    throw new ServiceError("This corrective task cannot be saved as it is typed.");
  }
  let description: string | undefined;
  if (input.description !== undefined) {
    description = blankToNull(input.description) ?? undefined;
    if (!description) throw new ServiceError("Write what is to be corrected.");
  }
  const dueDate = input.dueDate === undefined ? undefined : checkDate(input.dueDate);
  if (input.assignedToEmployeeId !== undefined) {
    await checkAssignee(ex, input.assignedToEmployeeId);
    if (!input.assignedToEmployeeId && task.status !== "OPEN") {
      throw new ServiceError("Name who is responsible for this task first.");
    }
  }
  const worker = input.workerId === undefined ? undefined : await workerOf(ex, input.workerId);
  if (input.redoVisitId) await checkVisits(ex, task.fileId, [input.redoVisitId]);

  const { set, changes } = changedColumns(task, {
    description,
    action: input.action,
    dueDate,
    assignedToEmployeeId: input.assignedToEmployeeId === undefined ? undefined : input.assignedToEmployeeId || null,
    workerId: worker === undefined ? undefined : (worker?.id ?? null),
    redoVisitId: input.redoVisitId === undefined ? undefined : input.redoVisitId || null,
  });
  if (!changes) return { id: task.id, changed: false };
  await ex
    .updateTable("CorrectiveTask")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", task.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "CorrectiveTask",
    entityId: task.id,
    entityLabel: task.fileNumber,
    changes,
  });
  return { id: task.id, changed: true };
}

/** The person responsible takes it on: the task is under way. */
export async function startCorrectiveTask(
  ex: Executor,
  ctx: ServiceContext,
  input: { taskId: string; assignedToEmployeeId?: string | null },
): Promise<{ id: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const task = await taskOf(ex, input.taskId);
  if (task.status === "IN_PROGRESS") throw new ServiceError("This corrective task is already under way.");
  stillOpen(task);
  const assignee = input.assignedToEmployeeId || task.assignedToEmployeeId;
  if (!assignee) throw new ServiceError("Name who is responsible for this task first.");
  await checkAssignee(ex, assignee);
  const { set, changes } = changedColumns(task, { status: "IN_PROGRESS", assignedToEmployeeId: assignee });
  await ex
    .updateTable("CorrectiveTask")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", task.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    entity: "CorrectiveTask",
    entityId: task.id,
    entityLabel: task.fileNumber,
    changes: changes ?? undefined,
  });
  return { id: task.id };
}

/** Done: what was done is written on the task. */
export async function completeCorrectiveTask(
  ex: Executor,
  ctx: ServiceContext,
  input: { taskId: string; resultNote: string; assignedToEmployeeId?: string | null },
): Promise<{ id: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const task = await taskOf(ex, input.taskId);
  stillOpen(task);
  const resultNote = blankToNull(input.resultNote);
  if (!resultNote) throw new ServiceError("Write what was done.");
  const assignee = input.assignedToEmployeeId || task.assignedToEmployeeId;
  if (!assignee) throw new ServiceError("Name who is responsible for this task first.");
  await checkAssignee(ex, assignee);
  const { set, changes } = changedColumns(task, {
    status: "DONE",
    assignedToEmployeeId: assignee,
    resultNote,
    doneAt: ctx.now,
    doneByUserId: ctx.userId,
  });
  await ex
    .updateTable("CorrectiveTask")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", task.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    entity: "CorrectiveTask",
    entityId: task.id,
    entityLabel: task.fileNumber,
    changes: changes ?? undefined,
  });
  return { id: task.id };
}

/** Cancelled, with the reason the user typed (kept on the task and in the log). */
export async function cancelCorrectiveTask(
  ex: Executor,
  ctx: ServiceContext,
  input: { taskId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const task = await taskOf(ex, input.taskId);
  stillOpen(task);
  const reason = blankToNull(input.reason);
  if (!reason) throw new ServiceError("A reason is required.");
  const { set, changes } = changedColumns(task, { status: "CANCELLED", resultNote: reason });
  await ex
    .updateTable("CorrectiveTask")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", task.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CANCEL",
    reason,
    entity: "CorrectiveTask",
    entityId: task.id,
    entityLabel: task.fileNumber,
    changes: changes ?? undefined,
  });
  return { id: task.id };
}

export const listCorrectiveTasksQuery = query(listCorrectiveTasks);
export const listEmployeeChoicesQuery = query(listEmployeeChoices);
export const saveCorrectiveTaskAction = action(saveCorrectiveTask, { revalidate: [CORRECTIVE_TASKS_PATH] });
export const startCorrectiveTaskAction = action(startCorrectiveTask, { revalidate: [CORRECTIVE_TASKS_PATH] });
export const completeCorrectiveTaskAction = action(completeCorrectiveTask, { revalidate: [CORRECTIVE_TASKS_PATH] });
export const cancelCorrectiveTaskAction = action(cancelCorrectiveTask, { revalidate: [CORRECTIVE_TASKS_PATH] });
