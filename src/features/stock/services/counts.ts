import { isIsoDate } from "@/features/money/rules/dates";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, qty, toQty, type LocalDate } from "@/lib/units";

import { isWholeThousandths, MAX_QUANTITY } from "../validators/item";
import { STOCK_KINDS, type StockKind } from "../validators/option-codes";

import { addMovement } from "./movements";
import { INVENTORY_PATH } from "./paths";

/**
 * «الجرد»: counting the store against the record, one kind at a time (he
 * splits «جرد المعدات» and «جرد المواد»).
 *
 * Opening a count freezes what the record says of each item. The office types
 * what is on the shelf. Closing writes one `COUNT_ADJUST` movement per
 * difference, with the reason typed beside it, and the count is then final.
 */

export async function openCount(
  ex: Executor,
  ctx: ServiceContext,
  input: { kind: StockKind; date?: string | null; note?: string | null },
): Promise<{ id: string; number: string; lines: number }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  if (ctx.userId === null) throw new Error("stock: a count is opened by somebody");
  if (!(STOCK_KINDS as readonly string[]).includes(input.kind)) throw new Error(`stock: unknown kind ${input.kind}`);
  const typed = input.date ?? ctx.today;
  if (!isIsoDate(typed)) throw new ServiceError("Enter a valid date.");
  if (typed > ctx.today) throw new ServiceError("A count cannot be dated after today.");
  const date = localDate(typed);
  const open = await ex
    .selectFrom("InventoryCount")
    .select("id")
    .where("kind", "=", input.kind)
    .where("status", "=", "OPEN")
    .where("branchId", "=", ctx.branchId)
    .executeTakeFirst();
  if (open) throw new ServiceError("A count of this kind is already open.");

  const items = await ex
    .selectFrom("StockItem")
    .select(["id", "onHandQty"])
    .where("kind", "=", input.kind)
    .where("isActive", "=", 1)
    .where("deletedAt", "is", null)
    .orderBy("createdAt")
    .orderBy("code")
    .execute();
  const number = await nextNumber(ex, ctx, "COUNT", { date });
  const id = newId();
  await ex
    .insertInto("InventoryCount")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      date,
      kind: input.kind,
      status: "OPEN",
      countedByUserId: ctx.userId,
      note: input.note?.trim() || null,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  for (const item of items) {
    await ex
      .insertInto("InventoryCountLine")
      .values({
        id: newId(),
        countId: id,
        itemId: item.id,
        // Frozen now: what moves while the shelves are counted does not move the comparison.
        systemQty: item.onHandQty,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .execute();
  }
  return { id, number: number.display, lines: items.length };
}

/** What was found on the shelf for one line, in the item's unit. Typed again, it replaces what was typed. */
export async function saveCountLine(
  ex: Executor,
  ctx: ServiceContext,
  input: { lineId: string; countedQty: number; note?: string | null },
): Promise<{ id: string; difference: number }> {
  requireSection(ctx, "STOCK", "WRITE");
  if (!Number.isFinite(input.countedQty) || input.countedQty < 0)
    throw new ServiceError("A quantity cannot be negative.");
  if (input.countedQty > MAX_QUANTITY) throw new ServiceError("This quantity is too large.");
  if (!isWholeThousandths(input.countedQty)) throw new ServiceError("A quantity has at most three decimals.");
  const line = await ex
    .selectFrom("InventoryCountLine")
    .innerJoin("InventoryCount", "InventoryCount.id", "InventoryCountLine.countId")
    .select(["InventoryCountLine.id", "InventoryCountLine.systemQty", "InventoryCount.status"])
    .where("InventoryCountLine.id", "=", input.lineId)
    .executeTakeFirst();
  if (!line) throw new ServiceError("This count line does not exist.");
  if (line.status !== "OPEN") throw new ServiceError("This count is closed and can no longer be changed.");
  const counted = toQty(input.countedQty);
  const difference = counted - line.systemQty;
  await ex
    .updateTable("InventoryCountLine")
    .set({ countedQty: counted, difference: qty(difference), note: input.note?.trim() || null, updatedAt: ctx.now })
    .where("id", "=", line.id)
    .execute();
  return { id: line.id, difference };
}

/** Closes a count: every line was typed, every difference has its reason, and the record is brought to the shelf. */
export async function closeCount(
  ex: Executor,
  ctx: ServiceContext,
  input: { countId: string },
): Promise<{ id: string; adjusted: number }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const count = await ex
    .selectFrom("InventoryCount")
    .select(["id", "number", "status", "date"])
    .where("id", "=", input.countId)
    .executeTakeFirst();
  if (!count) throw new ServiceError("This count does not exist.");
  if (count.status !== "OPEN") throw new ServiceError("This count is closed and can no longer be changed.");
  const lines = await ex
    .selectFrom("InventoryCountLine")
    .select(["id", "itemId", "countedQty", "difference", "note"])
    .where("countId", "=", count.id)
    .execute();
  if (lines.some((line) => line.countedQty === null)) {
    throw new ServiceError("Type what was counted for every line before closing.");
  }
  if (lines.some((line) => (line.difference ?? 0) !== 0 && !line.note)) {
    throw new ServiceError("Say why the count differs from the record, on each line that does.");
  }

  let adjusted = 0;
  for (const line of lines) {
    const difference = line.difference ?? 0;
    if (difference === 0) continue;
    await addMovement(ex, ctx, {
      itemId: line.itemId,
      type: "COUNT_ADJUST",
      qty: difference,
      date: count.date,
      countLineId: line.id,
      reason: line.note,
    });
    adjusted += 1;
  }
  await ex
    .updateTable("InventoryCount")
    .set({
      status: "CLOSED",
      closedByUserId: ctx.userId,
      closedAt: ctx.now,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", count.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "STATUS_CHANGE",
    entity: "InventoryCount",
    entityId: count.id,
    entityLabel: count.number,
    changes: { status: ["OPEN", "CLOSED"] },
    context: { adjusted },
  });
  return { id: count.id, adjusted };
}

