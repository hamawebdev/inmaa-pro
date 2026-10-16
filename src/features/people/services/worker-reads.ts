import type { WorkerFormData } from "@/features/people/forms/worker-form-data";
import { printDataFromValues, valuesFromRecord } from "@/features/people/forms/worker-values";
import { documentState, type DocumentState } from "@/features/people/rules/documents";
import { daysBetween } from "@/features/people/rules/dates";
import {
  HEALTH_CONDITIONS,
  HIRING_CRITERIA,
  STAFF_DOCUMENT_TYPES,
  type EngagementStatus,
  type HiringDecision,
  type Sex,
  type StaffDocumentType,
  type WorkerRole,
} from "@/features/people/validators/staff-codes";
import type { WorkerFormValues } from "@/features/people/validators/worker";
import { requireCapability, requireSection } from "@/lib/access/session";
import { listUploads } from "@/lib/attachments";
import { logConsult, logDisclose } from "@/lib/log";
import { readRestricted } from "@/lib/restricted";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";

import { getSanctionStates, listSanctions, type SanctionRow, type SanctionStateOf } from "./sanctions";
import { staffName } from "@/lib/text/names";

/**
 * Reading cleaning workers: the list (not logged, as lists are not), one
 * worker's file (logged as a consultation, DESIGN section 9), her restricted
 * answers on demand (each read logged by `readRestricted`), and her form filled
 * for printing (a disclosure, with the reason typed).
 */

export interface WorkerListRow {
  id: string;
  number: string;
  numberSeq: number;
  lastName: string;
  firstName: string;
  fullNameLatin: string | null;
  sex: Sex;
  phone: string;
  role: WorkerRole | null;
  status: EngagementStatus;
  registrationDate: string;
  zoneId: string | null;
  zoneName: string | null;
  communeName: string | null;
  photoUrl: string | null;
  sanction: SanctionStateOf | null;
  /** Documents handed in that have expired, or expire within the lead time. */
  documentsToRenew: number;
}

