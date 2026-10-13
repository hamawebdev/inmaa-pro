import { ensureZoneForCommune, PLACES_PATH } from "@/features/core/services/places";
import { addDays } from "@/features/people/rules/dates";
import type { PersonIdentity } from "@/features/people/rules/sanction-match";
import { hiringTotal } from "@/features/people/rules/scores";
import {
  HIRING_CRITERIA,
  REG_SUFFIX_OF_SEX,
  STAFF_DOCUMENT_TYPES,
  type EngagementStatus,
  type HiringDecision,
} from "@/features/people/validators/staff-codes";
import {
  phoneDigits,
  scoresAsNumbers,
  workerFormSchema,
  type WorkerFormValues,
} from "@/features/people/validators/worker";
import { can, requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logCollect, WITHHELD } from "@/lib/log";
import { formatNumber, nextNumber } from "@/lib/numbering";
import { readRestricted } from "@/lib/restricted";
import { action } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { normaliseName, phoneKeys } from "@/lib/text/normalise";
import { dinarsToMoney, hoursToMinutes, localDate, type LocalDate } from "@/lib/units";

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
  settleSanctionCheck,
  staffOf,
  type SanctionPassage,
} from "./staff-shared";
import { staffName } from "@/lib/text/names";

export type { SanctionPassage } from "./staff-shared";

/**
 * A cleaning worker's record, from his worker form (features 25 and 37):
 *
 *  - `registerWorker`: one transaction for the access rules, the
 *    suspended-or-penalised check, the number (H or F from the sex), the rows
 *    (`StaffMember`, `StaffConfidential`, the documents handed in, the
 *    decision, the dated status and pay terms) and the log;
 *  - `updateWorker`: the same form changed later. Only what changed is
 *    written, the health answers and the score only when someone allowed
 *    opened them, an identity edited into someone under sanction is stopped;
 *  - `recordWorkerLeaving` and `readmitWorker`: «غادر», and coming back.
 *    Coming back is checked against her own sanction too.
 */

export const WORKERS_PATH = "/dashboard/workers";
/** What a registration refreshes: the workers, and the zone pickers when her commune got its zone. */
export const REGISTRATION_REFRESHES = [WORKERS_PATH, PLACES_PATH] as const;

export interface RegisterWorkerInput extends WorkerFormValues, SanctionPassage {}

export interface RegisterWorkerResult {
  id: string;
  /** «رقم التسجيل» as printed: `12/F`. */
  number: string;
}

/** The status a worker's file takes from «قرار الإدارة». */
export const STATUS_OF_DECISION: Readonly<Record<HiringDecision, EngagementStatus>> = {
  ACCEPTED: "ACCEPTED",
  ACCEPTED_ON_TRIAL: "ON_TRIAL",
  REFUSED_FINAL: "REFUSED",
};

/** Documents only the holders of the restricted capabilities open (DESIGN section 9). */
export const RESTRICTED_DOCUMENTS: ReadonlySet<string> = new Set(["MEDICAL_CERT", "CRIMINAL_RECORD"]);

/** The identity the sanction check compares, from the screen's values. The emergency phone is somebody else's. */
export function workerIdentity(values: WorkerFormValues): PersonIdentity {
  return {
    lastName: values.lastName,
    firstName: values.firstName,
    nameLatin: values.fullNameLatin,
    birthDate: values.birthDate || null,
    phones: [values.phone],
    nationalId: idNumber(values.nationalIdNumber),
  };
}

function parseValues(values: WorkerFormValues): WorkerFormValues {
  const parsed = workerFormSchema.safeParse(values);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  return parsed.data;
}

