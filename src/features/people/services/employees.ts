import type { PersonIdentity } from "@/features/people/rules/sanction-match";
import {
  employeeFormSchema,
  emptyEmployeeValues,
  type EmployeeFormValues,
} from "@/features/people/validators/employee";
import {
  EMPLOYMENT_CONTRACTS,
  JOB_POSITIONS,
  MARITAL_STATUSES,
  PAY_BASES,
  PAY_PERIODS,
  WORK_TIMES,
  type EngagementStatus,
  type JobPosition,
  type Sex,
} from "@/features/people/validators/staff-codes";
import { residenceValues } from "@/features/people/forms/worker-values";
import { phoneDigits } from "@/features/people/validators/worker";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logCollect, logConsult } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { addDays } from "@/lib/clock";
import { getSetting } from "@/lib/settings";
import { normaliseName, phoneKeys } from "@/lib/text/normalise";
import { dinarsToMoney, hoursToMinutes, localDate } from "@/lib/units";

import { getSanctionStates, type SanctionStateOf } from "./sanctions";
import {
  dateOrNull,
  decimal,
  DERIVED_KEYS,
  idNumber,
  insertPayTerms,
  insertStatus,
  orNull,
  passSanctionCheck,
  readmit,
  recordLeaving,
  refuseSecondRecord,
  residenceCommuneOf,
  settleSanctionCheck,
  staffOf,
  staffSubject,
  type SanctionPassage,
} from "./staff-shared";

/**
 * Centre employees (his section 1, scope A2): the academy's employee file with
 * the personal block of his worker form, a job position, the terms of the post
 * and the pay. They are rows of the same table as the workers, of kind
 * EMPLOYEE, numbered in their own sequence, and checked against the suspended
 * and penalised like anybody the centre registers.
 *
 * An employee's login account is Foundation's (`User.staffMemberId`): the file
 * shows the account that points at the employee; linking one is Foundation's
 * `linkAccountToStaff`.
 */

export const EMPLOYEES_PATH = "/dashboard/employees";

export interface RegisterEmployeeInput extends EmployeeFormValues, SanctionPassage {}

/** The identity the sanction check compares. The emergency phone is somebody else's. */
export function employeeIdentity(values: EmployeeFormValues): PersonIdentity {
  return {
    lastName: values.lastName,
    firstName: values.firstName,
    nameLatin: values.fullNameLatin,
    birthDate: values.birthDate || null,
    phones: [values.phone, values.phone2],
    nationalId: idNumber(values.nationalIdNumber),
  };
}

function parseValues(values: EmployeeFormValues): EmployeeFormValues {
  const parsed = employeeFormSchema.safeParse(values);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  return parsed.data;
}

/** The columns of `StaffMember` the employee screen gives, as stored. */
function memberColumns(values: EmployeeFormValues) {
  const phone = phoneDigits(values.phone);
  const phone2 = orNull(phoneDigits(values.phone2));
  return {
    registrationDate: localDate(values.registrationDate),
    lastName: values.lastName,
    firstName: values.firstName,
    fullNameLatin: orNull(values.fullNameLatin),
    sex: values.sex,
    birthDate: dateOrNull(values.birthDate),
    birthPlace: orNull(values.birthPlace),
    birthWilayaCode: orNull(values.birthWilayaCode),
    address: orNull(values.address),
    residenceCommuneId: orNull(values.residenceCommuneId),
    maritalStatus: values.maritalStatus ?? null,
    phone,
    phone2,
    email: orNull(values.email),
    emergencyName: orNull(values.emergencyName),
    emergencyRelation: orNull(values.emergencyRelation),
    emergencyAddress: orNull(values.emergencyAddress),
    emergencyPhone: orNull(phoneDigits(values.emergencyPhone)),
    educationLevel: orNull(values.educationLevel),
    certificateName: orNull(values.certificateName),
    nationalIdNumber: orNull(idNumber(values.nationalIdNumber)),
    nameKey: normaliseName(`${values.lastName} ${values.firstName}`),
    nameLatinKey: orNull(normaliseName(values.fullNameLatin)),
    phoneKeys: phoneKeys([phone, phone2]),
    jobPosition: values.jobPosition,
    startDate: dateOrNull(values.startDate),
    employmentContract: values.employmentContract ?? null,
    workTimeKind: values.workTimeKind ?? null,
    contractEndDate: dateOrNull(values.contractEndDate),
    cnasDeclared: values.cnasDeclared ? 1 : 0,
    cnasNumber: orNull(values.cnasNumber),
    weeklyCapacityMin: hoursToMinutes(decimal(values.weeklyCapacityHours)),
    payBasis: values.payBasis ?? null,
    payRate: values.payRate === "" ? null : dinarsToMoney(decimal(values.payRate)),
    payPeriod: values.payPeriod ?? null,
  };
}