export async function listWorkers(ex: Executor, ctx: ServiceContext): Promise<WorkerListRow[]> {
  requireSection(ctx, "WORKERS", "READ");
  const rows = await ex
    .selectFrom("StaffMember as w")
    .leftJoin("Zone as z", "z.id", "w.zoneId")
    .leftJoin("Commune as c", "c.id", "w.residenceCommuneId")
    .select([
      "w.id",
      "w.number",
      "w.numberSeq",
      "w.lastName",
      "w.firstName",
      "w.fullNameLatin",
      "w.sex",
      "w.phone",
      "w.role",
      "w.engagementStatus",
      "w.registrationDate",
      "w.zoneId",
      "w.photoUrl",
      "z.name as zoneName",
      "c.nameAr as communeName",
    ])
    .where("w.kind", "=", "WORKER")
    .where("w.deletedAt", "is", null)
    .orderBy("w.numberSeq", "desc")
    .execute();
  const ids = rows.map((row) => row.id);
  const [states, leadDays, documents] = await Promise.all([
    getSanctionStates(ex, ctx, { kind: "WORKER", ids }),
    getSetting(ex, "alerts.documentExpiryLeadDays"),
    ids.length
      ? ex
          .selectFrom("StaffDocument")
          .select(["staffId", "type", "delivered", "expiryDate"])
          .where("isCurrent", "=", 1)
          .where("deletedAt", "is", null)
          .where("delivered", "=", 1)
          .where("expiryDate", "is not", null)
          .execute()
      : Promise.resolve([]),
  ]);
  const toRenew = new Map<string, number>();
  for (const document of documents) {
    const state = documentState(
      { type: document.type as StaffDocumentType, delivered: true, expiryDate: document.expiryDate },
      ctx.today,
      leadDays,
    );
    if (state === "EXPIRED" || state === "EXPIRING") {
      toRenew.set(document.staffId, (toRenew.get(document.staffId) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    numberSeq: row.numberSeq,
    lastName: row.lastName,
    firstName: row.firstName,
    fullNameLatin: row.fullNameLatin,
    sex: row.sex as Sex,
    phone: row.phone,
    role: row.role as WorkerRole | null,
    status: row.engagementStatus as EngagementStatus,
    registrationDate: row.registrationDate,
    zoneId: row.zoneId,
    zoneName: row.zoneName,
    communeName: row.communeName,
    photoUrl: row.photoUrl,
    sanction: states[row.id] ?? null,
    documentsToRenew: toRenew.get(row.id) ?? 0,
  }));
}

export interface WorkerDocumentLine {
  type: StaffDocumentType;
  delivered: boolean;
  deliveredDate: string | null;
  expiryDate: string | null;
  state: DocumentState;
  daysLeft: number | null;
  isRestricted: boolean;
  /** The scan of the document: restricted, opened only through `openRestrictedUpload`. */
  fileUrl: string | null;
}

export interface WorkerFile {
  id: string;
  number: string;
  numberSeq: number;
  status: EngagementStatus;
  registrationDate: string;
  leftDate: string | null;
  leftReason: string | null;
  /** The screen's values, without the health answers and the score. */
  values: WorkerFormValues;
  zone: { id: string; name: string } | null;
  commune: { id: string; nameAr: string; nameFr: string | null; wilayaCode: string } | null;
  photoUrl: string | null;
  /** The scan of the signed pages 1 and 2: restricted, opened only through `openRestrictedUpload`. */
  signedScan: { url: string; originalName: string | null; createdAt: string } | null;
  documents: WorkerDocumentLine[];
  decisions: Array<{
    decision: HiringDecision;
    decisionDate: string;
    trialEndDate: string | null;
    decidedBy: string | null;
  }>;
  history: Array<{ date: string; fromStatus: string | null; toStatus: string; reason: string | null }>;
  sanction: SanctionStateOf | null;
  sanctions: SanctionRow[];
}

/** One worker's file. Opening it is a consultation of her personal data, and is logged. */
export async function openWorkerFile(ex: Executor, ctx: ServiceContext, input: { id: string }): Promise<WorkerFile> {
  requireSection(ctx, "WORKERS", "READ");
  const worker = await ex
    .selectFrom("StaffMember")
    .selectAll()
    .where("id", "=", input.id)
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!worker) throw new ServiceError("This worker does not exist.");

  const [zone, commune, documents, decisions, history, states, sanctions, scans, leadDays] = await Promise.all([
    worker.zoneId
      ? ex.selectFrom("Zone").select(["id", "name"]).where("id", "=", worker.zoneId).executeTakeFirst()
      : Promise.resolve(undefined),
    worker.residenceCommuneId
      ? ex
          .selectFrom("Commune")
          .select(["id", "nameAr", "nameFr", "wilayaCode"])
          .where("id", "=", worker.residenceCommuneId)
          .executeTakeFirst()
      : Promise.resolve(undefined),
    ex
      .selectFrom("StaffDocument")
      .select(["type", "delivered", "deliveredDate", "expiryDate", "isRestricted", "fileUrl"])
      .where("staffId", "=", worker.id)
      .where("isCurrent", "=", 1)
      .where("deletedAt", "is", null)
      .execute(),
    ex
      .selectFrom("HiringDecision as d")
      .leftJoin("User as u", "u.id", "d.decidedByUserId")
      .select(["d.decision", "d.decisionDate", "d.trialEndDate", "u.displayName as decidedBy"])
      .where("d.staffId", "=", worker.id)
      .orderBy("d.decisionDate", "desc")
      .orderBy("d.createdAt", "desc")
      .execute(),
    ex
      .selectFrom("StaffEvent")
      .select(["date", "fromStatus", "toStatus", "reason"])
      .where("staffId", "=", worker.id)
      .where("kind", "=", "STATUS")
      .orderBy("date", "desc")
      .orderBy("createdAt", "desc")
      .execute(),
    getSanctionStates(ex, ctx, { kind: "WORKER", ids: [worker.id] }),
    listSanctions(ex, ctx, { subjectKind: "WORKER", subjectId: worker.id }),
    listUploads(ex, { entity: "StaffConfidential", ownerId: worker.id, field: "signedFormScanUrl" }),
    getSetting(ex, "alerts.documentExpiryLeadDays"),
  ]);

  const subject = { kind: "WORKER" as const, id: worker.id, label: staffName(worker) };
  await logConsult(ex, ctx, {
    owner: "PEOPLE",
    action: "VIEW",
    entity: "StaffMember",
    entityId: worker.id,
    entityLabel: `${worker.number} ${subject.label}`,
    subject,
  });

  const scan = scans.at(-1);
  return {
    id: worker.id,
    number: worker.number,
    numberSeq: worker.numberSeq,
    status: worker.engagementStatus as EngagementStatus,
    registrationDate: worker.registrationDate,
    leftDate: worker.leftDate,
    leftReason: worker.leftReason,
    values: valuesFromRecord(worker, documents, decisions[0]?.decision ?? null, commune),
    zone: zone ?? null,
    commune: commune ?? null,
    photoUrl: worker.photoUrl,
    signedScan: scan ? { url: scan.url, originalName: scan.originalName, createdAt: scan.createdAt } : null,
    documents: STAFF_DOCUMENT_TYPES.map((type) => {
      const held = documents.find((document) => document.type === type);
      const line = {
        type,
        delivered: held?.delivered === 1,
        expiryDate: held?.expiryDate ?? null,
      };
      return {
        ...line,
        deliveredDate: held?.deliveredDate ?? null,
        state: documentState(line, ctx.today, leadDays),
        daysLeft: line.delivered && line.expiryDate ? daysBetween(ctx.today, line.expiryDate) : null,
        isRestricted: held?.isRestricted === 1,
        fileUrl: held?.fileUrl ?? null,
      };
    }),
    decisions: decisions.map((decision) => ({
      decision: decision.decision as HiringDecision,
      decisionDate: decision.decisionDate,
      trialEndDate: decision.trialEndDate,
      decidedBy: decision.decidedBy,
    })),
    history: history.map((event) => ({ ...event, toStatus: event.toStatus ?? "" })),
    sanction: states[worker.id] ?? null,
    sanctions,
  };
}

