import { getEquipmentIncidents, type ChargeState } from "@/features/stock/services/incidents";
import { getWorkerHoldings, type WorkerHoldings } from "@/features/stock/services/recovery";
import { can, requireCapability, requireSection } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * What the stock says about a worker, where the office decides about her
 * (Money's MON-10 and MON-13, read through Stock's own functions, which check
 * no permission: these do):
 *
 *  - her file's violations block shows the equipment she lost or damaged on
 *    its return, and what the manager charged her for it;
 *  - the leaving dialog shows what she still holds: equipment handed out and
 *    not brought back, and blocks of blank receipts not given back.
 */

export interface WorkerEquipmentIncident {
  id: string;
  date: string;
  handOutNumber: string;
  itemName: string;
  itemNameFr: string | null;
  itemNameEn: string | null;
  unitNumber: string | null;
  /** Thousandths. */
  lost: number;
  damaged: number;
  note: string | null;
  state: ChargeState;
  /** What she was charged, in centimes: for readers of pay only (a debt on her ledger), else null. */
  charged: number | null;
  /** What the store paid for it, in centimes: for readers of pay only, else null. */
  cost: number | null;
}

/** The equipment a worker lost or damaged on its return, the latest first. */
export async function listWorkerEquipmentIncidents(
  ex: Executor,
  ctx: ServiceContext,
  input: { workerId: string },
): Promise<WorkerEquipmentIncident[]> {
  requireSection(ctx, "WORKERS", "READ");
  const readsPay = can(ctx, "pay.read") || can(ctx, "pay.write");
  const incidents = await getEquipmentIncidents(ex, ctx, { workerId: input.workerId });
  return incidents.map((incident) => ({
    id: incident.handOutReturnId,
    date: incident.date,
    handOutNumber: incident.handOutNumber,
    itemName: incident.itemName,
    itemNameFr: incident.itemNameFr,
    itemNameEn: incident.itemNameEn,
    unitNumber: incident.unitNumber,
    lost: incident.lost,
    damaged: incident.damaged,
    note: incident.note,
    state: incident.state,
    charged: readsPay ? incident.charged : null,
    cost: readsPay ? incident.cost : null,
  }));
}

/** What a worker still holds, for the dialog that records her leaving: whoever may record it reads it. */
export async function listWorkerHoldings(
  ex: Executor,
  ctx: ServiceContext,
  input: { workerId: string },
): Promise<WorkerHoldings> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  return getWorkerHoldings(ex, ctx, { workerId: input.workerId });
}

// What the screens import.
export const listWorkerEquipmentIncidentsQuery = query(listWorkerEquipmentIncidents);
export const listWorkerHoldingsQuery = query(listWorkerHoldings);
