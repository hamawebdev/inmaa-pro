import { addDays, isDate } from "@/features/people/rules/dates";
import { leaveBalance, leaveEarned } from "@/features/people/rules/leave";
import {
  ABSENCE_TYPES,
  CHECK_TYPES,
  LEAVE_TYPES,
  type AbsenceType,
  type CheckType,
  type LeaveStatus,
  type LeaveType,
} from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logErase } from "@/lib/log";
import { weekdayOf } from "@/lib/options";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, localTime, minutes, qty } from "@/lib/units";

/**
 * Centre employees' attendance (his section 1; the academy's employee
 * attendance family): the times they come in and leave, their absences, and
 * their leave, which earns 2.5 days a month (the law, scope section 5).
 *
 * What the academy lacks and this adds: a check, an absence or a leave is
 * changed or taken off afterwards, with the reason, and the log keeps both
 * values. Cleaning workers are not here: their hours come from Operations'
 * orders, their absences and leave are Operations' `WorkerAbsence`.
 */

export const EMPLOYEE_ATTENDANCE_PATH = "/dashboard/employee-attendance";

const isTime = (text: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(text);

async function employeeOf(ex: Executor, staffId: string) {
  const person = await ex
    .selectFrom("StaffMember")
    .select([
      "id",
      "number",
      "lastName",
      "firstName",
      "kind",
      "startDate",
      "registrationDate",
      "leaveOpeningDays",
      "deletedAt",
    ])
    .where("id", "=", staffId)
    .executeTakeFirst();
  if (!person || person.deletedAt || person.kind !== "EMPLOYEE")
    throw new ServiceError("This employee does not exist.");
  return {
    ...person,
    subject: { kind: "EMPLOYEE" as const, id: person.id, label: `${person.lastName} ${person.firstName}` },
  };
}

function requireWrite(ctx: ServiceContext): void {
  requireSection(ctx, "EMPLOYEES", "WRITE");
}

/** Changing or taking off what was recorded is the HR officer's (and the manager's), with a reason. */
function requireEdit(ctx: ServiceContext, reason: string): string {
  requireWrite(ctx);
  requireCapability(ctx, "attendance.employee.edit");
  const typed = reason.trim();
  if (typed === "") throw new ServiceError("Write the reason for the change.");
  return typed;
}

// ── Checks in and out ───────────────────────────────────────────────────────

export interface CheckInput {
  staffId: string;
  type: CheckType;
  /** `YYYY-MM-DD` and `HH:MM`, the centre's time. */
  date: string;
  time: string;
  note?: string | null;
}

function checkTime(input: { type: string; date: string; time: string }) {
  if (!(CHECK_TYPES as readonly string[]).includes(input.type)) throw new ServiceError("Choose in or out.");
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (!isTime(input.time)) throw new ServiceError("Enter a valid time.");
  return { date: localDate(input.date), time: localTime(input.time) };
}

/** An employee came in, or left: typed by the office. */
export async function recordCheck(ex: Executor, ctx: ServiceContext, input: CheckInput): Promise<{ id: string }> {
  requireWrite(ctx);
  const { date, time } = checkTime(input);
  if (date > ctx.today) throw new ServiceError("A time cannot be recorded for a day still to come.");
  const person = await employeeOf(ex, input.staffId);
  const id = newId();
  await ex
    .insertInto("EmployeeCheckRecord")
    .values({
      id,
      staffId: person.id,
      type: input.type,
      timestamp: ctx.toInstant(date, time),
      localDate: date,
      localTime: time,
      note: input.note?.trim() || null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  return { id };
}

/** Corrects a check: its time, its direction, its note. Logged with the old and new values. */
export async function editCheck(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; type: CheckType; date: string; time: string; note?: string | null; reason: string },
): Promise<void> {
  const reason = requireEdit(ctx, input.reason);
  const { date, time } = checkTime(input);
  if (date > ctx.today) throw new ServiceError("A time cannot be recorded for a day still to come.");
  const before = await ex
    .selectFrom("EmployeeCheckRecord")
    .selectAll()
    .where("id", "=", input.id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This record does not exist.");
  const person = await employeeOf(ex, before.staffId);
  const { set, changes } = changedColumns(before, {
    type: input.type,
    localDate: date,
    localTime: time,
    timestamp: ctx.toInstant(date, time),
    note: input.note?.trim() || null,
  });
  if (!changes) return;
  await ex
    .updateTable("EmployeeCheckRecord")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  // The instant follows the day and the time: the log keeps what was typed.
  const shown = Object.fromEntries(Object.entries(changes).filter(([field]) => field !== "timestamp"));
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    reason,
    entity: "EmployeeCheckRecord",
    entityId: before.id,
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    changes: shown,
  });
}

/** Takes a check off, with the reason. Kept, marked deleted. */
export async function deleteCheck(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; reason: string },
): Promise<void> {
  const reason = requireEdit(ctx, input.reason);
  const before = await ex
    .selectFrom("EmployeeCheckRecord")
    .selectAll()
    .where("id", "=", input.id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This record does not exist.");
  const person = await employeeOf(ex, before.staffId);
  await ex
    .updateTable("EmployeeCheckRecord")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "PEOPLE",
    action: "SOFT_DELETE",
    reason,
    entity: "EmployeeCheckRecord",
    entityId: before.id,
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    context: { type: before.type, date: before.localDate, time: before.localTime },
  });
}

