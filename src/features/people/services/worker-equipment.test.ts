import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listWorkerEquipmentIncidents, listWorkerHoldings } from "./worker-equipment";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function aWorker() {
  return (
    await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, {
        ...emptyWorkerValues("2026-08-01"),
        sex: "FEMALE",
        lastName: "قاسمي",
        firstName: "نوال",
        birthDate: "1996-01-12",
        phone: "0555 31 42 53",
        hiringDecision: "ACCEPTED",
        issuedDate: "2026-08-01",
      }),
    )
  ).id;
}

/** An aspirator handed to her on 1 October, 450 DA. */
async function handedOut(workerId: string) {
  const item = await test.rows.insert("StockItem", { kind: "EQUIPMENT", nameAr: "مكنسة كهربائية" });
  const handOut = await test.rows.insert("HandOut", { workerId, date: localDate("2026-10-01"), number: "12/2026" });
  return test.rows.insert("HandOutLine", {
    handOutId: handOut.id,
    itemId: item.id,
    qty: 1000 as never,
    unitCost: 45_000 as never,
    expectReturn: 1,
  });
}

describe("what the stock says about a worker, where the office decides", () => {
  it("shows on her file the equipment she lost, its charge to pay readers only", async () => {
    const id = await aWorker();
    const line = await handedOut(id);
    await test.rows.insert("HandOutReturn", {
      handOutLineId: line.id,
      date: localDate("2026-10-10"),
      qtyReturned: 0 as never,
      qtyLost: 1000 as never,
      note: "ضاعت في الموقع",
    });
    const [incident] = await test.transact((ex, ctx) => listWorkerEquipmentIncidents(ex, ctx, { workerId: id }));
    expect(incident).toMatchObject({ itemName: "مكنسة كهربائية", lost: 1000, state: "PENDING", cost: 45_000 });
    // A supervisor reads the workers' section, not pay: the amounts are not hers to see.
    const supervisor = await test.sessionFor("SUPERVISOR");
    const [seen] = await test.transact(
      (ex, ctx) => listWorkerEquipmentIncidents(ex, ctx, { workerId: id }),
      supervisor,
    );
    expect(seen).toMatchObject({ state: "PENDING", charged: null, cost: null });
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact((ex, ctx) => listWorkerEquipmentIncidents(ex, ctx, { workerId: id }), reception),
    ).rejects.toThrow("You do not have permission to do this.");
  });

  it("shows in the leaving dialog what she still holds, to whoever may record her leaving", async () => {
    const id = await aWorker();
    await handedOut(id);
    const holdings = await test.transact((ex, ctx) => listWorkerHoldings(ex, ctx, { workerId: id }));
    expect(holdings.equipment).toHaveLength(1);
    expect(holdings.equipment[0]).toMatchObject({ itemName: "مكنسة كهربائية", qty: 1000, atSite: false });
    const supervisor = await test.sessionFor("SUPERVISOR");
    await expect(test.transact((ex, ctx) => listWorkerHoldings(ex, ctx, { workerId: id }), supervisor)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});
