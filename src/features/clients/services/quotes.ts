import type { Selectable } from "kysely";

import { can, requireCapability, requireSection, sectionLevel } from "@/lib/access/session";
import { addDays } from "@/lib/clock";
import { newId } from "@/lib/db/rows";
import type { DB } from "@/lib/db/schema";
import { logChange, logCollect, logConsultOnce, logDisclose } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting, getSettings } from "@/lib/settings";
import { basisPoints, money, qty, type LocalDate } from "@/lib/units";
import { FILES_PATH } from "@/navigation/file-parts";

import { fileAmountOf, marginOver, periodPriceOf, QUOTE_STEPS, quoteLineAmount, quoteTotals } from "../rules/pricing";
import { stageMove } from "../rules/stage-moves";
import type { AmountBasis, ServiceType } from "../validators/option-lists";
import {
  followUpSchema,
  quoteResultSchema,
  quoteSchema,
  type QuoteInput,
  type QuoteLineKind,
  type QuoteResult,
  type QuoteStatus,
} from "../validators/pricing";

import { quotesToFollowUp } from "./alerts";
import { clientSubjectOf, partHeaderOf, requireFileRecord, requireOpenFile, type FilePartHeader } from "./file-part";
import { sheetValuesOf, type FileRecord } from "./file-records";
import { closeFile, moveFileStage, STAGE_REFUSALS, stageFactsOf } from "./files";

/**
 * «عرض السعر» (plan features 5 and 29): the quote of a file, from its draft to
 * the client's answer.
 *
 *     DRAFT → AWAITING_APPROVAL → APPROVED → ISSUED        (the manager may send it back: NEEDS_REVIEW)
 *
 * The manager approves every quote (scope A9, setting `quote.approvalRule`),
 * signed in himself. Issuing freezes the tax terms and moves the file to «عرض
 * سعر». A new version keeps the number and replaces the issued one when it is
 * issued in turn. The client's answer is kept on the quote: his yes gives the
 * file the quote's amount and basis and lets it become «متعاقد»; his no may
 * close the file.
 */

type QuoteRow = Selectable<DB["Quote"]>;

export interface QuoteLineView {
  kind: QuoteLineKind;
  label: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  amount: number;
}

export interface QuoteFollowUpView {
  id: string;
  date: string;
  note: string | null;
  nextFollowUpDate: string | null;
}

export type QuoteStep = "EDIT" | "SUBMIT" | "DECIDE" | "ISSUE" | "CANCEL" | "ANSWER" | "REVISE";

export interface QuoteView {
  id: string;
  number: string;
  version: number;
  status: QuoteStatus;
  result: QuoteResult;
  /** The quote as its form edits it. */
  terms: QuoteInput;
  lines: QuoteLineView[];
  subtotal: number;
  discount: number;
  total: number;
  approvedByName: string | null;
  approvalNote: string | null;
  issuedDate: string | null;
  taxMode: "VAT" | "IFU" | null;
  vatRate: number | null;
  pricesIncludeVat: boolean | null;
  resultDate: string | null;
  resultNote: string | null;
  postponedUntil: string | null;
  followUps: QuoteFollowUpView[];
  /** What this reader may do to it now. */
  steps: QuoteStep[];
  /** Behind `cost.read`: null for anybody else. */
  costTotal: number | null;
  marginBp: number | null;
}

export interface FileQuotesView {
  file: FilePartHeader;
  /** Every version, the newest first. */
  quotes: QuoteView[];
  /** What a new quote starts from: the form's own answers, and the study's price for who may read it. */
  suggested: QuoteInput;
  /** Whether a first quote, or a new version, can be started now. */
  canStart: boolean;
  /** Whether the client's yes can take the file to «متعاقد» at once; if not, why. */
  contract: { allowed: boolean; refusal: string | null };
}

const WORKING: readonly QuoteStatus[] = ["DRAFT", "NEEDS_REVIEW", "AWAITING_APPROVAL", "APPROVED"];
/** Every screen of a file keeps its queries under the list's path; the follow-up tile is on the home screen. */
const QUOTES_REFRESH = [FILES_PATH, "/dashboard/home"];

function parsed<T>(
  result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
): T {
  if (!result.success) throw new ServiceError(result.error.issues[0]?.message ?? "Invalid form submission.");
  return result.data;
}

/** Nothing more is done to a version of a file whose client accepted another (CLI-4). */
async function refuseIfAccepted(ex: Executor, quote: QuoteRow): Promise<void> {
  const accepted = await ex
    .selectFrom("Quote")
    .select("id")
    .where("fileId", "=", quote.fileId)
    .where("id", "<>", quote.id)
    .where("result", "=", "ACCEPTED")
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (accepted) throw new ServiceError("This file's quote is already accepted.");
}