export async function registerEmployee(
  ex: Executor,
  ctx: ServiceContext,
  input: RegisterEmployeeInput,
): Promise<{ id: string; number: string }> {
  requireSection(ctx, "EMPLOYEES", "WRITE");
  requireCapability(ctx, "staff.write");
  const values = parseValues(input);
  const columns = memberColumns(values);
  await refuseSecondRecord(ex, "EMPLOYEE", columns.nationalIdNumber);
  const passage: SanctionPassage = { notTheSamePerson: input.notTheSamePerson, decisionId: input.decisionId };
  const check = await passSanctionCheck(ex, ctx, {
    context: "EMPLOYEE_REGISTRATION",
    subjectKind: "EMPLOYEE",
    identity: employeeIdentity(values),
    passage,
  });

  // The suffix of an employee's number, if any, is a setting: the numbering reads it.
  const number = await nextNumber(ex, ctx, "STAFF_EMPLOYEE", { date: columns.registrationDate });
  const id = newId();
  const stamp = { createdAt: ctx.now, updatedAt: ctx.now };
  await ex
    .insertInto("StaffMember")
    .values({
      id,
      kind: "EMPLOYEE",
      numberSeq: number.seq,
      numberSuffix: number.display.includes("/") ? number.display.slice(number.display.indexOf("/") + 1) : "",
      number: number.display,
      ...columns,
      residenceCommuneId: await residenceCommuneOf(ex, ctx, values),
      // An employee is taken on when registered; «غادر» ends it.
      engagementStatus: "ACCEPTED",
      branchId: ctx.branchId,
      ...stamp,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  // One restricted row per person, under the person's own id: where a signed scan would go.
  await ex
    .insertInto("StaffConfidential")
    .values({ id, staffId: id, ...stamp, updatedByUserId: ctx.userId })
    .execute();
  const from = columns.startDate ?? columns.registrationDate;
  await insertStatus(ex, ctx, { staffId: id, date: from, from: null, to: "ACCEPTED" });
  await insertPayTerms(ex, ctx, { staffId: id, date: from, terms: columns });
  await settleSanctionCheck(ex, ctx, check, {
    context: "EMPLOYEE_REGISTRATION",
    passage,
    staffId: id,
    number: number.display,
  });

  const subject = staffSubject("EMPLOYEE", id, number.display, values);
  await logCollect(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "StaffMember",
    entityId: id,
    entityLabel: subject.label,
    subject,
    context: {
      jobPosition: values.jobPosition,
      sanctionDecisionId: check.outcome === "ALLOWED" ? (input.decisionId ?? null) : null,
    },
  });
  return { id, number: number.display };
}

export interface UpdateEmployeeInput extends SanctionPassage {
  id: string;
  values: EmployeeFormValues;
}

export async function updateEmployee(
  ex: Executor,
  ctx: ServiceContext,
  input: UpdateEmployeeInput,
): Promise<{ id: string; number: string }> {
  requireSection(ctx, "EMPLOYEES", "WRITE");
  requireCapability(ctx, "staff.write");
  const values = parseValues(input.values);
  const before = await staffOf(ex, "EMPLOYEE", input.id);
  const columns = memberColumns(values);
  await refuseSecondRecord(ex, "EMPLOYEE", columns.nationalIdNumber, before.id);

  const identityChanged =
    columns.nameKey !== before.nameKey ||
    columns.nameLatinKey !== before.nameLatinKey ||
    columns.phoneKeys !== before.phoneKeys ||
    columns.nationalIdNumber !== before.nationalIdNumber ||
    columns.birthDate !== before.birthDate;
  const passage: SanctionPassage = { notTheSamePerson: input.notTheSamePerson, decisionId: input.decisionId };
  const check = identityChanged
    ? await passSanctionCheck(ex, ctx, {
        context: "IDENTITY_CHANGE",
        subjectKind: "EMPLOYEE",
        subjectId: before.id,
        identity: employeeIdentity(values),
        passage,
      })
    : null;

  const { set, changes } = changedColumns(before, {
    ...columns,
    residenceCommuneId: await residenceCommuneOf(ex, ctx, values),
  });
  if (!changes) return { id: before.id, number: before.number };
  await ex
    .updateTable("StaffMember")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  if (["payBasis", "payRate", "payPeriod", "weeklyCapacityMin"].some((key) => key in changes)) {
    await insertPayTerms(ex, ctx, { staffId: before.id, date: ctx.today, terms: columns });
  }
  if (check) {
    await settleSanctionCheck(ex, ctx, check, {
      context: "IDENTITY_CHANGE",
      passage,
      staffId: before.id,
      number: before.number,
    });
  }
  const subject = staffSubject("EMPLOYEE", before.id, before.number, values);
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "StaffMember",
    entityId: before.id,
    entityLabel: subject.label,
    subject,
    changes: Object.fromEntries(Object.entries(changes).filter(([field]) => !DERIVED_KEYS.has(field))),
  });
  return { id: before.id, number: before.number };
}

