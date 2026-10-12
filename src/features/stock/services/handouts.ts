import type { z } from "zod";

import { addDays, isIsoDate } from "@/features/money/rules/dates";
import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logCollect, logDisclose } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { localDate, qty, toQty, type LocalDate } from "@/lib/units";

import type { HandoutSlipData } from "../sheets/handout-slip-sheet";
import { handOutLineSchema, type HandOutLineValues } from "../validators/item";
import {
  DIVISIONS,
  HANDOUT_PURPOSES,
  ITEM_CONDITIONS,
  SERVICE_TYPES,
  STOCK_KINDS,
  UNITS,
  type Division,
  type HandoutPurpose,
  type ItemCondition,
  type ServiceType,
  type StockKind,
  type Unit,
} from "../validators/option-codes";

import { addMovement } from "./movements";
import { HANDOUTS_PATH, INVENTORY_PATH } from "./paths";

/**
 * «التسليم» (his note, section 5): what leaves the store is recorded against
 * a job, to a named worker, on a day, and equipment comes back.
 *
 * A hand-out holds lines of both kinds. Each line takes its quantity out of
 * the store through the ledger (`HANDOUT_OUT`); a return puts back what came
 * back (`RETURN_IN`), and says what was lost or damaged, which People's
 * violations block then shows (`handout.returnedShort`). A hand-out typed by
 * mistake is cancelled with a reason (reversing movements), never edited.
 */

// ── Recording ────────────────────────────────────────────────────────────────

export interface CreateHandOutInput {
  date: string;
  purpose: HandoutPurpose;
  /** The job. Required unless the hand-out is a worker's own kit. */
  fileId?: string | null;
  /** The visit it is for: the mission order then prints it. */
  visitId?: string | null;
  /** The named recipient. */
  workerId: string;
  /** Quantities in the item's unit, as typed. */
  lines: readonly HandOutLineValues[];
  note?: string | null;
}

const text = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);

function parseLine(values: unknown): z.infer<typeof handOutLineSchema> {
  const parsed = handOutLineSchema.safeParse(values);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  return parsed.data;
}

