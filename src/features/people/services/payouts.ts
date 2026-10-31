import { isDate } from "@/features/people/rules/dates";
import {
  DEBT_DIRECTIONS,
  DEBT_REASONS,
  PAYMENT_METHODS,
  PAYOUT_KINDS,
  type DebtDirection,
  type DebtReason,
  type PaymentMethod,
  type PayoutKind,
  type StaffKind,
} from "@/features/people/validators/staff-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange } from "@/lib/log";
import { sql } from "kysely";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { holdsBooks, requireBooks } from "@/lib/sync/books";
import { localDate, money } from "@/lib/units";

import { HOURS_PATH } from "./hours";
import { staffName } from "@/lib/text/names";

/**
 * Money paid to a person, and what a person owes the centre (feature 38).
 *
 *  - A payout is an advance, a wage paid on a closed payslip (in one or
 *    several times), or another payment. It is numbered, and voided with a
 *    reason, never deleted. Each one tells Money (`payout.recorded`,
 *    `payout.voided`), which posts the expense on the day paid (ruling 1).
 *  - The ledger (`StaffDebtEntry`) holds advances and other debts, one line
 *    after the other with the balance: an advance adds, a payslip's repayment
 *    takes off, and a line is undone by a REVERSAL line, never changed.
 *
 * What other owners call: `addDebtEntry` (Money, for equipment lost or
 * damaged), `getPayoutForExpense`, `getClosedPayroll`, `getPaidMinutes`.
 */

async function personOf(ex: Executor, staffId: string) {
  const person = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "firstName", "lastName", "deletedAt"])
    .where("id", "=", staffId)
    .executeTakeFirst();
  if (!person || person.deletedAt) throw new ServiceError("This person does not exist.");
  const label = staffName(person);
  return {
    ...person,
    label,
    subject: { kind: person.kind === "EMPLOYEE" ? ("EMPLOYEE" as const) : ("WORKER" as const), id: person.id, label },
  };
}

/**
 * Pay is opened from «الساعات والأجور», a tab of the workers' section, for
 * cleaning workers and centre employees alike: whoever reads that section and
 * holds the pay capability (the HR officer, the accountant, the manager).
 */
export function requirePay(ctx: ServiceContext, level: "READ" | "WRITE"): void {
  requireSection(ctx, "WORKERS", "READ");
  requireCapability(ctx, level === "WRITE" ? "pay.write" : "pay.read");
}

export interface PayPerson {
  id: string;
  kind: StaffKind;
  number: string;
  name: string;
}

/** Whom a payment can be made to: workers and employees who have not left. For the pickers of the pay screens. */
export async function listPayPeople(ex: Executor, ctx: ServiceContext): Promise<PayPerson[]> {
  requirePay(ctx, "READ");
  const rows = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "firstName", "lastName"])
    .where("deletedAt", "is", null)
    .where("kind", "in", ["WORKER", "EMPLOYEE"])
    .where("engagementStatus", "in", ["ON_TRIAL", "ACCEPTED"])
    .orderBy("kind", "desc")
    .orderBy("numberSeq")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as StaffKind,
    number: row.number,
    name: staffName(row),
  }));
}

// ── The ledger ──────────────────────────────────────────────────────────────

/** What a person owes the centre now, in centimes. */
export async function debtBalanceOf(ex: Executor, staffId: string): Promise<number> {
  const last = await ex
    .selectFrom("StaffDebtEntry")
    .select("balanceAfter")
    .where("staffId", "=", staffId)
    .orderBy("seq", "desc")
    .limit(1)
    .executeTakeFirst();
  return last?.balanceAfter ?? 0;
}

/**
 * What a person owed at the end of a day, from the lines dated up to it: a
 * month's payslip takes back the advances of that month and of those before
 * it, not one given after the month ended.
 */
export async function debtAt(ex: Executor, staffId: string, date: string): Promise<number> {
  const lines = await ex
    .selectFrom("StaffDebtEntry")
    .select(["direction", "amount"])
    .where("staffId", "=", staffId)
    .where("date", "<=", localDate(date))
    .execute();
  return lines.reduce((sum, line) => sum + (line.direction === "INCREASE" ? line.amount : -line.amount), 0);
}

