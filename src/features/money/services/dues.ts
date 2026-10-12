import { newId } from "@/lib/db/rows";
import { query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSetting } from "@/lib/settings";
import { localDate, money, type LocalDate } from "@/lib/units";

import { dueState, paymentState } from "../rules/alerts";
import { diffDays } from "../rules/dates";
import { buildDueSchedule, type ScheduledDue } from "../rules/due-schedule";
import type { DueKind, DueState, PaymentState } from "../validators/option-codes";

import { dueTermsOf, readFileBilling, type FileBilling } from "./terms";
import { isProgrammeVisit, readBillingVisits, type BillingVisit } from "./visits";

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

/** The kinds `syncDues` builds and may cancel. The others are written one by one and never touched here. */
const SCHEDULED_KINDS: ReadonlySet<string> = new Set(["SCHEDULE", "VISIT", "SINGLE"]);

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
    if (visit.status === "POSTPONED") return false;
    if (visit.status === "CANCELLED") return visit.clientAtFault;
    return true;
  });
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

/** The existing live due a scheduled one stands for: its visit, its period, or the one due of a job. */
function matchOf(scheduled: ScheduledDue, live: readonly DueRow[]): DueRow | undefined {
  if (scheduled.kind === "VISIT") return live.find((due) => due.kind === "VISIT" && due.visitId === scheduled.visitId);
  if (scheduled.kind === "SCHEDULE") {
    return live.find((due) => due.kind === "SCHEDULE" && due.periodStart === scheduled.periodStart);
  }
  return live.find((due) => due.kind === "SINGLE");
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
 *  - Once the contract has ended, only the untouched dues whose period or
 *    visit lies after the day it ended are cancelled; a finished job
 *    (`JOB_DONE`) keeps its due.
 *
 * It never refuses: it runs inside other owners' saves, and a file whose terms
 * are not all written yet simply has no dues.
 */
export async function syncDues(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<SyncDuesResult> {
  const result: SyncDuesResult = { created: 0, updated: 0, cancelled: 0 };
  const file = await readFileBilling(ex, input.fileId);
  if (!file) return result;

  const dues = await readDues(ex, file.id);
  const live = dues.filter((due) => due.cancelledAt === null);
  const cancel = async (due: DueRow, reason: DueCancelReason) => {
    await ex
      .updateTable("PaymentDue")
      .set({ cancelledAt: ctx.now, cancelReason: reason, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", due.id)
      .execute();
    result.cancelled += 1;
  };

  if (file.stage === "CONTRACT_ENDED") {
    if (file.endKind === "JOB_DONE" || file.endedDate === null) return result;
    const visitDates = new Map(
      (await readBillingVisits(ex, { fileId: file.id })).map((visit) => [visit.id, visit.visitDate]),
    );
    for (const due of live) {
      if (!SCHEDULED_KINDS.has(due.kind) || !isUntouched(due)) continue;
      const startsOn = due.visitId ? (visitDates.get(due.visitId) ?? due.periodStart) : due.periodStart;
      if (startsOn !== null && startsOn > file.endedDate) await cancel(due, "CONTRACT_ENDED");
    }
    return result;
  }
  if (file.stage !== "CONTRACTED") return result;

  const visits = await readBillingVisits(ex, { fileId: file.id });
  const schedule = scheduleOf(file, visits);
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
  paidAmount: number;
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
        paidAmount: row.paidAmount,
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