export interface CountSheet {
  id: string;
  number: string;
  date: LocalDate;
  kind: StockKind;
  status: "OPEN" | "CLOSED";
  lines: {
    id: string;
    itemId: string;
    itemName: string;
    unit: string;
    systemQty: number;
    countedQty: number | null;
    difference: number | null;
    note: string | null;
  }[];
}

export async function getCount(ex: Executor, ctx: ServiceContext, input: { countId: string }): Promise<CountSheet> {
  requireSection(ctx, "STOCK", "READ");
  const count = await ex.selectFrom("InventoryCount").selectAll().where("id", "=", input.countId).executeTakeFirst();
  if (!count) throw new ServiceError("This count does not exist.");
  const lines = await ex
    .selectFrom("InventoryCountLine")
    .innerJoin("StockItem", "StockItem.id", "InventoryCountLine.itemId")
    .select([
      "InventoryCountLine.id",
      "InventoryCountLine.itemId",
      "StockItem.nameAr as itemName",
      "StockItem.unit",
      "InventoryCountLine.systemQty",
      "InventoryCountLine.countedQty",
      "InventoryCountLine.difference",
      "InventoryCountLine.note",
    ])
    .where("InventoryCountLine.countId", "=", count.id)
    .orderBy("InventoryCountLine.createdAt")
    .orderBy("StockItem.code")
    .execute();
  return {
    id: count.id,
    number: count.number,
    date: count.date,
    kind: count.kind as StockKind,
    status: count.status === "CLOSED" ? "CLOSED" : "OPEN",
    lines,
  };
}

export interface CountListRow {
  id: string;
  number: string;
  date: LocalDate;
  kind: StockKind;
  status: "OPEN" | "CLOSED";
  lines: number;
  /** Lines typed so far. */
  typed: number;
}

/** The counts, the latest first: an open one is taken up again, a closed one is read. */
export async function listCounts(ex: Executor, ctx: ServiceContext): Promise<CountListRow[]> {
  requireSection(ctx, "STOCK", "READ");
  const counts = await ex
    .selectFrom("InventoryCount")
    .select(["id", "number", "date", "kind", "status"])
    .orderBy("date", "desc")
    .orderBy("numberSeq", "desc")
    .execute();
  if (counts.length === 0) return [];
  const lines = await ex
    .selectFrom("InventoryCountLine")
    .select(["countId", "countedQty"])
    .where(
      "countId",
      "in",
      counts.map((count) => count.id),
    )
    .execute();
  return counts.map((count) => {
    const own = lines.filter((line) => line.countId === count.id);
    return {
      id: count.id,
      number: count.number,
      date: count.date as LocalDate,
      kind: count.kind as StockKind,
      status: count.status === "CLOSED" ? "CLOSED" : "OPEN",
      lines: own.length,
      typed: own.filter((line) => line.countedQty !== null).length,
    };
  });
}

// ── What the screens call ────────────────────────────────────────────────────

export const COUNTS_PATH = `${INVENTORY_PATH}/counts`;

export const getCountQuery = query(getCount);
export const listCountsQuery = query((ex: Executor, ctx: ServiceContext) => listCounts(ex, ctx));
export const openCountAction = action(openCount, { revalidate: [INVENTORY_PATH, COUNTS_PATH] });
export const saveCountLineAction = action(saveCountLine, { revalidate: [COUNTS_PATH] });
export const closeCountAction = action(closeCount, { revalidate: [INVENTORY_PATH, COUNTS_PATH] });
