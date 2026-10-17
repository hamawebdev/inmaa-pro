import { addDays, isIsoDate } from "@/features/money/rules/dates";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { localDate, money, type LocalDate } from "@/lib/units";

import { maintenanceAlert, type MaintenanceAlert } from "../rules/alerts";
import {
  EQUIPMENT_LOCATIONS,
  ITEM_CONDITIONS,
  MAINTENANCE_KINDS,
  type EquipmentLocation,
  type ItemCondition,
  type MaintenanceKind,
} from "../validators/option-codes";

import { addMovement } from "./movements";
import { MAINTENANCE_PATH } from "./paths";

/**
 * «الصيانة» (feature 35): the pieces of equipment followed one by one, when
 * each is next to be serviced, and what was done to it.
 *
 * A piece is made by the purchase that brought it (services/purchases.ts).
 * Here it is given its interval, and each service or repair is recorded: the
 * record moves the piece's last and next dates and its condition, and what it
 * cost goes into the expenses (`source = MAINTENANCE`, on «عام»: a machine
 * serves every division).
 */

export interface EquipmentUnitRow {
  id: string;
  number: string;
  itemId: string;
  /** The item's name; the screen picks the reader's language, Arabic when it has none. */
  itemName: string;
  itemNameFr: string | null;
  itemNameEn: string | null;
  serialNumber: string | null;
  condition: ItemCondition;
  location: EquipmentLocation;
  intervalDays: number | null;
  lastMaintenanceDate: LocalDate | null;
  nextMaintenanceDate: LocalDate | null;
  /** What the maintenance tile counts it for, or nothing. */
  alert: MaintenanceAlert | null;
}

const oneOf = <T extends string>(list: readonly T[], value: string, fallback: T): T =>
  (list as readonly string[]).includes(value) ? (value as T) : fallback;

/** Every piece still in use, those to see to first. */
export async function listEquipmentUnits(ex: Executor, ctx: ServiceContext): Promise<EquipmentUnitRow[]> {
  requireSection(ctx, "STOCK", "READ");
  const leadDays = await getSetting(ex, "alerts.maintenanceLeadDays");
  const rows = await ex
    .selectFrom("EquipmentUnit")
    .innerJoin("StockItem", "StockItem.id", "EquipmentUnit.itemId")
    .select([
      "EquipmentUnit.id",
      "EquipmentUnit.number",
      "EquipmentUnit.itemId",
      "StockItem.nameAr as itemName",
      "StockItem.nameFr as itemNameFr",
      "StockItem.nameEn as itemNameEn",
      "EquipmentUnit.serialNumber",
      "EquipmentUnit.condition",
      "EquipmentUnit.locationKind",
      "EquipmentUnit.maintenanceIntervalDays",
      "EquipmentUnit.lastMaintenanceDate",
      "EquipmentUnit.nextMaintenanceDate",
    ])
    .where("EquipmentUnit.retiredAt", "is", null)
    .orderBy("EquipmentUnit.numberSeq")
    .execute();
  return rows
    .map((row): EquipmentUnitRow => {
      const condition = oneOf<ItemCondition>(ITEM_CONDITIONS, row.condition, "GOOD");
      return {
        id: row.id,
        number: row.number,
        itemId: row.itemId,
        itemName: row.itemName,
        itemNameFr: row.itemNameFr,
        itemNameEn: row.itemNameEn,
        serialNumber: row.serialNumber,
        condition,
        location: oneOf<EquipmentLocation>(EQUIPMENT_LOCATIONS, row.locationKind, "STORE"),
        intervalDays: row.maintenanceIntervalDays,
        lastMaintenanceDate: (row.lastMaintenanceDate as LocalDate | null) ?? null,
        nextMaintenanceDate: (row.nextMaintenanceDate as LocalDate | null) ?? null,
        alert: maintenanceAlert(
          { retired: false, condition, nextMaintenanceDate: row.nextMaintenanceDate },
          ctx.today,
          leadDays,
        ),
      };
    })
    .sort((a, b) => Number(b.alert !== null) - Number(a.alert !== null));
}

async function unitOf(ex: Executor, unitId: string) {
  const unit = await ex.selectFrom("EquipmentUnit").selectAll().where("id", "=", unitId).executeTakeFirst();
  if (!unit || unit.retiredAt !== null) throw new ServiceError("This piece of equipment does not exist.");
  return unit;
}