/** The columns of `StaffMember` that his form and the office card give, as stored. */
function memberColumns(values: WorkerFormValues) {
  const phone = phoneDigits(values.phone);
  const nationalId = idNumber(values.nationalIdNumber);
  const weeklyCapacityMin = hoursToMinutes(decimal(values.weeklyCapacityHours));
  return {
    registrationDate: localDate(values.registrationDate),
    lastName: values.lastName,
    firstName: values.firstName,
    fullNameLatin: orNull(values.fullNameLatin),
    sex: values.sex,
    birthDate: localDate(values.birthDate),
    birthPlace: orNull(values.birthPlace),
    birthWilayaCode: orNull(values.birthWilayaCode),
    address: orNull(values.address),
    residenceCommuneId: orNull(values.residenceCommuneId),
    maritalStatus: values.maritalStatus ?? null,
    phone,
    emergencyName: orNull(values.emergencyName),
    emergencyRelation: orNull(values.emergencyRelation),
    emergencyAddress: orNull(values.emergencyAddress),
    emergencyPhone: orNull(phoneDigits(values.emergencyPhone)),
    educationLevel: orNull(values.educationLevel),
    certificateName: orNull(values.certificateName),
    workedInFieldBefore: values.workedInFieldBefore === undefined ? null : values.workedInFieldBefore === "YES" ? 1 : 0,
    previousEmployer: values.workedInFieldBefore === "YES" ? orNull(values.previousEmployer) : null,
    abilities: JSON.stringify(values.abilities),
    availableDays: JSON.stringify(values.availableDays),
    issuedDate: dateOrNull(values.issuedDate),
    nationalIdNumber: orNull(nationalId),
    nameKey: normaliseName(staffName(values)),
    nameLatinKey: orNull(normaliseName(values.fullNameLatin)),
    phoneKeys: phoneKeys([phone]),
    role: values.role,
    canCollectCash: values.canCollectCash ? 1 : 0,
    collectAuthFrom: values.canCollectCash ? dateOrNull(values.collectAuthFrom) : null,
    collectAuthNote: values.canCollectCash ? orNull(values.collectAuthNote) : null,
    weeklyCapacityMin,
    payBasis: values.payBasis ?? null,
    payRate: values.payRate === "" ? null : dinarsToMoney(decimal(values.payRate)),
    payPeriod: values.payPeriod ?? null,
    cnasDeclared: values.cnasDeclared ? 1 : 0,
    cnasNumber: values.cnasDeclared ? orNull(values.cnasNumber.replace(/\s/g, "")) : null,
  };
}

/** The restricted part's columns, by group: the health answers, and the score. */
function confidentialColumns(values: WorkerFormValues) {
  const scores = scoresAsNumbers(values.hiringScores);
  const typedTotal = values.hiringTotal === "" ? null : Number(values.hiringTotal);
  const hasHealth = values.healthConditions.length > 0 || values.healthOtherText !== "";
  return {
    hasHealth,
    hasScore: Object.keys(scores).length > 0 || typedTotal !== null,
    health: {
      conditions: hasHealth ? JSON.stringify(values.healthConditions) : null,
      otherText: orNull(values.healthOtherText),
    },
    score: {
      ...(Object.fromEntries(HIRING_CRITERIA.map((criterion) => [criterion, scores[criterion] ?? null])) as Record<
        (typeof HIRING_CRITERIA)[number],
        number | null
      >),
      total: hiringTotal(scores).total ?? typedTotal,
    },
  };
}

async function zoneFor(
  ex: Executor,
  ctx: ServiceContext,
  values: WorkerFormValues,
  residenceCommuneId: string | null,
): Promise<string | null> {
  if (values.zoneId) return values.zoneId;
  if (!residenceCommuneId) return null;
  return (await ensureZoneForCommune(ex, ctx, { communeId: residenceCommuneId })).zoneId;
}

function requireWhatIsRecorded(
  ctx: ServiceContext,
  recorded: { health: boolean; score: boolean; decision: boolean },
): void {
  if (recorded.health && !can(ctx, "staff.health.read")) {
    throw new ServiceError("You do not have permission to record the health answers.");
  }
  if (recorded.score && !can(ctx, "staff.hiringScore.read")) {
    throw new ServiceError("You do not have permission to record the confidential evaluation.");
  }
  if (recorded.decision && !can(ctx, "hiring.decide")) {
    throw new ServiceError("You do not have permission to record the management's decision.");
  }
}

