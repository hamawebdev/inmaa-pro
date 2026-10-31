import { fileAmountOf } from "@/features/clients/rules/pricing";
import { getAcceptedQuote } from "@/features/clients/services/exports";
import { newId } from "@/lib/db/rows";
import { query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSetting } from "@/lib/settings";
import { holdsBooks } from "@/lib/sync/books/guard";
import { localDate, money, type LocalDate } from "@/lib/units";

import { dueState, paymentState } from "../rules/alerts";
import { mulDivRound } from "../rules/centimes";
import { diffDays } from "../rules/dates";
import { buildDueSchedule, type ScheduledDue } from "../rules/due-schedule";
import type { DueKind, DueState, PaymentState } from "../validators/option-codes";

import { rebalanceFile } from "./credit";
import { dueTermsOf, readFileBilling, type FileBilling } from "./terms";
import {
  isBilled,
  isPricedExtra,
  isProgrammeVisit,
  readBillingVisits,
  readRequireSignOff,
  type BillingVisit,
} from "./visits";

/**
 * «الاستحقاقات»: what a file's client is expected to pay, and when.
 *
 * The dues are built from the file's terms (scope A7) and kept in line with
 * them by `syncDues`, which Clients' and Operations' events call
 * (../events.ts): a file becomes «متعاقد», its terms change, it ends, a visit
 * is signed off, postponed or cancelled. The payment alerts and the debt list
 * read this table, so they work before any invoice exists.
 */

/** Why a due the terms no longer ask for was cancelled. Stored in `PaymentDue.cancelReason`. */
export const DUE_CANCEL_REASONS = ["TERMS_CHANGED", "CONTRACT_ENDED"] as const;
export type DueCancelReason = (typeof DUE_CANCEL_REASONS)[number];

/**
 * The kinds `syncDues` builds and may cancel: the schedule of the terms, the first deep clean of the accepted
 * quote (`INITIAL_JOB`) and the priced extra visits (`EXTRA`). The others are written one by one and never
 * touched here.
 */
const SCHEDULED_KINDS: ReadonlySet<string> = new Set(["SCHEDULE", "VISIT", "SINGLE", "INITIAL_JOB", "EXTRA"]);

/** A due the file's terms ask for: the schedule's, or one of the two one-off kinds. */
type WantedDue = Omit<ScheduledDue, "kind" | "seq"> & { kind: DueKind };

type DueRow = Awaited<ReturnType<typeof readDues>>[number];

async function readDues(ex: Executor, fileId: string) {
  return ex.selectFrom("PaymentDue").selectAll().where("fileId", "=", fileId).orderBy("seq").execute();
}

/** Nothing has been done with it yet: no invoice, no payment, no draft. Only such a due follows the terms. */
const isUntouched = (due: DueRow) => due.invoiceId === null && due.paidAmount === 0 && due.draftId === null;

/** The visits a per-visit contract charges: those that take place, and those the client made impossible. */
function chargedVisits(visits: readonly BillingVisit[]): BillingVisit[] {
  return visits.filter((visit) => {
    if (!isProgrammeVisit(visit) && visit.origin !== "MAKEUP") return false;
    // The office decided this visit is not billed (MON-05): the client is not charged for it.
    if (visit.decision && !visit.decision.billable) return false;
    if (visit.status === "POSTPONED") return false;
    if (visit.status === "CANCELLED") return visit.clientAtFault || visit.decision?.billable === true;
    return true;
  });
}

/**
 * The first deep clean a contract bills once, apart from its periods (RULINGS.md 3): what the accepted quote
 * comes to beyond the contract's own amount, as Clients' `fileAmountOf` sets that amount. A job on demand, or a
 * contract whose quote holds nothing but one-off lines, already has it in «المبلغ إجمالي»: nothing apart.
 */
export async function initialJobAmount(ex: Executor, ctx: ServiceContext, file: FileBilling): Promise<number> {
  if (file.serviceType !== "CONTRACT") return 0;
  const quote = await getAcceptedQuote(ex, ctx, { fileId: file.id });
  if (!quote || quote.totals.INITIAL_JOB <= 0) return 0;
  const subtotal = quote.totals.INITIAL_JOB + quote.totals.PERIODIC + quote.totals.EXTRA;
  const contractAmount = fileAmountOf(
    { subtotal, discount: quote.discount, total: quote.total, byKind: quote.totals },
    "CONTRACT",
  );
  return Math.max(0, quote.total - contractAmount);
}

/** The visit of the first deep clean, once Operations planned it: the latest one not cancelled. */
const initialVisitOf = (visits: readonly BillingVisit[]) =>
  visits.filter((visit) => visit.origin === "INITIAL" && visit.status !== "CANCELLED").at(-1) ?? null;

