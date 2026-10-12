import { requireSection } from "@/lib/access/session";
import { linkUpload, removeUpload } from "@/lib/attachments";
import { newId } from "@/lib/db/rows";
import { logChange, logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { dinarsToMoney, localDate, type LocalDate } from "@/lib/units";

import { expenseFormSchema, type ExpenseFormValues } from "../validators/expense";
import type { ExpenseView } from "../views";

import { EXPENSES_PATH, REPORTS_PATH } from "./paths";

/**
 * «المصاريف» (#39): money out, on the day it went out, on one of his four
 * divisions or on «عام».
 *
 * An expense typed by hand (`source = MANUAL`) is created, changed and removed
 * here. One the program wrote from a purchase, a maintenance record or a
 * payout to staff is read-only on screen: it is changed where it came from, so
 * the two can never disagree. Removing is a soft delete with the reason typed,
 * kept in the log; nothing is erased.
 */

const VIEW_COLUMNS = [
  "id",
  "date",
  "division",
  "category",
  "amount",
  "method",
  "paidTo",
  "spentByName",
  "recurrence",
  "source",
  "receiptUrl",
  "note",
] as const;

/** The expenses paid between two days, both included, the latest first. Removed ones are left out. */
export async function listExpenses(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: LocalDate; to: LocalDate },
): Promise<ExpenseView[]> {
  requireSection(ctx, "MONEY", "READ");
  return ex
    .selectFrom("Expense")
    .select([...VIEW_COLUMNS])
    .where("deletedAt", "is", null)
    .where("date", ">=", input.from)
    .where("date", "<=", input.to)
    .orderBy("date", "desc")
    .orderBy("createdAt", "desc")
    .execute();
}

function parse(ctx: ServiceContext, values: unknown): ExpenseFormValues {
  const parsed = expenseFormSchema(ctx.today).safeParse(values);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  return parsed.data;
}

/** The columns the dialog fills, as stored. */
function columnsOf(values: ExpenseFormValues) {
  return {
    date: localDate(values.date),
    division: values.division,
    category: values.category,
    amount: dinarsToMoney(values.amount),
    method: values.method,
    paidTo: values.paidTo ?? null,
    spentByName: values.spentByName ?? null,
    recurrence: values.recurrence,
    note: values.note ?? null,
  };
}

export interface SaveExpenseInput {
  /** The dialog's values, the amount in dinars as typed. */
  values: ExpenseFormValues;
  /**
   * The receipt's address, saved before the action (`saveManagedUpload`).
   * Left out: unchanged. `null`: the receipt is taken off.
   */
  receiptUrl?: string | null;
}

export async function createExpense(
  ex: Executor,
  ctx: ServiceContext,
  input: SaveExpenseInput,
): Promise<{ id: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  const values = parse(ctx, input.values);
  const id = newId();
  const receiptUrl = input.receiptUrl ?? null;
  await ex
    .insertInto("Expense")
    .values({
      id,
      ...columnsOf(values),
      source: "MANUAL",
      receiptUrl,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  if (receiptUrl) await linkUpload(ex, ctx, receiptUrl, id);
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "CREATE",
    entity: "Expense",
    entityId: id,
    entityLabel: values.category,
    context: { division: values.division, date: values.date },
  });
  return { id };
}

async function manualExpense(ex: Executor, id: string) {
  const expense = await ex.selectFrom("Expense").selectAll().where("id", "=", id).executeTakeFirst();
  if (!expense || expense.deletedAt !== null) throw new ServiceError("This expense does not exist.");
  if (expense.source !== "MANUAL") {
    throw new ServiceError("This expense was written by the program: it is changed where it came from.");
  }
  return expense;
}

export async function updateExpense(
  ex: Executor,
  ctx: ServiceContext,
  input: SaveExpenseInput & { id: string },
): Promise<{ id: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  const before = await manualExpense(ex, input.id);
  const values = parse(ctx, input.values);
  const { set, changes } = changedColumns(before, {
    ...columnsOf(values),
    ...(input.receiptUrl === undefined ? {} : { receiptUrl: input.receiptUrl }),
  });
  if (!changes) return { id: before.id };

  if (set.receiptUrl !== undefined) {
    if (before.receiptUrl) await removeUpload(ex, ctx, { url: before.receiptUrl, owner: "MONEY" });
    if (set.receiptUrl) await linkUpload(ex, ctx, set.receiptUrl, before.id);
  }
  await ex
    .updateTable("Expense")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "UPDATE",
    entity: "Expense",
    entityId: before.id,
    entityLabel: before.category,
    changes,
  });
  return { id: before.id };
}

/** Removes an expense typed by mistake. The row stays, marked removed, and the log keeps who, when and why. */
export async function deleteExpense(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const expense = await manualExpense(ex, input.id);
  await ex
    .updateTable("Expense")
    .set({ deletedAt: ctx.now, deleteReason: reason, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", expense.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "MONEY",
    action: "SOFT_DELETE",
    reason,
    entity: "Expense",
    entityId: expense.id,
    entityLabel: expense.category,
    context: { division: expense.division, date: expense.date, amount: expense.amount },
  });
  return { id: expense.id };
}

// ── What the screens call ────────────────────────────────────────────────────

const REFRESH = [EXPENSES_PATH, REPORTS_PATH] as const;

export const listExpensesQuery = query(listExpenses);
export const createExpenseAction = action(createExpense, { revalidate: [...REFRESH] });
export const updateExpenseAction = action(updateExpense, { revalidate: [...REFRESH] });
export const deleteExpenseAction = action(deleteExpense, { revalidate: [...REFRESH] });
