import { requireSection } from "@/lib/access/session";
import { addDays } from "@/lib/clock";
import { emit } from "@/lib/events";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, type LocalDate } from "@/lib/units";
import { FILES_PATH } from "@/navigation/file-parts";

import type { FormValues } from "../forms/values";
import type { EndKind } from "../validators/option-lists";
import { isDate, type FileOfficeInput } from "../validators/file-values";

import { clientSubjectOf, partHeaderOf, requireFileRecord, type FilePartHeader } from "./file-part";
import { liveSheetValuesOf, type FileRecord } from "./file-records";
import { siteOfficeOf } from "./file-reads";
import { moveFileStage, registerFile } from "./files";

/**
 * «العقد وتجديده» (plan feature 6): a contract's life after its signature. His
 * contract sheet is «الاستمارة»; this part renews it (a new file, signed in
 * turn), ends it before its date, and keeps the clauses printed as its annex.
 */

export const EARLY_END_KINDS = [
  "ENDED_BY_CLIENT",
  "ENDED_BY_CENTRE",
  "NON_PAYMENT",
  "CANCELLED",
] as const satisfies readonly EndKind[];
export type EarlyEndKind = (typeof EARLY_END_KINDS)[number];

export interface Clause {
  title: string;
  body: string;
}

export interface ContractPart {
  file: FilePartHeader;
  locked: boolean;
  startDate: string | null;
  endDate: string | null;
  contractedAt: string | null;
  endedDate: string | null;
  endKind: EndKind | null;
  endNote: string | null;
  renewalDecision: string | null;
  /** The contract this file renews. */
  renewalOf: { id: string; number: string } | null;
  /** The file that renews this one. */
  renewedBy: { id: string; number: string; stage: string } | null;
  clauses: Clause[];
  canRenew: boolean;
  canEnd: boolean;
  /** The contract has not started yet: the client may cancel it (kind CANCELLED). */
  notStarted: boolean;
  /** «لن يُجدَّد» can be recorded: a signed contract with no renewal under way and no decision yet. */
  canRefuseRenewal: boolean;
  renewalNote: string | null;
  clientPhone: string | null;
}

function clausesOf(text: string | null): Clause[] {
  if (!text) return [];
  return (JSON.parse(text) as Partial<Clause>[]).map((clause) => ({
    title: clause.title ?? "",
    body: clause.body ?? "",
  }));
}

async function successorOf(ex: Executor, fileId: string) {
  return (
    ex
      .selectFrom("File")
      .select(["id", "number", "stage"])
      .where("renewalOfFileId", "=", fileId)
      .where("deletedAt", "is", null)
      // A renewal that was closed (refused, never signed) does not stand in the way of another (CLI-7, INT-9).
      .where("closedAt", "is", null)
      .executeTakeFirst()
  );
}

/** A contract that is signed and running, or one that ran out on its date, may be renewed once. */
function renewable(record: FileRecord): boolean {
  const { file } = record;
  if (file.serviceType !== "CONTRACT") return false;
  if (file.stage === "CONTRACTED") return file.closedAt === null;
  return file.stage === "CONTRACT_ENDED" && file.endKind === "EXPIRED";
}

export async function getContractPart(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<ContractPart> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireFileRecord(ex, input.fileId);
  const { file } = record;
  const [renewalOf, renewedBy] = await Promise.all([
    file.renewalOfFileId
      ? ex.selectFrom("File").select(["id", "number"]).where("id", "=", file.renewalOfFileId).executeTakeFirst()
      : undefined,
    successorOf(ex, file.id),
  ]);
  return {
    file: partHeaderOf(record),
    locked: file.lockedAt !== null,
    startDate: file.startDate,
    endDate: file.endDate,
    contractedAt: file.contractedAt,
    endedDate: file.endedDate,
    endKind: file.endKind as EndKind | null,
    endNote: file.endNote,
    renewalDecision: file.renewalDecision,
    renewalNote: file.renewalNote,
    clientPhone: record.client.phone1,
    renewalOf: renewalOf ?? null,
    renewedBy: renewedBy ?? null,
    clauses: clausesOf(file.clauses),
    canRenew: renewable(record) && renewedBy === undefined,
    canEnd: file.stage === "CONTRACTED" && file.closedAt === null,
    notStarted: file.stage === "CONTRACTED" && file.startDate !== null && ctx.today <= file.startDate,
    canRefuseRenewal: renewable(record) && renewedBy === undefined && file.renewalDecision !== "WILL_NOT_RENEW",
  };
}