export async function createHandOut(
  ex: Executor,
  ctx: ServiceContext,
  input: CreateHandOutInput,
): Promise<{ id: string; number: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  if (ctx.userId === null) throw new Error("stock: a hand-out is recorded by somebody");
  if (!(HANDOUT_PURPOSES as readonly string[]).includes(input.purpose)) {
    throw new Error(`stock: unknown hand-out purpose ${input.purpose}`);
  }
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date > ctx.today) throw new ServiceError("A hand-out cannot be dated after today.");
  const date = localDate(input.date);

  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "number", "firstName", "lastName"])
    .where("id", "=", input.workerId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!worker) throw new ServiceError("Choose the worker who receives the hand-out.");

  const fileId = input.purpose === "JOB" ? text(input.fileId) : null;
  if (input.purpose === "JOB" && !fileId) throw new ServiceError("Choose the job this hand-out is for.");
  const file = fileId
    ? await ex
        .selectFrom("File")
        .select(["id", "number", "division", "serviceType", "siteId", "branchId"])
        .where("id", "=", fileId)
        .where("deletedAt", "is", null)
        .executeTakeFirst()
    : undefined;
  if (fileId && !file) throw new ServiceError("This file does not exist.");
  const visitId = file ? text(input.visitId) : null;
  if (visitId) {
    const visit = await ex.selectFrom("Visit").select("fileId").where("id", "=", visitId).executeTakeFirst();
    if (!visit || visit.fileId !== file?.id) throw new ServiceError("This visit is not one of this file's visits.");
  }

  if (input.lines.length === 0) throw new ServiceError("A hand-out needs at least one line.");
  const lines = input.lines.map(parseLine);
  const items = await ex
    .selectFrom("StockItem")
    .select(["id", "nameAr", "kind", "tracking", "onHandQty", "avgCost", "isActive"])
    .where(
      "id",
      "in",
      lines.map((line) => line.itemId),
    )
    .where("deletedAt", "is", null)
    .execute();

  // What is asked of each item, over all its lines, against what the store holds.
  const asked = new Map<string, number>();
  const usedUnits = new Set<string>();
  const prepared = [];
  for (const line of lines) {
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (!item || item.isActive !== 1) throw new ServiceError("This item does not exist.");
    const equipment = item.kind === "EQUIPMENT";
    if (equipment && !line.condition) throw new ServiceError("Say in what condition the equipment is handed over.");
    let quantity = toQty(line.qty);
    let unitId: string | null = null;
    if (item.tracking === "UNIT") {
      unitId = line.unitId ?? null;
      if (!unitId) throw new ServiceError("Choose which piece is handed over.");
      const unit = await ex
        .selectFrom("EquipmentUnit")
        .select(["id", "itemId", "locationKind", "retiredAt"])
        .where("id", "=", unitId)
        .executeTakeFirst();
      if (
        !unit ||
        unit.itemId !== item.id ||
        unit.retiredAt !== null ||
        unit.locationKind !== "STORE" ||
        usedUnits.has(unitId)
      ) {
        throw new ServiceError("This piece is not in the store.");
      }
      usedUnits.add(unitId);
      // One piece is one piece.
      quantity = qty(1000);
    }
    asked.set(item.id, (asked.get(item.id) ?? 0) + quantity);
    if ((asked.get(item.id) ?? 0) > item.onHandQty) {
      throw new ServiceError("There is not enough of this item in the store.");
    }
    prepared.push({ line, item, equipment, quantity, unitId });
  }

  const number = await nextNumber(ex, ctx, "HANDOUT", { date });
  const id = newId();
  await ex
    .insertInto("HandOut")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      date,
      purpose: input.purpose,
      fileId: file?.id ?? null,
      visitId,
      serviceType: file?.serviceType ?? null,
      division: file?.division ?? null,
      workerId: worker.id,
      handedByUserId: ctx.userId,
      note: text(input.note),
      branchId: file?.branchId ?? ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();

  for (const { line, item, equipment, quantity, unitId } of prepared) {
    const lineId = newId();
    const stays = equipment && line.stayAtSite === true && file !== undefined;
    await ex
      .insertInto("HandOutLine")
      .values({
        id: lineId,
        handOutId: id,
        itemId: item.id,
        unitId,
        qty: quantity,
        condition: equipment ? (line.condition ?? null) : null,
        // The average cost at that moment: what this hand-out cost the job.
        unitCost: item.avgCost,
        expectReturn: equipment ? 1 : 0,
        stayAtSite: stays ? 1 : 0,
        createdAt: ctx.now,
      })
      .execute();
    await addMovement(ex, ctx, {
      itemId: item.id,
      unitId,
      type: "HANDOUT_OUT",
      qty: -quantity,
      unitCost: item.avgCost,
      date,
      handOutLineId: lineId,
    });
    if (unitId) {
      await ex
        .updateTable("EquipmentUnit")
        .set({
          locationKind: stays ? "AT_SITE" : "WITH_WORKER",
          locationWorkerId: stays ? null : worker.id,
          locationFileId: file?.id ?? null,
          locationSiteId: stays ? (file?.siteId ?? null) : null,
          updatedAt: ctx.now,
          updatedByUserId: ctx.userId,
        })
        .where("id", "=", unitId)
        .execute();
    }
  }

  await logCollect(ex, ctx, {
    owner: "MONEY",
    action: "CREATE",
    entity: "HandOut",
    entityId: id,
    entityLabel: number.display,
    subject: { kind: "WORKER", id: worker.id, label: `${worker.lastName} ${worker.firstName}` },
    context: { file: file?.number ?? null, lines: prepared.length },
  });
  return { id, number: number.display };
}

// ── Returns ──────────────────────────────────────────────────────────────────

export interface RecordHandOutReturnInput {
  handOutLineId: string;
  date: string;
  /** In the item's unit, as typed. */
  qtyReturned: number;
  qtyLost?: number;
  qtyDamaged?: number;
  /** «الحالة عند الاستلام» of what came back. Equipment only. */
  condition?: ItemCondition | null;
  note?: string | null;
}

/** What a line still has outside the store, in thousandths. */
async function outstandingOf(ex: Executor, line: { id: string; qty: number }): Promise<number> {
  const returns = await ex
    .selectFrom("HandOutReturn")
    .select(["qtyReturned", "qtyLost", "qtyDamaged"])
    .where("handOutLineId", "=", line.id)
    .execute();
  return line.qty - returns.reduce((sum, row) => sum + row.qtyReturned + row.qtyLost + row.qtyDamaged, 0);
}