/**
 * Minutes at work, day by day: each check in paired with the next check out
 * of the same day. A check in left open, or an out with no in, counts nothing
 * and marks the day incomplete.
 */
export function minutesFromChecks(checks: ReadonlyArray<{ type: string; localTime: string }>): {
  minutes: number;
  complete: boolean;
} {
  const sorted = [...checks].sort((a, b) => a.localTime.localeCompare(b.localTime));
  const toMin = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  let total = 0;
  let open: number | null = null;
  let complete = true;
  for (const check of sorted) {
    if (check.type === "CHECK_IN") {
      if (open !== null) complete = false;
      open = toMin(check.localTime);
    } else if (open === null) {
      complete = false;
    } else {
      total += toMin(check.localTime) - open;
      open = null;
    }
  }
  if (open !== null) complete = false;
  return { minutes: total, complete };
}

/** Each employee's minutes per day in a period, from their checks. */
export async function employeeDays(
  ex: Executor,
  input: { staffIds: readonly string[]; from: string; to: string },
): Promise<Map<string, Map<string, { minutes: number; complete: boolean }>>> {
  const days = new Map<string, Map<string, { minutes: number; complete: boolean }>>();
  if (input.staffIds.length === 0) return days;
  const checks = await ex
    .selectFrom("EmployeeCheckRecord")
    .select(["staffId", "type", "localDate", "localTime"])
    .where("staffId", "in", [...input.staffIds])
    .where("localDate", ">=", localDate(input.from))
    .where("localDate", "<=", localDate(input.to))
    .where("deletedAt", "is", null)
    .execute();
  const grouped = new Map<string, Array<{ type: string; localTime: string }>>();
  for (const check of checks) {
    const key = `${check.staffId}|${check.localDate}`;
    grouped.set(key, [...(grouped.get(key) ?? []), check]);
  }
  for (const [key, list] of grouped) {
    const [staffId, date] = key.split("|");
    const map = days.get(staffId) ?? new Map();
    map.set(date, minutesFromChecks(list));
    days.set(staffId, map);
  }
  return days;
}

// ── Absences ────────────────────────────────────────────────────────────────

export interface EmployeeAbsenceInput {
  staffId: string;
  date: string;
  type: AbsenceType;
  /** For an absence of some hours. */
  startTime?: string | null;
  endTime?: string | null;
  justified: boolean;
  paid: boolean;
  reason?: string | null;
  details?: string | null;
}

