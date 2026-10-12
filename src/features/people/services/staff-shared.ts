import { isDate } from "@/features/people/rules/dates";
import type { PersonIdentity } from "@/features/people/rules/sanction-match";
import type { SanctionContext, StaffKind } from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logConsult } from "@/lib/log";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, type LocalDate, type Minutes, type Money } from "@/lib/units";

import { checkSanction, consumeDecision, type CheckSanctionResult } from "./sanctions";

/**
 * What the worker services and the employee services share: one table holds
 * both kinds of person (A2), so the sanction check around a save, the dated
 * status and pay-terms rows, leaving and coming back are written once.
 */

/** What the screen's gate brought back (`useSanctionGate`). */
export interface SanctionPassage {
  /** The clerk said that the person under sanction who has this name is somebody else. */
  notTheSamePerson?: boolean;
  /** The manager's yes to this attempt. */
  decisionId?: string | null;
}

/** Columns the program derives from what was typed: the log says what the person changed, not what follows from it. */
export const DERIVED_KEYS: ReadonlySet<string> = new Set(["nameKey", "nameLatinKey", "phoneKeys"]);

export const orNull = (text: string) => (text.trim() === "" ? null : text.trim());
export const dateOrNull = (text: string) => (text.trim() === "" ? null : localDate(text.trim()));
export const decimal = (text: string) => Number(text.trim().replace(",", "."));
export const idNumber = (text: string) => text.replace(/\s/g, "");

/** The bar section each kind of person belongs to. */
export const SECTION_OF_KIND = { WORKER: "WORKERS", EMPLOYEE: "EMPLOYEES" } as const;

const REGISTRATION_OF_KIND = { WORKER: "WORKER_REGISTRATION", EMPLOYEE: "EMPLOYEE_REGISTRATION" } as const;
export const registrationContext = (kind: StaffKind): SanctionContext => REGISTRATION_OF_KIND[kind];

export const staffSubject = (
  kind: StaffKind,
  id: string,
  number: string,
  name: { lastName: string; firstName: string },
) => ({ kind, id, label: `${number} ${name.lastName} ${name.firstName}` });

/** One record per person and kind (the database says so too): somebody coming back is readmitted on her file. */
export async function refuseSecondRecord(
  ex: Executor,
  kind: StaffKind,
  nationalId: string | null,
  exceptId?: string,
): Promise<void> {
  if (!nationalId) return;
  const holder = await ex
    .selectFrom("StaffMember")
    .select("id")
    .where("kind", "=", kind)
    .where("nationalIdNumber", "=", nationalId)
    .where("deletedAt", "is", null)
    .$if(exceptId !== undefined, (qb) => qb.where("id", "<>", exceptId as string))
    .executeTakeFirst();
  if (!holder) return;
  throw new ServiceError(
    kind === "WORKER"
      ? "A worker with this identity number is already registered. Open that worker's file."
      : "An employee with this identity number is already registered. Open that employee's file.",
  );
}

/** The check, and what the screen's gate brought: the clerk's word, or the manager's yes. */
export async function passSanctionCheck(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    context: SanctionContext;
    subjectKind: StaffKind;
    subjectId?: string;
    identity: PersonIdentity;
    passage: SanctionPassage;
  },
): Promise<CheckSanctionResult> {
  const check = await checkSanction(ex, ctx, {
    context: input.context,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    identity: input.identity,
    decisionId: input.passage.decisionId ?? null,
    ignoreOwnRecord: input.context === "IDENTITY_CHANGE",
  });
  if (check.outcome === "BLOCKED") {
    throw new ServiceError("This person is suspended or penalised. The manager must allow the registration first.");
  }
  if (check.outcome === "REFUSED") {
    throw new ServiceError("The manager did not allow this person to be registered.");
  }
  if (check.outcome === "POSSIBLE" && input.passage.notTheSamePerson !== true) {
    throw new ServiceError(
      "Someone with this name is suspended or penalised. Confirm that this is another person before saving.",
    );
  }
  return check;
}

/** After the save: the manager's yes is spent, the clerk's word is logged. */
export async function settleSanctionCheck(
  ex: Executor,
  ctx: ServiceContext,
  check: CheckSanctionResult,
  input: { context: SanctionContext; passage: SanctionPassage; staffId: string; number: string },
): Promise<void> {
  if (check.outcome === "ALLOWED" && input.passage.decisionId) {
    await consumeDecision(ex, ctx, {
      decisionId: input.passage.decisionId,
      entityKind: "STAFF_MEMBER",
      entityId: input.staffId,
    });
  }
  if (check.outcome !== "POSSIBLE") return;
  for (const match of check.matches) {
    await logConsult(ex, ctx, {
      owner: "PEOPLE",
      action: "SANCTION_CHECK",
      entity: "Sanction",
      entityId: match.sanctionId,
      entityLabel: match.displayName,
      // Whose data was looked at: the person under sanction.
      subject: { kind: match.subjectKind, id: match.subjectId, label: match.displayName },
      context: {
        context: input.context,
        foundBy: match.foundBy,
        answer: "NOT_THE_SAME_PERSON",
        registered: input.staffId,
        registeredNumber: input.number,
      },
    });
  }
}

