import { addDebtEntry } from "@/features/people/services/payouts";
import { requireCapability, requireSection } from "@/lib/access/session";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { staffName } from "@/lib/text/names";
import { qty, type LocalDate } from "@/lib/units";

import { HANDOUTS_PATH } from "./paths";

/**
 * Equipment lost or damaged on its return (MON-10): a charge «للتسوية» that the manager settles.
 *
 * A return only records what happened (services/handouts.ts). The manager then decides, with the reason
 * typed: the worker owes the piece's cost, part of it, or nothing. Only then is the worker's ledger
 * written, through People's `addDebtEntry`: the incident at its cost (`LOSS`, `DAMAGE`), and what the
 * manager forgives written off beside it (`WRITTEN_OFF`), both carrying the return, so the ledger says
 * what happened and what was decided, and its balance is what is owed. People's payslip takes that back
 * as it does any debt, never more than the net.
 *
 * `getEquipmentIncidents` is also the read People's violations block takes (CONTRACTS.md section 3).
 */

export const CHARGE_STATES = ["PENDING", "CHARGED", "WAIVED", "NO_COST"] as const;
export type ChargeState = (typeof CHARGE_STATES)[number];

export interface EquipmentIncident {
  handOutReturnId: string;
  date: LocalDate;
  handOutId: string;
  handOutNumber: string;
  workerId: string;
  workerName: string;
  workerNumber: string | null;
  /** The item's name; the screen picks the reader's language, Arabic when it has none. */
  itemName: string;
  itemNameFr: string | null;
  itemNameEn: string | null;
  unitNumber: string | null;
  /** Thousandths. */
  lost: number;
  damaged: number;
  note: string | null;
  /** What the store paid for what was lost or damaged, in centimes. */
  cost: number;
  /** What the worker was charged in the end. */
  charged: number;
  state: ChargeState;
}

/** The returns that lost or damaged equipment, the latest first; for one worker, or all. Checks no permission. */
export async function getEquipmentIncidents(
  ex: Executor,
  _ctx: ServiceContext,
  input: { workerId?: string | null; pendingOnly?: boolean } = {},
): Promise<EquipmentIncident[]> {
  const rows = await ex
    .selectFrom("HandOutReturn")
    .innerJoin("HandOutLine", "HandOutLine.id", "HandOutReturn.handOutLineId")
    .innerJoin("HandOut", "HandOut.id", "HandOutLine.handOutId")
    .innerJoin("StockItem", "StockItem.id", "HandOutLine.itemId")
    .innerJoin("StaffMember", "StaffMember.id", "HandOut.workerId")
    .leftJoin("EquipmentUnit", "EquipmentUnit.id", "HandOutLine.unitId")
    .select([
      "HandOutReturn.id",
      "HandOutReturn.date",
      "HandOutReturn.qtyLost",
      "HandOutReturn.qtyDamaged",
      "HandOutReturn.note",
      "HandOutLine.unitCost",
      "HandOut.id as handOutId",
      "HandOut.number as handOutNumber",
      "HandOut.workerId",
      "StaffMember.lastName",
      "StaffMember.firstName",
      "StaffMember.number as workerNumber",
      "StockItem.nameAr as itemName",
      "StockItem.nameFr as itemNameFr",
      "StockItem.nameEn as itemNameEn",
      "EquipmentUnit.number as unitNumber",
    ])
    .where("StockItem.kind", "=", "EQUIPMENT")
    .where((eb) => eb.or([eb("HandOutReturn.qtyLost", ">", qty(0)), eb("HandOutReturn.qtyDamaged", ">", qty(0))]))
    .$if(input.workerId != null, (qb) => qb.where("HandOut.workerId", "=", input.workerId ?? ""))
    .orderBy("HandOutReturn.date", "desc")
    .orderBy("HandOutReturn.createdAt", "desc")
    .execute();
  if (rows.length === 0) return [];
  const entries = await ex
    .selectFrom("StaffDebtEntry")
    .select(["handOutReturnId", "direction", "amount"])
    .where(
      "handOutReturnId",
      "in",
      rows.map((row) => row.id),
    )
    .execute();

  const incidents = rows.map((row): EquipmentIncident => {
    const cost = Math.round((row.unitCost * (row.qtyLost + row.qtyDamaged)) / 1000);
    const own = entries.filter((entry) => entry.handOutReturnId === row.id);
    const charged = own.reduce(
      (sum, entry) => sum + (entry.direction === "INCREASE" ? entry.amount : -entry.amount),
      0,
    );
    const state: ChargeState =
      own.length === 0 ? (cost > 0 ? "PENDING" : "NO_COST") : charged > 0 ? "CHARGED" : "WAIVED";
    return {
      handOutReturnId: row.id,
      date: row.date as LocalDate,
      handOutId: row.handOutId,
      handOutNumber: row.handOutNumber,
      workerId: row.workerId,
      workerName: staffName(row),
      workerNumber: row.workerNumber,
      itemName: row.itemName,
      itemNameFr: row.itemNameFr,
      itemNameEn: row.itemNameEn,
      unitNumber: row.unitNumber,
      lost: row.qtyLost,
      damaged: row.qtyDamaged,
      note: row.note,
      cost,
      charged: Math.max(0, charged),
      state,
    };
  });
  return input.pendingOnly ? incidents.filter((incident) => incident.state === "PENDING") : incidents;
}

