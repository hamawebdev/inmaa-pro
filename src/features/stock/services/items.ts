import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { toQty } from "@/lib/units";
import type { z } from "zod";

import { newStockItemSchema, stockItemSchema, type NewStockItemValues, type StockItemValues } from "../validators/item";
import type { StockItemView } from "../views";

import { addMovement } from "./movements";
import { INVENTORY_PATH } from "./paths";

/**
 * «جرد المخزون»: the items of the store, in his two kinds, «المعدات» and
 * «المواد», each with its unit and its minimum.
 *
 * An item's quantity is never typed into it: it is what its movements add up
 * to (a purchase, a hand-out, a return, a count). A new item may start with
 * what is on the shelf today, written as its first movement.
 */

const VIEW_COLUMNS = [
  "id",
  "code",
  "nameAr",
  "nameFr",
  "nameEn",
  "kind",
  "category",
  "unit",
  "tracking",
  "minLevel",
  "onHandQty",
  "isActive",
] as const;

/** Every item of the store, in the order it was added. Removed ones are left out. */
export async function listInventory(ex: Executor, ctx: ServiceContext): Promise<StockItemView[]> {
  requireSection(ctx, "STOCK", "READ");
  const rows = await ex
    .selectFrom("StockItem")
    .select([...VIEW_COLUMNS])
    .where("deletedAt", "is", null)
    .orderBy("createdAt")
    .orderBy("code")
    .execute();
  return rows.map((row) => ({ ...row, isActive: row.isActive === 1 }));
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, values: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(values);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  return parsed.data as z.infer<Schema>;
}

function columnsOf(values: StockItemValues) {
  return {
    nameAr: values.nameAr,
    nameFr: values.nameFr ?? null,
    nameEn: values.nameEn ?? null,
    kind: values.kind,
    category: values.category ?? null,
    unit: values.unit,
    tracking: values.tracking,
    minLevel: values.minLevel === undefined ? null : toQty(values.minLevel),
    note: values.note ?? null,
  };
}

/** A code for an item nobody named one for: `MAT-0007`, `EQP-0003`, the next that is free. */
async function nextCode(ex: Executor, kind: string): Promise<string> {
  const prefix = kind === "EQUIPMENT" ? "EQP" : "MAT";
  const taken = new Set(
    (await ex.selectFrom("StockItem").select("code").where("code", "like", `${prefix}-%`).execute()).map(
      (row) => row.code,
    ),
  );
  for (let number = taken.size + 1; ; number += 1) {
    const code = `${prefix}-${String(number).padStart(4, "0")}`;
    if (!taken.has(code)) return code;
  }
}

export interface CreateStockItemInput {
  values: NewStockItemValues;
  /** A code the office or the demo data names the item by. Left out, the next free one. */
  code?: string | null;
}

export async function createStockItem(
  ex: Executor,
  ctx: ServiceContext,
  input: CreateStockItemInput,
): Promise<{ id: string; code: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  const values = parse(newStockItemSchema, input.values);
  const typed = input.code?.trim() || null;
  if (typed && (await ex.selectFrom("StockItem").select("id").where("code", "=", typed).executeTakeFirst())) {
    throw new ServiceError("An item with this code already exists.");
  }
  const code = typed ?? (await nextCode(ex, values.kind));
  const id = newId();
  await ex
    .insertInto("StockItem")
    .values({
      id,
      code,
      ...columnsOf(values),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  if (values.openingQty !== undefined && values.openingQty > 0) {
    await addMovement(ex, ctx, { itemId: id, type: "OPENING", qty: toQty(values.openingQty), date: ctx.today });
  }
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "CREATE",
    entity: "StockItem",
    entityId: id,
    entityLabel: values.nameAr,
    context: { code, kind: values.kind },
  });
  return { id, code };
}

export async function updateStockItem(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; values: StockItemValues; isActive?: boolean },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  const values = parse(stockItemSchema, input.values);
  const before = await ex.selectFrom("StockItem").selectAll().where("id", "=", input.id).executeTakeFirst();
  if (!before || before.deletedAt !== null) throw new ServiceError("This item does not exist.");
  // Only what changed is sent: `onHandQty` is kept by the ledger and is never named here.
  const { set, changes } = changedColumns(before, {
    ...columnsOf(values),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive ? 1 : 0 }),
  });
  if (!changes) return { id: before.id };
  await ex
    .updateTable("StockItem")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "UPDATE",
    entity: "StockItem",
    entityId: before.id,
    entityLabel: before.nameAr,
    changes,
  });
  return { id: before.id };
}

// ── What the screens call ────────────────────────────────────────────────────

export const listInventoryQuery = query((ex: Executor, ctx: ServiceContext) => listInventory(ex, ctx));
export const createStockItemAction = action(createStockItem, { revalidate: [INVENTORY_PATH] });
export const updateStockItemAction = action(updateStockItem, { revalidate: [INVENTORY_PATH] });
