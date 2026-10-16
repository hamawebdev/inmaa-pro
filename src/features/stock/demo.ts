import type { Executor, ServiceContext } from "@/lib/service/context";
import { dinarsToMoney } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { createHandOut } from "./services/handouts";
import { seededItemId } from "./seeds";
import { closeCount, openCount, saveCountLine } from "./services/counts";
import { updateStockItem } from "./services/items";
import { setMaintenancePlan } from "./services/maintenance";
import { createSupplier, recordPurchase } from "./services/purchases";
import type { StockCategory, StockKind, StockTracking, Unit } from "./validators/option-codes";

/**
 * Stock's demo data (CLAUDE.md, "Demo data"), on the 29 items the seeds put in
 * every installation (./seeds.ts), as the office would start:
 *
 *  - it sets the four minimums of his store table (D1) on the seeded items;
 *  - it counts the materials on 1 October (the first count brings the record
 *    to the shelf; glass cleaner is found below its minimum);
 *  - one purchase from a supplier on 5 October brings the equipment, numbers
 *    each vacuum cleaner, and writes its expense; the first one is due for its
 *    service on Thursday;
 *  - one hand-out this morning: cleaner, bags, gloves and a bucket for the
 *    team of today's first visit (Operations' demo), to the first worker on it.
 *
 * Quantities are invented, except his table's.
 */