/** How often a piece is serviced, and when next. An empty interval takes it off the calendar. */
export async function setMaintenancePlan(
  ex: Executor,
  ctx: ServiceContext,
  input: { unitId: string; intervalDays: number | null; nextDate?: string | null },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const unit = await unitOf(ex, input.unitId);
  const interval = input.intervalDays;
  if (interval !== null && (!Number.isInteger(interval) || interval < 1 || interval > 3650)) {
    throw new ServiceError("A maintenance interval is a number of days, from 1 to 3650.");
  }
  if (input.nextDate && !isIsoDate(input.nextDate)) throw new ServiceError("Enter a valid date.");
  // With no date typed, the next service is one interval after the last one, or after today.
  const next = interval === null ? null : (input.nextDate ?? addDays(unit.lastMaintenanceDate ?? ctx.today, interval));
  const { set, changes } = changedColumns(unit, {
    maintenanceIntervalDays: interval,
    nextMaintenanceDate: next === null ? null : localDate(next),
  });
  if (!changes) return { id: unit.id };
  await ex
    .updateTable("EquipmentUnit")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", unit.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "UPDATE",
    entity: "EquipmentUnit",
    entityId: unit.id,
    entityLabel: unit.number,
    changes,
  });
  return { id: unit.id };
}

export interface RecordMaintenanceInput {
  unitId: string;
  date: string;
  kind: MaintenanceKind;
  /** What was done. */
  description: string;
  /** Centimes. Zero when the centre did it itself. */
  cost?: number;
  provider?: string | null;
  conditionAfter: ItemCondition;
}