/** The one-off dues of a contracted file: its first deep clean, and each extra visit the office priced. */
async function oneOffDues(
  ex: Executor,
  ctx: ServiceContext,
  file: FileBilling,
  visits: readonly BillingVisit[],
): Promise<WantedDue[]> {
  const wanted: WantedDue[] = [];
  const initial = await initialJobAmount(ex, ctx, file);
  const cleanVisit = initialVisitOf(visits);
  // The office waived the first clean on its visit («قرار الفوترة»): nothing is asked for it.
  const waived = cleanVisit?.decision?.billable === false;
  if (initial > 0 && file.startDate !== null && !waived) {
    const day = cleanVisit?.visitDate ?? file.startDate;
    wanted.push({
      kind: "INITIAL_JOB",
      periodStart: day,
      periodEnd: day,
      visitId: null,
      // «تاريخ تسديد»: what the client agreed to pay on; never before the clean itself.
      dueDate: file.firstDueDate && file.firstDueDate > day ? file.firstDueDate : day,
      plannedVisits: 1,
      expectedAmount: money(initial),
    });
  }
  for (const visit of visits.filter(isPricedExtra)) {
    wanted.push({
      kind: "EXTRA",
      periodStart: visit.visitDate,
      periodEnd: visit.visitDate,
      visitId: visit.id,
      dueDate: visit.visitDate,
      plannedVisits: 1,
      expectedAmount: money(visit.decision?.amount ?? 0),
    });
  }
  return wanted;
}

function scheduleOf(file: FileBilling, visits: readonly BillingVisit[]): ScheduledDue[] {
  const terms = dueTermsOf(file);
  if (!terms) return [];
  // A contract written with its end before its start, or a negative amount, expects nothing until it is corrected.
  if (terms.totalAmount < 0 || (terms.endDate !== null && terms.endDate < terms.startDate)) return [];
  const planned =
    terms.serviceType === "CONTRACT" && terms.frequency === "PER_VISIT"
      ? chargedVisits(visits)
      : visits.filter(isProgrammeVisit);
  return buildDueSchedule(
    terms,
    planned.map((visit) => ({ id: visit.id, date: visit.visitDate })),
  );
}

/** The existing live due a wanted one stands for: its visit, its period, the one due of a job, the first clean. */
function matchOf(scheduled: WantedDue, live: readonly DueRow[]): DueRow | undefined {
  if (scheduled.kind === "VISIT" || scheduled.kind === "EXTRA") {
    return live.find((due) => due.kind === scheduled.kind && due.visitId === scheduled.visitId);
  }
  if (scheduled.kind === "SCHEDULE") {
    return live.find((due) => due.kind === "SCHEDULE" && due.periodStart === scheduled.periodStart);
  }
  return live.find((due) => due.kind === scheduled.kind);
}

export interface SyncDuesResult {
  created: number;
  updated: number;
  cancelled: number;
}

/**
 * Brings a file's dues in line with its terms. Idempotent: called again with
 * nothing changed, it writes nothing.
 *
 *  - A due that was invoiced, paid in part or taken into a draft stays as it is.
 *  - An untouched due is updated in place; a missing one is added; one the
 *    terms no longer ask for is cancelled. Nothing is ever deleted.
 *  - Besides the schedule of its terms, a contract owes the first deep clean
 *    of its accepted quote once (`INITIAL_JOB`), and each extra visit the
 *    office priced (`EXTRA`, from `VisitBilling.amount`).
 *  - Once the contract has ended early (INT-2), nothing is owed for what lay
 *    after the day it ended: those dues are cancelled, the period that holds
 *    that day is cut to the visits before it, a job ended before anything of
 *    it was done owes nothing, nor a first clean that never took place. A due
 *    paid but not invoiced is cancelled too, and what was paid on it goes to
 *    the file's other dues or its credit. An invoiced due stays: an invoice is
 *    voided on its own. A finished job (`JOB_DONE`) keeps its due.
 *
 * It never refuses: it runs inside other owners' saves, and a file whose terms
 * are not all written yet simply has no dues.
 */