const at = (localDate: string, localTime: string) => {
  const [hours, minutes] = localTime.split(":").map(Number);
  // The centre is at UTC+1 and keeps no summer time.
  return `${localDate}T${String(hours - 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
};

/** His store table (D1): floor cleaner 10, glass cleaner 5, gloves 30, bags 100. */
const DEMO_MINIMUMS: readonly (readonly [string, number])[] = [
  ["FLOOR_CLEANER", 10],
  ["GLASS_CLEANER", 5],
  ["GLOVES", 30],
  ["WASTE_BAGS", 100],
];

/** What the first count found, in each item's unit. Everything else of the materials: nothing. */
const FIRST_COUNT: ReadonlyMap<string, number> = new Map([
  ["FLOOR_CLEANER", 30],
  ["GLASS_CLEANER", 4],
  ["BATHROOM_CLEANER", 8],
  ["DISINFECTANT", 15],
  ["MULTI_CLEANER", 12],
  ["WASTE_BAGS", 500],
  ["CLOTHS", 30],
  ["MICROFIBER", 25],
  ["SPONGE", 40],
  ["GLOVES", 100],
  ["PPE_GLOVES", 20],
  ["PPE_WORKWEAR", 10],
  ["PPE_MASK", 50],
]);

export async function seedDemo(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  const item = (code: string) => seededItemId(code);
  const seeded = async (code: string) => {
    const row = await ex.selectFrom("StockItem").selectAll().where("id", "=", item(code)).executeTakeFirst();
    if (!row) throw new Error(`stock: the seeded item ${code} is missing`);
    return row;
  };

  // ── The office sets the four minimums of his store table (D1) on the seeded items ──
  for (const [code, minLevel] of DEMO_MINIMUMS) {
    const row = await seeded(code);
    await updateStockItem(ex, ctx, {
      id: row.id,
      values: {
        nameAr: row.nameAr,
        nameFr: row.nameFr ?? undefined,
        nameEn: row.nameEn ?? undefined,
        kind: row.kind as StockKind,
        category: (row.category ?? undefined) as StockCategory | undefined,
        unit: row.unit as Unit,
        tracking: row.tracking as StockTracking,
        minLevel,
        note: row.note ?? undefined,
      },
    });
  }
  names.floorCleaner = item("FLOOR_CLEANER");

  // ── Thursday 1 October: the first count of the materials puts what is on the shelf in the record ──
  const count = await openCount(ex, tools.at(at("2026-10-01", "08:30")), {
    kind: "MATERIAL",
    date: "2026-10-01",
    note: "الجرد الأول للمخزن",
  });
  const lines = await ex
    .selectFrom("InventoryCountLine")
    .innerJoin("StockItem", "StockItem.id", "InventoryCountLine.itemId")
    .select(["InventoryCountLine.id", "StockItem.code"])
    .where("InventoryCountLine.countId", "=", count.id)
    .execute();
  const counting = tools.at(at("2026-10-01", "10:00"));
  for (const line of lines) {
    const found = FIRST_COUNT.get(line.code) ?? 0;
    await saveCountLine(ex, counting, {
      lineId: line.id,
      countedQty: found,
      note: found > 0 ? "الجرد الأول للمخزن" : null,
    });
  }
  await closeCount(ex, counting, { countId: count.id });
  // Glass cleaner was counted at 4 l for a minimum of 5: the low-stock tile lights for it.
  names.itemLow = item("GLASS_CLEANER");

  // ── Monday 5 October: bought in bulk, the vacuum cleaners numbered piece by piece ──
  const supplier = await createSupplier(ex, ctx, {
    name: "مؤسسة الصفاء لمواد التنظيف",
    phone: "032 44 55 66",
    address: "المنطقة الصناعية، عين مليلة",
  });
  names.supplier = supplier.id;
  const purchase = await recordPurchase(ex, ctx, {
    date: "2026-10-05",
    supplierId: supplier.id,
    supplierInvoiceNo: "F-2026/118",
    division: "COMMON",
    method: "CASH",
    lines: [
      { itemId: item("FLOOR_CLEANER"), qty: 20, unitPrice: dinarsToMoney(180) },
      { itemId: item("WASTE_BAGS"), qty: 200, unitPrice: dinarsToMoney(15) },
      { itemId: item("VACUUM"), qty: 3, unitPrice: dinarsToMoney(24_000) },
      { itemId: item("LADDER"), qty: 2, unitPrice: dinarsToMoney(6_500) },
      { itemId: item("BUCKET"), qty: 6, unitPrice: dinarsToMoney(450) },
      { itemId: item("BROOM"), qty: 5, unitPrice: dinarsToMoney(350) },
      { itemId: item("MOP"), qty: 5, unitPrice: dinarsToMoney(600) },
    ],
  });
  names.purchase = purchase.id;

  // ── The first vacuum cleaner is serviced every three months: its next service falls this Thursday ──
  // (inside `alerts.maintenanceLeadDays`: it lights the maintenance tile of the home screen.)
  const firstVacuum = await ex
    .selectFrom("EquipmentUnit")
    .select("id")
    .where("itemId", "=", item("VACUUM"))
    .orderBy("numberSeq")
    .executeTakeFirst();
  if (firstVacuum) {
    await setMaintenancePlan(ex, ctx, { unitId: firstVacuum.id, intervalDays: 90, nextDate: "2026-10-15" });
    names.unitMaintenanceDue = firstVacuum.id;
  }

  // ── This morning: the team of today's first visit takes its materials ──
  const visitId = tools.names.operations?.visitInProgress ?? tools.names.operations?.visitToday;
  if (visitId) {
    const visit = await ex.selectFrom("Visit").select(["id", "fileId"]).where("id", "=", visitId).executeTakeFirst();
    const seat = await ex
      .selectFrom("VisitWorker")
      .select("workerId")
      .where("visitId", "=", visitId)
      .where("seatStatus", "=", "ASSIGNED")
      .orderBy("createdAt")
      .executeTakeFirst();
    const workerId = seat?.workerId ?? tools.names.people?.workerSamira;
    if (visit && workerId) {
      const storekeeper = tools.at(ctx.now, await tools.sessionOf("OPERATIONS"));
      const handOut = await createHandOut(ex, storekeeper, {
        date: ctx.today,
        purpose: "JOB",
        fileId: visit.fileId,
        visitId: visit.id,
        workerId,
        lines: [
          { itemId: item("FLOOR_CLEANER"), qty: 2.5 },
          { itemId: item("WASTE_BAGS"), qty: 20 },
          { itemId: item("PPE_GLOVES"), qty: 2 },
          { itemId: item("BUCKET"), qty: 1, condition: "GOOD" },
        ],
        note: "لتنظيف السلالم والمدخل",
      });
      names.handOut = handOut.id;
    }
  }
  return names;
}
