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
  itemName: string;
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

export interface MaintenanceLine {
  id: string;
  date: LocalDate;
  kind: MaintenanceKind;
  description: string;
  cost: number;
  provider: string | null;
  conditionAfter: ItemCondition;
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
  return rows.map((row) => ({
    id: row.id,
    date: row.date as LocalDate,
    kind: oneOf<MaintenanceKind>(MAINTENANCE_KINDS, row.kind, "PREVENTIVE"),
    description: row.description,
    cost: row.cost,
    provider: row.provider,
    conditionAfter: oneOf<ItemCondition>(ITEM_CONDITIONS, row.conditionAfter, "GOOD"),
  }));
}

// ── What the screens call ────────────────────────────────────────────────────

const REFRESH = [MAINTENANCE_PATH, "/dashboard/expenses", "/dashboard/reports"] as const;

export const listEquipmentUnitsQuery = query((ex: Executor, ctx: ServiceContext) => listEquipmentUnits(ex, ctx));
export const listMaintenanceQuery = query(listMaintenance);
export const setMaintenancePlanAction = action(setMaintenancePlan, { revalidate: [MAINTENANCE_PATH] });
export const recordMaintenanceAction = action(recordMaintenance, { revalidate: [...REFRESH] });