/** A dated status: the history answers "active on that date". */
export async function insertStatus(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string; date: LocalDate; from: string | null; to: string; reason?: string | null },
): Promise<void> {
  await ex
    .insertInto("StaffEvent")
    .values({
      id: newId(),
      staffId: input.staffId,
      kind: "STATUS",
      date: input.date,
      fromStatus: input.from,
      toStatus: input.to,
      reason: input.reason ?? null,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    })
    .execute();
}

export interface PayTerms {
  payBasis: string | null;
  payRate: Money | null;
  payPeriod: string | null;
  weeklyCapacityMin: Minutes;
}

/** Dated pay terms, only when the basis and the rate are both known (the table refuses them half given). */
export async function insertPayTerms(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string; date: LocalDate; terms: PayTerms },
): Promise<void> {
  const { payBasis, payRate, payPeriod, weeklyCapacityMin } = input.terms;
  if (payBasis === null || payRate === null) return;
  await ex
    .insertInto("StaffEvent")
    .values({
      id: newId(),
      staffId: input.staffId,
      kind: "PAY_TERMS",
      date: input.date,
      payBasis,
      payRate,
      payPeriod,
      weeklyCapacityMin,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    })
    .execute();
}

const NOT_FOUND = { WORKER: "This worker does not exist.", EMPLOYEE: "This employee does not exist." } as const;

/** The person's record, or the refusal that says there is none. */
export async function staffOf(ex: Executor, kind: StaffKind, id: string) {
  const person = await ex
    .selectFrom("StaffMember")
    .selectAll()
    .where("id", "=", id)
    .where("kind", "=", kind)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!person) throw new ServiceError(NOT_FOUND[kind]);
  return person;
}

/**
 * «غادر»: the person leaves the centre on a day, with the reason. For a
 * worker, Operations gives up her seats from then on (`staff.unavailable`).
 */
export async function recordLeaving(
  ex: Executor,
  ctx: ServiceContext,
  kind: StaffKind,
  input: { id: string; leftDate: string; reason: string },
): Promise<void> {
  requireSection(ctx, SECTION_OF_KIND[kind], "WRITE");
  requireCapability(ctx, "staff.write");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for leaving.");
  if (!isDate(input.leftDate)) throw new ServiceError("Enter a valid date.");
  const leftDate = localDate(input.leftDate);
  const before = await staffOf(ex, kind, input.id);
  if (before.engagementStatus === "LEFT") throw new ServiceError("This person has already left.");
  if (leftDate < before.registrationDate) {
    throw new ServiceError("The leaving date cannot be before the registration date.");
  }

  const { set, changes } = changedColumns(before, { engagementStatus: "LEFT", leftDate, leftReason: reason });
  await ex
    .updateTable("StaffMember")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await insertStatus(ex, ctx, {
    staffId: before.id,
    date: leftDate,
    from: before.engagementStatus,
    to: "LEFT",
    reason,
  });
  const subject = staffSubject(kind, before.id, before.number, before);
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "STATUS_CHANGE",
    entity: "StaffMember",
    entityId: before.id,
    entityLabel: subject.label,
    subject,
    changes: changes ?? undefined,
  });
  if (kind === "WORKER") {
    await emit(ex, ctx, "staff.unavailable", { workerId: before.id, fromDate: leftDate, toDate: null, cause: "LEFT" });
  }
}

/**
 * Somebody who left, or was refused, comes back on the same file and number.
 * The person's own sanction counts here: coming back is an attempt to
 * register them, and the manager answers it.
 */
export async function readmit(
  ex: Executor,
  ctx: ServiceContext,
  kind: StaffKind,
  input: { id: string } & SanctionPassage,
): Promise<void> {
  requireSection(ctx, SECTION_OF_KIND[kind], "WRITE");
  requireCapability(ctx, "staff.write");
  const before = await staffOf(ex, kind, input.id);
  if (before.engagementStatus !== "LEFT" && before.engagementStatus !== "REFUSED") {
    throw new ServiceError("Only someone who left or was refused can be readmitted.");
  }
  const passage: SanctionPassage = { notTheSamePerson: input.notTheSamePerson, decisionId: input.decisionId };
  const check = await passSanctionCheck(ex, ctx, {
    context: "READMISSION",
    subjectKind: kind,
    subjectId: before.id,
    identity: {
      lastName: before.lastName,
      firstName: before.firstName,
      nameLatin: before.fullNameLatin,
      birthDate: before.birthDate,
      phones: [before.phone],
      nationalId: before.nationalIdNumber,
    },
    passage,
  });

  // A worker is a candidate again, to be decided on; an employee is back in post.
  const status = kind === "WORKER" ? "CANDIDATE" : "ACCEPTED";
  const { set, changes } = changedColumns(before, { engagementStatus: status, leftDate: null, leftReason: null });
  await ex
    .updateTable("StaffMember")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await insertStatus(ex, ctx, { staffId: before.id, date: ctx.today, from: before.engagementStatus, to: status });
  await settleSanctionCheck(ex, ctx, check, {
    context: "READMISSION",
    passage,
    staffId: before.id,
    number: before.number,
  });
  const subject = staffSubject(kind, before.id, before.number, before);
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "STATUS_CHANGE",
    entity: "StaffMember",
    entityId: before.id,
    entityLabel: subject.label,
    subject,
    changes: changes ?? undefined,
    context: { readmission: true, sanctionDecisionId: check.outcome === "ALLOWED" ? (input.decisionId ?? null) : null },
  });
}
