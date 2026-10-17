import { mulDivRound } from "@/features/money/rules/centimes";
import { isIsoDate } from "@/features/money/rules/dates";
import {
  EXPENSE_DIVISIONS,
  PAYMENT_METHODS,
  type ExpenseDivision,
  type PaymentMethod,
} from "@/features/money/validators/option-codes";
import { requireCapability, requireSection } from "@/lib/access/session";
import { linkUpload } from "@/lib/attachments";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, money, toQty, type LocalDate } from "@/lib/units";

import { isWholeThousandths, MAX_QUANTITY } from "../validators/item";

import { addMovement } from "./movements";
import { INVENTORY_PATH, PURCHASES_PATH } from "./paths";

/**
 * «المشتريات»: the centre buys in bulk ("the centre buys, not each worker",
 * his first study). Receiving a purchase puts its quantities in the store
 * through the ledger (`PURCHASE_IN`), moves each item's average cost, and
 * writes the expense it is: money out on that day, on the division it was
 * bought for or on «عام», read-only on the expenses screen.
 */

const text = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);

// ── Suppliers ────────────────────────────────────────────────────────────────

export interface SupplierInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  rc?: string | null;
  nif?: string | null;
  note?: string | null;
}

export async function createSupplier(ex: Executor, ctx: ServiceContext, input: SupplierInput): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  const name = input.name.trim();
  if (!name) throw new ServiceError("This field is required.");
  const id = newId();
  await ex
    .insertInto("Supplier")
    .values({
      id,
      name,
      phone: text(input.phone),
      address: text(input.address),
      rc: text(input.rc),
      nif: text(input.nif),
      note: text(input.note),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  return { id };
}

export async function listSuppliers(
  ex: Executor,
  ctx: ServiceContext,
): Promise<{ id: string; name: string; phone: string | null }[]> {
  requireSection(ctx, "STOCK", "READ");
  return ex
    .selectFrom("Supplier")
    .select(["id", "name", "phone"])
    .where("deletedAt", "is", null)
    .where("isActive", "=", 1)
    .orderBy("name")
    .execute();
}

// ── A purchase ───────────────────────────────────────────────────────────────

export interface PurchaseLineInput {
  itemId: string;
  /** In the item's unit, as typed. */
  qty: number;
  /** Centimes for one unit. */
  unitPrice: number;
}

export interface RecordPurchaseInput {
  date: string;
  supplierId: string;
  supplierInvoiceNo?: string | null;
  /** What it was bought for: one of his four divisions, or the centre as a whole. */
  division?: ExpenseDivision;
  method: PaymentMethod;
  lines: readonly PurchaseLineInput[];
  /** The scan of the supplier's invoice, saved before the action. */
  invoiceUrl?: string | null;
}

export async function recordPurchase(
  ex: Executor,
  ctx: ServiceContext,
  input: RecordPurchaseInput,
): Promise<{ id: string; number: string; total: number }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  if (ctx.userId === null) throw new Error("stock: a purchase is received by somebody");
  const division = input.division ?? "COMMON";
  if (!(EXPENSE_DIVISIONS as readonly string[]).includes(division))
    throw new Error(`stock: unknown division ${division}`);
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) {
    throw new Error(`stock: unknown payment method ${input.method}`);
  }
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date > ctx.today) throw new ServiceError("A purchase cannot be dated after today.");
  const date = localDate(input.date);

  const supplier = await ex
    .selectFrom("Supplier")
    .select(["id", "name"])
    .where("id", "=", input.supplierId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!supplier) throw new ServiceError("Choose the supplier.");
  if (input.lines.length === 0) throw new ServiceError("A purchase needs at least one line.");

  const prepared = [];
  for (const line of input.lines) {
    const item = await ex
      .selectFrom("StockItem")
      .select(["id", "kind", "tracking", "onHandQty", "avgCost"])
      .where("id", "=", line.itemId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!item) throw new ServiceError("This item does not exist.");
    if (!Number.isFinite(line.qty) || line.qty <= 0) throw new ServiceError("A quantity must be more than zero.");
    if (line.qty > MAX_QUANTITY) throw new ServiceError("This quantity is too large.");
    if (!isWholeThousandths(line.qty)) throw new ServiceError("A quantity has at most three decimals.");
    if (!Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0) {
      throw new ServiceError("A price cannot be negative.");
    }
    if (item.tracking === "UNIT" && !Number.isInteger(line.qty)) {
      throw new ServiceError("Pieces followed one by one are bought in whole numbers.");
    }
    const quantity = toQty(line.qty);
    prepared.push({ item, quantity, unitPrice: line.unitPrice, amount: mulDivRound(quantity, line.unitPrice, 1000) });
  }
  const total = prepared.reduce((sum, line) => sum + line.amount, 0);

  const number = await nextNumber(ex, ctx, "PURCHASE", { date });
  const id = newId();
  const invoiceUrl = text(input.invoiceUrl);
  await ex
    .insertInto("Purchase")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      date,
      supplierId: supplier.id,
      supplierInvoiceNo: text(input.supplierInvoiceNo),
      division,
      total: money(total),
      method: input.method,
      // Paid when received: an expense is money out, on that day.
      paidAmount: money(total),
      invoiceUrl,
      receivedByUserId: ctx.userId,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  if (invoiceUrl) await linkUpload(ex, ctx, invoiceUrl, id);

  // What the store held and cost before this purchase, per item: several lines may name one item.
  const held = new Map<string, { qty: number; cost: number }>();
  for (const [index, line] of prepared.entries()) {
    const lineId = newId();
    await ex
      .insertInto("PurchaseLine")
      .values({
        id: lineId,
        purchaseId: id,
        seq: index + 1,
        itemId: line.item.id,
        qty: line.quantity,
        unitPrice: money(line.unitPrice),
        amount: money(line.amount),
        createdAt: ctx.now,
      })
      .execute();

    if (line.item.tracking === "UNIT") {
      // One row per piece, each with its own number, each entering the store by its own movement.
      for (let piece = 0; piece < line.quantity / 1000; piece += 1) {
        const unitNumber = await nextNumber(ex, ctx, "EQUIPMENT_UNIT", { date });
        const unitId = newId();
        await ex
          .insertInto("EquipmentUnit")
          .values({
            id: unitId,
            itemId: line.item.id,
            numberSeq: unitNumber.seq,
            number: unitNumber.display,
            purchaseDate: date,
            purchaseCost: money(line.unitPrice),
            supplierId: supplier.id,
            condition: "GOOD",
            locationKind: "STORE",
            branchId: ctx.branchId,
            createdAt: ctx.now,
            updatedAt: ctx.now,
            createdByUserId: ctx.userId,
            updatedByUserId: ctx.userId,
          })
          .execute();
        await addMovement(ex, ctx, {
          itemId: line.item.id,
          unitId,
          type: "PURCHASE_IN",
          qty: 1000,
          unitCost: line.unitPrice,
          date,
          purchaseLineId: piece === 0 ? lineId : null,
        });
      }
    } else {
      await addMovement(ex, ctx, {
        itemId: line.item.id,
        type: "PURCHASE_IN",
        qty: line.quantity,
        unitCost: line.unitPrice,
        date,
        purchaseLineId: lineId,
      });
    }

    // The weighted average cost: what was on the shelf at its cost, and what came in at its price.
    const before = held.get(line.item.id) ?? { qty: Math.max(0, line.item.onHandQty), cost: line.item.avgCost };
    const after = before.qty + line.quantity;
    const cost = mulDivRound(before.qty * before.cost + line.quantity * line.unitPrice, 1, after);
    held.set(line.item.id, { qty: after, cost });
  }
  for (const [itemId, { cost }] of held) {
    await ex
      .updateTable("StockItem")
      .set({ avgCost: money(cost), updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", itemId)
      .execute();
  }

  // The expense it is: one row per kind bought, «مواد» and «معدات» being two lines of his profitability model.
  for (const [kind, category] of [
    ["MATERIAL", "MATERIALS"],
    ["EQUIPMENT", "EQUIPMENT"],
  ] as const) {
    const amount = prepared.filter((line) => line.item.kind === kind).reduce((sum, line) => sum + line.amount, 0);
    if (amount <= 0) continue;
    await ex
      .insertInto("Expense")
      .values({
        id: newId(),
        date,
        division,
        category,
        amount: money(amount),
        method: input.method,
        paidTo: supplier.name,
        supplierId: supplier.id,
        recurrence: "NONE",
        source: "PURCHASE",
        purchaseId: id,
        branchId: ctx.branchId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
  }

  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "CREATE",
    entity: "Purchase",
    entityId: id,
    entityLabel: number.display,
    context: { supplier: supplier.name, lines: prepared.length },
  });
  return { id, number: number.display, total };
}

/**
 * Cancels a purchase typed wrong (MON-08), with the reason typed: what it brought in leaves the store again by
 * `REVERSAL` movements (refused when part of it has already left), the pieces it made are retired, the average
 * cost is brought back to what it was without it, and its expense is reversed by an opposite entry on the
 * purchase's own day, so the month it was typed in comes out right. Nothing is deleted. The purchase is then
 * typed again as it should have been.
 */
export async function cancelPurchase(
  ex: Executor,
  ctx: ServiceContext,
  input: { purchaseId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const purchase = await ex.selectFrom("Purchase").selectAll().where("id", "=", input.purchaseId).executeTakeFirst();
  if (!purchase) throw new ServiceError("This purchase does not exist.");
  if (purchase.cancelledAt !== null) throw new ServiceError("This purchase is already cancelled.");

  const lines = await ex
    .selectFrom("PurchaseLine")
    .innerJoin("StockItem", "StockItem.id", "PurchaseLine.itemId")
    .select([
      "PurchaseLine.id",
      "PurchaseLine.itemId",
      "PurchaseLine.qty",
      "PurchaseLine.unitPrice",
      "StockItem.tracking",
      "StockItem.onHandQty",
      "StockItem.avgCost",
    ])
    .where("PurchaseLine.purchaseId", "=", purchase.id)
    .orderBy("PurchaseLine.seq")
    .execute();

  // What each item holds and costs as the lines are taken back one by one.
  const held = new Map<string, { qty: number; cost: number }>(
    lines.map((line) => [line.itemId, { qty: line.onHandQty, cost: line.avgCost }]),
  );
  for (const line of lines) {
    const item = held.get(line.itemId) ?? { qty: 0, cost: 0 };
    if (item.qty < line.qty) {
      throw new ServiceError("Part of this purchase has already left the store: it cannot be cancelled.");
    }
    if (line.tracking === "UNIT") {
      // The pieces this line made: bought with it, at the same instant, from the same supplier.
      const units = await ex
        .selectFrom("EquipmentUnit")
        .select(["id", "locationKind", "retiredAt"])
        .where("itemId", "=", line.itemId)
        .where("supplierId", "=", purchase.supplierId)
        .where("purchaseDate", "=", purchase.date)
        .where("createdAt", "=", purchase.createdAt)
        .orderBy("numberSeq")
        .execute();
      const pieces = units.slice(0, line.qty / 1000);
      if (pieces.length * 1000 !== line.qty || pieces.some((unit) => unit.locationKind !== "STORE" || unit.retiredAt)) {
        throw new ServiceError("Part of this purchase has already left the store: it cannot be cancelled.");
      }
      for (const unit of pieces) {
        const entered = await ex
          .selectFrom("StockMovement")
          .select("id")
          .where("unitId", "=", unit.id)
          .where("type", "=", "PURCHASE_IN")
          .executeTakeFirstOrThrow();
        await addMovement(ex, ctx, {
          itemId: line.itemId,
          unitId: unit.id,
          type: "REVERSAL",
          qty: -1000,
          unitCost: line.unitPrice,
          date: localDate(ctx.today),
          reversesMovementId: entered.id,
          reason,
        });
        await ex
          .updateTable("EquipmentUnit")
          .set({
            retiredAt: ctx.now,
            retireReason: "PURCHASE_CANCELLED",
            updatedAt: ctx.now,
            updatedByUserId: ctx.userId,
          })
          .where("id", "=", unit.id)
          .execute();
      }
    } else {
      const entered = await ex
        .selectFrom("StockMovement")
        .select("id")
        .where("purchaseLineId", "=", line.id)
        .where("type", "=", "PURCHASE_IN")
        .executeTakeFirstOrThrow();
      await addMovement(ex, ctx, {
        itemId: line.itemId,
        type: "REVERSAL",
        qty: -line.qty,
        unitCost: line.unitPrice,
        date: localDate(ctx.today),
        reversesMovementId: entered.id,
        reason,
      });
    }
    // The average without this line: what is left, at what it cost without the line's price in it.
    const left = item.qty - line.qty;
    const cost =
      left > 0 ? Math.max(0, mulDivRound(item.qty * item.cost - line.qty * line.unitPrice, 1, left)) : item.cost;
    held.set(line.itemId, { qty: left, cost });
  }
  for (const [itemId, { cost }] of held) {
    await ex
      .updateTable("StockItem")
      .set({ avgCost: money(cost), updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", itemId)
      .execute();
  }

  const expenses = await ex
    .selectFrom("Expense")
    .selectAll()
    .where("purchaseId", "=", purchase.id)
    .where("deletedAt", "is", null)
    .where("amount", ">", money(0))
    .execute();
  for (const expense of expenses) {
    await ex
      .insertInto("Expense")
      .values({
        id: newId(),
        date: expense.date,
        division: expense.division,
        category: expense.category,
        amount: money(-expense.amount),
        method: expense.method,
        paidTo: expense.paidTo,
        supplierId: expense.supplierId,
        recurrence: "NONE",
        source: "PURCHASE",
        purchaseId: purchase.id,
        note: `إلغاء الشراء رقم ${purchase.number}: ${reason}`,
        branchId: expense.branchId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
  }

  await ex
    .updateTable("Purchase")
    .set({
      cancelledAt: ctx.now,
      cancelledByUserId: ctx.userId,
      cancelReason: reason,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", purchase.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "CANCEL",
    reason,
    entity: "Purchase",
    entityId: purchase.id,
    entityLabel: purchase.number,
    context: { lines: lines.length, expensesReversed: expenses.length },
  });
  return { id: purchase.id };
}

export interface PurchaseListRow {
  id: string;
  number: string;
  date: LocalDate;
  supplierName: string;
  supplierInvoiceNo: string | null;
  division: ExpenseDivision;
  method: PaymentMethod;
  total: number;
  lines: number;
  cancelled: boolean;
}

export async function listPurchases(ex: Executor, ctx: ServiceContext): Promise<PurchaseListRow[]> {
  requireSection(ctx, "STOCK", "READ");
  const rows = await ex
    .selectFrom("Purchase")
    .innerJoin("Supplier", "Supplier.id", "Purchase.supplierId")
    .select([
      "Purchase.id",
      "Purchase.number",
      "Purchase.date",
      "Supplier.name as supplierName",
      "Purchase.supplierInvoiceNo",
      "Purchase.division",
      "Purchase.method",
      "Purchase.total",
      "Purchase.cancelledAt",
    ])
    .select(({ selectFrom }) =>
      selectFrom("PurchaseLine")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .whereRef("PurchaseLine.purchaseId", "=", "Purchase.id")
        .as("lines"),
    )
    .orderBy("Purchase.date", "desc")
    .orderBy("Purchase.numberSeq", "desc")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    date: row.date,
    supplierName: row.supplierName,
    supplierInvoiceNo: row.supplierInvoiceNo,
    division: row.division as ExpenseDivision,
    method: row.method as PaymentMethod,
    total: row.total,
    lines: Number(row.lines ?? 0),
    cancelled: row.cancelledAt !== null,
  }));
}

// ── What the screens call ────────────────────────────────────────────────────

export const listSuppliersQuery = query((ex: Executor, ctx: ServiceContext) => listSuppliers(ex, ctx));
export const listPurchasesQuery = query((ex: Executor, ctx: ServiceContext) => listPurchases(ex, ctx));
export const createSupplierAction = action(createSupplier, { revalidate: [PURCHASES_PATH] });
export const recordPurchaseAction = action(recordPurchase, {
  revalidate: [PURCHASES_PATH, INVENTORY_PATH, "/dashboard/expenses"],
});
export const cancelPurchaseAction = action(cancelPurchase, {
  revalidate: [PURCHASES_PATH, INVENTORY_PATH, "/dashboard/expenses", "/dashboard/maintenance"],
});
