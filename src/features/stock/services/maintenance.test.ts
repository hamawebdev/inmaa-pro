import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countMaintenanceDue } from "../alerts";
import { stockItem } from "../testing/fixtures";

import { listEquipmentUnits, listMaintenance, recordMaintenance, setMaintenancePlan } from "./maintenance";
import { createSupplier, recordPurchase } from "./purchases";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** One vacuum cleaner bought today: a piece followed by its own number. */
async function vacuum() {
  const item = await stockItem(test, {
    nameAr: "مكنسة كهربائية",
    kind: "EQUIPMENT",
    category: "MACHINE",
    unit: "PIECE",
    tracking: "UNIT",
    openingQty: 0,
  });
  const { id: supplierId } = await test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
  await test.transact((ex, ctx) =>
    recordPurchase(ex, ctx, {
      date: "2026-10-12",
      supplierId,
      division: "COMMON",
      method: "CASH",
      lines: [{ itemId: item.id, qty: 1, unitPrice: 2_500_000 }],
    }),
  );
  const [unit] = await test.transact((ex, ctx) => listEquipmentUnits(ex, ctx));
  return unit;
}

const due = () => test.transact((ex, ctx) => countMaintenanceDue(ex, ctx, { leadDays: 7 }));

describe("a piece of equipment's maintenance", () => {
  it("is planned by an interval, and lights the tile inside the lead time", async () => {
    const unit = await vacuum();
    expect(unit).toMatchObject({ itemName: "مكنسة كهربائية", condition: "GOOD", location: "STORE", alert: null });
    expect(await due()).toBe(0);

    // Every 90 days from today: far off, nothing to see to.
    await test.transact((ex, ctx) => setMaintenancePlan(ex, ctx, { unitId: unit.id, intervalDays: 90 }));
    let [planned] = await test.transact((ex, ctx) => listEquipmentUnits(ex, ctx));
    expect(planned).toMatchObject({ intervalDays: 90, nextMaintenanceDate: "2027-01-10", alert: null });

    // The date typed: in five days.
    await test.transact((ex, ctx) =>
      setMaintenancePlan(ex, ctx, { unitId: unit.id, intervalDays: 90, nextDate: "2026-10-17" }),
    );
    [planned] = await test.transact((ex, ctx) => listEquipmentUnits(ex, ctx));
    expect(planned.alert).toEqual({ state: "DUE_SOON", daysLeft: 5 });
    expect(await due()).toBe(1);
  });

  it("is recorded: the dates and the condition move, and the cost goes into the expenses", async () => {
    const unit = await vacuum();
    await test.transact((ex, ctx) =>
      setMaintenancePlan(ex, ctx, { unitId: unit.id, intervalDays: 30, nextDate: "2026-10-10" }),
    );
    expect(await due()).toBe(1);

    const done = await test.transact((ex, ctx) =>
      recordMaintenance(ex, ctx, {
        unitId: unit.id,
        date: "2026-10-12",
        kind: "PREVENTIVE",
        description: "تنظيف المصفاة وتغيير الكيس",
        cost: 150_000,
        provider: "ورشة الأمل",
        conditionAfter: "GOOD",
      }),
    );
    expect(done.nextDueDate).toBe("2026-11-11");
    const [after] = await test.transact((ex, ctx) => listEquipmentUnits(ex, ctx));
    expect(after).toMatchObject({ lastMaintenanceDate: "2026-10-12", nextMaintenanceDate: "2026-11-11", alert: null });
    expect(await due()).toBe(0);

    const expense = await test.db
      .selectFrom("Expense")
      .select(["category", "division", "amount", "source", "paidTo"])
      .where("maintenanceRecordId", "=", done.id)
      .executeTakeFirstOrThrow();
    expect(expense).toEqual({
      category: "MAINTENANCE",
      division: "COMMON",
      amount: 150_000,
      source: "MAINTENANCE",
      paidTo: "ورشة الأمل",
    });
    const history = await test.transact((ex, ctx) => listMaintenance(ex, ctx, { unitId: unit.id }));
    expect(history).toMatchObject([{ kind: "PREVENTIVE", cost: 150_000, conditionAfter: "GOOD" }]);
  });

  it("is refused to who only reads the store, and with nothing written about it", async () => {
    const unit = await vacuum();
    const supervisor = await test.sessionFor("SUPERVISOR");
    await expect(
      test.transact((ex, ctx) => setMaintenancePlan(ex, ctx, { unitId: unit.id, intervalDays: 30 }), supervisor),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) =>
        recordMaintenance(ex, ctx, {
          unitId: unit.id,
          date: "2026-10-12",
          kind: "REPAIR",
          description: " ",
          conditionAfter: "GOOD",
        }),
      ),
    ).rejects.toThrow("Write what was done.");
  });
});
