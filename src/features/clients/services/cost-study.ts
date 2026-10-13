import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logCollect, logConsult } from "@/lib/log";
import { action } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { basisPoints, minutes, money, qty } from "@/lib/units";

import { computeCostStudy, type CostLine, type CostStudyTerms, type CostStudyTotals } from "../rules/pricing";
import { COST_LINES, costStudySchema, type CostLineCode, type CostStudyInput } from "../validators/pricing";

import { clientSubjectOf, partHeaderOf, requireFileRecord, requireOpenFile, type FilePartHeader } from "./file-part";
import type { FileRecord } from "./file-records";
import { fileQueryPath } from "./file-reads";

/**
 * «الدراسة المالية» (plan feature 4): what the job costs the centre, the
 * margin, and the price it gives. One study per file, behind `cost.read`:
 * reading it is logged, and its figures never enter the log.
 */

export interface CostStudyView {
  file: FilePartHeader;
  /** False until the study has been saved once: the terms are then what the file and the settings suggest. */
  saved: boolean;
  terms: CostStudyTerms;
  totals: CostStudyTotals;
  preparedAt: string | null;
  preparedByName: string | null;
}

function parseLines(text: string | null): CostLine[] {
  if (!text) return [];
  const rows = JSON.parse(text) as { code: string; label?: string | null; amount?: number; rateBp?: number | null }[];
  return rows
    .filter((row) => (COST_LINES as readonly string[]).includes(row.code))
    .map((row) => ({
      code: row.code as CostLineCode,
      label: row.label ? row.label : null,
      amount: row.amount ?? 0,
      rateBp: row.rateBp ?? null,
    }));
}

const minutesBetween = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const span = th * 60 + tm - (fh * 60 + fm);
  return span > 0 ? span : null;
};

const weeksBetween = (start: string | null, end: string | null): number | null => {
  if (!start || !end || end < start) return null;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.round((days / 7) * 1000);
};

/** What a study starts from: the first visit's estimate, else the form; the hourly cost and the rates of the settings. */
async function suggestedTerms(ex: Executor, record: FileRecord): Promise<CostStudyTerms> {
  const { file } = record;
  const [visit, settings] = await Promise.all([
    ex
      .selectFrom("FirstVisit")
      .select(["estimatedWorkers", "perVisitMin"])
      .where("fileId", "=", file.id)
      .where("deletedAt", "is", null)
      .where("doneDate", "is not", null)
      .orderBy("doneDate", "desc")
      .executeTakeFirst(),
    getSettings(ex, [
      "costing.hourlyLabourCost",
      "costing.marginPercent",
      "costing.reservePercent",
      "costing.adminSharePercent",
    ]),
  ]);
  const days = file.executionDays ? (JSON.parse(file.executionDays) as string[]).length : 0;
  const rateOf: Partial<Record<CostLineCode, number | null>> = {
    RESERVE: settings["costing.reservePercent"],
    ADMIN_SHARE: settings["costing.adminSharePercent"],
  };
  const amountOf: Partial<Record<CostLineCode, number | null>> = {
    MATERIALS: file.materialsBearer === "CENTRE" ? file.materialsAmount : null,
    TRANSPORT: file.transportBearer === "CENTRE" ? file.transportAmount : null,
  };
  return {
    workers: visit?.estimatedWorkers ?? file.workersCount,
    perVisitMin: visit?.perVisitMin ?? minutesBetween(file.arrivalTime, file.departureTime),
    visitsPerWeek: file.visitsPerWeek ?? (days > 0 ? days : null),
    weeks: weeksBetween(file.startDate, file.endDate),
    hourlyRate: settings["costing.hourlyLabourCost"],
    lines: COST_LINES.map((code) => ({
      code,
      label: null,
      amount: amountOf[code] ?? 0,
      rateBp: rateOf[code] ?? null,
    })),
    marginPercent: settings["costing.marginPercent"],
    discount: null,
  };
}