async function requireQuote(ex: Executor, quoteId: string): Promise<{ quote: QuoteRow; record: FileRecord }> {
  const quote = await ex.selectFrom("Quote").selectAll().where("id", "=", quoteId).executeTakeFirst();
  if (!quote || quote.deletedAt !== null) throw new ServiceError("This quote does not exist.");
  return { quote, record: await requireFileRecord(ex, quote.fileId) };
}

const quoteLog = (record: FileRecord, quote: Pick<QuoteRow, "id" | "number" | "version">) =>
  ({
    owner: "CLIENTS",
    entity: "Quote",
    entityId: quote.id,
    entityLabel: quote.version > 1 ? `${quote.number} (${quote.version})` : quote.number,
    subject: clientSubjectOf(record),
  }) as const;

async function linesOf(ex: Executor, quoteIds: readonly string[]) {
  if (quoteIds.length === 0) return [];
  return ex.selectFrom("QuoteLine").selectAll().where("quoteId", "in", quoteIds).orderBy("sortOrder").execute();
}

function stepsOf(ctx: ServiceContext, quote: QuoteRow, others: readonly QuoteRow[]): QuoteStep[] {
  const status = quote.status as QuoteStatus;
  // Once the client has accepted a version, the others are dead (CLI-4).
  if (others.some((other) => other.result === "ACCEPTED")) return [];
  const steps: QuoteStep[] = QUOTE_STEPS[status].filter((step) => step !== "DECIDE" || can(ctx, "quote.approve"));
  if (status === "ISSUED") {
    steps.push("ANSWER");
    const working = others.some((other) => WORKING.includes(other.status as QuoteStatus));
    if (quote.result !== "ACCEPTED" && !working) steps.push("REVISE");
  }
  return steps;
}

