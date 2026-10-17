import { getHourlyLabourCost } from "@/features/people/services/staff-exports";
import { requireCapability } from "@/lib/access/session";
import { logConsultOnce } from "@/lib/log";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { basisPoints, localDate, money, type LocalDate } from "@/lib/units";

import { mulDivRound } from "../rules/centimes";
import { isIsoDate } from "../rules/dates";
import { contractProfitability, type Profitability } from "../rules/profitability";

import { readTaxSettings } from "./money-settings";
import { readFileBilling, type FileBilling } from "./terms";

/**
 * «ربحية العقد» (feature 30): what a contract really earns over a period, on
 * the estimate the price was set on and on what was done.
 *
 *  - Revenue: the file's dues of the period, invoiced at their amount, the
 *    others at what they are expected to be; before tax under VAT.
 *  - Time: planned as each programme visit's workers × its length; worked as
 *    each worker's minutes on the visits done (Operations' returned orders).
 *  - Labour: each worker at his own hourly cost (People's
 *    `getHourlyLabourCost`), else the setting `costing.hourlyLabourCost`.
 *  - Materials: what was handed out to the job, less what came back, at the
 *    cost frozen on each line; transport and the rest: expenses tagged to the
 *    file. The estimate's materials and transport are the cost study's
 *    (Clients'), spread over its planned visits.
 *
 * Cost and margin are for those who hold `cost.read`; reading them is logged
 * once per user, file and day (DESIGN.md section 9), so this read is an action.
 */

export interface FileProfitability {
  fileId: string;
  fileNumber: string;
  from: LocalDate;
  to: LocalDate;
  visits: { planned: number; done: number };
  result: Profitability;
}

interface CostLine {
  code: string;
  amount: number;
}

export async function getFileProfitability(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; from?: string | null; to?: string | null },
): Promise<FileProfitability> {
  requireCapability(ctx, "cost.read");
  const file = await readFileBilling(ex, ctx, input.fileId);
  if (!file) throw new ServiceError("This file does not exist.");
  await logConsultOnce(ex, ctx, {
    owner: "MONEY",
    action: "VIEW_RESTRICTED",
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    subject: { kind: "CLIENT", id: file.clientId },
    context: { what: "PROFITABILITY" },
  });
  return computeFileProfitability(ex, ctx, { file, from: input.from, to: input.to });
}

/**
 * The profitability of one file over a period, with no check and no log: for a caller that checked
 * `cost.read` and logged the reading its own way (the file's card above, the reports' tables).
 */