/** What is still owed of one line of the ledger that made a debt. */
export interface DebtPart {
  entryId: string;
  reason: DebtReason;
  violationId: string | null;
  note: string | null;
  left: number;
}

/**
 * What a person still owes, line by line (PEO-13): each debt made (an
 * advance, a damage, a violation's deduction…) is taken back in the order it
 * was made, a repayment undone owes again what it had taken back, and an
 * undone debt is taken off its own line first.
 */
export async function outstandingDebts(ex: Executor, staffId: string): Promise<DebtPart[]> {
  const lines = await ex
    .selectFrom("StaffDebtEntry")
    .select(["id", "direction", "reason", "amount", "note", "violationId", "reversesEntryId"])
    .where("staffId", "=", staffId)
    .orderBy("seq")
    .execute();
  const parts: DebtPart[] = [];
  const takenBy = new Map<string, Array<{ part: DebtPart; amount: number }>>();
  const take = (amount: number, first: DebtPart | undefined) => {
    const taken: Array<{ part: DebtPart; amount: number }> = [];
    let rest = amount;
    for (const part of first ? [first, ...parts.filter((each) => each !== first)] : parts) {
      if (rest <= 0) break;
      const now = Math.min(part.left, rest);
      if (now <= 0) continue;
      part.left -= now;
      rest -= now;
      taken.push({ part, amount: now });
    }
    return taken;
  };
  for (const line of lines) {
    if (line.direction === "DECREASE") {
      const undone =
        line.reason === "REVERSAL" ? parts.find((part) => part.entryId === line.reversesEntryId) : undefined;
      takenBy.set(line.id, take(line.amount, undone));
      continue;
    }
    const repaid = line.reason === "REVERSAL" && line.reversesEntryId ? takenBy.get(line.reversesEntryId) : undefined;
    let rest: number = line.amount;
    for (const { part, amount } of repaid ?? []) {
      const back = Math.min(amount, rest);
      part.left += back;
      rest -= back;
    }
    if (rest > 0) {
      parts.push({
        entryId: line.id,
        reason: (repaid ? "OTHER" : line.reason) as DebtReason,
        violationId: line.violationId,
        note: line.note,
        left: rest,
      });
    }
  }
  return parts.filter((part) => part.left > 0);
}

export interface DebtEntryInput {
  staffId: string;
  date: string;
  direction: DebtDirection;
  reason: DebtReason;
  /** Centimes, above zero. */
  amount: number;
  note?: string | null;
  payoutId?: string | null;
  payslipId?: string | null;
  violationId?: string | null;
  handOutReturnId?: string | null;
  reversesEntryId?: string | null;
  /** Who decided it, when the books' laptop posts what was decided on the other laptop; the acting user otherwise. */
  byUserId?: string | null;
}

/**
 * One line of a person's ledger, with its sequence and the balance after it.
 * A line never brings the balance below nothing: nobody is owed by this ledger.
 */
export async function addDebtEntry(
  ex: Executor,
  ctx: ServiceContext,
  input: DebtEntryInput,
): Promise<{ id: string; balanceAfter: number }> {
  // The person's ledger is a running balance: only the laptop that holds the books writes it (DECISION section 4).
  await requireBooks(ex, ctx);
  if (!(DEBT_DIRECTIONS as readonly string[]).includes(input.direction))
    throw new Error("people: unknown debt direction");
  if (!(DEBT_REASONS as readonly string[]).includes(input.reason)) throw new Error("people: unknown debt reason");
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new ServiceError("Enter an amount above zero.");
  const person = await personOf(ex, input.staffId);
  const last = await ex
    .selectFrom("StaffDebtEntry")
    .select(["seq", "balanceAfter"])
    .where("staffId", "=", person.id)
    .orderBy("seq", "desc")
    .limit(1)
    .executeTakeFirst();
  const balanceAfter = (last?.balanceAfter ?? 0) + (input.direction === "INCREASE" ? input.amount : -input.amount);
  if (balanceAfter < 0) throw new ServiceError("This is more than the person owes.");
  const id = newId();
  await ex
    .insertInto("StaffDebtEntry")
    .values({
      id,
      staffId: person.id,
      seq: (last?.seq ?? 0) + 1,
      date: localDate(input.date),
      direction: input.direction,
      reason: input.reason,
      amount: money(input.amount),
      balanceAfter: money(balanceAfter),
      note: input.note?.trim() || null,
      payoutId: input.payoutId ?? null,
      payslipId: input.payslipId ?? null,
      violationId: input.violationId ?? null,
      handOutReturnId: input.handOutReturnId ?? null,
      reversesEntryId: input.reversesEntryId ?? null,
      createdAt: ctx.now,
      createdByUserId: input.byUserId ?? ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "StaffDebtEntry",
    entityId: id,
    entityLabel: `${person.number} ${person.label}`,
    subject: person.subject,
    changes: { balance: [last?.balanceAfter ?? 0, balanceAfter] },
    context: { direction: input.direction, reason: input.reason, amount: input.amount },
  });
  return { id, balanceAfter };
}