/** «غادر» for an employee, with the day and the reason. */
export const recordEmployeeLeaving = (
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; leftDate: string; reason: string },
) => recordLeaving(ex, ctx, "EMPLOYEE", input);

/** An employee who left comes back in post, on the same file. Checked like a registration. */
export const readmitEmployee = (ex: Executor, ctx: ServiceContext, input: { id: string } & SanctionPassage) =>
  readmit(ex, ctx, "EMPLOYEE", input);

// ── Reading ─────────────────────────────────────────────────────────────────

export interface EmployeeListRow {
  id: string;
  number: string;
  numberSeq: number;
  lastName: string;
  firstName: string;
  fullNameLatin: string | null;
  sex: Sex;
  jobPosition: JobPosition | null;
  phone: string;
  email: string | null;
  status: EngagementStatus;
  startDate: string | null;
  contractEndDate: string | null;
  /** The contract ends within the lead time of `alerts.staffContractEndLeadDays`, or has ended, while in post. */
  contractEnding: boolean;
  /** The login account that points at this employee, if any. */
  account: string | null;
  sanction: SanctionStateOf | null;
}

/**
 * The centre's employees, for the list and for the pickers of other owners
 * (inspector, file owner, sales rep, supervisor, collector, storekeeper):
 * `listEmployees({ position: "SUPERVISOR" })` (CONTRACTS section 3).
 */
export async function listEmployees(
  ex: Executor,
  ctx: ServiceContext,
  input: { position?: JobPosition; activeOnly?: boolean } = {},
): Promise<EmployeeListRow[]> {
  let rows = ex
    .selectFrom("StaffMember as e")
    .leftJoin("User as u", "u.staffMemberId", "e.id")
    .select([
      "e.id",
      "e.number",
      "e.numberSeq",
      "e.lastName",
      "e.firstName",
      "e.fullNameLatin",
      "e.sex",
      "e.jobPosition",
      "e.phone",
      "e.email",
      "e.engagementStatus",
      "e.startDate",
      "e.contractEndDate",
      "u.username as account",
    ])
    .where("e.kind", "=", "EMPLOYEE")
    .where("e.deletedAt", "is", null);
  if (input.position) rows = rows.where("e.jobPosition", "=", input.position);
  if (input.activeOnly) rows = rows.where("e.engagementStatus", "=", "ACCEPTED");
  const found = await rows.orderBy("e.numberSeq", "desc").execute();
  const [states, leadDays] = await Promise.all([
    getSanctionStates(ex, ctx, { kind: "EMPLOYEE", ids: found.map((row) => row.id) }),
    getSetting(ex, "alerts.staffContractEndLeadDays"),
  ]);
  const until = addDays(ctx.today, leadDays);
  return found.map((row) => ({
    id: row.id,
    number: row.number,
    numberSeq: row.numberSeq,
    lastName: row.lastName,
    firstName: row.firstName,
    fullNameLatin: row.fullNameLatin,
    sex: row.sex as Sex,
    jobPosition: row.jobPosition as JobPosition | null,
    phone: row.phone,
    email: row.email,
    status: row.engagementStatus as EngagementStatus,
    startDate: row.startDate,
    contractEndDate: row.contractEndDate,
    contractEnding: row.engagementStatus !== "LEFT" && row.contractEndDate !== null && row.contractEndDate <= until,
    account: row.account,
    sanction: states[row.id] ?? null,
  }));
}

export interface EmployeeFile {
  id: string;
  number: string;
  status: EngagementStatus;
  leftDate: string | null;
  leftReason: string | null;
  values: EmployeeFormValues;
  /** The login account that points at this employee: Foundation's, shown here. */
  account: { username: string; displayName: string; roleId: string; isActive: boolean } | null;
  sanction: SanctionStateOf | null;
}