async function absenceColumns(ex: Executor, input: Omit<EmployeeAbsenceInput, "staffId">) {
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (!(ABSENCE_TYPES as readonly string[]).includes(input.type)) throw new ServiceError("Choose the kind of absence.");
  const { "work.dayMin": dayMin } = await getSettings(ex, ["work.dayMin"]);
  let absenceMin = input.type === "FULL_DAY" ? dayMin : Math.round(dayMin / 2);
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (input.type === "HOURS") {
    if (!input.startTime || !input.endTime || !isTime(input.startTime) || !isTime(input.endTime)) {
      throw new ServiceError("Enter the hours of the absence.");
    }
    const span =
      Number(input.endTime.slice(0, 2)) * 60 +
      Number(input.endTime.slice(3, 5)) -
      (Number(input.startTime.slice(0, 2)) * 60 + Number(input.startTime.slice(3, 5)));
    if (span <= 0) throw new ServiceError("The end must be after the start.");
    absenceMin = span;
    startTime = input.startTime;
    endTime = input.endTime;
  }
  return {
    date: localDate(input.date),
    type: input.type,
    startTime: startTime === null ? null : localTime(startTime),
    endTime: endTime === null ? null : localTime(endTime),
    absenceMin: minutes(absenceMin),
    justified: input.justified ? 1 : 0,
    paid: input.paid ? 1 : 0,
    reason: input.reason?.trim() || null,
    details: input.details?.trim() || null,
  };
}

export async function recordEmployeeAbsence(
  ex: Executor,
  ctx: ServiceContext,
  input: EmployeeAbsenceInput,
): Promise<{ id: string }> {
  requireWrite(ctx);
  const person = await employeeOf(ex, input.staffId);
  const columns = await absenceColumns(ex, input);
  const id = newId();
  await ex
    .insertInto("EmployeeAbsence")
    .values({
      id,
      staffId: person.id,
      ...columns,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "EmployeeAbsence",
    entityId: id,
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    changes: { date: [null, columns.date], absenceMin: [null, columns.absenceMin] },
  });
  return { id };
}

export async function editEmployeeAbsence(
  ex: Executor,
  ctx: ServiceContext,
  input: EmployeeAbsenceInput & { id: string; reasonForChange: string },
): Promise<void> {
  const reason = requireEdit(ctx, input.reasonForChange);
  const before = await ex
    .selectFrom("EmployeeAbsence")
    .selectAll()
    .where("id", "=", input.id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This absence does not exist.");
  const person = await employeeOf(ex, before.staffId);
  const { set, changes } = changedColumns(before, await absenceColumns(ex, input));
  if (!changes) return;
  await ex
    .updateTable("EmployeeAbsence")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    reason,
    entity: "EmployeeAbsence",
    entityId: before.id,
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    changes,
  });
}

export async function deleteEmployeeAbsence(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; reason: string },
): Promise<void> {
  const reason = requireEdit(ctx, input.reason);
  const before = await ex
    .selectFrom("EmployeeAbsence")
    .selectAll()
    .where("id", "=", input.id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This absence does not exist.");
  const person = await employeeOf(ex, before.staffId);
  await ex
    .updateTable("EmployeeAbsence")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "PEOPLE",
    action: "SOFT_DELETE",
    reason,
    entity: "EmployeeAbsence",
    entityId: before.id,
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    context: { date: before.date, absenceMin: before.absenceMin },
  });
}

// ── Leave ───────────────────────────────────────────────────────────────────

/** Days of leave between two dates: every day but the weekly rest (`work.restDay`). */
export function leaveDays(startDate: string, endDate: string, restDay: string): number {
  let days = 0;
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    if (weekdayOf(localDate(day)) !== restDay) days += 1;
  }
  return days;
}

/** A leave cut at each month's end, so each payslip reads whole rows. */
export function cutAtMonthEnds(startDate: string, endDate: string): Array<{ startDate: string; endDate: string }> {
  const parts: Array<{ startDate: string; endDate: string }> = [];
  let from = startDate;
  while (from <= endDate) {
    const [year, month] = from.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const to = monthEnd < endDate ? monthEnd : endDate;
    parts.push({ startDate: from, endDate: to });
    from = addDays(to, 1);
  }
  return parts;
}

export interface LeaveInput {
  staffId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  /** Unpaid leave is never paid; the others are unless said. */
  paid?: boolean;
  reason?: string | null;
  /** Recorded already decided: a leave the HR officer grants at once. */
  approved?: boolean;
}