// ── Two laptops: debts decided where the books are not ───────────────────────

/**
 * A debt line decided by an ordinary save on the laptop without the books (a
 * violation's deduction, an equipment charge: coordinator's ruling). The
 * ledger is a running balance that only the books' laptop writes, so the save
 * does not write it: it carries the lines in its own log entry
 * (`context.debtPending`), and the books' laptop posts them when the entry
 * reaches it (`postDeferredDebts`).
 */
export type DeferredDebt = Omit<DebtEntryInput, "byUserId" | "payoutId" | "payslipId" | "reversesEntryId">;

/**
 * Whether this save writes the ledger now (the books are here, or sync is not
 * set up), or defers the lines to the books' laptop.
 */
export const mayWriteLedger = (ex: Executor, ctx: ServiceContext) => holdsBooks(ex, ctx);

/** The sources whose deferred lines are posted, and the ledger column that says a source is already posted. */
const DEFERRED_SOURCES = { Violation: "violationId", HandOutReturn: "handOutReturnId" } as const;

/**
 * Run on the books' laptop after each round and at the start of its day:
 * the lines decided on the other laptop that are not in the ledger yet are
 * posted, in the order they were decided, as their decider's. Idempotent,
 * keyed by the source row: a source that has any line in the ledger is
 * posted. Nothing on the laptop without the books.
 */
export async function postDeferredDebts(ex: Executor, ctx: ServiceContext): Promise<{ posted: number }> {
  if (!(await holdsBooks(ex, ctx))) return { posted: 0 };
  const entries = await ex
    .selectFrom("AuditLog")
    .select(["userId", "entity", "entityId", "context"])
    .where("entity", "in", Object.keys(DEFERRED_SOURCES))
    .where(sql<boolean>`json_extract("context", '$.debtPending') IS NOT NULL`)
    .orderBy("occurredAt")
    .orderBy("chainSeq")
    .execute();
  let posted = 0;
  for (const entry of entries) {
    const column = DEFERRED_SOURCES[entry.entity as keyof typeof DEFERRED_SOURCES];
    if (!column || !entry.entityId) continue;
    const done = await ex
      .selectFrom("StaffDebtEntry")
      .select("id")
      .where(column, "=", entry.entityId)
      .executeTakeFirst();
    if (done) continue;
    const lines = (JSON.parse(entry.context ?? "{}") as { debtPending?: DeferredDebt[] }).debtPending ?? [];
    for (const line of lines) {
      await addDebtEntry(ex, ctx, { ...line, [column]: entry.entityId, byUserId: entry.userId });
      posted += 1;
    }
  }
  return { posted };
}

/** The lines decided for a source and still waiting for the books' laptop, from the decision's log entry. */
export async function deferredDebtsOf(
  ex: Executor,
  entity: keyof typeof DEFERRED_SOURCES,
  ids: readonly string[],
): Promise<Map<string, DeferredDebt[]>> {
  const out = new Map<string, DeferredDebt[]>();
  if (ids.length === 0) return out;
  const column = DEFERRED_SOURCES[entity];
  const entries = await ex
    .selectFrom("AuditLog")
    .select(["entityId", "context"])
    .where("entity", "=", entity)
    .where("entityId", "in", ids)
    .where(sql<boolean>`json_extract("context", '$.debtPending') IS NOT NULL`)
    .execute();
  const posted = new Set(
    (await ex.selectFrom("StaffDebtEntry").select(column).where(column, "in", ids).execute()).map(
      (row) => (row as Record<string, string | null>)[column],
    ),
  );
  for (const entry of entries) {
    if (!entry.entityId || posted.has(entry.entityId)) continue;
    out.set(entry.entityId, (JSON.parse(entry.context ?? "{}") as { debtPending: DeferredDebt[] }).debtPending);
  }
  return out;
}

