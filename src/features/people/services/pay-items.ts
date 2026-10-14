import { isDate } from "@/features/people/rules/dates";
import { PAY_ITEM_TYPES, type PayItemType } from "@/features/people/validators/staff-codes";
import { newId } from "@/lib/db/rows";
import { logChange, logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { staffName } from "@/lib/text/names";
import { localDate, money } from "@/lib/units";

import { HOURS_PATH } from "./hours";
import { requirePay } from "./payouts";

/**
 * Recurring allowances and deductions (`StaffPayItem`, feature 38): an amount
 * a person gets, or loses, every month from one date until another, or until
 * it is ended. A pay run reads those in force in its month: an allowance as a
 * line of its own, counted in the CNAS and IRG bases as ticked; a deduction
 * with the others.
 */

async function personOf(ex: Executor, staffId: string) {
  const person = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "firstName", "lastName"])
    .where("id", "=", staffId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!person) throw new ServiceError("This person does not exist.");
  const label = staffName(person);
  return {
    ...person,
    label,
    subject: { kind: person.kind === "EMPLOYEE" ? ("EMPLOYEE" as const) : ("WORKER" as const), id: person.id, label },
  };
}

async function itemOf(ex: Executor, id: string) {
  const item = await ex
    .selectFrom("StaffPayItem")
    .selectAll()
    .where("id", "=", id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!item) throw new ServiceError("This allowance or deduction does not exist.");
  return item;
}

export interface PayItemInput {
  staffId: string;
  type: PayItemType;
  label: string;
  /** Centimes a month, above zero. */
  amount: number;
  contributable?: boolean;
  taxable?: boolean;
  fromDate: string;
  toDate?: string | null;
}

export async function addPayItem(ex: Executor, ctx: ServiceContext, input: PayItemInput): Promise<{ id: string }> {
  requirePay(ctx, "WRITE");
  if (!(PAY_ITEM_TYPES as readonly string[]).includes(input.type))
    throw new ServiceError("Choose an allowance or a deduction.");
  const label = input.label.trim();
  if (label === "") throw new ServiceError("Write what the amount is for.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new ServiceError("Enter an amount above zero.");
  const toDate = input.toDate?.trim() || null;
  if (!isDate(input.fromDate) || (toDate !== null && !isDate(toDate))) throw new ServiceError("Enter a valid date.");
  if (toDate !== null && toDate < input.fromDate)
    throw new ServiceError("The end date must not be before the start date.");
  const person = await personOf(ex, input.staffId);
  const id = newId();
  await ex
    .insertInto("StaffPayItem")
    .values({
      id,
      staffId: person.id,
      type: input.type,
      label,
      amount: money(input.amount),
      contributable: input.contributable === false ? 0 : 1,
      taxable: input.taxable === false ? 0 : 1,
      fromDate: localDate(input.fromDate),
      toDate: toDate ? localDate(toDate) : null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "StaffPayItem",
    entityId: id,
    entityLabel: `${person.number} ${label}`,
    subject: person.subject,
    changes: { type: [null, input.type], fromDate: [null, input.fromDate], toDate: [null, toDate] },
  });
  return { id };
}

/** Ends an allowance or a deduction on a day: the months after it no longer have it. */
export async function endPayItem(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; toDate: string },
): Promise<void> {
  requirePay(ctx, "WRITE");
  if (!isDate(input.toDate)) throw new ServiceError("Enter a valid date.");
  const item = await itemOf(ex, input.id);
  if (input.toDate < item.fromDate) throw new ServiceError("The end date must not be before the start date.");
  const person = await personOf(ex, item.staffId);
  const { set, changes } = changedColumns(item, { toDate: localDate(input.toDate) });
  if (!changes) return;
  await ex
    .updateTable("StaffPayItem")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", item.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "StaffPayItem",
    entityId: item.id,
    entityLabel: `${person.number} ${item.label}`,
    subject: person.subject,
    changes,
  });
}

/** One typed in error, taken off with the reason. Payslips already closed keep their line. */
export async function deletePayItem(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; reason: string },
): Promise<void> {
  requirePay(ctx, "WRITE");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the change.");
  const item = await itemOf(ex, input.id);
  const person = await personOf(ex, item.staffId);
  await ex
    .updateTable("StaffPayItem")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now })
    .where("id", "=", item.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "PEOPLE",
    action: "SOFT_DELETE",
    reason,
    entity: "StaffPayItem",
    entityId: item.id,
    entityLabel: `${person.number} ${item.label}`,
    subject: person.subject,
  });
}

export interface PayItemRow {
  id: string;
  type: PayItemType;
  label: string;
  amount: number;
  contributable: boolean;
  taxable: boolean;
  fromDate: string;
  toDate: string | null;
  /** In force on the centre's today. */
  inForce: boolean;
}

export async function listPayItems(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffId: string },
): Promise<PayItemRow[]> {
  requirePay(ctx, "READ");
  const rows = await ex
    .selectFrom("StaffPayItem")
    .selectAll()
    .where("staffId", "=", input.staffId)
    .where("deletedAt", "is", null)
    .orderBy("fromDate", "desc")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    type: row.type as PayItemType,
    label: row.label,
    amount: row.amount,
    contributable: row.contributable === 1,
    taxable: row.taxable === 1,
    fromDate: row.fromDate,
    toDate: row.toDate,
    inForce: row.fromDate <= ctx.today && (row.toDate === null || row.toDate >= ctx.today),
  }));
}

// What the screens import.
export const listPayItemsQuery = query(listPayItems);
export const addPayItemAction = action(addPayItem, { revalidate: [HOURS_PATH] });
export const endPayItemAction = action(endPayItem, { revalidate: [HOURS_PATH] });
export const deletePayItemAction = action(deletePayItem, { revalidate: [HOURS_PATH] });