/** A leave asked for, or granted at once. Cut at month ends. */
export async function requestEmployeeLeave(
  ex: Executor,
  ctx: ServiceContext,
  input: LeaveInput,
): Promise<{ ids: string[] }> {
  requireWrite(ctx);
  if (!isDate(input.startDate) || !isDate(input.endDate)) throw new ServiceError("Enter a valid date.");
  if (input.endDate < input.startDate) throw new ServiceError("The end date must not be before the start date.");
  if (!(LEAVE_TYPES as readonly string[]).includes(input.type)) throw new ServiceError("Choose the kind of leave.");
  const person = await employeeOf(ex, input.staffId);
  const overlapping = await ex
    .selectFrom("EmployeeLeave")
    .select("id")
    .where("staffId", "=", person.id)
    .where("deletedAt", "is", null)
    .where("status", "in", ["REQUESTED", "APPROVED"])
    .where("startDate", "<=", localDate(input.endDate))
    .where("endDate", ">=", localDate(input.startDate))
    .executeTakeFirst();
  if (overlapping) throw new ServiceError("This employee already has a leave on these days.");
  const { "work.restDay": restDay } = await getSettings(ex, ["work.restDay"]);
  const status: LeaveStatus = input.approved ? "APPROVED" : "REQUESTED";
  const paid = input.type === "UNPAID" ? false : (input.paid ?? true);
  const parts = cutAtMonthEnds(input.startDate, input.endDate);
  const splitGroupId = parts.length > 1 ? newId() : null;
  const ids: string[] = [];
  for (const part of parts) {
    const id = newId();
    ids.push(id);
    await ex
      .insertInto("EmployeeLeave")
      .values({
        id,
        staffId: person.id,
        type: input.type,
        startDate: localDate(part.startDate),
        endDate: localDate(part.endDate),
        days: qty(leaveDays(part.startDate, part.endDate, restDay) * 1000),
        splitGroupId,
        paid: paid ? 1 : 0,
        status,
        decidedByUserId: input.approved ? ctx.userId : null,
        decidedAt: input.approved ? ctx.now : null,
        reason: input.reason?.trim() || null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "EmployeeLeave",
    entityId: ids[0],
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    changes: { startDate: [null, input.startDate], endDate: [null, input.endDate], status: [null, status] },
    context: { type: input.type, parts: ids.length },
  });
  return { ids };
}

/** The parts of the leave a row belongs to. */
async function leaveGroup(ex: Executor, leaveId: string) {
  const row = await ex.selectFrom("EmployeeLeave").selectAll().where("id", "=", leaveId).executeTakeFirst();
  if (!row || row.deletedAt) throw new ServiceError("This leave does not exist.");
  if (!row.splitGroupId) return [row];
  return ex
    .selectFrom("EmployeeLeave")
    .selectAll()
    .where("splitGroupId", "=", row.splitGroupId)
    .where("deletedAt", "is", null)
    .orderBy("startDate")
    .execute();
}

/** Grants or refuses a leave asked for: every part of it. */
export async function decideEmployeeLeave(
  ex: Executor,
  ctx: ServiceContext,
  input: { leaveId: string; status: "APPROVED" | "REFUSED"; reason?: string },
): Promise<void> {
  requireWrite(ctx);
  requireCapability(ctx, "attendance.employee.edit");
  const reason = input.reason?.trim() ?? "";
  if (input.status === "REFUSED" && reason === "") throw new ServiceError("Write the reason for the decision.");
  const parts = await leaveGroup(ex, input.leaveId);
  if (parts.some((part) => part.status !== "REQUESTED")) throw new ServiceError("This leave has already been decided.");
  const person = await employeeOf(ex, parts[0].staffId);
  for (const part of parts) {
    await ex
      .updateTable("EmployeeLeave")
      .set({
        status: input.status,
        decidedByUserId: ctx.userId,
        decidedAt: ctx.now,
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", part.id)
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    // A leave granted is a change of its status; a refusal carries the reason typed.
    action: input.status === "APPROVED" ? "STATUS_CHANGE" : "REFUSE",
    reason: reason || undefined,
    entity: "EmployeeLeave",
    entityId: parts[0].id,
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    changes: { status: ["REQUESTED", input.status] },
  });
}

/** Cancels a leave not yet over: every part of it. With the reason. */
export async function cancelEmployeeLeave(
  ex: Executor,
  ctx: ServiceContext,
  input: { leaveId: string; reason: string },
): Promise<void> {
  const reason = requireEdit(ctx, input.reason);
  const parts = await leaveGroup(ex, input.leaveId);
  if (parts.every((part) => part.status === "CANCELLED" || part.status === "REFUSED")) {
    throw new ServiceError("This leave is no longer in force.");
  }
  const person = await employeeOf(ex, parts[0].staffId);
  for (const part of parts) {
    if (part.status === "CANCELLED" || part.status === "REFUSED") continue;
    await ex
      .updateTable("EmployeeLeave")
      .set({ status: "CANCELLED", updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", part.id)
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CANCEL",
    reason,
    entity: "EmployeeLeave",
    entityId: parts[0].id,
    entityLabel: `${person.number} ${person.subject.label}`,
    subject: person.subject,
    changes: { status: [parts[0].status, "CANCELLED"] },
  });
}

// ── Reading ─────────────────────────────────────────────────────────────────

export interface AttendanceDay {
  date: string;
  checks: Array<{ id: string; type: CheckType; time: string; note: string | null }>;
  minutes: number;
  complete: boolean;
}

export interface EmployeeAttendance {
  staffId: string;
  number: string;
  firstName: string;
  lastName: string;
  days: AttendanceDay[];
  absences: Array<{
    id: string;
    date: string;
    type: AbsenceType;
    startTime: string | null;
    endTime: string | null;
    absenceMin: number;
    justified: boolean;
    paid: boolean;
    reason: string | null;
  }>;
  leaves: Array<{
    id: string;
    type: LeaveType;
    startDate: string;
    endDate: string;
    days: number;
    paid: boolean;
    status: LeaveStatus;
    splitGroupId: string | null;
    reason: string | null;
  }>;
  /** Thousandths of a day: earned this year of reference, taken, and what is left. */
  leave: { earned: number; taken: number; balance: number; from: string };
  totals: {
    workedMin: number;
    daysPresent: number;
    incompleteDays: number;
    absenceMin: number;
    unpaidAbsenceMin: number;
  };
}

/** The attendance of one employee, or of every employee, in a period. */
export async function listEmployeeAttendance(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: string; to: string; staffId?: string | null },
): Promise<EmployeeAttendance[]> {
  requireSection(ctx, "EMPLOYEES", "READ");
  if (!isDate(input.from) || !isDate(input.to)) throw new ServiceError("Enter a valid date.");
  if (input.to < input.from) throw new ServiceError("The end date must not be before the start date.");
  let people = ex
    .selectFrom("StaffMember")
    .select(["id", "number", "numberSeq", "firstName", "lastName", "startDate", "registrationDate", "leaveOpeningDays"])
    .where("kind", "=", "EMPLOYEE")
    .where("deletedAt", "is", null);
  if (input.staffId) people = people.where("id", "=", input.staffId);
  else people = people.where("engagementStatus", "<>", "LEFT");
  const found = await people.orderBy("numberSeq").execute();
  const ids = found.map((person) => person.id);
  if (ids.length === 0) return [];

  const [checks, absences, leaves, rules] = await Promise.all([
    ex
      .selectFrom("EmployeeCheckRecord")
      .select(["id", "staffId", "type", "localDate", "localTime", "note"])
      .where("staffId", "in", ids)
      .where("localDate", ">=", localDate(input.from))
      .where("localDate", "<=", localDate(input.to))
      .where("deletedAt", "is", null)
      .orderBy("localDate")
      .orderBy("localTime")
      .execute(),
    ex
      .selectFrom("EmployeeAbsence")
      .selectAll()
      .where("staffId", "in", ids)
      .where("date", ">=", localDate(input.from))
      .where("date", "<=", localDate(input.to))
      .where("deletedAt", "is", null)
      .orderBy("date")
      .execute(),
    ex
      .selectFrom("EmployeeLeave")
      .selectAll()
      .where("staffId", "in", ids)
      .where("deletedAt", "is", null)
      .orderBy("startDate")
      .execute(),
    getSettings(ex, ["pay.leaveDaysPerMonth", "pay.leaveCapDays", "pay.leaveYearStart"]),
  ]);

  return found.map((person) => {
    const own = checks.filter((check) => check.staffId === person.id);
    const byDay = new Map<string, typeof own>();
    for (const check of own) byDay.set(check.localDate, [...(byDay.get(check.localDate) ?? []), check]);
    const days: AttendanceDay[] = [...byDay.entries()].map(([date, list]) => ({
      date,
      checks: list.map((check) => ({
        id: check.id,
        type: check.type as CheckType,
        time: check.localTime,
        note: check.note,
      })),
      ...minutesFromChecks(list),
    }));
    const ownAbsences = absences.filter((absence) => absence.staffId === person.id);
    const ownLeaves = leaves.filter((leave) => leave.staffId === person.id);
    const start = person.startDate ?? person.registrationDate;
    const accrual = leaveEarned(
      { startDate: start, asOf: ctx.today },
      {
        perMonth: rules["pay.leaveDaysPerMonth"],
        cap: rules["pay.leaveCapDays"],
        yearStart: rules["pay.leaveYearStart"],
      },
    );
    const taken = ownLeaves
      .filter((leave) => leave.status === "APPROVED" && leave.paid === 1 && leave.startDate >= accrual.from)
      .reduce((sum, leave) => sum + leave.days, 0);
    const absenceMin = ownAbsences
      .filter((absence) => absence.employeeLeaveId === null)
      .reduce((sum, a) => sum + a.absenceMin, 0);
    return {
      staffId: person.id,
      number: person.number,
      firstName: person.firstName,
      lastName: person.lastName,
      days,
      absences: ownAbsences.map((absence) => ({
        id: absence.id,
        date: absence.date,
        type: absence.type as AbsenceType,
        startTime: absence.startTime,
        endTime: absence.endTime,
        absenceMin: absence.absenceMin,
        justified: absence.justified === 1,
        paid: absence.paid === 1,
        reason: absence.reason,
      })),
      leaves: ownLeaves
        .filter((leave) => leave.endDate >= input.from && leave.startDate <= input.to)
        .map((leave) => ({
          id: leave.id,
          type: leave.type as LeaveType,
          startDate: leave.startDate,
          endDate: leave.endDate,
          days: leave.days,
          paid: leave.paid === 1,
          status: leave.status as LeaveStatus,
          splitGroupId: leave.splitGroupId,
          reason: leave.reason,
        })),
      leave: {
        earned: accrual.earned,
        taken,
        balance: leaveBalance({ broughtForward: person.leaveOpeningDays ?? 0, earned: accrual.earned, taken }),
        from: accrual.from,
      },
      totals: {
        workedMin: days.reduce((sum, day) => sum + day.minutes, 0),
        daysPresent: days.filter((day) => day.minutes > 0).length,
        incompleteDays: days.filter((day) => !day.complete).length,
        absenceMin,
        unpaidAbsenceMin: ownAbsences
          .filter((absence) => absence.employeeLeaveId === null && absence.paid === 0)
          .reduce((sum, a) => sum + a.absenceMin, 0),
      },
    };
  });
}

// What the screens import.
const REFRESH = [EMPLOYEE_ATTENDANCE_PATH, "/dashboard/employees"];
export const listEmployeeAttendanceQuery = query(listEmployeeAttendance);
export const recordCheckAction = action(recordCheck, { revalidate: REFRESH });
export const editCheckAction = action(editCheck, { revalidate: REFRESH });
export const deleteCheckAction = action(deleteCheck, { revalidate: REFRESH });
export const recordEmployeeAbsenceAction = action(recordEmployeeAbsence, { revalidate: REFRESH });
export const editEmployeeAbsenceAction = action(editEmployeeAbsence, { revalidate: REFRESH });
export const deleteEmployeeAbsenceAction = action(deleteEmployeeAbsence, { revalidate: REFRESH });
export const requestEmployeeLeaveAction = action(requestEmployeeLeave, { revalidate: REFRESH });
export const decideEmployeeLeaveAction = action(decideEmployeeLeave, { revalidate: REFRESH });
export const cancelEmployeeLeaveAction = action(cancelEmployeeLeave, { revalidate: REFRESH });