export async function syncDues(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<SyncDuesResult> {
  const result: SyncDuesResult = { created: 0, updated: 0, cancelled: 0 };
  const file = await readFileBilling(ex, ctx, input.fileId);
  if (!file) return result;

  const dues = await readDues(ex, file.id);
  const live = dues.filter((due) => due.cancelledAt === null);
  const cancel = async (due: DueRow, reason: DueCancelReason) => {
    await ex
      .updateTable("PaymentDue")
      // A due cancelled with money on it owes nothing: the money is placed again below (`rebalanceFile`).
      .set({
        cancelledAt: ctx.now,
        cancelReason: reason,
        ...(due.paidAmount > 0 ? { amount: money(0) } : {}),
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", due.id)
      .execute();
    result.cancelled += 1;
  };

  if (file.stage === "CONTRACT_ENDED") {
    if (file.endKind === "JOB_DONE" || file.endedDate === null) return result;
    await endDues(ex, ctx, file, file.endedDate, live, cancel, result);
    return result;
  }
  if (file.stage !== "CONTRACTED") return result;

  const visits = await readBillingVisits(ex, { fileId: file.id });
  const schedule: WantedDue[] = [...scheduleOf(file, visits), ...(await oneOffDues(ex, ctx, file, visits))];
  const kept = new Set<string>();
  let nextSeq = dues.reduce((highest, due) => Math.max(highest, due.seq), 0) + 1;

  for (const scheduled of schedule) {
    const existing = matchOf(scheduled, live);
    if (existing) {
      kept.add(existing.id);
      if (!isUntouched(existing)) continue;
      const { set, changes } = changedColumns(existing, {
        periodStart: localDate(scheduled.periodStart),
        periodEnd: localDate(scheduled.periodEnd),
        dueDate: localDate(scheduled.dueDate),
        plannedVisits: scheduled.plannedVisits,
        expectedAmount: money(scheduled.expectedAmount),
        // Not invoiced: the receivable is what the terms expect.
        amount: money(scheduled.expectedAmount),
      });
      if (!changes) continue;
      await ex
        .updateTable("PaymentDue")
        .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", existing.id)
        .execute();
      result.updated += 1;
      continue;
    }
    await ex
      .insertInto("PaymentDue")
      .values({
        id: newId(),
        fileId: file.id,
        seq: nextSeq,
        kind: scheduled.kind,
        periodStart: localDate(scheduled.periodStart),
        periodEnd: localDate(scheduled.periodEnd),
        visitId: scheduled.visitId,
        dueDate: localDate(scheduled.dueDate),
        plannedVisits: scheduled.plannedVisits,
        expectedAmount: money(scheduled.expectedAmount),
        amount: money(scheduled.expectedAmount),
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    nextSeq += 1;
    result.created += 1;
  }

  for (const due of live) {
    if (kept.has(due.id) || !SCHEDULED_KINDS.has(due.kind) || !isUntouched(due)) continue;
    await cancel(due, "TERMS_CHANGED");
  }
  return result;
}

/**
 * The dues of a contract ended early (INT-2), brought to what the client still owes: nothing after the day it
 * ended, the period holding that day cut to the visits planned before it (its days, when none was planned), a
 * job or a first clean that never took place nothing at all. An invoiced due is left to its invoice.
 */
async function endDues(
  ex: Executor,
  ctx: ServiceContext,
  file: FileBilling,
  end: LocalDate,
  live: readonly DueRow[],
  cancel: (due: DueRow, reason: DueCancelReason) => Promise<void>,
  result: SyncDuesResult,
) {
  const visits = await readBillingVisits(ex, { fileId: file.id });
  const requireSignOff = await readRequireSignOff(ex);
  const visitDates = new Map(visits.map((visit) => [visit.id, visit.visitDate]));
  let moneyFreed = false;
  const drop = async (due: DueRow) => {
    moneyFreed ||= due.paidAmount > 0;
    await cancel(due, "CONTRACT_ENDED");
  };

  for (const due of live) {
    if (!SCHEDULED_KINDS.has(due.kind) || due.invoiceId !== null || due.draftId !== null) continue;
    const startsOn = due.visitId ? (visitDates.get(due.visitId) ?? due.periodStart) : due.periodStart;
    if (startsOn !== null && startsOn > end) {
      await drop(due);
      continue;
    }
    if (due.kind === "SINGLE") {
      // A job stopped before anything of it was done owes nothing.
      const done = visits.some((visit) => visit.visitDate <= end && isBilled(visit, requireSignOff));
      if (!done) await drop(due);
      continue;
    }
    if (due.kind === "INITIAL_JOB") {
      const cleaned = visits.some(
        (visit) => visit.origin === "INITIAL" && visit.visitDate <= end && visit.status === "DONE",
      );
      if (!cleaned) await drop(due);
      continue;
    }
    if (due.kind !== "SCHEDULE" || due.periodStart === null || due.periodEnd === null || due.periodEnd <= end) continue;

    // The period that holds the last day: its price for the visits planned before the end, against the whole period's.
    const inPeriod = visits.filter(
      (visit) =>
        isProgrammeVisit(visit) &&
        visit.visitDate >= (due.periodStart ?? end) &&
        visit.visitDate <= (due.periodEnd ?? end),
    );
    const before = inPeriod.filter((visit) => visit.visitDate <= end).length;
    const cut =
      inPeriod.length > 0
        ? mulDivRound(due.expectedAmount, before, inPeriod.length)
        : mulDivRound(
            due.expectedAmount,
            diffDays(due.periodStart, end) + 1,
            diffDays(due.periodStart, due.periodEnd) + 1,
          );
    if (cut <= 0) {
      await drop(due);
      continue;
    }
    moneyFreed ||= due.paidAmount > cut;
    await ex
      .updateTable("PaymentDue")
      .set({
        periodEnd: end,
        plannedVisits: before,
        expectedAmount: money(cut),
        amount: money(cut),
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", due.id)
      .execute();
    result.updated += 1;
  }
  // What was paid on a due that no longer asks for it goes to the file's other dues, else to its credit.
  // Two laptops: only the books' laptop moves allocations; elsewhere the due waits, over its amount, until the
  // books' laptop rebalances the file after this change reaches it (`rebalanceWaitingFiles`).
  if (moneyFreed && (await holdsBooks(ex, ctx))) await rebalanceFile(ex, ctx, { fileId: file.id });
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface DueLine {
  id: string;
  fileId: string;
  seq: number;
  kind: DueKind;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  visitId: string | null;
  dueDate: LocalDate;
  plannedVisits: number | null;
  expectedAmount: number;
  amount: number;
  /** What the due holds of the money paid, never more than it asks. */
  paidAmount: number;
  /**
   * Two laptops: money paid on the due beyond what it now asks (it was cut on the laptop without the books), that
   * the books' laptop will place on the file's other dues or keep as its credit. 0 once rebalanced, and always 0
   * on one laptop.
   */
  pendingExcess: number;
  remaining: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  cancelled: boolean;
  state: DueState;
  daysLate: number;
}

/** The dues of a file with their state on `ctx.today`, oldest first. Cancelled ones included, last. */
export async function listFileDues(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<DueLine[]> {
  const leadDays = await getSetting(ex, "alerts.paymentDueLeadDays");
  const rows = await ex
    .selectFrom("PaymentDue")
    .leftJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
    .selectAll("PaymentDue")
    .select("Invoice.number as invoiceNumber")
    .where("PaymentDue.fileId", "=", input.fileId)
    .orderBy("PaymentDue.dueDate")
    .orderBy("PaymentDue.seq")
    .execute();
  return rows
    .map((row): DueLine => {
      const cancelled = row.cancelledAt !== null;
      const remaining = cancelled ? 0 : Math.max(0, row.amount - row.paidAmount);
      const state = dueState(
        { amount: row.amount, paidAmount: row.paidAmount, dueDate: row.dueDate, cancelled },
        ctx.today,
        leadDays,
      );
      return {
        id: row.id,
        fileId: row.fileId,
        seq: row.seq,
        kind: row.kind as DueKind,
        periodStart: (row.periodStart as LocalDate | null) ?? null,
        periodEnd: (row.periodEnd as LocalDate | null) ?? null,
        visitId: row.visitId,
        dueDate: row.dueDate as LocalDate,
        plannedVisits: row.plannedVisits,
        expectedAmount: row.expectedAmount,
        amount: row.amount,
        paidAmount: Math.min(row.paidAmount, Math.max(0, row.amount)),
        pendingExcess: Math.max(0, row.paidAmount - Math.max(0, row.amount)),
        remaining,
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        cancelled,
        state,
        daysLate: remaining > 0 ? Math.max(0, diffDays(row.dueDate, ctx.today)) : 0,
      };
    })
    .sort((a, b) => Number(a.cancelled) - Number(b.cancelled));
}

export interface FilePaymentSummary {
  /** What the file's live dues come to. */
  amount: number;
  paid: number;
  remaining: number;
  /** What is past its date and not paid. */
  overdue: number;
  /** The date of the oldest due still open, or none. */
  nextDueDate: LocalDate | null;
  state: PaymentState;
}

/** «التسديد» in a word and four figures: the file hub's tile, and «حالة الدفع» of his homes file. */
export async function getFilePaymentSummary(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<FilePaymentSummary> {
  const dues = (await listFileDues(ex, ctx, input)).filter((due) => !due.cancelled);
  const open = dues.filter((due) => due.remaining > 0);
  const amount = dues.reduce((sum, due) => sum + due.amount, 0);
  const paid = dues.reduce((sum, due) => sum + Math.min(due.paidAmount, due.amount), 0);
  return {
    amount,
    paid,
    remaining: open.reduce((sum, due) => sum + due.remaining, 0),
    overdue: open.filter((due) => due.dueDate < ctx.today).reduce((sum, due) => sum + due.remaining, 0),
    nextDueDate: open[0]?.dueDate ?? null,
    state: paymentState(amount, paid),
  };
}

// ── What the screens call ────────────────────────────────────────────────────

export const listFileDuesQuery = query(listFileDues);
export const getFilePaymentSummaryQuery = query(getFilePaymentSummary);