const workerSubject = (id: string, number: string, values: { lastName: string; firstName: string }) => ({
  kind: "WORKER" as const,
  id,
  label: `${number} ${staffName(values)}`,
});

// ── Registration ────────────────────────────────────────────────────────────

export async function registerWorker(
  ex: Executor,
  ctx: ServiceContext,
  input: RegisterWorkerInput,
): Promise<RegisterWorkerResult> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  const values = parseValues(input);
  const confidential = confidentialColumns(values);
  requireWhatIsRecorded(ctx, {
    health: confidential.hasHealth,
    score: confidential.hasScore,
    decision: values.hiringDecision !== undefined,
  });

  const columns = memberColumns(values);
  await refuseSecondRecord(ex, "WORKER", columns.nationalIdNumber);
  const passage: SanctionPassage = { notTheSamePerson: input.notTheSamePerson, decisionId: input.decisionId };
  const check = await passSanctionCheck(ex, ctx, {
    context: "WORKER_REGISTRATION",
    subjectKind: "WORKER",
    identity: workerIdentity(values),
    passage,
  });

  const suffix = REG_SUFFIX_OF_SEX[values.sex];
  const number = await nextNumber(ex, ctx, "STAFF_WORKER", { date: columns.registrationDate, suffix });
  const settings = await getSettings(ex, ["centre.city", "hiring.trialDays"]);
  const id = newId();
  const decision = values.hiringDecision;
  const status: EngagementStatus = decision ? STATUS_OF_DECISION[decision] : "CANDIDATE";
  const stamp = { createdAt: ctx.now, updatedAt: ctx.now };
  const by = { createdByUserId: ctx.userId, updatedByUserId: ctx.userId };

  await ex
    .insertInto("StaffMember")
    .values({
      id,
      kind: "WORKER",
      numberSeq: number.seq,
      numberSuffix: suffix,
      number: number.display,
      ...columns,
      issuedPlace: settings["centre.city"],
      engagementStatus: status,
      branchId: ctx.branchId,
      zoneId: await zoneFor(ex, ctx, values, columns.residenceCommuneId),
      ...stamp,
      ...by,
    })
    .execute();

  // One row per person, even empty, under her own id: the one place her restricted answers will ever be.
  await ex
    .insertInto("StaffConfidential")
    .values({
      id,
      staffId: id,
      ...confidential.health,
      ...confidential.score,
      evaluatedByUserId: confidential.hasScore ? ctx.userId : null,
      evaluatedDate: confidential.hasScore ? ctx.today : null,
      ...stamp,
      updatedByUserId: ctx.userId,
    })
    .execute();

  const documents = values.documents.filter((document) => document.delivered);
  for (const document of documents) {
    await ex
      .insertInto("StaffDocument")
      .values({
        id: newId(),
        staffId: id,
        type: document.type,
        isCurrent: 1,
        isRestricted: RESTRICTED_DOCUMENTS.has(document.type) ? 1 : 0,
        delivered: 1,
        deliveredDate: columns.registrationDate,
        expiryDate: dateOrNull(document.expiryDate),
        ...stamp,
        ...by,
      })
      .execute();
  }

  // «قرار الإدارة», dated by «حررت: بأم البواقي، بتاريخ» when the paper gives that date.
  const decisionDate = decision ? (columns.issuedDate ?? ctx.today) : null;
  if (decision && decisionDate) {
    await insertDecision(ex, ctx, {
      staffId: id,
      decision,
      date: decisionDate,
      trialDays: settings["hiring.trialDays"],
    });
  }

  // Her status from the registration date, and from the decision's when that is a later day: the history
  // answers "active on that date". Pay terms only when they are known (the table refuses them half given).
  const decidedLater = decisionDate !== null && decisionDate > columns.registrationDate;
  await insertStatus(ex, ctx, {
    staffId: id,
    date: columns.registrationDate,
    from: null,
    to: decidedLater ? "CANDIDATE" : status,
  });
  if (decidedLater && decisionDate) {
    await insertStatus(ex, ctx, { staffId: id, date: decisionDate, from: "CANDIDATE", to: status });
  }
  await insertPayTerms(ex, ctx, { staffId: id, date: columns.registrationDate, terms: columns });

  await settleSanctionCheck(ex, ctx, check, {
    context: "WORKER_REGISTRATION",
    passage,
    staffId: id,
    number: number.display,
  });

  const subject = workerSubject(id, number.display, values);
  await logCollect(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "StaffMember",
    entityId: id,
    entityLabel: subject.label,
    subject,
    context: {
      status,
      documents: documents.length,
      sanctionDecisionId: check.outcome === "ALLOWED" ? (input.decisionId ?? null) : null,
    },
  });
  if (confidential.hasHealth || confidential.hasScore) {
    // That they were collected, never what they are.
    const fields = [...(confidential.hasHealth ? ["conditions"] : []), ...(confidential.hasScore ? ["total"] : [])];
    await logCollect(ex, ctx, {
      owner: "PEOPLE",
      action: "CREATE",
      entity: "StaffConfidential",
      entityId: id,
      entityLabel: subject.label,
      subject,
      changes: Object.fromEntries(fields.map((field) => [field, [WITHHELD, WITHHELD] as const])),
    });
  }

  return { id, number: number.display };
}

