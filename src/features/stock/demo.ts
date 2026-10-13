import type { Executor, ServiceContext } from "@/lib/service/context";
import { dinarsToMoney } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { sampleInventory } from "./samples/inventory";
import { createHandOut } from "./services/handouts";
import { createStockItem } from "./services/items";
import { setMaintenancePlan } from "./services/maintenance";
import { createSupplier, recordPurchase } from "./services/purchases";

/**
 * Stock's demo data (CLAUDE.md, "Demo data"): his store, a purchase, and a
 * hand-out against today's job.
 *
 *  - The items of his lists (his first study's store table with its four
 *    minimums, the worker's kit, form 9's hand-out lines, form 8's equipment),
 *    each with what is on the shelf this morning. The machines followed one by
 *    one start empty and come in with the purchase, which numbers each piece.
 *  - One purchase from a supplier, which also writes its expense.
 *  - One hand-out: cleaner, bags and a bucket for the team of today's first
 *    visit (Operations' demo), to the first worker on its team.
 *
 * Quantities are invented, a few at or below their minimum so the chip shows.
 */
export async function seedDemo(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  const ids = new Map<string, string>();

  for (const item of sampleInventory()) {
    const pieces = item.tracking === "UNIT";
    const made = await createStockItem(ex, ctx, {
      code: item.code,
      values: {
        nameAr: item.nameAr,
        nameFr: item.nameFr ?? undefined,
        nameEn: item.nameEn ?? undefined,
        kind: item.kind as "EQUIPMENT" | "MATERIAL",
        category: (item.category ?? undefined) as never,
        unit: item.unit as never,
        tracking: item.tracking as "QUANTITY" | "UNIT",
        minLevel: item.minLevel === null ? undefined : item.minLevel / 1000,
        // A machine is counted by its pieces: they enter with the purchase below.
        openingQty: pieces ? 0 : item.onHandQty / 1000,
      },
    });
    ids.set(item.code, made.id);
  }
  names.floorCleaner = ids.get("FLOOR_CLEANER") ?? "";

  // ── Monday 5 October: bought in bulk, the vacuum cleaners numbered piece by piece ──
  const supplier = await createSupplier(ex, ctx, {
    name: "مؤسسة الصفاء لمواد التنظيف",
    phone: "032 44 55 66",
    address: "المنطقة الصناعية، عين مليلة",
  });
  names.supplier = supplier.id;
  const item = (code: string) => {
    const id = ids.get(code);
    if (!id) throw new Error(`stock: no demo item ${code}`);
    return id;
  };
  const purchase = await recordPurchase(ex, ctx, {
    date: "2026-10-05",
    supplierId: supplier.id,
    supplierInvoiceNo: "F-2026/118",
    division: "COMMON",
    method: "CASH",
    lines: [
      { itemId: item("FLOOR_CLEANER"), qty: 20, unitPrice: dinarsToMoney(180) },
      { itemId: item("BIN_BAGS"), qty: 200, unitPrice: dinarsToMoney(15) },
      { itemId: item("VACUUM"), qty: 3, unitPrice: dinarsToMoney(24_000) },
      { itemId: item("LADDER"), qty: 2, unitPrice: dinarsToMoney(6_500) },
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

  // The item the low-stock tile counts first: one of his materials at or below its minimum.
  const low = await ex
    .selectFrom("StockItem")
    .select("id")
    .where("kind", "=", "MATERIAL")
    .where("minLevel", "is not", null)
    .whereRef("onHandQty", "<=", "minLevel")
    .orderBy("code")
    .executeTakeFirst();
  if (low) names.itemLow = low.id;

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
          { itemId: item("BIN_BAGS"), qty: 20 },
          { itemId: item("PPE_GLOVES"), qty: 2 },
          { itemId: item("BUCKETS"), qty: 1, condition: "GOOD" },
        ],
        note: "لتنظيف السلالم والمدخل",
      });
      names.handOut = handOut.id;
    }
  }
  return names;
}
