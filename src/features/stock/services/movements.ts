import { newId } from "@/lib/db/rows";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { money, qty, type LocalDate } from "@/lib/units";

/**
 * The stock ledger. Every quantity that enters or leaves the store is one row
 * of `StockMovement`, never changed afterwards: a wrong row is undone by a
 * `REVERSAL` row that points at it. `StockItem.onHandQty` is the sum of an
 * item's rows, kept by a trigger: nothing here, and nothing anywhere, sets it.
 */
export const MOVEMENT_TYPES = [
  "OPENING",
  "PURCHASE_IN",
  "HANDOUT_OUT",
  "RETURN_IN",
  "COUNT_ADJUST",
  "WRITE_OFF",
  "REVERSAL",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface MovementInput {
  itemId: string;
  unitId?: string | null;
  type: MovementType;
  /** Thousandths, signed: positive into the store, negative out of it. */
  qty: number;
  /** Centimes per unit, at that moment. */
  unitCost?: number;
  date: LocalDate;
  handOutLineId?: string | null;
  handOutReturnId?: string | null;
  purchaseLineId?: string | null;
  countLineId?: string | null;
  reversesMovementId?: string | null;
  reason?: string | null;
}

export async function addMovement(ex: Executor, ctx: ServiceContext, input: MovementInput): Promise<string> {
  if (ctx.userId === null) throw new Error("stock: a movement is written for somebody");
  const id = newId();
  await ex
    .insertInto("StockMovement")
    .values({
      id,
      itemId: input.itemId,
      unitId: input.unitId ?? null,
      type: input.type,
      qty: qty(input.qty),
      unitCost: money(input.unitCost ?? 0),
      date: input.date,
      handOutLineId: input.handOutLineId ?? null,
      handOutReturnId: input.handOutReturnId ?? null,
      purchaseLineId: input.purchaseLineId ?? null,
      countLineId: input.countLineId ?? null,
      reversesMovementId: input.reversesMovementId ?? null,
      reason: input.reason ?? null,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    })
    .execute();
  return id;
}