const text = (value: string | null) => value ?? "";
const oneOf = <T extends string>(value: string | null, allowed: readonly T[]) =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const dinars = (centimes: number | null) =>
  centimes === null ? "" : Number.isInteger(centimes / 100) ? String(centimes / 100) : (centimes / 100).toFixed(2);
const hours = (minutes: number) => (Number.isInteger(minutes / 60) ? String(minutes / 60) : (minutes / 60).toFixed(1));

/** One employee's file. Opening it is a consultation of personal data, and is logged. */
export async function openEmployeeFile(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string },
): Promise<EmployeeFile> {
  requireSection(ctx, "EMPLOYEES", "READ");
  const employee = await staffOf(ex, "EMPLOYEE", input.id);
  const [account, states, commune] = await Promise.all([
    ex
      .selectFrom("User")
      .select(["username", "displayName", "roleId", "isActive"])
      .where("staffMemberId", "=", employee.id)
      .executeTakeFirst(),
    getSanctionStates(ex, ctx, { kind: "EMPLOYEE", ids: [employee.id] }),
    employee.residenceCommuneId
      ? ex
          .selectFrom("Commune")
          .select(["nameAr", "wilayaCode"])
          .where("id", "=", employee.residenceCommuneId)
          .executeTakeFirst()
      : Promise.resolve(undefined),
  ]);
  const subject = { kind: "EMPLOYEE" as const, id: employee.id, label: `${employee.lastName} ${employee.firstName}` };
  await logConsult(ex, ctx, {
    owner: "PEOPLE",
    action: "VIEW",
    entity: "StaffMember",
    entityId: employee.id,
    entityLabel: `${employee.number} ${subject.label}`,
    subject,
  });
  return {
    id: employee.id,
    number: employee.number,
    status: employee.engagementStatus as EngagementStatus,
    leftDate: employee.leftDate,
    leftReason: employee.leftReason,
    values: {
      ...emptyEmployeeValues(employee.registrationDate),
      lastName: employee.lastName,
      firstName: employee.firstName,
      fullNameLatin: text(employee.fullNameLatin),
      sex: employee.sex as Sex,
      birthDate: text(employee.birthDate),
      birthPlace: text(employee.birthPlace),
      birthWilayaCode: text(employee.birthWilayaCode),
      address: text(employee.address),
      ...residenceValues(employee.residenceCommuneId, commune),
      maritalStatus: oneOf(employee.maritalStatus, MARITAL_STATUSES),
      phone: employee.phone,
      phone2: text(employee.phone2),
      email: text(employee.email),
      nationalIdNumber: text(employee.nationalIdNumber),
      emergencyName: text(employee.emergencyName),
      emergencyAddress: text(employee.emergencyAddress),
      emergencyRelation: text(employee.emergencyRelation),
      emergencyPhone: text(employee.emergencyPhone),
      jobPosition: oneOf(employee.jobPosition, JOB_POSITIONS) ?? "OTHER",
      educationLevel: text(employee.educationLevel),
      certificateName: text(employee.certificateName),
      startDate: text(employee.startDate),
      employmentContract: oneOf(employee.employmentContract, EMPLOYMENT_CONTRACTS),
      workTimeKind: oneOf(employee.workTimeKind, WORK_TIMES),
      contractEndDate: text(employee.contractEndDate),
      cnasDeclared: employee.cnasDeclared === 1,
      cnasNumber: text(employee.cnasNumber),
      payBasis: oneOf(employee.payBasis, PAY_BASES),
      payRate: dinars(employee.payRate),
      payPeriod: oneOf(employee.payPeriod, PAY_PERIODS),
      weeklyCapacityHours: hours(employee.weeklyCapacityMin),
    },
    account: account ? { ...account, isActive: account.isActive === 1 } : null,
    sanction: states[employee.id] ?? null,
  };
}

// What the screens import.
export const registerEmployeeAction = action(registerEmployee, { revalidate: [EMPLOYEES_PATH] });
export const updateEmployeeAction = action(updateEmployee, { revalidate: [EMPLOYEES_PATH] });
export const recordEmployeeLeavingAction = action(recordEmployeeLeaving, { revalidate: [EMPLOYEES_PATH] });
export const readmitEmployeeAction = action(readmitEmployee, { revalidate: [EMPLOYEES_PATH] });
export const listEmployeesQuery = query(listEmployees);
export const openEmployeeFileAction = action(openEmployeeFile);