/** The charges still to settle, for the hand-outs screen. */
export async function listPendingCharges(ex: Executor, ctx: ServiceContext): Promise<EquipmentIncident[]> {
  requireSection(ctx, "STOCK", "READ");
  return getEquipmentIncidents(ex, ctx, { pendingOnly: true });
}

/**
 * The manager settles a charge: the worker owes `amount` (centimes, from nothing to the cost), with the reason
 * typed. Settled once.
 */
export async function settleEquipmentCharge(
  ex: Executor,
  ctx: ServiceContext,
  input: { handOutReturnId: string; amount: number; reason: string },
): Promise<{ handOutReturnId: string; charged: number }> {
  requireCapability(ctx, "sanction.set");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const [incident] = (await getEquipmentIncidents(ex, ctx)).filter(
    (row) => row.handOutReturnId === input.handOutReturnId,
  );
  if (!incident) throw new ServiceError("This return lost or damaged nothing.");
  if (incident.state !== "PENDING") throw new ServiceError("This charge is already settled.");
  if (!Number.isSafeInteger(input.amount) || input.amount < 0 || input.amount > incident.cost) {
    throw new ServiceError("The worker is charged from nothing up to what the equipment cost.");
  }

  const note = `${reason} (التسليم رقم ${incident.handOutNumber})`;
  // The incident at its cost, by what happened to it…
  const lostCost = Math.round((incident.cost * incident.lost) / (incident.lost + incident.damaged));
  for (const [amount, kind] of [
    [lostCost, "LOSS"],
    [incident.cost - lostCost, "DAMAGE"],
  ] as const) {
    if (amount <= 0) continue;
    await addDebtEntry(ex, ctx, {
      staffId: incident.workerId,
      date: ctx.today,
      direction: "INCREASE",
      reason: kind,
      amount,
      note,
      handOutReturnId: incident.handOutReturnId,
    });
  }
  // … and what the manager forgives, written off beside it.
  if (input.amount < incident.cost) {
    await addDebtEntry(ex, ctx, {
      staffId: incident.workerId,
      date: ctx.today,
      direction: "DECREASE",
      reason: "WRITTEN_OFF",
      amount: incident.cost - input.amount,
      note,
      handOutReturnId: incident.handOutReturnId,
    });
  }
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "SANCTION_SET",
    reason,
    entity: "HandOutReturn",
    entityId: incident.handOutReturnId,
    entityLabel: incident.handOutNumber,
    subject: { kind: "WORKER", id: incident.workerId, label: incident.workerName },
    context: { charged: input.amount === incident.cost ? "WHOLE" : input.amount === 0 ? "NOTHING" : "PART" },
  });
  return { handOutReturnId: incident.handOutReturnId, charged: input.amount };
}

// ── What the screens call ────────────────────────────────────────────────────

export const listPendingChargesQuery = query((ex: Executor, ctx: ServiceContext) => listPendingCharges(ex, ctx));
export const settleEquipmentChargeAction = action(settleEquipmentCharge, { revalidate: [HANDOUTS_PATH] });