/**
 * Renews a contract (CONTRACTS.md section 3): a new file of the same form, for
 * the same client and site, filled from this one, its dates following on from
 * it, at «جديد». It ends nothing: this contract runs to its end date, where the
 * day-start job ends it as RENEWED once the new one is «متعاقد». Operations
 * copies the set-up on `file.renewed`.
 */
export async function renewFile(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; notTheSamePerson?: boolean; decisionId?: string | null },
): Promise<{ fileId: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const record = await requireFileRecord(ex, input.fileId);
  const { file } = record;
  if (!renewable(record)) throw new ServiceError("Only a signed contract, running or ended on its date, is renewed.");
  if (await successorOf(ex, file.id)) throw new ServiceError("This contract is already being renewed.");
  // A closed renewal keeps its link in the log, and gives its place to this one (CLI-7, INT-9): the
  // database allows one renewal per contract.
  const closedRenewals = await ex
    .selectFrom("File")
    .select(["id", "number"])
    .where("renewalOfFileId", "=", file.id)
    .where("closedAt", "is not", null)
    .execute();
  for (const closed of closedRenewals) {
    await ex
      .updateTable("File")
      .set({ renewalOfFileId: null, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", closed.id)
      .execute();
    await logChange(ex, ctx, {
      owner: "CLIENTS",
      action: "UPDATE",
      entity: "File",
      entityId: closed.id,
      entityLabel: closed.number,
      subject: clientSubjectOf(record),
      changes: { renewalOfFileId: [file.id, null] },
      context: { replacedByANewRenewalOf: file.number },
    });
  }

  const previous = liveSheetValuesOf(record);
  const start = file.endDate ? addDays(localDate(file.endDate), 1) : null;
  const values: FormValues = {
    ...previous,
    registrationDate: ctx.today,
    startDate: start && start > ctx.today ? start : ctx.today,
    endDate: undefined,
    firstDueDate: undefined,
    issuedDate: undefined,
    firstVisitDate: undefined,
  };
  delete values.dossierNumber;
  delete values.registrationNumber;
  delete values.statusTicks;
  const renewed = await registerFile(ex, ctx, {
    kind: record.kind,
    values,
    office: {
      source: file.source,
      priority: file.priority,
      officeNotes: file.officeNotes,
      amountBasis: file.amountBasis,
      expensesIncluded: file.expensesIncluded === 1,
    } as FileOfficeInput,
    siteOffice: siteOfficeOf(record.site),
    returning: { clientId: record.client.id, siteId: record.site.id, copiedFromFileId: file.id },
    notTheSamePerson: input.notTheSamePerson,
    decisionId: input.decisionId,
  });

  await ex
    .updateTable("File")
    .set({ renewalOfFileId: file.id, clauses: file.clauses, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", renewed.fileId)
    .execute();
  const { set, changes } = changedColumns(file, { renewalDecision: "WILL_RENEW" });
  if (changes) {
    await ex
      .updateTable("File")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", file.id)
      .execute();
    await logChange(ex, ctx, {
      owner: "CLIENTS",
      action: "UPDATE",
      entity: "File",
      entityId: file.id,
      entityLabel: file.number,
      subject: clientSubjectOf(record),
      changes,
      context: { renewedBy: renewed.number },
    });
  }
  await emit(ex, ctx, "file.renewed", { fromFileId: file.id, toFileId: renewed.fileId });
  return { fileId: renewed.fileId, number: renewed.number };
}

/**
 * Ends a signed contract before its date (CONTRACTS.md: `endContract`): the
 * kind of ending, the day it ended, and why. Operations cancels the visits
 * after that day and Money settles what is due (`file.ended`).
 */
export async function endContract(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; endKind: EarlyEndKind; endedDate: string; note: string },
): Promise<{ fileId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(EARLY_END_KINDS as readonly string[]).includes(input.endKind)) {
    throw new Error(`clients: not an early ending ${input.endKind}`);
  }
  if (!isDate(input.endedDate)) throw new ServiceError("Enter a valid date.");
  const note = input.note.trim();
  if (!note) throw new ServiceError("A reason is required.");
  const record = await requireFileRecord(ex, input.fileId);
  const { file } = record;
  if (file.stage !== "CONTRACTED" || file.closedAt !== null) {
    throw new ServiceError("Only a signed contract that is running can be ended.");
  }
  if (input.endKind === "CANCELLED") {
    // Given up before it starts (ruling on CLI-3): it ends the day before its start, so that its first visit and
    // its first due go with everything after them.
    if (!file.startDate || ctx.today > file.startDate) {
      throw new ServiceError("Only a contract that has not started yet is cancelled.");
    }
    await moveFileStage(ex, ctx, {
      fileId: file.id,
      to: "CONTRACT_ENDED",
      endKind: "CANCELLED",
      endedDate: addDays(localDate(file.startDate), -1),
      note,
    });
    return { fileId: file.id };
  }
  if (input.endedDate > ctx.today) throw new ServiceError("A contract is ended on the day it ends, not before.");
  if (file.startDate && input.endedDate < file.startDate) {
    throw new ServiceError("A contract cannot end before it starts.");
  }
  await moveFileStage(ex, ctx, {
    fileId: file.id,
    to: "CONTRACT_ENDED",
    endKind: input.endKind,
    endedDate: input.endedDate as LocalDate,
    note,
  });
  return { fileId: file.id };
}

/**
 * «لن يُجدَّد» (ruling on CLI-5): the client will not renew. The contract runs
 * to its date and ends EXPIRED; Money's tile «عقد يقترب من نهايته» leaves it.
 * The reason typed is kept on the file and in the log.
 */
export async function recordNoRenewal(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; reason: string },
): Promise<{ fileId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const record = await requireFileRecord(ex, input.fileId);
  const { file } = record;
  if (!renewable(record)) throw new ServiceError("Only a signed contract, running or ended on its date, is renewed.");
  if (await successorOf(ex, file.id)) throw new ServiceError("This contract is already being renewed.");
  const { set, changes } = changedColumns(file, { renewalDecision: "WILL_NOT_RENEW", renewalNote: reason });
  if (!changes) return { fileId: file.id };
  await ex
    .updateTable("File")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", file.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "UPDATE",
    reason,
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    subject: clientSubjectOf(record),
    changes,
  });
  return { fileId: file.id };
}

