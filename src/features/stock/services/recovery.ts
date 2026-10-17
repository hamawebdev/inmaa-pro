import { requireSection } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { staffName } from "@/lib/text/names";
import type { LocalDate } from "@/lib/units";

/**
 * Equipment to bring back (INT-8, MON-13): what is still out when the reason it went out is over.
 *
 *  - A contract ended without renewal: what its hand-outs left out, and the pieces stored at its site
 *    («تخزين معدات») are to be recovered (CONTRACTS.md section 4, `file.ended`).
 *  - A worker who left, or was refused: what she still holds (`staff.unavailable`), and the blank receipts
 *    of a block she was handed.
 *
 * The lists are read from the records as they stand, so no event has to write anything: People's leaving
 * dialog reads `getWorkerHoldings`, Clients' hub reads `getFileHandOutSummary`, and the hand-outs screen
 * shows what is to recover. The first three check no permission: their callers do.
 */

export interface EquipmentOut {
  handOutLineId: string | null;
  handOutId: string | null;
  handOutNumber: string | null;
  date: LocalDate | null;
  /** The item's name; the screen picks the reader's language, Arabic when it has none. */
  itemName: string;
  itemNameFr: string | null;
  itemNameEn: string | null;
  unitNumber: string | null;
  /** Thousandths still out. */
  qty: number;
  workerId: string | null;
  workerName: string | null;
  fileId: string | null;
  fileNumber: string | null;
  clientName: string | null;
  /** Kept at the client's site («تخزين معدات»), not with a worker. */
  atSite: boolean;
}

async function equipmentOut(ex: Executor, filter: { fileId?: string; workerId?: string }): Promise<EquipmentOut[]> {
  const lines = await ex
    .selectFrom("HandOutLine")
    .innerJoin("HandOut", "HandOut.id", "HandOutLine.handOutId")
    .innerJoin("StockItem", "StockItem.id", "HandOutLine.itemId")
    .innerJoin("StaffMember", "StaffMember.id", "HandOut.workerId")
    .leftJoin("EquipmentUnit", "EquipmentUnit.id", "HandOutLine.unitId")
    .leftJoin("File", "File.id", "HandOut.fileId")
    .leftJoin("Client", "Client.id", "File.clientId")
    .select([
      "HandOutLine.id",
      "HandOutLine.qty",
      "HandOutLine.stayAtSite",
      "HandOut.id as handOutId",
      "HandOut.number as handOutNumber",
      "HandOut.date",
      "HandOut.workerId",
      "StaffMember.lastName",
      "StaffMember.firstName",
      "StockItem.nameAr as itemName",
      "StockItem.nameFr as itemNameFr",
      "StockItem.nameEn as itemNameEn",
      "EquipmentUnit.number as unitNumber",
      "EquipmentUnit.retiredAt",
      "File.id as fileId",
      "File.number as fileNumber",
      "Client.name as clientName",
    ])
    .where("HandOut.cancelledAt", "is", null)
    .where("HandOutLine.expectReturn", "=", 1)
    .$if(filter.fileId !== undefined, (qb) => qb.where("HandOut.fileId", "=", filter.fileId ?? ""))
    .$if(filter.workerId !== undefined, (qb) => qb.where("HandOut.workerId", "=", filter.workerId ?? ""))
    .orderBy("HandOut.date")
    .execute();
  if (lines.length === 0) return [];
  const returns = await ex
    .selectFrom("HandOutReturn")
    .select(["handOutLineId", "qtyReturned", "qtyLost", "qtyDamaged"])
    .where(
      "handOutLineId",
      "in",
      lines.map((line) => line.id),
    )
    .execute();
  return lines.flatMap((line): EquipmentOut[] => {
    const settled = returns
      .filter((row) => row.handOutLineId === line.id)
      .reduce((sum, row) => sum + row.qtyReturned + row.qtyLost + row.qtyDamaged, 0);
    const qty = line.qty - settled;
    if (qty <= 0 || line.retiredAt) return [];
    return [
      {
        handOutLineId: line.id,
        handOutId: line.handOutId,
        handOutNumber: line.handOutNumber,
        date: line.date as LocalDate,
        itemName: line.itemName,
        itemNameFr: line.itemNameFr,
        itemNameEn: line.itemNameEn,
        unitNumber: line.unitNumber,
        qty,
        workerId: line.workerId,
        workerName: staffName(line),
        fileId: line.fileId,
        fileNumber: line.fileNumber,
        clientName: line.clientName,
        atSite: line.stayAtSite === 1,
      },
    ];
  });
}