export async function recordHandOutReturn(
  ex: Executor,
  ctx: ServiceContext,
  input: RecordHandOutReturnInput,
): Promise<{ id: string; outstanding: number }> {
  requireSection(ctx, "STOCK", "WRITE");
  if (ctx.userId === null) throw new Error("stock: a return is recorded by somebody");
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date > ctx.today) throw new ServiceError("A return cannot be dated after today.");
  const amounts = [input.qtyReturned, input.qtyLost ?? 0, input.qtyDamaged ?? 0];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new ServiceError("A quantity cannot be negative.");
  }
  const [returned, lost, damaged] = amounts.map((value) => toQty(value));
  if (returned + lost + damaged <= 0) throw new ServiceError("Say what came back, was lost or was damaged.");

  const line = await ex
    .selectFrom("HandOutLine")
    .innerJoin("HandOut", "HandOut.id", "HandOutLine.handOutId")
    .innerJoin("StockItem", "StockItem.id", "HandOutLine.itemId")
    .select([
      "HandOutLine.id",
      "HandOutLine.itemId",
      "HandOutLine.unitId",
      "HandOutLine.qty",
      "HandOutLine.unitCost",
      "HandOut.id as handOutId",
      "HandOut.number",
      "HandOut.date",
      "HandOut.workerId",
      "HandOut.cancelledAt",
      "StockItem.kind",
    ])
    .where("HandOutLine.id", "=", input.handOutLineId)
    .executeTakeFirst();
  if (!line || line.cancelledAt !== null) throw new ServiceError("This hand-out line does not exist.");
  if (input.date < line.date) throw new ServiceError("A return cannot be dated before its hand-out.");
  if (returned + lost + damaged > (await outstandingOf(ex, line))) {
    throw new ServiceError("This is more than what is still out.");
  }
  const equipment = line.kind === "EQUIPMENT";
  const condition = equipment ? (input.condition ?? null) : null;
  if (condition !== null && !(ITEM_CONDITIONS as readonly string[]).includes(condition)) {
    throw new Error(`stock: unknown condition ${condition}`);
  }
  if (equipment && returned > 0 && !condition) throw new ServiceError("Say in what condition the equipment came back.");
  const note = text(input.note);
  if (lost + damaged > 0 && !note) throw new ServiceError("Say what happened to what was lost or damaged.");

  const id = newId();
  const date = localDate(input.date);
  await ex
    .insertInto("HandOutReturn")
    .values({
      id,
      handOutLineId: line.id,
      date,
      qtyReturned: returned,
      condition,
      qtyLost: lost,
      qtyDamaged: damaged,
      note,
      receivedByUserId: ctx.userId,
      createdAt: ctx.now,
    })
    .execute();
  // Only what came back whole goes back on the shelf.
  if (returned > 0) {
    await addMovement(ex, ctx, {
      itemId: line.itemId,
      unitId: line.unitId,
      type: "RETURN_IN",
      qty: returned,
      unitCost: line.unitCost,
      date,
      handOutReturnId: id,
    });
  }
  if (line.unitId) {
    await ex
      .updateTable("EquipmentUnit")
      .set({
        ...(returned > 0
          ? { locationKind: "STORE", locationWorkerId: null, locationFileId: null, locationSiteId: null }
          : {}),
        ...(condition ? { condition } : damaged > 0 ? { condition: "NEEDS_MAINTENANCE" } : {}),
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", line.unitId)
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "UPDATE",
    entity: "HandOut",
    entityId: line.handOutId,
    entityLabel: line.number,
    subject: { kind: "WORKER", id: line.workerId },
    context: { returned, lost, damaged },
  });
  if (lost + damaged > 0) await emit(ex, ctx, "handout.returnedShort", { handOutReturnId: id });
  return { id, outstanding: await outstandingOf(ex, line) };
}

// ── Cancelling ───────────────────────────────────────────────────────────────