/** A debt typed by the office (damage, loss, an overpayment), or a repayment in cash, or a debt written off. */
export async function recordDebt(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string; date: string; reason: DebtReason; amount: number; note: string },
): Promise<{ id: string; balanceAfter: number }> {
  const person = await personOf(ex, input.staffId);
  requirePay(ctx, "WRITE");
  const increases: readonly DebtReason[] = ["DAMAGE", "LOSS", "OVERPAYMENT", "OTHER"];
  const decreases: readonly DebtReason[] = ["REPAID_IN_CASH", "WRITTEN_OFF"];
  if (!increases.includes(input.reason) && !decreases.includes(input.reason)) {
    throw new ServiceError("Choose what the amount is for.");
  }
  if (input.note.trim() === "") throw new ServiceError("Write what the amount is for.");
  if (isDate(input.date) && input.date > ctx.today) throw new ServiceError("The date cannot be after today.");
  return addDebtEntry(ex, ctx, {
    staffId: person.id,
    date: input.date,
    direction: increases.includes(input.reason) ? "INCREASE" : "DECREASE",
    reason: input.reason,
    amount: input.amount,
    note: input.note,
  });
}

export interface DebtLine {
  id: string;
  seq: number;
  date: string;
  direction: DebtDirection;
  reason: DebtReason;
  amount: number;
  balanceAfter: number;
  note: string | null;
  payoutNumber: string | null;
  payslipNumber: string | null;
}

/** A person's ledger, the last line first, with the balance now. */
export async function getStaffLedger(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string },
): Promise<{ staffId: string; number: string; name: string; balance: number; lines: DebtLine[] }> {
  const person = await personOf(ex, input.staffId);
  requirePay(ctx, "READ");
  const lines = await ex
    .selectFrom("StaffDebtEntry as d")
    .leftJoin("StaffPayout as o", "o.id", "d.payoutId")
    .leftJoin("Payslip as p", "p.id", "d.payslipId")
    .select([
      "d.id",
      "d.seq",
      "d.date",
      "d.direction",
      "d.reason",
      "d.amount",
      "d.balanceAfter",
      "d.note",
      "o.number as payoutNumber",
      "p.number as payslipNumber",
    ])
    .where("d.staffId", "=", person.id)
    .orderBy("d.seq", "desc")
    .execute();
  return {
    staffId: person.id,
    number: person.number,
    name: person.label,
    balance: lines[0]?.balanceAfter ?? 0,
    lines: lines.map((line) => ({
      ...line,
      direction: line.direction as DebtDirection,
      reason: line.reason as DebtReason,
    })),
  };
}

export interface DebtorRow {
  staffId: string;
  kind: StaffKind;
  number: string;
  name: string;
  balance: number;
  lastDate: string;
}

/** Everybody who owes the centre something now. */
export async function listDebtors(ex: Executor, ctx: ServiceContext): Promise<DebtorRow[]> {
  requirePay(ctx, "READ");
  const rows = await ex
    .selectFrom("StaffDebtEntry as d")
    .innerJoin("StaffMember as s", "s.id", "d.staffId")
    .select(["d.staffId", "d.balanceAfter", "d.date", "d.seq", "s.kind", "s.number", "s.firstName", "s.lastName"])
    .where(({ eb, selectFrom }) =>
      eb(
        "d.seq",
        "=",
        selectFrom("StaffDebtEntry as l")
          .select(({ fn }) => fn.max("l.seq").as("seq"))
          .whereRef("l.staffId", "=", "d.staffId"),
      ),
    )
    .where("d.balanceAfter", ">", money(0))
    .orderBy("d.balanceAfter", "desc")
    .execute();
  return rows.map((row) => ({
    staffId: row.staffId,
    kind: row.kind as StaffKind,
    number: row.number,
    name: staffName(row),
    balance: row.balanceAfter,
    lastDate: row.date,
  }));
}