/** A service or a repair done on a piece: its dates and condition move, and its cost goes into the expenses. */
export async function recordMaintenance(
  ex: Executor,
  ctx: ServiceContext,
  input: RecordMaintenanceInput,
): Promise<{ id: string; nextDueDate: string | null }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const unit = await unitOf(ex, input.unitId);
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date > ctx.today) throw new ServiceError("A maintenance cannot be dated after today.");
  if (!(MAINTENANCE_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`stock: unknown maintenance kind ${input.kind}`);
  }
  if (!(ITEM_CONDITIONS as readonly string[]).includes(input.conditionAfter)) {
    throw new ServiceError("Say in what condition the equipment is after the maintenance.");
  }
  const description = input.description.trim();
  if (!description) throw new ServiceError("Write what was done.");
  const cost = input.cost ?? 0;
  if (!Number.isSafeInteger(cost) || cost < 0) throw new ServiceError("A price cannot be negative.");
  const provider = input.provider?.trim() || null;

  const date = localDate(input.date);
  const nextDueDate =
    unit.maintenanceIntervalDays === null ? null : localDate(addDays(date, unit.maintenanceIntervalDays));
  const id = newId();
  await ex
    .insertInto("MaintenanceRecord")
    .values({
      id,
      unitId: unit.id,
      kind: input.kind,
      date,
      description,
      cost: money(cost),
      provider,
      conditionAfter: input.conditionAfter,
      nextDueDate,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();

  // The piece follows its latest record only: an older one typed late does not move its dates back.
  if (unit.lastMaintenanceDate === null || date >= unit.lastMaintenanceDate) {
    await ex
      .updateTable("EquipmentUnit")
      .set({
        lastMaintenanceDate: date,
        nextMaintenanceDate: nextDueDate,
        condition: input.conditionAfter,
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", unit.id)
      .execute();
  }

  if (cost > 0) {
    await ex
      .insertInto("Expense")
      .values({
        id: newId(),
        date,
        division: "COMMON",
        category: "MAINTENANCE",
        amount: money(cost),
        method: null,
        paidTo: provider,
        recurrence: "NONE",
        source: "MAINTENANCE",
        maintenanceRecordId: id,
        note: `${description} (${unit.number})`,
        branchId: unit.branchId,
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
    entity: "MaintenanceRecord",
    entityId: id,
    entityLabel: unit.number,
    context: { kind: input.kind, date, conditionAfter: input.conditionAfter },
  });
  return { id, nextDueDate };
}

/**
 * Takes a piece out of service for good (MON-14), with the reason typed: lost, broken beyond repair, sold.
 * A piece still on the shelf leaves the store by a `WRITE_OFF`; one already out of it (with a worker, at a
 * site) only stops being followed.
 */
export async function retireUnit(
  ex: Executor,
  ctx: ServiceContext,
  input: { unitId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const unit = await unitOf(ex, input.unitId);
  if (unit.locationKind === "STORE" || unit.locationKind === "IN_MAINTENANCE") {
    const item = await ex
      .selectFrom("StockItem")
      .select("avgCost")
      .where("id", "=", unit.itemId)
      .executeTakeFirstOrThrow();
    await addMovement(ex, ctx, {
      itemId: unit.itemId,
      unitId: unit.id,
      type: "WRITE_OFF",
      qty: -1000,
      unitCost: item.avgCost,
      date: localDate(ctx.today),
      reason,
    });
  }
  await ex
    .updateTable("EquipmentUnit")
    .set({ retiredAt: ctx.now, retireReason: reason, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", unit.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "STATUS_CHANGE",
    reason,
    entity: "EquipmentUnit",
    entityId: unit.id,
    entityLabel: unit.number,
    changes: { retiredAt: [null, ctx.now] },
  });
  return { id: unit.id };
}

/**
 * Brings back to the store a piece no hand-out expects any more (MON-14): one that came back damaged and stayed
 * with the worker, or was found again at a site. It enters the store again by a `RETURN_IN`, with the reason.
 */
export async function bringUnitToStore(
  ex: Executor,
  ctx: ServiceContext,
  input: { unitId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const unit = await unitOf(ex, input.unitId);
  if (unit.locationKind === "STORE") throw new ServiceError("This piece is already in the store.");
  const lines = await ex
    .selectFrom("HandOutLine")
    .innerJoin("HandOut", "HandOut.id", "HandOutLine.handOutId")
    .select(["HandOutLine.id", "HandOutLine.qty"])
    .where("HandOutLine.unitId", "=", unit.id)
    .where("HandOut.cancelledAt", "is", null)
    .execute();
  for (const line of lines) {
    const back = await ex
      .selectFrom("HandOutReturn")
      .select(["qtyReturned", "qtyLost", "qtyDamaged"])
      .where("handOutLineId", "=", line.id)
      .execute();
    const settled = back.reduce((sum, row) => sum + row.qtyReturned + row.qtyLost + row.qtyDamaged, 0);
    if (settled < line.qty) {
      throw new ServiceError("A hand-out still expects this piece back: record its return on the hand-out.");
    }
  }
  const item = await ex
    .selectFrom("StockItem")
    .select("avgCost")
    .where("id", "=", unit.itemId)
    .executeTakeFirstOrThrow();
  await addMovement(ex, ctx, {
    itemId: unit.itemId,
    unitId: unit.id,
    type: "RETURN_IN",
    qty: 1000,
    unitCost: item.avgCost,
    date: localDate(ctx.today),
    reason,
  });
  const { set, changes } = changedColumns(unit, {
    locationKind: "STORE",
    locationWorkerId: null,
    locationFileId: null,
    locationSiteId: null,
  });
  await ex
    .updateTable("EquipmentUnit")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", unit.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "UPDATE",
    entity: "EquipmentUnit",
    entityId: unit.id,
    entityLabel: unit.number,
    changes: changes ?? undefined,
    reason,
  });
  return { id: unit.id };
}

/** The records whose cost was reversed: cancelled (MON-08). */
async function cancelledRecords(ex: Executor, recordIds: readonly string[]): Promise<Set<string>> {
  if (recordIds.length === 0) return new Set();
  const rows = await ex
    .selectFrom("Expense")
    .select("maintenanceRecordId")
    .where("maintenanceRecordId", "in", [...recordIds])
    .where("amount", "<", money(0))
    .execute();
  return new Set(rows.flatMap((row) => (row.maintenanceRecordId ? [row.maintenanceRecordId] : [])));
}

/**
 * Cancels a maintenance record typed wrong (MON-08), with the reason typed: its cost is reversed by an opposite
 * entry on its own day, never deleted, and when it was the piece's latest the piece goes back to the record
 * before it. A record that cost nothing has no money to correct: its piece's dates are corrected in its plan.
 */
export async function cancelMaintenanceRecord(
  ex: Executor,
  ctx: ServiceContext,
  input: { recordId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const record = await ex
    .selectFrom("MaintenanceRecord")
    .selectAll()
    .where("id", "=", input.recordId)
    .executeTakeFirst();
  if (!record) throw new ServiceError("This maintenance record does not exist.");
  if ((await cancelledRecords(ex, [record.id])).has(record.id)) {
    throw new ServiceError("This maintenance record is already cancelled.");
  }
  if (record.cost <= 0) {
    throw new ServiceError("This maintenance cost nothing: correct the piece's next date in its plan.");
  }
  const unit = await ex
    .selectFrom("EquipmentUnit")
    .selectAll()
    .where("id", "=", record.unitId)
    .executeTakeFirstOrThrow();

  const expense = await ex
    .selectFrom("Expense")
    .selectAll()
    .where("maintenanceRecordId", "=", record.id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  await ex
    .insertInto("Expense")
    .values({
      id: newId(),
      date: localDate(record.date),
      division: expense?.division ?? "COMMON",
      category: "MAINTENANCE",
      amount: money(-record.cost),
      method: null,
      paidTo: record.provider,
      recurrence: "NONE",
      source: "MAINTENANCE",
      maintenanceRecordId: record.id,
      note: `إلغاء صيانة (${unit.number}): ${reason}`,
      branchId: expense?.branchId ?? unit.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();

  // The piece follows its latest record still standing.
  const others = await ex
    .selectFrom("MaintenanceRecord")
    .selectAll()
    .where("unitId", "=", unit.id)
    .where("id", "!=", record.id)
    .orderBy("date", "desc")
    .orderBy("createdAt", "desc")
    .execute();
  const cancelled = await cancelledRecords(
    ex,
    others.map((other) => other.id),
  );
  const latest = others.find((other) => !cancelled.has(other.id)) ?? null;
  if (unit.lastMaintenanceDate === record.date && (latest === null || latest.date <= record.date)) {
    const fallbackNext =
      unit.maintenanceIntervalDays === null
        ? null
        : localDate(addDays(unit.purchaseDate ?? ctx.today, unit.maintenanceIntervalDays));
    const { set, changes } = changedColumns(unit, {
      lastMaintenanceDate: latest ? localDate(latest.date) : null,
      nextMaintenanceDate: latest ? (latest.nextDueDate === null ? null : localDate(latest.nextDueDate)) : fallbackNext,
      condition: latest ? latest.conditionAfter : unit.condition,
    });
    if (changes) {
      await ex
        .updateTable("EquipmentUnit")
        .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", unit.id)
        .execute();
    }
  }
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "CANCEL",
    reason,
    entity: "MaintenanceRecord",
    entityId: record.id,
    entityLabel: unit.number,
    context: { cost: "reversed" },
  });
  return { id: record.id };
}

export interface MaintenanceLine {
  id: string;
  date: LocalDate;
  kind: MaintenanceKind;
  description: string;
  cost: number;
  provider: string | null;
  conditionAfter: ItemCondition;
  /** Cancelled with its cost reversed (MON-08). */
  cancelled: boolean;
}

/** What was done to a piece, the latest first. */
export async function listMaintenance(
  ex: Executor,
  ctx: ServiceContext,
  input: { unitId: string },
): Promise<MaintenanceLine[]> {
  requireSection(ctx, "STOCK", "READ");
  const rows = await ex
    .selectFrom("MaintenanceRecord")
    .select(["id", "date", "kind", "description", "cost", "provider", "conditionAfter"])
    .where("unitId", "=", input.unitId)
    .orderBy("date", "desc")
    .orderBy("createdAt", "desc")
    .execute();
  const cancelled = await cancelledRecords(
    ex,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    date: row.date as LocalDate,
    kind: oneOf<MaintenanceKind>(MAINTENANCE_KINDS, row.kind, "PREVENTIVE"),
    description: row.description,
    cost: row.cost,
    provider: row.provider,
    conditionAfter: oneOf<ItemCondition>(ITEM_CONDITIONS, row.conditionAfter, "GOOD"),
    cancelled: cancelled.has(row.id),
  }));
}

// ── What the screens call ────────────────────────────────────────────────────

const REFRESH = [MAINTENANCE_PATH, "/dashboard/expenses", "/dashboard/reports"] as const;

export const listEquipmentUnitsQuery = query((ex: Executor, ctx: ServiceContext) => listEquipmentUnits(ex, ctx));
export const listMaintenanceQuery = query(listMaintenance);
export const setMaintenancePlanAction = action(setMaintenancePlan, { revalidate: [MAINTENANCE_PATH] });
export const recordMaintenanceAction = action(recordMaintenance, { revalidate: [...REFRESH] });
export const cancelMaintenanceRecordAction = action(cancelMaintenanceRecord, { revalidate: [...REFRESH] });
export const retireUnitAction = action(retireUnit, { revalidate: [MAINTENANCE_PATH, "/dashboard/inventory"] });
export const bringUnitToStoreAction = action(bringUnitToStore, {
  revalidate: [MAINTENANCE_PATH, "/dashboard/inventory"],
});