/** Opens the study of a file. A restricted read: checked, logged, then read. */
export async function getCostStudy(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<CostStudyView> {
  requireSection(ctx, "REQUESTS", "READ");
  requireCapability(ctx, "cost.read");
  const record = await requireFileRecord(ex, input.fileId);
  await logConsult(ex, ctx, {
    owner: "CLIENTS",
    action: "VIEW_RESTRICTED",
    entity: "CostStudy",
    entityId: record.file.id,
    entityLabel: record.file.number,
    subject: clientSubjectOf(record),
  });

  const study = await ex.selectFrom("CostStudy").selectAll().where("fileId", "=", record.file.id).executeTakeFirst();
  const terms: CostStudyTerms = study
    ? {
        workers: study.workers,
        perVisitMin: study.perVisitMin,
        visitsPerWeek: study.visitsPerWeek,
        weeks: study.weeks,
        hourlyRate: study.hourlyRate,
        lines: parseLines(study.lines),
        marginPercent: study.marginPercent,
        discount: study.discount,
      }
    : await suggestedTerms(ex, record);
  const preparer = study?.preparedByUserId
    ? await ex.selectFrom("User").select("displayName").where("id", "=", study.preparedByUserId).executeTakeFirst()
    : undefined;
  return {
    file: partHeaderOf(record),
    saved: study !== undefined,
    terms,
    totals: computeCostStudy(terms),
    preparedAt: study?.preparedAt ?? null,
    preparedByName: preparer?.displayName ?? null,
  };
}

/** Saves the study: the figures the program works out are stored with what was typed. */
export async function saveCostStudy(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; terms: CostStudyInput },
): Promise<{ fileId: string; finalPrice: number; changed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  requireCapability(ctx, "cost.read");
  const parsed = costStudySchema.safeParse(input.terms);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  const record = await requireFileRecord(ex, input.fileId);
  requireOpenFile(record);

  const terms = parsed.data;
  const totals = computeCostStudy(terms);
  const amount = (value: number | null) => (value === null ? null : money(value));
  const columns = {
    workers: terms.workers,
    perVisitMin: terms.perVisitMin === null ? null : minutes(terms.perVisitMin),
    visitsPerWeek: terms.visitsPerWeek,
    weeks: terms.weeks === null ? null : qty(terms.weeks),
    hourlyRate: amount(terms.hourlyRate),
    lines: JSON.stringify(totals.lines),
    totalCost: amount(totals.totalCost),
    marginPercent: terms.marginPercent === null ? null : basisPoints(terms.marginPercent),
    profitValue: amount(totals.profitValue),
    priceBeforeDiscount: amount(totals.priceBeforeDiscount),
    discount: amount(terms.discount),
    finalPrice: amount(totals.finalPrice),
    pricePerVisit: amount(totals.pricePerVisit),
    pricePerWeek: amount(totals.pricePerWeek),
    pricePerMonth: amount(totals.pricePerMonth),
  };
  const log = {
    owner: "CLIENTS",
    entity: "CostStudy",
    entityLabel: record.file.number,
    subject: clientSubjectOf(record),
  } as const;

  const before = await ex.selectFrom("CostStudy").selectAll().where("fileId", "=", record.file.id).executeTakeFirst();
  if (!before) {
    const id = newId();
    await ex
      .insertInto("CostStudy")
      .values({
        id,
        fileId: record.file.id,
        ...columns,
        preparedByUserId: ctx.userId,
        preparedAt: ctx.now,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    await logCollect(ex, ctx, { ...log, action: "CREATE", entityId: id });
    return { fileId: record.file.id, finalPrice: totals.finalPrice, changed: true };
  }
  const { set, changes } = changedColumns(before, columns);
  if (!changes) return { fileId: record.file.id, finalPrice: totals.finalPrice, changed: false };
  await ex
    .updateTable("CostStudy")
    .set({ ...set, preparedByUserId: ctx.userId, preparedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, { ...log, action: "UPDATE", entityId: before.id, changes });
  return { fileId: record.file.id, finalPrice: totals.finalPrice, changed: true };
}

// A read that writes its line in the log is an action.
export const getCostStudyAction = action(getCostStudy);
export const saveCostStudyAction = action(saveCostStudy, {
  revalidate: (_data, input) => [fileQueryPath(input.fileId)],
});