/** What a file's hand-outs left out, and the pieces stored at its site. Checks no permission. */
export async function getEquipmentOutForFile(
  ex: Executor,
  _ctx: ServiceContext,
  input: { fileId: string },
): Promise<EquipmentOut[]> {
  const out = await equipmentOut(ex, { fileId: input.fileId });
  const file = await ex.selectFrom("File").select(["siteId"]).where("id", "=", input.fileId).executeTakeFirst();
  if (!file) return out;
  // A piece stored at the site may have come with a file before a renewal: the site is what holds it.
  const stored = await ex
    .selectFrom("EquipmentUnit")
    .innerJoin("StockItem", "StockItem.id", "EquipmentUnit.itemId")
    .select([
      "EquipmentUnit.number",
      "StockItem.nameAr as itemName",
      "StockItem.nameFr as itemNameFr",
      "StockItem.nameEn as itemNameEn",
    ])
    .where("EquipmentUnit.retiredAt", "is", null)
    .where("EquipmentUnit.locationKind", "=", "AT_SITE")
    .where("EquipmentUnit.locationSiteId", "=", file.siteId)
    .execute();
  const known = new Set(out.map((row) => row.unitNumber).filter(Boolean));
  for (const unit of stored) {
    if (known.has(unit.number)) continue;
    out.push({
      handOutLineId: null,
      handOutId: null,
      handOutNumber: null,
      date: null,
      itemName: unit.itemName,
      itemNameFr: unit.itemNameFr,
      itemNameEn: unit.itemNameEn,
      unitNumber: unit.number,
      qty: 1000,
      workerId: null,
      workerName: null,
      fileId: input.fileId,
      fileNumber: null,
      clientName: null,
      atSite: true,
    });
  }
  return out;
}

/** The hub tile «التسليم» of a file: how many hand-outs, and how much equipment is still out or at its site. */
export async function getFileHandOutSummary(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<{ handOuts: number; equipmentOut: number; atSite: number }> {
  const handOuts = await ex
    .selectFrom("HandOut")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("fileId", "=", input.fileId)
    .where("cancelledAt", "is", null)
    .executeTakeFirstOrThrow();
  const out = await getEquipmentOutForFile(ex, ctx, input);
  return {
    handOuts: Number(handOuts.count),
    equipmentOut: out.filter((row) => !row.atSite).length,
    atSite: out.filter((row) => row.atSite).length,
  };
}

export interface WorkerHoldings {
  equipment: EquipmentOut[];
  /** Blocks of blank receipts handed to her and not given back. */
  receiptBlocks: { batchId: string; date: LocalDate; firstNumber: number; lastNumber: number; numberYear: number }[];
}

/** What a worker still holds: for her leaving (People's dialog). Checks no permission. */
export async function getWorkerHoldings(
  ex: Executor,
  _ctx: ServiceContext,
  input: { workerId: string },
): Promise<WorkerHoldings> {
  const equipment = await equipmentOut(ex, { workerId: input.workerId });
  const blocks = await ex
    .selectFrom("ReceiptBatch")
    .select(["id", "date", "firstNumber", "lastNumber", "numberYear"])
    .where("collectorStaffId", "=", input.workerId)
    .where("returnedAt", "is", null)
    .orderBy("date")
    .execute();
  return {
    equipment,
    receiptBlocks: blocks.map((block) => ({
      batchId: block.id,
      date: block.date as LocalDate,
      firstNumber: block.firstNumber,
      lastNumber: block.lastNumber,
      numberYear: block.numberYear,
    })),
  };
}

export interface ToRecover extends EquipmentOut {
  /** Why it is to come back: the contract ended without renewal, or the worker is no longer in post. */
  why: "CONTRACT_ENDED" | "WORKER_LEFT";
}

/** Everything to bring back, for the hand-outs screen: equipment out on an ended contract or with a leaver. */
export async function listEquipmentToRecover(ex: Executor, ctx: ServiceContext): Promise<ToRecover[]> {
  requireSection(ctx, "STOCK", "READ");
  const ended = await ex
    .selectFrom("File")
    .select(["id"])
    .where("stage", "=", "CONTRACT_ENDED")
    .where("deletedAt", "is", null)
    .where((eb) => eb.or([eb("endKind", "is", null), eb("endKind", "!=", "RENEWED")]))
    .execute();
  const leavers = await ex
    .selectFrom("StaffMember")
    .select(["id"])
    .where("engagementStatus", "in", ["LEFT", "REFUSED"])
    .execute();
  const rows: ToRecover[] = [];
  const seen = new Set<string>();
  for (const file of ended) {
    for (const row of await getEquipmentOutForFile(ex, ctx, { fileId: file.id })) {
      const key = row.handOutLineId ?? `unit:${row.unitNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...row, why: "CONTRACT_ENDED" });
    }
  }
  for (const worker of leavers) {
    for (const row of await equipmentOut(ex, { workerId: worker.id })) {
      const key = row.handOutLineId ?? "";
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...row, why: "WORKER_LEFT" });
    }
  }
  return rows;
}

// ── What the screens call ────────────────────────────────────────────────────

export const listEquipmentToRecoverQuery = query((ex: Executor, ctx: ServiceContext) =>
  listEquipmentToRecover(ex, ctx),
);