/** The quotes of a file, and what a new one would start from. */
export async function getFileQuotes(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<FileQuotesView> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireFileRecord(ex, input.fileId);
  const { file } = record;
  const writes = sectionLevel(ctx, "REQUESTS") === "WRITE";
  const rows = await ex
    .selectFrom("Quote")
    .selectAll()
    .where("fileId", "=", file.id)
    .where("deletedAt", "is", null)
    .orderBy("version", "desc")
    .orderBy("createdAt", "desc")
    .execute();
  const ids = rows.map((row) => row.id);
  const [lines, followUps, approvers] = await Promise.all([
    linesOf(ex, ids),
    ids.length
      ? ex.selectFrom("QuoteFollowUp").selectAll().where("quoteId", "in", ids).orderBy("date", "desc").execute()
      : [],
    ex
      .selectFrom("User")
      .select(["id", "displayName"])
      .where(
        "id",
        "in",
        rows.map((row) => row.approvedByUserId ?? ""),
      )
      .execute(),
  ]);

  const quotes = rows.map((row): QuoteView => {
    const own = lines.filter((line) => line.quoteId === row.id);
    return {
      id: row.id,
      number: row.number,
      version: row.version,
      status: row.status as QuoteStatus,
      result: row.result as QuoteResult,
      terms: {
        date: row.date,
        validUntil: row.validUntil,
        includedText: row.includedText,
        excludedText: row.excludedText,
        materialsIncluded: row.materialsIncluded === null ? null : row.materialsIncluded === 1,
        equipmentIncluded: row.equipmentIncluded === null ? null : row.equipmentIncluded === 1,
        workers: row.workers,
        duration: row.duration,
        visits: row.visits,
        discount: row.discount,
        amountBasis: row.amountBasis as AmountBasis | null,
        lines: own.map((line) => ({
          kind: line.kind as QuoteLineKind,
          label: line.label,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
        })),
      },
      lines: own.map((line) => ({
        kind: line.kind as QuoteLineKind,
        label: line.label,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        amount: line.amount,
      })),
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      approvedByName: approvers.find((user) => user.id === row.approvedByUserId)?.displayName ?? null,
      approvalNote: row.approvalNote,
      issuedDate: row.issuedDate,
      taxMode: row.taxMode as "VAT" | "IFU" | null,
      vatRate: row.vatRate,
      pricesIncludeVat: row.pricesIncludeVat === null ? null : row.pricesIncludeVat === 1,
      resultDate: row.resultDate,
      resultNote: row.resultNote,
      postponedUntil: row.postponedUntil,
      followUps: followUps
        .filter((followUp) => followUp.quoteId === row.id)
        .map((followUp) => ({
          id: followUp.id,
          date: followUp.date,
          note: followUp.note,
          nextFollowUpDate: followUp.nextFollowUpDate,
        })),
      steps:
        writes && file.closedAt === null
          ? stepsOf(
              ctx,
              row,
              rows.filter((other) => other.id !== row.id),
            )
          : [],
      // Restricted: served, and logged, by `openQuoteCosts` (audit LOG-6).
      costTotal: null,
      marginBp: null,
    };
  });

  const facts = await stageFactsOf(ex, ctx, record);
  // The client's yes gives the file the issued quote's amount and basis before the move (CLI-9): judge with them.
  const live = rows.find((row) => row.status === "ISSUED");
  if (live) {
    const liveLines = lines.filter((line) => line.quoteId === live.id);
    const totals = quoteTotals(
      liveLines.map((line) => ({
        kind: line.kind as QuoteLineKind,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      live.discount,
    );
    facts.values = { ...facts.values, totalAmount: fileAmountOf(totals, file.serviceType as ServiceType) as never };
    facts.office = {
      ...facts.office,
      amountBasis:
        (live.amountBasis as AmountBasis | null) ??
        (file.amountBasis as AmountBasis | null) ??
        (file.serviceType === "ON_DEMAND" ? "WHOLE_CONTRACT" : null),
    };
  }
  const move =
    file.stage === "CONTRACTED" || file.stage === "CONTRACT_ENDED"
      ? { allowed: false as const, refusal: "SAME_STAGE" as const }
      : stageMove({ ...facts, stage: "QUOTE", quoteAccepted: true }, "CONTRACTED");
  const accepted = rows.some((row) => row.result === "ACCEPTED");
  const working = rows.some((row) => WORKING.includes(row.status as QuoteStatus));
  return {
    file: partHeaderOf(record),
    quotes,
    suggested: await suggestedQuote(ex, ctx, record),
    canStart: writes && file.closedAt === null && !accepted && !working && rows.every((row) => row.status !== "ISSUED"),
    contract: { allowed: move.allowed, refusal: move.allowed ? null : STAGE_REFUSALS[move.refusal] },
  };
}

/** A first quote starts from the form: its amount, its workers, who brings the materials. */
async function suggestedQuote(ex: Executor, ctx: ServiceContext, record: FileRecord): Promise<QuoteInput> {
  const { file } = record;
  const values = sheetValuesOf(record);
  const study = can(ctx, "cost.read")
    ? await ex
        .selectFrom("CostStudy")
        .select(["finalPrice", "pricePerVisit", "pricePerWeek", "pricePerMonth"])
        .where("fileId", "=", file.id)
        .executeTakeFirst()
    : undefined;
  const contract = file.serviceType === "CONTRACT";
  const basis = (file.amountBasis as AmountBasis | null) ?? (contract ? null : "WHOLE_CONTRACT");
  // The study prices the whole contract; a per-period contract takes the price of one period (CLI-2).
  const studyPrice =
    study === undefined
      ? null
      : basis === "PER_PAYMENT_PERIOD"
        ? periodPriceOf(study, file.paymentFrequency)
        : study.finalPrice;
  const price = studyPrice ?? file.totalAmount ?? 0;
  const validity = await getSetting(ex, "quote.validityDays");
  return {
    date: ctx.today,
    validUntil: addDays(ctx.today, validity),
    includedText: null,
    excludedText: null,
    materialsIncluded: file.materialsBearer === null ? null : file.materialsBearer === "CENTRE",
    equipmentIncluded: null,
    workers: file.workersCount,
    duration: null,
    visits: typeof values.visitsPerWeek === "number" ? String(values.visitsPerWeek) : null,
    discount: 0,
    amountBasis: basis,
    lines: [
      {
        kind: contract ? "PERIODIC" : "INITIAL_JOB",
        label: "",
        description: null,
        quantity: 1000,
        unit: null,
        unitPrice: price,
      },
    ],
  };
}

function columnsOf(terms: QuoteInput) {
  const totals = quoteTotals(terms.lines, terms.discount);
  return {
    totals,
    columns: {
      date: terms.date as LocalDate,
      validUntil: terms.validUntil as LocalDate | null,
      includedText: terms.includedText,
      excludedText: terms.excludedText,
      materialsIncluded: terms.materialsIncluded === null ? null : terms.materialsIncluded ? 1 : 0,
      equipmentIncluded: terms.equipmentIncluded === null ? null : terms.equipmentIncluded ? 1 : 0,
      workers: terms.workers,
      duration: terms.duration,
      visits: terms.visits,
      subtotal: money(totals.subtotal),
      discount: money(totals.discount),
      total: money(totals.total),
      amountBasis: terms.amountBasis,
    },
  };
}

async function writeLines(ex: Executor, ctx: ServiceContext, quoteId: string, terms: QuoteInput): Promise<void> {
  await ex.deleteFrom("QuoteLine").where("quoteId", "=", quoteId).execute();
  await ex
    .insertInto("QuoteLine")
    .values(
      terms.lines.map((line, index) => ({
        id: newId(),
        quoteId,
        sortOrder: index + 1,
        kind: line.kind,
        label: line.label,
        description: line.description,
        quantity: qty(line.quantity),
        unit: line.unit,
        unitPrice: money(line.unitPrice),
        amount: money(quoteLineAmount(line)),
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })),
    )
    .execute();
}

/**
 * Saves a quote being prepared: a new one (numbered from the year's counter, or
 * as the next version of the file's own number), or the draft named.
 */
export async function saveQuote(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; quoteId?: string | null; quote: QuoteInput },
): Promise<{ quoteId: string; number: string; version: number }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const terms = parsed(quoteSchema.safeParse(input.quote));
  if (terms.validUntil !== null && terms.validUntil < terms.date) {
    throw new ServiceError("A quote cannot stop being valid before its date.");
  }
  const { totals, columns } = columnsOf(terms);
  if (totals.discount < terms.discount) throw new ServiceError("The discount cannot be more than the quote.");

  if (input.quoteId) {
    const { quote, record } = await requireQuote(ex, input.quoteId);
    requireOpenFile(record);
    if (!QUOTE_STEPS[quote.status as QuoteStatus].includes("EDIT")) {
      throw new ServiceError("Only a quote being prepared can be changed.");
    }
    const { set, changes } = changedColumns(quote, columns);
    const before = (await linesOf(ex, [quote.id])).map((line) => [
      line.kind,
      line.label,
      line.description,
      line.quantity,
      line.unit,
      line.unitPrice,
    ]);
    const after = terms.lines.map((line) => [
      line.kind,
      line.label,
      line.description,
      line.quantity,
      line.unit,
      line.unitPrice,
    ]);
    const linesChanged = JSON.stringify(before) !== JSON.stringify(after);
    if (changes || linesChanged) {
      await ex
        .updateTable("Quote")
        .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", quote.id)
        .execute();
      if (linesChanged) await writeLines(ex, ctx, quote.id, terms);
      await logChange(ex, ctx, {
        ...quoteLog(record, quote),
        action: "UPDATE",
        changes: changes ?? undefined,
        context: linesChanged ? { lines: terms.lines.length } : undefined,
      });
    }
    return { quoteId: quote.id, number: quote.number, version: quote.version };
  }

  const record = await requireFileRecord(ex, input.fileId);
  requireOpenFile(record);
  const earlier = await ex
    .selectFrom("Quote")
    .selectAll()
    .where("fileId", "=", record.file.id)
    .where("deletedAt", "is", null)
    .orderBy("version", "desc")
    .execute();
  if (earlier.some((quote) => quote.result === "ACCEPTED")) {
    throw new ServiceError("This file's quote is already accepted.");
  }
  if (earlier.some((quote) => WORKING.includes(quote.status as QuoteStatus))) {
    throw new ServiceError("This file already has a quote being prepared.");
  }
  // A new version keeps the number of the file's quote (DESIGN.md section 6).
  const numbered = earlier.find((quote) => quote.status !== "CANCELLED") ?? null;
  const number = numbered
    ? { seq: numbered.numberSeq, year: numbered.numberYear, display: numbered.number }
    : await nextNumber(ex, ctx, "QUOTE", { date: terms.date as LocalDate });
  const version = numbered ? Math.max(...earlier.map((quote) => quote.version)) + 1 : 1;
  const id = newId();
  await ex
    .insertInto("Quote")
    .values({
      id,
      fileId: record.file.id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      version,
      ...columns,
      status: "DRAFT",
      result: "PENDING",
      preparedByUserId: ctx.userId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await writeLines(ex, ctx, id, terms);
  await logCollect(ex, ctx, {
    ...quoteLog(record, { id, number: number.display, version }),
    action: "CREATE",
    context: { fileId: record.file.id },
  });
  return { quoteId: id, number: number.display, version };
}

async function setStatus(
  ex: Executor,
  ctx: ServiceContext,
  quote: QuoteRow,
  record: FileRecord,
  status: QuoteStatus,
  more: Partial<Selectable<DB["Quote"]>> = {},
  log: { action: "STATUS_CHANGE" | "APPROVE" | "REFUSE" | "ISSUE" | "CANCEL"; reason?: string } = {
    action: "STATUS_CHANGE",
  },
): Promise<void> {
  await ex
    .updateTable("Quote")
    .set({ status, ...more, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", quote.id)
    .execute();
  await logChange(ex, ctx, {
    ...quoteLog(record, quote),
    action: log.action,
    reason: log.reason,
    changes: { status: [quote.status, status] },
  });
}

/** The quote goes to the manager, or is approved at once when the centre's rule asks for no approval. */
export async function submitQuote(
  ex: Executor,
  ctx: ServiceContext,
  input: { quoteId: string },
): Promise<{ quoteId: string; status: QuoteStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const { quote, record } = await requireQuote(ex, input.quoteId);
  requireOpenFile(record);
  await refuseIfAccepted(ex, quote);
  if (!QUOTE_STEPS[quote.status as QuoteStatus].includes("SUBMIT")) {
    throw new ServiceError("This quote is not waiting to be sent for approval.");
  }
  const status: QuoteStatus =
    (await getSetting(ex, "quote.approvalRule")) === "NONE" ? "APPROVED" : "AWAITING_APPROVAL";
  await setStatus(ex, ctx, quote, record, status);
  return { quoteId: quote.id, status };
}

/** The manager's yes or no to a quote, with his reason. His no sends it back to be reviewed. */
export async function decideQuote(
  ex: Executor,
  ctx: ServiceContext,
  input: { quoteId: string; approve: boolean; note: string },
): Promise<{ quoteId: string; status: QuoteStatus }> {
  requireSection(ctx, "REQUESTS", "READ");
  requireCapability(ctx, "quote.approve");
  const { quote, record } = await requireQuote(ex, input.quoteId);
  requireOpenFile(record);
  await refuseIfAccepted(ex, quote);
  if (quote.status !== "AWAITING_APPROVAL") throw new ServiceError("This quote is not waiting for approval.");
  const note = input.note.trim();
  if (!note) throw new ServiceError("A reason is required.");
  const status: QuoteStatus = input.approve ? "APPROVED" : "NEEDS_REVIEW";
  await setStatus(
    ex,
    ctx,
    quote,
    record,
    status,
    {
      approvedByUserId: input.approve ? ctx.userId : null,
      approvedAt: input.approve ? ctx.now : null,
      approvalNote: note,
    },
    { action: input.approve ? "APPROVE" : "REFUSE", reason: note },
  );
  return { quoteId: quote.id, status };
}

/**
 * Issues an approved quote: the day, the tax terms of that day and, for the
 * approval rules, what the study said it costs. The version it replaces is
 * superseded, and a file not yet at «عرض سعر» moves there.
 */
export async function issueQuote(
  ex: Executor,
  ctx: ServiceContext,
  input: { quoteId: string },
): Promise<{ quoteId: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const { quote, record } = await requireQuote(ex, input.quoteId);
  requireOpenFile(record);
  await refuseIfAccepted(ex, quote);
  if (quote.status !== "APPROVED") throw new ServiceError("A quote is issued once the manager has approved it.");
  const [tax, study] = await Promise.all([
    getSettings(ex, ["tax.mode", "tax.vatRate", "tax.pricesIncludeVat"]),
    ex
      .selectFrom("CostStudy")
      .select(["totalCost", "finalPrice", "pricePerVisit", "pricePerWeek", "pricePerMonth"])
      .where("fileId", "=", quote.fileId)
      .executeTakeFirst(),
  ]);
  // Cost and price over the same span (CLI-2): a per-period quote is set against one period of the study's cost.
  let cost: number | null = study?.totalCost ?? null;
  if (study && cost !== null && quote.amountBasis === "PER_PAYMENT_PERIOD") {
    const period = periodPriceOf(study, record.file.paymentFrequency);
    cost = period !== null && study.finalPrice ? Math.round((cost * period) / study.finalPrice) : null;
  }
  const margin = marginOver(cost, quote.total);

  const replaced = await ex
    .selectFrom("Quote")
    .selectAll()
    .where("fileId", "=", quote.fileId)
    .where("status", "=", "ISSUED")
    .where("result", "<>", "ACCEPTED")
    .where("id", "<>", quote.id)
    .where("deletedAt", "is", null)
    .execute();
  for (const old of replaced) await setStatus(ex, ctx, old, record, "SUPERSEDED");

  await setStatus(
    ex,
    ctx,
    quote,
    record,
    "ISSUED",
    {
      issuedAt: ctx.now,
      issuedDate: ctx.today,
      taxMode: tax["tax.mode"],
      vatRate: basisPoints(tax["tax.vatRate"]),
      pricesIncludeVat: tax["tax.pricesIncludeVat"] ? 1 : 0,
      costTotal: cost === null ? null : money(cost),
      marginBp: margin === null ? null : basisPoints(margin),
    },
    { action: "ISSUE" },
  );
  if (record.file.stage === "NEW" || record.file.stage === "VISIT") {
    await moveFileStage(ex, ctx, { fileId: record.file.id, to: "QUOTE" });
  }
  return { quoteId: quote.id, number: quote.number };
}

/** A new version of an issued quote the client has not accepted: the same number, a draft to change. */
export async function reviseQuote(
  ex: Executor,
  ctx: ServiceContext,
  input: { quoteId: string },
): Promise<{ quoteId: string; version: number }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const { quote, record } = await requireQuote(ex, input.quoteId);
  requireOpenFile(record);
  if (quote.status !== "ISSUED" || quote.result === "ACCEPTED") {
    throw new ServiceError("Only an issued quote the client has not accepted gets a new version.");
  }
  const lines = await linesOf(ex, [quote.id]);
  const saved = await saveQuote(ex, ctx, {
    fileId: quote.fileId,
    quote: {
      date: ctx.today,
      validUntil: addDays(ctx.today, await getSetting(ex, "quote.validityDays")),
      includedText: quote.includedText,
      excludedText: quote.excludedText,
      materialsIncluded: quote.materialsIncluded === null ? null : quote.materialsIncluded === 1,
      equipmentIncluded: quote.equipmentIncluded === null ? null : quote.equipmentIncluded === 1,
      workers: quote.workers,
      duration: quote.duration,
      visits: quote.visits,
      discount: quote.discount,
      amountBasis: quote.amountBasis as AmountBasis | null,
      lines: lines.map((line) => ({
        kind: line.kind as QuoteLineKind,
        label: line.label,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
      })),
    },
  });
  return { quoteId: saved.quoteId, version: saved.version };
}

/** A quote not yet issued is given up, with the reason. */
export async function cancelQuote(
  ex: Executor,
  ctx: ServiceContext,
  input: { quoteId: string; reason: string },
): Promise<{ quoteId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const { quote, record } = await requireQuote(ex, input.quoteId);
  if (!QUOTE_STEPS[quote.status as QuoteStatus].includes("CANCEL")) {
    throw new ServiceError("An issued quote is not cancelled: record the client's answer, or make a new version.");
  }
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  await setStatus(ex, ctx, quote, record, "CANCELLED", {}, { action: "CANCEL", reason });
  return { quoteId: quote.id };
}

export interface QuoteAnswerInput {
  quoteId: string;
  result: QuoteResult;
  resultDate: string;
  note?: string | null;
  postponedUntil?: string | null;
  /** His yes: take the file to «متعاقد» in the same act. */
  contract?: boolean;
  /** His no: close the file (A5: a refused quote closes the file without a status of its own). */
  close?: boolean;
}

/**
 * The client's answer to an issued quote. His yes gives the file the quote's
 * amount and basis (CONTRACTS.md section 5, step 2); with `contract` the file
 * becomes «متعاقد» in the same transaction, which tells Operations and Money.
 */
export async function recordQuoteResult(
  ex: Executor,
  ctx: ServiceContext,
  input: QuoteAnswerInput,
): Promise<{ quoteId: string; fileId: string; result: QuoteResult; contracted: boolean; closed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const answer = parsed(
    quoteResultSchema.safeParse({
      result: input.result,
      resultDate: input.resultDate,
      note: input.note,
      postponedUntil: input.postponedUntil,
    }),
  );
  const { quote, record } = await requireQuote(ex, input.quoteId);
  requireOpenFile(record);
  const { file } = record;
  if (quote.status !== "ISSUED") throw new ServiceError("Only an issued quote has an answer from the client.");
  if (answer.resultDate > ctx.today) throw new ServiceError("The client's answer cannot be dated after today.");
  if (answer.result === "POSTPONED" && !answer.postponedUntil) {
    throw new ServiceError("Say until when the client postponed his answer.");
  }
  const signed = file.stage === "CONTRACTED" || file.stage === "CONTRACT_ENDED";
  if (signed && quote.result === "ACCEPTED" && answer.result !== "ACCEPTED") {
    throw new ServiceError("This file is signed on this quote: its answer can no longer change.");
  }

  const { set, changes } = changedColumns(quote, {
    result: answer.result,
    resultDate: answer.resultDate as LocalDate,
    resultNote: answer.note,
    postponedUntil: (answer.result === "POSTPONED" ? answer.postponedUntil : null) as LocalDate | null,
  });
  if (changes) {
    await ex
      .updateTable("Quote")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", quote.id)
      .execute();
    await logChange(ex, ctx, { ...quoteLog(record, quote), action: "STATUS_CHANGE", changes });
  }

  let contracted = false;
  if (answer.result === "ACCEPTED") {
    // The other versions still being prepared are dead once the client has said yes (CLI-4).
    const working = await ex
      .selectFrom("Quote")
      .selectAll()
      .where("fileId", "=", quote.fileId)
      .where("id", "<>", quote.id)
      .where("status", "in", WORKING)
      .where("deletedAt", "is", null)
      .execute();
    for (const other of working) {
      await setStatus(
        ex,
        ctx,
        other,
        record,
        "CANCELLED",
        {},
        {
          action: "CANCEL",
          reason: "Another version of this quote was accepted.",
        },
      );
    }
  }
  if (answer.result === "ACCEPTED" && !signed) {
    const lines = await linesOf(ex, [quote.id]);
    const totals = quoteTotals(
      lines.map((line) => ({ kind: line.kind as QuoteLineKind, quantity: line.quantity, unitPrice: line.unitPrice })),
      quote.discount,
    );
    const taken = changedColumns(file, {
      totalAmount: money(fileAmountOf(totals, file.serviceType as ServiceType)),
      amountBasis:
        quote.amountBasis ?? file.amountBasis ?? (file.serviceType === "ON_DEMAND" ? "WHOLE_CONTRACT" : null),
      workersCount: file.workersCount ?? quote.workers,
    });
    if (taken.changes) {
      await ex
        .updateTable("File")
        .set({ ...taken.set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", file.id)
        .execute();
      await logChange(ex, ctx, {
        owner: "CLIENTS",
        action: "UPDATE",
        entity: "File",
        entityId: file.id,
        entityLabel: file.number,
        subject: clientSubjectOf(record),
        changes: taken.changes,
        context: { quoteId: quote.id, quote: quote.number },
      });
    }
    if (input.contract) {
      if (file.stage === "NEW" || file.stage === "VISIT") {
        await moveFileStage(ex, ctx, { fileId: file.id, to: "QUOTE" });
      }
      await moveFileStage(ex, ctx, { fileId: file.id, to: "CONTRACTED" });
      contracted = true;
    }
  }

  let closed = false;
  if (answer.result === "REFUSED" && input.close && !signed) {
    await closeFile(ex, ctx, { fileId: file.id, reason: "QUOTE_REFUSED", note: answer.note ?? undefined });
    closed = true;
  }
  return { quoteId: quote.id, fileId: file.id, result: answer.result, contracted, closed };
}

/** A call or a visit about an issued quote still without a yes or a no (plan feature 29). */
export async function addQuoteFollowUp(
  ex: Executor,
  ctx: ServiceContext,
  input: { quoteId: string; date: string; note?: string | null; nextFollowUpDate?: string | null },
): Promise<{ followUpId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const followUp = parsed(
    followUpSchema.safeParse({ date: input.date, note: input.note, nextFollowUpDate: input.nextFollowUpDate }),
  );
  const { quote, record } = await requireQuote(ex, input.quoteId);
  requireOpenFile(record);
  if (quote.status !== "ISSUED") throw new ServiceError("Only an issued quote is followed up.");
  if (followUp.date > ctx.today) throw new ServiceError("A follow-up cannot be dated after today.");
  if (followUp.nextFollowUpDate !== null && followUp.nextFollowUpDate < followUp.date) {
    throw new ServiceError("The next follow-up cannot be before this one.");
  }
  const id = newId();
  await ex
    .insertInto("QuoteFollowUp")
    .values({
      id,
      quoteId: quote.id,
      date: followUp.date as LocalDate,
      note: followUp.note,
      nextFollowUpDate: followUp.nextFollowUpDate as LocalDate | null,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    ...quoteLog(record, quote),
    action: "UPDATE",
    context: { followUp: followUp.date, next: followUp.nextFollowUpDate },
  });
  return { followUpId: id };
}

export interface QuoteSheetData {
  fileId: string;
  fileNumber: string;
  serviceType: string;
  /** «دورية السداد» of the file: what a per-period amount is for. */
  paymentFrequency: string | null;
  quote: QuoteView;
  client: { name: string; managerName: string | null; phone: string | null; address: string | null };
  site: { name: string | null; address: string | null; commune: string | null };
}

/** What the quote's sheet prints: the quote as saved, and the client as his form names him. */
export async function getQuoteSheet(
  ex: Executor,
  ctx: ServiceContext,
  input: { quoteId: string },
): Promise<QuoteSheetData> {
  requireSection(ctx, "REQUESTS", "READ");
  const { quote, record } = await requireQuote(ex, input.quoteId);
  const view = (await getFileQuotes(ex, ctx, { fileId: quote.fileId })).quotes.find((one) => one.id === quote.id);
  if (!view) throw new ServiceError("This quote does not exist.");
  const values = sheetValuesOf(record);
  const textOf = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  return {
    fileId: record.file.id,
    fileNumber: record.file.number,
    serviceType: record.file.serviceType,
    paymentFrequency: record.file.paymentFrequency,
    quote: { ...view, costTotal: null, marginBp: null },
    client: {
      name: textOf(values.clientName) ?? record.client.name,
      managerName: textOf(values.managerName),
      phone: textOf(values.phone),
      address: textOf(values.address),
    },
    site: { name: record.site.commonName, address: record.site.address, commune: record.commune?.nameAr ?? null },
  };
}

/** A quote going to paper names the client: a disclosure. */
export async function recordQuotePrint(ex: Executor, ctx: ServiceContext, input: { quoteId: string }): Promise<void> {
  requireSection(ctx, "REQUESTS", "READ");
  const { quote, record } = await requireQuote(ex, input.quoteId);
  await logDisclose(ex, ctx, {
    ...quoteLog(record, quote),
    action: "PRINT",
    disclosure: "PRINT",
    context: { sheet: "QUOTE", status: quote.status },
  });
}

export interface PendingQuoteRow {
  quoteId: string;
  number: string;
  version: number;
  fileId: string;
  fileNumber: string;
  clientName: string;
  phone: string;
  issuedDate: string | null;
  result: QuoteResult;
  postponedUntil: string | null;
  total: number;
  lastFollowUp: { date: string; note: string | null } | null;
  nextFollowUpDate: string | null;
  /** Counted by the home tile «عروض أسعار تنتظر المتابعة»: a call is due. */
  due: boolean;
}

/**
 * The issued quotes still waiting for the client's answer (plan feature 29),
 * with their last follow-up and the next call: what the home tile opens.
 */
export async function listPendingQuotes(
  ex: Executor,
  ctx: ServiceContext,
  input: { dueOnly?: boolean } = {},
): Promise<PendingQuoteRow[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const rows = await ex
    .selectFrom("Quote as q")
    .innerJoin("File as f", "f.id", "q.fileId")
    .innerJoin("Client as c", "c.id", "f.clientId")
    .select([
      "q.id",
      "q.number",
      "q.version",
      "q.fileId",
      "q.issuedDate",
      "q.result",
      "q.postponedUntil",
      "q.total",
      "f.number as fileNumber",
      "c.name as clientName",
      "c.phone1 as phone",
    ])
    .where("q.status", "=", "ISSUED")
    .where("q.deletedAt", "is", null)
    .where("q.result", "in", ["PENDING", "NO_ANSWER", "POSTPONED", "DISCOUNT_REQUESTED", "CHANGE_REQUESTED"])
    .where("f.closedAt", "is", null)
    .where("f.deletedAt", "is", null)
    .orderBy("q.issuedDate")
    .execute();
  if (rows.length === 0) return [];
  const [followUps, due] = await Promise.all([
    ex
      .selectFrom("QuoteFollowUp")
      .select(["quoteId", "date", "note", "nextFollowUpDate", "createdAt"])
      .where(
        "quoteId",
        "in",
        rows.map((row) => row.id),
      )
      .orderBy("date", "desc")
      .orderBy("createdAt", "desc")
      .execute(),
    quotesToFollowUp(ex, ctx, { days: await getSetting(ex, "alerts.quoteFollowUpDays") }),
  ]);
  return rows
    .map((row) => {
      const mine = followUps.filter((followUp) => followUp.quoteId === row.id);
      const next = mine.flatMap((followUp) => (followUp.nextFollowUpDate ? [String(followUp.nextFollowUpDate)] : []));
      return {
        quoteId: row.id,
        number: row.number,
        version: row.version,
        fileId: row.fileId,
        fileNumber: row.fileNumber,
        clientName: row.clientName,
        phone: row.phone,
        issuedDate: row.issuedDate,
        result: row.result as QuoteResult,
        postponedUntil: row.postponedUntil,
        total: row.total,
        lastFollowUp: mine[0] ? { date: mine[0].date, note: mine[0].note } : null,
        nextFollowUpDate: next.sort().at(-1) ?? null,
        due: due.quoteIds.includes(row.id),
      };
    })
    .filter((row) => !input.dueOnly || row.due);
}

/**
 * The cost and margin each issued quote of a file froze from the study:
 * restricted data, checked against `cost.read` and logged once a day per
 * reader and quote, as the study itself is.
 */
export async function openQuoteCosts(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<Record<string, { costTotal: number | null; marginBp: number | null }>> {
  requireSection(ctx, "REQUESTS", "READ");
  requireCapability(ctx, "cost.read");
  const record = await requireFileRecord(ex, input.fileId);
  const rows = await ex
    .selectFrom("Quote")
    .select(["id", "number", "version", "costTotal", "marginBp"])
    .where("fileId", "=", record.file.id)
    .where("deletedAt", "is", null)
    .execute();
  const costs: Record<string, { costTotal: number | null; marginBp: number | null }> = {};
  for (const row of rows) {
    if (row.costTotal === null && row.marginBp === null) continue;
    await logConsultOnce(ex, ctx, { ...quoteLog(record, row), action: "VIEW_RESTRICTED" });
    costs[row.id] = { costTotal: row.costTotal, marginBp: row.marginBp };
  }
  return costs;
}

// ── What the screens call ────────────────────────────────────────────────────

export const getFileQuotesQuery = query(getFileQuotes);
export const listPendingQuotesQuery = query(listPendingQuotes);
export const getQuoteSheetQuery = query(getQuoteSheet);
export const saveQuoteAction = action(saveQuote, { revalidate: QUOTES_REFRESH });
export const submitQuoteAction = action(submitQuote, { revalidate: QUOTES_REFRESH });
export const decideQuoteAction = action(decideQuote, { revalidate: QUOTES_REFRESH });
export const issueQuoteAction = action(issueQuote, { revalidate: QUOTES_REFRESH });
export const reviseQuoteAction = action(reviseQuote, { revalidate: QUOTES_REFRESH });
export const cancelQuoteAction = action(cancelQuote, { revalidate: QUOTES_REFRESH });
export const recordQuoteResultAction = action(recordQuoteResult, { revalidate: QUOTES_REFRESH });
export const addQuoteFollowUpAction = action(addQuoteFollowUp, { revalidate: QUOTES_REFRESH });
export const recordQuotePrintAction = action(recordQuotePrint);
export const openQuoteCostsAction = action(openQuoteCosts);