/** The clauses printed as the contract's annex: typed until the file is signed. */
export async function saveFileClauses(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; clauses: readonly Clause[] },
): Promise<{ fileId: string; changed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const record = await requireFileRecord(ex, input.fileId);
  const { file } = record;
  if (file.closedAt !== null) throw new ServiceError("This file is closed and can no longer be changed.");
  if (file.lockedAt !== null) throw new ServiceError("A signed contract keeps the clauses it was signed with.");
  const clauses = input.clauses
    .map((clause) => ({ title: clause.title.trim(), body: clause.body.trim() }))
    .filter((clause) => clause.title !== "" || clause.body !== "");
  if (clauses.some((clause) => clause.body === "")) throw new ServiceError("Every clause needs its text.");
  const { set, changes } = changedColumns(file, { clauses: clauses.length ? JSON.stringify(clauses) : null });
  if (!changes) return { fileId: file.id, changed: false };
  await ex
    .updateTable("File")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", file.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "UPDATE",
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    subject: clientSubjectOf(record),
    context: { clauses: clauses.length },
  });
  return { fileId: file.id, changed: true };
}

/** How many residents the site's list holds: a number, no names, for who may not read them. */
export async function countResidents(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<number> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireFileRecord(ex, input.fileId);
  const row = await ex
    .selectFrom("Resident")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("siteId", "=", record.site.id)
    .where("deletedAt", "is", null)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

const REFRESH = { revalidate: [FILES_PATH, "/dashboard/home", "/dashboard/clients"] };

export const getContractPartQuery = query(getContractPart);
export const countResidentsQuery = query(countResidents);
export const renewFileAction = action(renewFile, REFRESH);
export const endContractAction = action(endContract, REFRESH);
export const recordNoRenewalAction = action(recordNoRenewal, {
  revalidate: [...REFRESH.revalidate, "/dashboard/payments"],
});
export const saveFileClausesAction = action(saveFileClauses, REFRESH);