/** Cancels a hand-out typed by mistake: every quantity it took out goes back, by a reversing movement. */
export async function cancelHandOut(
  ex: Executor,
  ctx: ServiceContext,
  input: { handOutId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "WRITE");
  requireCapability(ctx, "stock.manage");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const handOut = await ex
    .selectFrom("HandOut")
    .select(["id", "number", "date", "workerId", "cancelledAt"])
    .where("id", "=", input.handOutId)
    .executeTakeFirst();
  if (!handOut) throw new ServiceError("This hand-out does not exist.");
  if (handOut.cancelledAt !== null) throw new ServiceError("This hand-out is already cancelled.");
  const lines = await ex
    .selectFrom("HandOutLine")
    .select(["id", "unitId"])
    .where("handOutId", "=", handOut.id)
    .execute();
  const lineIds = lines.map((line) => line.id);
  const returned = lineIds.length
    ? await ex.selectFrom("HandOutReturn").select("id").where("handOutLineId", "in", lineIds).executeTakeFirst()
    : undefined;
  if (returned) throw new ServiceError("A hand-out with a return cannot be cancelled.");

  const movements = lineIds.length
    ? await ex
        .selectFrom("StockMovement")
        .select(["id", "itemId", "unitId", "qty", "unitCost"])
        .where("handOutLineId", "in", lineIds)
        .where("type", "=", "HANDOUT_OUT")
        .execute()
    : [];
  for (const movement of movements) {
    await addMovement(ex, ctx, {
      itemId: movement.itemId,
      unitId: movement.unitId,
      type: "REVERSAL",
      qty: -movement.qty,
      unitCost: movement.unitCost,
      date: ctx.today,
      reversesMovementId: movement.id,
      reason,
    });
  }
  for (const line of lines) {
    if (!line.unitId) continue;
    await ex
      .updateTable("EquipmentUnit")
      .set({
        locationKind: "STORE",
        locationWorkerId: null,
        locationFileId: null,
        locationSiteId: null,
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", line.unitId)
      .execute();
  }
  await ex
    .updateTable("HandOut")
    .set({
      cancelledAt: ctx.now,
      cancelledByUserId: ctx.userId,
      cancelReason: reason,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", handOut.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "CANCEL",
    reason,
    entity: "HandOut",
    entityId: handOut.id,
    entityLabel: handOut.number,
    subject: { kind: "WORKER", id: handOut.workerId },
  });
  return { id: handOut.id };
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface HandOutListRow {
  id: string;
  number: string;
  date: LocalDate;
  purpose: HandoutPurpose;
  fileId: string | null;
  fileNumber: string | null;
  clientName: string | null;
  division: Division | null;
  serviceType: ServiceType | null;
  workerName: string;
  workerNumber: string;
  /** How many lines, and how many of them are equipment not all back yet. */
  lines: number;
  stillOut: number;
  cancelled: boolean;
}

export async function listHandOuts(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId?: string | null } = {},
): Promise<HandOutListRow[]> {
  requireSection(ctx, "STOCK", "READ");
  let rows = ex
    .selectFrom("HandOut")
    .innerJoin("StaffMember", "StaffMember.id", "HandOut.workerId")
    .leftJoin("File", "File.id", "HandOut.fileId")
    .leftJoin("Client", "Client.id", "File.clientId")
    .select([
      "HandOut.id",
      "HandOut.number",
      "HandOut.date",
      "HandOut.purpose",
      "HandOut.fileId",
      "HandOut.division",
      "HandOut.serviceType",
      "HandOut.cancelledAt",
      "File.number as fileNumber",
      "Client.name as clientName",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "StaffMember.number as workerNumber",
    ])
    .orderBy("HandOut.date", "desc")
    .orderBy("HandOut.numberSeq", "desc");
  if (input.fileId) rows = rows.where("HandOut.fileId", "=", input.fileId);
  const handOuts = await rows.execute();
  if (handOuts.length === 0) return [];

  const lines = await ex
    .selectFrom("HandOutLine")
    .select(["id", "handOutId", "qty", "expectReturn"])
    .where(
      "handOutId",
      "in",
      handOuts.map((row) => row.id),
    )
    .execute();
  const returns = lines.length
    ? await ex
        .selectFrom("HandOutReturn")
        .select(["handOutLineId", "qtyReturned", "qtyLost", "qtyDamaged"])
        .where(
          "handOutLineId",
          "in",
          lines.map((line) => line.id),
        )
        .execute()
    : [];
  const settled = (lineId: string) =>
    returns
      .filter((row) => row.handOutLineId === lineId)
      .reduce((sum, row) => sum + row.qtyReturned + row.qtyLost + row.qtyDamaged, 0);

  return handOuts.map((row) => {
    const own = lines.filter((line) => line.handOutId === row.id);
    const cancelled = row.cancelledAt !== null;
    return {
      id: row.id,
      number: row.number,
      date: row.date,
      purpose: row.purpose as HandoutPurpose,
      fileId: row.fileId,
      fileNumber: row.fileNumber,
      clientName: row.clientName,
      division: (DIVISIONS as readonly string[]).includes(row.division ?? "") ? (row.division as Division) : null,
      serviceType: (SERVICE_TYPES as readonly string[]).includes(row.serviceType ?? "")
        ? (row.serviceType as ServiceType)
        : null,
      workerName: `${row.lastName} ${row.firstName}`,
      workerNumber: row.workerNumber,
      lines: own.length,
      stillOut: cancelled ? 0 : own.filter((line) => line.expectReturn === 1 && settled(line.id) < line.qty).length,
      cancelled,
    };
  });
}

export interface HandOutDetailLine {
  id: string;
  itemId: string;
  itemName: string;
  kind: StockKind;
  unit: Unit;
  unitCode: string | null;
  qty: number;
  condition: ItemCondition | null;
  expectReturn: boolean;
  stayAtSite: boolean;
  /** Thousandths still outside the store. */
  outstanding: number;
}

export interface HandOutDetail {
  id: string;
  fileId: string | null;
  workerId: string;
  slip: HandoutSlipData;
  lines: HandOutDetailLine[];
}

const oneOf = <T extends string>(list: readonly T[], value: string, what: string): T => {
  if (!(list as readonly string[]).includes(value)) throw new Error(`stock: unknown ${what} ${value}`);
  return value as T;
};

/** A hand-out as it was recorded: its slip, and what each line still has out. */
export async function getHandOut(
  ex: Executor,
  ctx: ServiceContext,
  input: { handOutId: string },
): Promise<HandOutDetail> {
  requireSection(ctx, "STOCK", "READ");
  const handOut = await ex.selectFrom("HandOut").selectAll().where("id", "=", input.handOutId).executeTakeFirst();
  if (!handOut) throw new ServiceError("This hand-out does not exist.");
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["firstName", "lastName", "number"])
    .where("id", "=", handOut.workerId)
    .executeTakeFirstOrThrow();
  const handedBy = await ex
    .selectFrom("User")
    .select("displayName")
    .where("id", "=", handOut.handedByUserId)
    .executeTakeFirst();
  const file = handOut.fileId
    ? await ex
        .selectFrom("File")
        .innerJoin("Client", "Client.id", "File.clientId")
        .innerJoin("Site", "Site.id", "File.siteId")
        .leftJoin("Commune", "Commune.id", "Site.communeId")
        .select(["File.number", "Client.name as clientName", "Site.address", "Commune.nameAr as commune"])
        .where("File.id", "=", handOut.fileId)
        .executeTakeFirst()
    : undefined;
  const visit = handOut.visitId
    ? await ex.selectFrom("Visit").select("visitDate").where("id", "=", handOut.visitId).executeTakeFirst()
    : undefined;
  const rows = await ex
    .selectFrom("HandOutLine")
    .innerJoin("StockItem", "StockItem.id", "HandOutLine.itemId")
    .leftJoin("EquipmentUnit", "EquipmentUnit.id", "HandOutLine.unitId")
    .select([
      "HandOutLine.id",
      "HandOutLine.itemId",
      "HandOutLine.qty",
      "HandOutLine.condition",
      "HandOutLine.expectReturn",
      "HandOutLine.stayAtSite",
      "StockItem.nameAr",
      "StockItem.kind",
      "StockItem.unit",
      "EquipmentUnit.number as unitCode",
    ])
    .where("HandOutLine.handOutId", "=", handOut.id)
    .orderBy("HandOutLine.createdAt")
    .orderBy("HandOutLine.id")
    .execute();

  const lines: HandOutDetailLine[] = [];
  for (const row of rows) {
    lines.push({
      id: row.id,
      itemId: row.itemId,
      itemName: row.nameAr,
      kind: oneOf(STOCK_KINDS, row.kind, "kind"),
      unit: oneOf(UNITS, row.unit, "unit"),
      unitCode: row.unitCode,
      qty: row.qty,
      condition: row.condition ? oneOf(ITEM_CONDITIONS, row.condition, "condition") : null,
      expectReturn: row.expectReturn === 1,
      stayAtSite: row.stayAtSite === 1,
      outstanding: handOut.cancelledAt === null ? await outstandingOf(ex, row) : 0,
    });
  }

  return {
    id: handOut.id,
    fileId: handOut.fileId,
    workerId: handOut.workerId,
    lines,
    slip: {
      number: handOut.number,
      date: handOut.date,
      place: await getSetting(ex, "centre.city"),
      purpose: oneOf(HANDOUT_PURPOSES, handOut.purpose, "purpose"),
      workerName: `${worker.lastName} ${worker.firstName}`,
      workerNumber: worker.number,
      handedByName: handedBy?.displayName ?? "",
      job:
        file && handOut.division && handOut.serviceType
          ? {
              fileNumber: file.number,
              clientName: file.clientName,
              siteAddress: [file.address, file.commune].filter(Boolean).join("، "),
              division: oneOf(DIVISIONS, handOut.division, "division"),
              serviceType: oneOf(SERVICE_TYPES, handOut.serviceType, "service type"),
              visitDate: visit?.visitDate ?? null,
            }
          : null,
      lines: lines.map((line) => ({
        kind: line.kind,
        itemName: line.itemName,
        unitCode: line.unitCode,
        qty: line.qty,
        unit: line.unit,
        condition: line.condition,
        stayAtSite: line.stayAtSite,
      })),
      // The kit is handed as lines of its own; the slip's tick boxes stay for the pen.
      ppe: [],
      note: handOut.note,
      cancelled: handOut.cancelledAt
        ? { date: ctx.toLocal(handOut.cancelledAt).date, reason: handOut.cancelReason ?? "" }
        : null,
    },
  };
}

export interface VisitHandOutLine {
  handOutNumber: string;
  itemName: string;
  qty: number;
  unit: Unit;
  condition: ItemCondition | null;
  workerId: string;
  workerName: string;
}

/**
 * What was handed out for a visit: the hand-outs that name it, and those of
 * its file that name no visit. Operations prints it on the mission order
 * (CONTRACTS.md section 3). No prices: money never appears on an order.
 */
export async function getHandOutsForVisit(
  ex: Executor,
  _ctx: ServiceContext,
  input: { visitId: string },
): Promise<VisitHandOutLine[]> {
  const visit = await ex
    .selectFrom("Visit")
    .select(["id", "fileId"])
    .where("id", "=", input.visitId)
    .executeTakeFirst();
  if (!visit) return [];
  const rows = await ex
    .selectFrom("HandOutLine")
    .innerJoin("HandOut", "HandOut.id", "HandOutLine.handOutId")
    .innerJoin("StockItem", "StockItem.id", "HandOutLine.itemId")
    .innerJoin("StaffMember", "StaffMember.id", "HandOut.workerId")
    .select([
      "HandOut.number",
      "HandOut.workerId",
      "StockItem.nameAr",
      "StockItem.unit",
      "HandOutLine.qty",
      "HandOutLine.condition",
      "StaffMember.firstName",
      "StaffMember.lastName",
    ])
    .where("HandOut.cancelledAt", "is", null)
    .where((eb) =>
      eb.or([
        eb("HandOut.visitId", "=", visit.id),
        eb.and([eb("HandOut.fileId", "=", visit.fileId), eb("HandOut.visitId", "is", null)]),
      ]),
    )
    .orderBy("HandOut.numberSeq")
    .orderBy("HandOutLine.createdAt")
    .execute();
  return rows.map((row) => ({
    handOutNumber: row.number,
    itemName: row.nameAr,
    qty: row.qty,
    unit: oneOf(UNITS, row.unit, "unit"),
    condition: row.condition ? oneOf(ITEM_CONDITIONS, row.condition, "condition") : null,
    workerId: row.workerId,
    workerName: `${row.lastName} ${row.firstName}`,
  }));
}

/** The slip went to paper: the disclosure the law asks for (it names a worker). */
export async function recordHandOutPrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { handOutId: string },
): Promise<{ id: string }> {
  requireSection(ctx, "STOCK", "READ");
  const handOut = await ex
    .selectFrom("HandOut")
    .select(["id", "number", "workerId"])
    .where("id", "=", input.handOutId)
    .executeTakeFirst();
  if (!handOut) throw new ServiceError("This hand-out does not exist.");
  await logDisclose(ex, ctx, {
    owner: "MONEY",
    action: "PRINT",
    entity: "HandOut",
    entityId: handOut.id,
    entityLabel: handOut.number,
    subject: { kind: "WORKER", id: handOut.workerId },
    disclosure: "PRINT",
  });
  return { id: handOut.id };
}