async function insertDecision(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string; decision: HiringDecision; date: LocalDate; trialDays: number },
): Promise<void> {
  if (!ctx.userId) throw new Error("people: a hiring decision needs the user who took it");
  await ex
    .insertInto("HiringDecision")
    .values({
      id: newId(),
      staffId: input.staffId,
      decision: input.decision,
      decisionDate: input.date,
      decidedByUserId: ctx.userId,
      trialEndDate: input.decision === "ACCEPTED_ON_TRIAL" ? localDate(addDays(input.date, input.trialDays)) : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .execute();
}

// ── Changing a registered worker ────────────────────────────────────────────

export interface UpdateWorkerInput extends SanctionPassage {
  id: string;
  values: WorkerFormValues;
  /**
   * The restricted parts the user opened on her file, and so may have changed.
   * A part left closed is not touched, whatever its fields hold.
   */
  opened?: { health?: boolean; score?: boolean };
}

/** The current copy of each document type: what the form's ticks and dates are compared with. */
async function currentDocuments(ex: Executor, staffId: string) {
  return ex
    .selectFrom("StaffDocument")
    .select(["id", "type", "delivered", "expiryDate"])
    .where("staffId", "=", staffId)
    .where("isCurrent", "=", 1)
    .where("deletedAt", "is", null)
    .where("type", "in", [...STAFF_DOCUMENT_TYPES])
    .execute();
}

export async function lastDecisionOf(ex: Executor, staffId: string) {
  return ex
    .selectFrom("HiringDecision")
    .select(["id", "decision", "decisionDate", "trialEndDate"])
    .where("staffId", "=", staffId)
    .orderBy("decisionDate", "desc")
    .orderBy("createdAt", "desc")
    .executeTakeFirst();
}

export async function updateWorker(
  ex: Executor,
  ctx: ServiceContext,
  input: UpdateWorkerInput,
): Promise<RegisterWorkerResult> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  const values = parseValues(input.values);
  const before = await staffOf(ex, "WORKER", input.id);

  const lastDecision = await lastDecisionOf(ex, before.id);
  const newDecision =
    values.hiringDecision !== undefined && values.hiringDecision !== lastDecision?.decision
      ? values.hiringDecision
      : undefined;
  const opened = { health: input.opened?.health === true, score: input.opened?.score === true };
  requireWhatIsRecorded(ctx, { ...opened, decision: newDecision !== undefined });

  const columns = memberColumns(values);
  await refuseSecondRecord(ex, "WORKER", columns.nationalIdNumber, before.id);

  // An identity edited into someone under sanction is stopped like a registration (her own sanction aside).
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
        subjectKind: "WORKER",
        subjectId: before.id,
        identity: workerIdentity(values),
        passage,
      })
    : null;

  // A corrected sex rewrites the letter after the number.
  const suffix = REG_SUFFIX_OF_SEX[values.sex];
  const number = formatNumber("STAFF_WORKER", before.numberSeq, 0, { suffix });
  const settings = await getSettings(ex, ["hiring.trialDays"]);
  const status =
    newDecision !== undefined && before.engagementStatus !== "LEFT"
      ? STATUS_OF_DECISION[newDecision]
      : (before.engagementStatus as EngagementStatus);

  const { set, changes } = changedColumns(before, {
    ...columns,
    numberSuffix: suffix,
    number,
    zoneId: await zoneFor(ex, ctx, values, columns.residenceCommuneId),
    engagementStatus: status,
  });
  if (changes) {
    await ex
      .updateTable("StaffMember")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
  }

  if (newDecision !== undefined) {
    await insertDecision(ex, ctx, {
      staffId: before.id,
      decision: newDecision,
      date: ctx.today,
      trialDays: settings["hiring.trialDays"],
    });
  }
  if (status !== before.engagementStatus) {
    await insertStatus(ex, ctx, { staffId: before.id, date: ctx.today, from: before.engagementStatus, to: status });
  }
  const payChanged = ["payBasis", "payRate", "payPeriod", "weeklyCapacityMin"].some((key) => changes && key in changes);
  if (payChanged) await insertPayTerms(ex, ctx, { staffId: before.id, date: ctx.today, terms: columns });

  const documentChanges = await saveDocuments(ex, ctx, before.id, values, columns.registrationDate);
  const confidentialChanges = await saveConfidential(ex, ctx, before.id, values, opened);

  if (check) {
    await settleSanctionCheck(ex, ctx, check, { context: "IDENTITY_CHANGE", passage, staffId: before.id, number });
  }

  const subject = workerSubject(before.id, number, values);
  // The search keys follow the name and phone: the log says what the person changed, not what follows from it.
  const allChanges = Object.fromEntries(
    Object.entries({ ...(changes ?? {}), ...documentChanges }).filter(([field]) => !DERIVED_KEYS.has(field)),
  );
  if (Object.keys(allChanges).length > 0 || newDecision !== undefined) {
    await logChange(ex, ctx, {
      owner: "PEOPLE",
      action: "UPDATE",
      entity: "StaffMember",
      entityId: before.id,
      entityLabel: subject.label,
      subject,
      changes: allChanges,
      context: newDecision !== undefined ? { decision: newDecision } : undefined,
    });
  }
  if (confidentialChanges.length > 0) {
    await logChange(ex, ctx, {
      owner: "PEOPLE",
      action: "UPDATE",
      entity: "StaffConfidential",
      entityId: before.id,
      entityLabel: subject.label,
      subject,
      changes: Object.fromEntries(confidentialChanges.map((field) => [field, [WITHHELD, WITHHELD] as const])),
    });
  }
  return { id: before.id, number };
}