export async function computeFileProfitability(
  ex: Executor,
  ctx: ServiceContext,
  input: { file: FileBilling; from?: string | null; to?: string | null },
): Promise<FileProfitability> {
  const { file } = input;
  const start = file.startDate ?? ctx.today;
  const end = file.endedDate ?? file.endDate ?? ctx.today;
  const from = localDate(input.from && isIsoDate(input.from) ? input.from : start);
  const to = localDate(input.to && isIsoDate(input.to) ? input.to : end < ctx.today ? end : ctx.today);
  if (from > to) throw new ServiceError("The start of the period cannot be after its end.");

  const settings = await getSettings(ex, ["costing.hourlyLabourCost", "costing.hoursOverrunPercent"]);
  const tax = await readTaxSettings(ex);

  // ── Revenue ──
  const dues = await ex
    .selectFrom("PaymentDue")
    .leftJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
    .select([
      "PaymentDue.amount",
      "PaymentDue.expectedAmount",
      "PaymentDue.invoiceId",
      "PaymentDue.periodStart",
      "PaymentDue.dueDate",
      "Invoice.totalHT",
      "Invoice.totalTTC",
    ])
    .where("PaymentDue.fileId", "=", file.id)
    .where("PaymentDue.cancelledAt", "is", null)
    .execute();
  const inPeriod = dues.filter((due) => {
    const day = due.periodStart ?? due.dueDate;
    return day >= from && day <= to;
  });
  // Revenue is before tax, invoiced or not (MON-12): an invoiced due is its share of the invoice's total with
  // tax, so its share of the total before tax is taken; one not invoiced yet is what the terms expect, brought
  // back before tax only when the file's price includes it.
  const priceIncludesVat = tax.mode === "VAT" && (file.amountIncludesVat ?? tax.pricesIncludeVat);
  const revenue = inPeriod.reduce((sum, due) => {
    if (due.invoiceId !== null && due.totalTTC !== null && due.totalHT !== null && due.totalTTC > 0) {
      return sum + mulDivRound(due.amount, due.totalHT, due.totalTTC);
    }
    return (
      sum + (priceIncludesVat ? mulDivRound(due.expectedAmount, 10_000, 10_000 + tax.vatRate) : due.expectedAmount)
    );
  }, 0);

  // ── Time ──
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "origin", "status", "statusReason", "plannedDurationMin", "workersNeeded"])
    .where("fileId", "=", file.id)
    .where("visitDate", ">=", from)
    .where("visitDate", "<=", to)
    .execute();
  const programme = visits.filter(
    (visit) =>
      (visit.origin === "CONTRACT" || visit.origin === "ON_DEMAND") &&
      !(visit.status === "CANCELLED" && visit.statusReason === "PROGRAMME_CHANGED"),
  );
  const estimatedMinutes = programme.reduce((sum, visit) => sum + visit.workersNeeded * visit.plannedDurationMin, 0);
  const done = visits.filter((visit) => visit.status === "DONE");
  const seats = done.length
    ? await ex
        .selectFrom("VisitWorker")
        .select(["workerId", "workedMin"])
        .where(
          "visitId",
          "in",
          done.map((visit) => visit.id),
        )
        .where("seatStatus", "=", "ASSIGNED")
        .execute()
    : [];
  const byWorker = new Map<string, number>();
  for (const seat of seats) byWorker.set(seat.workerId, (byWorker.get(seat.workerId) ?? 0) + (seat.workedMin ?? 0));
  const workedByWorker = [];
  for (const [staffId, minutes] of byWorker) {
    workedByWorker.push({ minutes, hourlyCost: await getHourlyLabourCost(ex, ctx, { staffId, date: to }) });
  }
  const workedMinutes = workedByWorker.reduce((sum, worker) => sum + worker.minutes, 0);

  // ── Materials, transport, the rest ──
  const lines = await ex
    .selectFrom("HandOutLine")
    .innerJoin("HandOut", "HandOut.id", "HandOutLine.handOutId")
    .select(["HandOutLine.id", "HandOutLine.qty", "HandOutLine.unitCost"])
    .where("HandOut.fileId", "=", file.id)
    .where("HandOut.cancelledAt", "is", null)
    .where("HandOut.date", ">=", from)
    .where("HandOut.date", "<=", to)
    .execute();
  const returns = lines.length
    ? await ex
        .selectFrom("HandOutReturn")
        .select(["handOutLineId", "qtyReturned"])
        .where(
          "handOutLineId",
          "in",
          lines.map((line) => line.id),
        )
        .execute()
    : [];
  const materials = lines.reduce((sum, line) => {
    const back = returns
      .filter((row) => row.handOutLineId === line.id)
      .reduce((total, row) => total + row.qtyReturned, 0);
    return sum + mulDivRound(line.qty - back, line.unitCost ?? 0, 1000);
  }, 0);
  const expenses = await ex
    .selectFrom("Expense")
    .select(["category", "amount"])
    .where("fileId", "=", file.id)
    .where("deletedAt", "is", null)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .execute();
  const transport = expenses.filter((row) => row.category === "TRANSPORT").reduce((sum, row) => sum + row.amount, 0);
  const other = expenses.filter((row) => row.category !== "TRANSPORT").reduce((sum, row) => sum + row.amount, 0);

  // ── The estimate's own costs: the cost study, spread over its planned visits ──
  const study = await ex
    .selectFrom("CostStudy")
    .select(["lines", "visitsPerWeek", "weeks", "hourlyRate"])
    .where("fileId", "=", file.id)
    .executeTakeFirst();
  const studyVisits = study?.visitsPerWeek && study.weeks ? Math.round((study.visitsPerWeek * study.weeks) / 1000) : 0;
  const studyLines: CostLine[] = study?.lines ? (JSON.parse(study.lines) as CostLine[]) : [];
  const spread = (code: string) => {
    const amount = studyLines.filter((line) => line.code === code).reduce((sum, line) => sum + (line.amount ?? 0), 0);
    return studyVisits > 0 ? mulDivRound(amount, programme.length, studyVisits) : 0;
  };

  const fallbackRate = settings["costing.hourlyLabourCost"] ?? study?.hourlyRate ?? null;
  const result = contractProfitability({
    revenue: money(revenue),
    estimatedMinutes,
    workedMinutes,
    hourlyCost: fallbackRate === null ? null : money(fallbackRate),
    workedByWorker,
    estimatedMaterials: money(spread("MATERIALS")),
    estimatedTransport: money(spread("TRANSPORT")),
    materials: money(materials),
    transport: money(transport),
    other: money(other),
    hoursOverrunTolerance: basisPoints(settings["costing.hoursOverrunPercent"]),
  });

  return {
    fileId: file.id,
    fileNumber: file.number,
    from,
    to,
    visits: { planned: programme.length, done: done.length },
    result,
  };
}

/** A read that writes the log's CONSULT line: the screen calls it as an action, with nothing to refresh. */
export const getFileProfitabilityAction = action(getFileProfitability);