// ── What the hand-out form offers ────────────────────────────────────────────

export interface HandOutChoices {
  /** Files under contract or with a job in hand, the latest first. */
  files: { id: string; number: string; clientName: string; division: Division; serviceType: ServiceType }[];
  /** Workers on file who have not left. */
  workers: { id: string; number: string; name: string }[];
  /** Items the store holds at least one of. */
  items: { id: string; name: string; kind: StockKind; unit: Unit; tracking: string; onHandQty: number }[];
}

export async function getHandOutChoices(ex: Executor, ctx: ServiceContext): Promise<HandOutChoices> {
  requireSection(ctx, "STOCK", "READ");
  const files = await ex
    .selectFrom("File")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select(["File.id", "File.number", "File.division", "File.serviceType", "Client.name as clientName"])
    .where("File.stage", "=", "CONTRACTED")
    .where("File.closedAt", "is", null)
    .where("File.deletedAt", "is", null)
    .orderBy("File.contractedAt", "desc")
    .execute();
  const workers = await ex
    .selectFrom("StaffMember")
    .select(["id", "number", "firstName", "lastName"])
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .where("engagementStatus", "in", ["ON_TRIAL", "ACCEPTED"])
    .orderBy("numberSeq")
    .execute();
  const items = await ex
    .selectFrom("StockItem")
    .select(["id", "nameAr", "kind", "unit", "tracking", "onHandQty"])
    .where("deletedAt", "is", null)
    .where("isActive", "=", 1)
    .where("onHandQty", ">", qty(0))
    .orderBy("kind")
    .orderBy("createdAt")
    .execute();
  return {
    files: files.map((file) => ({
      id: file.id,
      number: file.number,
      clientName: file.clientName,
      division: file.division as Division,
      serviceType: file.serviceType as ServiceType,
    })),
    workers: workers.map((worker) => ({
      id: worker.id,
      number: worker.number,
      name: `${worker.lastName} ${worker.firstName}`,
    })),
    items: items.map((item) => ({
      id: item.id,
      name: item.nameAr,
      kind: oneOf(STOCK_KINDS, item.kind, "kind"),
      unit: oneOf(UNITS, item.unit, "unit"),
      tracking: item.tracking,
      onHandQty: item.onHandQty,
    })),
  };
}