/** The ticks and expiry dates of «الوثائق المسلمة», against the current copies. Returns what changed, for the log. */
async function saveDocuments(
  ex: Executor,
  ctx: ServiceContext,
  staffId: string,
  values: WorkerFormValues,
  registered: LocalDate,
): Promise<Record<string, readonly [unknown, unknown]>> {
  const held = await currentDocuments(ex, staffId);
  const changes: Record<string, readonly [unknown, unknown]> = {};
  for (const line of values.documents) {
    const current = held.find((document) => document.type === line.type);
    const expiryDate = line.delivered ? dateOrNull(line.expiryDate) : null;
    if (!current) {
      if (!line.delivered) continue;
      await ex
        .insertInto("StaffDocument")
        .values({
          id: newId(),
          staffId,
          type: line.type,
          isCurrent: 1,
          isRestricted: RESTRICTED_DOCUMENTS.has(line.type) ? 1 : 0,
          delivered: 1,
          deliveredDate: ctx.today < registered ? registered : ctx.today,
          expiryDate,
          createdAt: ctx.now,
          updatedAt: ctx.now,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
        .execute();
      changes[`document.${line.type}`] = [null, expiryDate ?? true];
      continue;
    }
    const patch = { delivered: line.delivered ? 1 : 0, expiryDate };
    const { set, changes: changed } = changedColumns(current, patch);
    if (!changed) continue;
    await ex
      .updateTable("StaffDocument")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", current.id)
      .execute();
    for (const [field, pair] of Object.entries(changed)) changes[`document.${line.type}.${field}`] = pair;
  }
  return changes;
}

/**
 * The health answers and the score, each only when its part was opened (and
 * so read, with its line in the log). Returns the names of what changed.
 */
async function saveConfidential(
  ex: Executor,
  ctx: ServiceContext,
  staffId: string,
  values: WorkerFormValues,
  opened: { health: boolean; score: boolean },
): Promise<string[]> {
  if (!opened.health && !opened.score) return [];
  const next = confidentialColumns(values);
  const changed: string[] = [];
  let set: Record<string, unknown> = {};
  if (opened.health) {
    const before = await readRestricted(ex, ctx, {
      capability: "staff.health.read",
      entity: "StaffConfidential",
      id: staffId,
    });
    const diff = changedColumns(
      { conditions: before?.conditions ?? null, otherText: before?.otherText ?? null },
      next.health,
    );
    if (diff.changes) {
      set = { ...set, ...diff.set };
      changed.push(...Object.keys(diff.changes));
    }
  }
  if (opened.score) {
    const before = await readRestricted(ex, ctx, {
      capability: "staff.hiringScore.read",
      entity: "StaffConfidential",
      id: staffId,
    });
    const current = Object.fromEntries(
      [...HIRING_CRITERIA, "total" as const].map((column) => [column, before?.[column] ?? null]),
    );
    const diff = changedColumns(current, next.score);
    if (diff.changes) {
      set = { ...set, ...diff.set, evaluatedByUserId: ctx.userId, evaluatedDate: ctx.today };
      changed.push(...Object.keys(diff.changes));
    }
  }
  if (changed.length === 0) return [];
  await ex
    .updateTable("StaffConfidential")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("staffId", "=", staffId)
    .execute();
  return changed;
}

// ── Leaving, and coming back ────────────────────────────────────────────────

/** «غادر»: the worker leaves the centre on a day. Operations gives up her seats from then on. */
export const recordWorkerLeaving = (
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; leftDate: string; reason: string },
) => recordLeaving(ex, ctx, "WORKER", input);

/**
 * A worker who left, or was refused, comes back: a candidate again on her own
 * file and number. Her own sanction counts here, and the manager answers it.
 */
export const readmitWorker = (ex: Executor, ctx: ServiceContext, input: { id: string } & SanctionPassage) =>
  readmit(ex, ctx, "WORKER", input);

// What the screens import.
export const registerWorkerAction = action(registerWorker, { revalidate: REGISTRATION_REFRESHES });
export const updateWorkerAction = action(updateWorker, {
  revalidate: (_data, input) => [WORKERS_PATH, `${WORKERS_PATH}/${input.id}`, PLACES_PATH],
});
export const recordWorkerLeavingAction = action(recordWorkerLeaving, { revalidate: [WORKERS_PATH] });
export const readmitWorkerAction = action(readmitWorker, { revalidate: [WORKERS_PATH] });