export type RestrictedPart = "HEALTH" | "SCORE";

export interface RestrictedValues {
  health?: Pick<WorkerFormValues, "healthConditions" | "healthOtherText">;
  score?: Pick<WorkerFormValues, "hiringScores" | "hiringTotal"> & { evaluatedDate: string | null };
}

const parseCodes = <T extends string>(text: string | null, allowed: readonly T[]): T[] => {
  try {
    const parsed: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? allowed.filter((code) => parsed.includes(code)) : [];
  } catch {
    return [];
  }
};

/** Her health answers or her score, for the screen, when someone allowed asks. Each read is logged. */
export async function readWorkerRestricted(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; part: RestrictedPart; reason?: string },
): Promise<RestrictedValues> {
  requireSection(ctx, "WORKERS", "READ");
  if (input.part === "HEALTH") {
    const row = await readRestricted(ex, ctx, {
      capability: "staff.health.read",
      entity: "StaffConfidential",
      id: input.id,
      reason: input.reason,
    });
    if (!row) throw new ServiceError("This worker does not exist.");
    return {
      health: { healthConditions: parseCodes(row.conditions, HEALTH_CONDITIONS), healthOtherText: row.otherText ?? "" },
    };
  }
  const row = await readRestricted(ex, ctx, {
    capability: "staff.hiringScore.read",
    entity: "StaffConfidential",
    id: input.id,
    reason: input.reason,
  });
  if (!row) throw new ServiceError("This worker does not exist.");
  const hiringScores = Object.fromEntries(
    HIRING_CRITERIA.map((criterion) => [criterion, row[criterion] === null ? "" : String(row[criterion])]),
  ) as WorkerFormValues["hiringScores"];
  const scored = HIRING_CRITERIA.some((criterion) => row[criterion] !== null);
  return {
    score: {
      hiringScores,
      // A total typed alone shows in its box; one computed from the scores is computed again by the screen.
      hiringTotal: !scored && row.total !== null ? String(row.total) : "",
      evaluatedDate: row.evaluatedDate,
    },
  };
}

/**
 * Her worker form, filled, for printing: everything on it, her health answers
 * and her score included. Printing a filled worker form is a disclosure whose
 * reason the user types (DESIGN section 9).
 */
export async function workerFormForPrint(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; reason: string },
): Promise<{ data: WorkerFormData; name: string; number: string }> {
  requireSection(ctx, "WORKERS", "READ");
  requireCapability(ctx, "staff.printFilledForm");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write why the filled form is printed.");
  const worker = await ex
    .selectFrom("StaffMember")
    .selectAll()
    .where("id", "=", input.id)
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!worker) throw new ServiceError("This worker does not exist.");

  const [documents, decision, commune] = await Promise.all([
    ex
      .selectFrom("StaffDocument")
      .select(["type", "delivered", "expiryDate"])
      .where("staffId", "=", worker.id)
      .where("isCurrent", "=", 1)
      .where("deletedAt", "is", null)
      .execute(),
    ex
      .selectFrom("HiringDecision")
      .select("decision")
      .where("staffId", "=", worker.id)
      .orderBy("decisionDate", "desc")
      .orderBy("createdAt", "desc")
      .executeTakeFirst(),
    worker.residenceCommuneId
      ? ex
          .selectFrom("Commune")
          .select(["nameAr", "wilayaCode"])
          .where("id", "=", worker.residenceCommuneId)
          .executeTakeFirst()
      : Promise.resolve(undefined),
  ]);
  const health = await readWorkerRestricted(ex, ctx, { id: worker.id, part: "HEALTH", reason });
  const score = await readWorkerRestricted(ex, ctx, { id: worker.id, part: "SCORE", reason });
  const values: WorkerFormValues = {
    ...valuesFromRecord(worker, documents, decision?.decision ?? null, commune),
    ...health.health,
    hiringScores: score.score?.hiringScores ?? valuesFromRecord(worker, [], null).hiringScores,
    hiringTotal: score.score?.hiringTotal ?? "",
  };

  const name = staffName(worker);
  await logDisclose(ex, ctx, {
    owner: "PEOPLE",
    action: "PRINT",
    reason,
    entity: "StaffMember",
    entityId: worker.id,
    entityLabel: `${worker.number} ${name}`,
    subject: { kind: "WORKER", id: worker.id, label: name },
    disclosure: "PRINT",
    context: { sheet: "WORKER_FORM" },
  });
  return {
    data: printDataFromValues(values, {
      regNumber: String(worker.numberSeq),
      commune: () => (commune ? { nameAr: commune.nameAr, wilayaCode: commune.wilayaCode } : undefined),
    }),
    name,
    number: worker.number,
  };
}

// What the screens import. Opening a file and reading restricted answers write a log line: they are actions,
// and they refresh nothing (they are what the screens read).
export const listWorkersQuery = query((ex: Executor, ctx: ServiceContext) => listWorkers(ex, ctx));
export const openWorkerFileAction = action(openWorkerFile);
export const readWorkerRestrictedAction = action(readWorkerRestricted);
export const workerFormForPrintAction = action(workerFormForPrint);