/** The visits of a file a hand-out can name: from a week back, the nearest first. */
export async function listFileVisitsForHandOut(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<{ id: string; number: string; visitDate: LocalDate }[]> {
  requireSection(ctx, "STOCK", "READ");
  const rows = await ex
    .selectFrom("Visit")
    .select(["id", "number", "visitDate", "status"])
    .where("fileId", "=", input.fileId)
    .where("status", "!=", "CANCELLED")
    .orderBy("visitDate")
    .execute();
  const floor = addDays(ctx.today, -7);
  return rows
    .filter((row) => row.visitDate >= floor)
    .slice(0, 30)
    .map((row) => ({ id: row.id, number: row.number, visitDate: row.visitDate }));
}

// ── What the screens call ────────────────────────────────────────────────────

const REFRESH = [HANDOUTS_PATH, INVENTORY_PATH] as const;

export const listHandOutsQuery = query(listHandOuts);
export const getHandOutQuery = query(getHandOut);
export const getHandOutChoicesQuery = query((ex: Executor, ctx: ServiceContext) => getHandOutChoices(ex, ctx));
export const listFileVisitsForHandOutQuery = query(listFileVisitsForHandOut);
export const createHandOutAction = action(createHandOut, { revalidate: [...REFRESH] });
export const recordHandOutReturnAction = action(recordHandOutReturn, { revalidate: [...REFRESH] });
export const cancelHandOutAction = action(cancelHandOut, { revalidate: [...REFRESH] });
export const recordHandOutPrintedAction = action(recordHandOutPrinted);