// ── Payouts ─────────────────────────────────────────────────────────────────

export interface PayoutInput {
  staffId: string;
  date: string;
  /** Centimes, above zero. */
  amount: number;
  kind: PayoutKind;
  wageMethod: PaymentMethod;
  /** A wage: the closed payslip it pays. */
  payslipId?: string | null;
  note?: string | null;
}

/**
 * Records money paid to a person. An advance goes on the ledger, to be repaid
 * on the next payslip. A wage pays a closed payslip, all of it or a part, and
 * never more than what is left of its net.
 */
export async function recordPayout(
  ex: Executor,
  ctx: ServiceContext,
  input: PayoutInput,
): Promise<{ id: string; number: string }> {
  const person = await personOf(ex, input.staffId);
  requirePay(ctx, "WRITE");
  if (!(PAYOUT_KINDS as readonly string[]).includes(input.kind)) throw new ServiceError("Choose what is paid.");
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.wageMethod))
    throw new ServiceError("Choose how it is paid.");
  if (!isDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date > ctx.today) throw new ServiceError("The date cannot be after today.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new ServiceError("Enter an amount above zero.");
  const note = input.note?.trim() || null;
  if (input.kind === "OTHER" && !note) throw new ServiceError("Write what the amount is for.");

  let payslip: { id: string; netAmount: number; paidAmount: number; number: string | null } | null = null;
  if (input.kind === "WAGE") {
    const found = input.payslipId
      ? await ex
          .selectFrom("Payslip as p")
          .innerJoin("PayRun as r", "r.id", "p.payRunId")
          .select(["p.id", "p.staffId", "p.netAmount", "p.paidAmount", "p.number", "r.status"])
          .where("p.id", "=", input.payslipId)
          .executeTakeFirst()
      : undefined;
    if (!found || found.staffId !== person.id) throw new ServiceError("Choose the payslip this wage pays.");
    if (found.status !== "CLOSED") throw new ServiceError("A wage is paid on a closed pay run.");
    if (input.amount > found.netAmount - found.paidAmount) {
      throw new ServiceError("This is more than what is left to pay on this payslip.");
    }
    payslip = found;
  } else if (input.payslipId) {
    throw new Error("people: only a wage names a payslip");
  }

  const number = await nextNumber(ex, ctx, "PAYOUT", { date: localDate(input.date) });
  const id = newId();
  await ex
    .insertInto("StaffPayout")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      staffId: person.id,
      date: localDate(input.date),
      amount: money(input.amount),
      kind: input.kind,
      wageMethod: input.wageMethod,
      payslipId: payslip?.id ?? null,
      note,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  if (input.kind === "ADVANCE") {
    await addDebtEntry(ex, ctx, {
      staffId: person.id,
      date: input.date,
      direction: "INCREASE",
      reason: "ADVANCE",
      amount: input.amount,
      payoutId: id,
      note,
    });
  }
  if (payslip) {
    // Only the payment columns: the rest of a closed payslip is frozen.
    await ex
      .updateTable("Payslip")
      .set({
        paidAmount: money(payslip.paidAmount + input.amount),
        // The day of the payout that completes it.
        paidDate: payslip.paidAmount + input.amount >= payslip.netAmount ? localDate(input.date) : null,
        wageMethod: input.wageMethod,
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", payslip.id)
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "StaffPayout",
    entityId: id,
    entityLabel: number.display,
    subject: person.subject,
    changes: { amount: [null, input.amount] },
    context: { kind: input.kind, date: input.date, payslip: payslip?.number ?? null },
  });
  await emit(ex, ctx, "payout.recorded", { staffPayoutId: id });
  return { id, number: number.display };
}

/** Voids a payout, with the reason: an advance leaves the ledger, a wage is owed again on its payslip. */
export async function voidPayout(
  ex: Executor,
  ctx: ServiceContext,
  input: { payoutId: string; reason: string },
): Promise<void> {
  const payout = await ex.selectFrom("StaffPayout").selectAll().where("id", "=", input.payoutId).executeTakeFirst();
  if (!payout) throw new ServiceError("This payout does not exist.");
  const person = await personOf(ex, payout.staffId);
  requirePay(ctx, "WRITE");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for voiding.");
  if (payout.voidedAt) throw new ServiceError("This payout is already voided.");

  if (payout.kind === "ADVANCE") {
    const line = await ex
      .selectFrom("StaffDebtEntry")
      .select(["id", "amount"])
      .where("payoutId", "=", payout.id)
      .where("reason", "=", "ADVANCE")
      .executeTakeFirst();
    if (line) {
      if ((await debtBalanceOf(ex, person.id)) < line.amount) {
        throw new ServiceError("This advance has already been repaid: it can no longer be voided.");
      }
      await addDebtEntry(ex, ctx, {
        staffId: person.id,
        date: ctx.today,
        direction: "DECREASE",
        reason: "REVERSAL",
        amount: line.amount,
        payoutId: payout.id,
        reversesEntryId: line.id,
        note: reason,
      });
    }
  }
  await ex
    .updateTable("StaffPayout")
    .set({
      voidedAt: ctx.now,
      voidedByUserId: ctx.userId,
      voidReason: reason,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", payout.id)
    .execute();
  if (payout.payslipId) {
    const left = await ex
      .selectFrom("StaffPayout")
      .select(["amount", "date"])
      .where("payslipId", "=", payout.payslipId)
      .where("voidedAt", "is", null)
      .orderBy("date", "desc")
      .execute();
    await ex
      .updateTable("Payslip")
      .set({
        paidAmount: money(left.reduce((sum, each) => sum + each.amount, 0)),
        // No longer paid in full: a wage can be voided only when it is owed again.
        paidDate: null,
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", payout.payslipId)
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "VOID",
    reason,
    entity: "StaffPayout",
    entityId: payout.id,
    entityLabel: payout.number,
    subject: person.subject,
    changes: { voided: [false, true] },
    context: { kind: payout.kind, amount: payout.amount },
  });
  await emit(ex, ctx, "payout.voided", { staffPayoutId: payout.id });
}

export interface PayoutRow {
  id: string;
  number: string;
  staffId: string;
  staffKind: StaffKind;
  staffNumber: string;
  staffName: string;
  date: string;
  amount: number;
  kind: PayoutKind;
  wageMethod: PaymentMethod;
  payslipId: string | null;
  payslipNumber: string | null;
  note: string | null;
  voided: boolean;
  voidReason: string | null;
}

/** Payouts of a period, or of one person, the last first. */
export async function listPayouts(
  ex: Executor,
  ctx: ServiceContext,
  input: { from?: string; to?: string; staffId?: string | null; kind?: PayoutKind | null } = {},
): Promise<PayoutRow[]> {
  requirePay(ctx, "READ");
  let rows = ex
    .selectFrom("StaffPayout as o")
    .innerJoin("StaffMember as s", "s.id", "o.staffId")
    .leftJoin("Payslip as p", "p.id", "o.payslipId")
    .select([
      "o.id",
      "o.number",
      "o.staffId",
      "o.date",
      "o.amount",
      "o.kind",
      "o.wageMethod",
      "o.payslipId",
      "o.note",
      "o.voidedAt",
      "o.voidReason",
      "s.kind as staffKind",
      "s.number as staffNumber",
      "s.firstName",
      "s.lastName",
      "p.number as payslipNumber",
    ]);
  if (input.from && isDate(input.from)) rows = rows.where("o.date", ">=", localDate(input.from));
  if (input.to && isDate(input.to)) rows = rows.where("o.date", "<=", localDate(input.to));
  if (input.staffId) rows = rows.where("o.staffId", "=", input.staffId);
  if (input.kind) rows = rows.where("o.kind", "=", input.kind);
  const found = await rows
    .orderBy("o.date", "desc")
    .orderBy("o.numberYear", "desc")
    .orderBy("o.numberSeq", "desc")
    .execute();
  return found.map((row) => ({
    id: row.id,
    number: row.number,
    staffId: row.staffId,
    staffKind: row.staffKind as StaffKind,
    staffNumber: row.staffNumber,
    staffName: staffName(row),
    date: row.date,
    amount: row.amount,
    kind: row.kind as PayoutKind,
    wageMethod: row.wageMethod as PaymentMethod,
    payslipId: row.payslipId,
    payslipNumber: row.payslipNumber,
    note: row.note,
    voided: row.voidedAt !== null,
    voidReason: row.voidReason,
  }));
}

// ── What Money reads (CONTRACTS section 3) ──────────────────────────────────

function divisionMinutes(text: string | null): Record<string, number> {
  try {
    return text ? (JSON.parse(text) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export interface PayoutForExpense {
  staffPayoutId: string;
  number: string;
  staffId: string;
  staffKind: StaffKind;
  staffName: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  kind: PayoutKind;
  voided: boolean;
  /** The payslip and run a wage pays. */
  payslip: {
    id: string;
    number: string | null;
    payRunId: string;
    payRunNumber: string | null;
    periodStart: string;
    periodEnd: string;
    /** Minutes per division (and COMMON), to split the expense by. */
    divisionMin: Record<string, number>;
    /** True when, with this payout, the payslip's net is all paid. */
    completes: boolean;
    /** Given when this payout completes the payslip: its contributions, to post with it. */
    contributions: { employee: number; employer: number; irg: number } | null;
  } | null;
}

/** What Money posts a payout's expense from (ruling 1): called by its handler of `payout.recorded`. */
export async function getPayoutForExpense(
  ex: Executor,
  _ctx: ServiceContext,
  input: { staffPayoutId: string },
): Promise<PayoutForExpense | null> {
  const payout = await ex
    .selectFrom("StaffPayout as o")
    .innerJoin("StaffMember as s", "s.id", "o.staffId")
    .select([
      "o.id",
      "o.number",
      "o.staffId",
      "o.date",
      "o.amount",
      "o.kind",
      "o.wageMethod",
      "o.payslipId",
      "o.voidedAt",
      "o.createdAt",
    ])
    .select(["s.kind as staffKind", "s.firstName", "s.lastName"])
    .where("o.id", "=", input.staffPayoutId)
    .executeTakeFirst();
  if (!payout) return null;
  let payslip: PayoutForExpense["payslip"] = null;
  if (payout.payslipId) {
    const slip = await ex
      .selectFrom("Payslip as p")
      .innerJoin("PayRun as r", "r.id", "p.payRunId")
      .select([
        "p.id",
        "p.number",
        "p.netAmount",
        "p.cnasAmount",
        "p.employerCnasAmount",
        "p.irgAmount",
        "p.divisionMin",
      ])
      .select(["r.id as payRunId", "r.number as payRunNumber", "r.periodStart", "r.periodEnd"])
      .where("p.id", "=", payout.payslipId)
      .executeTakeFirstOrThrow();
    // The payouts of this payslip up to and including this one, in the order they were recorded.
    const paid = await ex
      .selectFrom("StaffPayout")
      .select(["id", "amount", "createdAt", "numberYear", "numberSeq"])
      .where("payslipId", "=", slip.id)
      .where("voidedAt", "is", null)
      .orderBy("numberYear")
      .orderBy("numberSeq")
      .execute();
    let sum = 0;
    let completedBy: string | null = null;
    for (const each of paid) {
      sum += each.amount;
      if (sum >= slip.netAmount) {
        completedBy = each.id;
        break;
      }
    }
    const completes = completedBy === payout.id;
    payslip = {
      id: slip.id,
      number: slip.number,
      payRunId: slip.payRunId,
      payRunNumber: slip.payRunNumber,
      periodStart: slip.periodStart,
      periodEnd: slip.periodEnd,
      divisionMin: divisionMinutes(slip.divisionMin),
      completes,
      contributions: completes
        ? { employee: slip.cnasAmount, employer: slip.employerCnasAmount, irg: slip.irgAmount }
        : null,
    };
  }
  return {
    staffPayoutId: payout.id,
    number: payout.number,
    staffId: payout.staffId,
    staffKind: payout.staffKind as StaffKind,
    staffName: staffName(payout),
    date: payout.date,
    amount: payout.amount,
    method: payout.wageMethod as PaymentMethod,
    kind: payout.kind as PayoutKind,
    voided: payout.voidedAt !== null,
    payslip,
  };
}

export interface ClosedPayrollRow {
  payRunId: string;
  payRunNumber: string | null;
  staffKind: StaffKind;
  periodStart: string;
  periodEnd: string;
  payslipId: string;
  staffId: string;
  staffName: string;
  gross: number;
  net: number;
  employeeContributions: number;
  employerContributions: number;
  irg: number;
  paid: number;
  divisionMin: Record<string, number>;
}

/** Per closed run and person, for Money's forecast and profitability. Runs whose period ends in the dates given. */
export async function getClosedPayroll(
  ex: Executor,
  _ctx: ServiceContext,
  input: { from: string; to: string },
): Promise<ClosedPayrollRow[]> {
  if (!isDate(input.from) || !isDate(input.to)) throw new ServiceError("Enter a valid date.");
  const rows = await ex
    .selectFrom("Payslip as p")
    .innerJoin("PayRun as r", "r.id", "p.payRunId")
    .select(["r.id as payRunId", "r.number as payRunNumber", "r.staffKind", "r.periodStart", "r.periodEnd"])
    .select([
      "p.id",
      "p.staffId",
      "p.staffName",
      "p.grossAmount",
      "p.netAmount",
      "p.cnasAmount",
      "p.employerCnasAmount",
    ])
    .select(["p.irgAmount", "p.paidAmount", "p.divisionMin"])
    .where("r.status", "=", "CLOSED")
    .where("r.periodEnd", ">=", localDate(input.from))
    .where("r.periodEnd", "<=", localDate(input.to))
    .orderBy("r.periodStart")
    .orderBy("p.staffNumber")
    .execute();
  return rows.map((row) => ({
    payRunId: row.payRunId,
    payRunNumber: row.payRunNumber,
    staffKind: row.staffKind as StaffKind,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    payslipId: row.id,
    staffId: row.staffId,
    staffName: row.staffName,
    gross: row.grossAmount,
    net: row.netAmount,
    employeeContributions: row.cnasAmount,
    employerContributions: row.employerCnasAmount,
    irg: row.irgAmount,
    paid: row.paidAmount,
    divisionMin: divisionMinutes(row.divisionMin),
  }));
}

/**
 * Minutes paid to workers for visits of a period, per worker: the seats closed
 * runs paid, whenever they were paid. For Money's use-of-time indicator.
 */
export async function getPaidMinutes(
  ex: Executor,
  _ctx: ServiceContext,
  input: { workerId?: string | null; from: string; to: string },
): Promise<Record<string, number>> {
  if (!isDate(input.from) || !isDate(input.to)) throw new ServiceError("Enter a valid date.");
  let seats = ex
    .selectFrom("PayslipSeat as s")
    .innerJoin("Payslip as p", "p.id", "s.payslipId")
    .innerJoin("PayRun as r", "r.id", "p.payRunId")
    .select(({ fn }) => ["p.staffId", fn.sum<number>("s.countedMin").as("minutes")])
    .where("r.status", "=", "CLOSED")
    .where("s.visitDate", ">=", localDate(input.from))
    .where("s.visitDate", "<=", localDate(input.to))
    .groupBy("p.staffId");
  if (input.workerId) seats = seats.where("p.staffId", "=", input.workerId);
  const rows = await seats.execute();
  return Object.fromEntries(rows.map((row) => [row.staffId, Number(row.minutes)]));
}

// What the screens import.
const REFRESH = [HOURS_PATH, "/dashboard/expenses"];
export const recordPayoutAction = action(recordPayout, { revalidate: REFRESH });
export const voidPayoutAction = action(voidPayout, { revalidate: REFRESH });
export const recordDebtAction = action(recordDebt, { revalidate: [HOURS_PATH] });
export const listPayoutsQuery = query(listPayouts);
export const listPayPeopleQuery = query(listPayPeople);
export const listDebtorsQuery = query(listDebtors);
export const getStaffLedgerQuery = query(getStaffLedger);
