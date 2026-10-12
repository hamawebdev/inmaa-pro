import type { TestDatabase } from "@/testing/database";

import { createStockItem } from "../services/items";
import type { NewStockItemValues } from "../validators/item";

/** Items Stock's tests start from, made through the service so each has its opening movement. Imported by tests only. */
export async function stockItem(test: TestDatabase, values: Partial<NewStockItemValues> & { code?: string } = {}) {
  const { code, ...rest } = values;
  return test.transact((ex, ctx) =>
    createStockItem(ex, ctx, {
      code,
      values: {
        nameAr: "منظف أرضيات",
        kind: "MATERIAL",
        category: "CLEANING_PRODUCT",
        unit: "LITRE",
        tracking: "QUANTITY",
        minLevel: 10,
        openingQty: 30,
        ...rest,
      },
    }),
  );
}

export const onHandOf = async (test: TestDatabase, itemId: string) =>
  (await test.db.selectFrom("StockItem").select("onHandQty").where("id", "=", itemId).executeTakeFirstOrThrow())
    .onHandQty;

/** A worker on file, as People would have registered her. */
export const workerOnFile = (test: TestDatabase) =>
  test.rows.insert("StaffMember", {
    kind: "WORKER",
    lastName: "حداد",
    firstName: "سميرة",
    engagementStatus: "ACCEPTED",
  } as never);
