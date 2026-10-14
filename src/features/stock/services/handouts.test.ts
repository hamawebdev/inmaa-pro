import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { listenersOf } from "@/lib/events";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { onHandOf, stockItem, workerOnFile } from "../testing/fixtures";

import {
  cancelHandOut,
  createHandOut,
  getHandOut,
  getHandOutChoices,
  getHandOutsForVisit,
  listHandOuts,
  recordHandOutReturn,
  type CreateHandOutInput,
} from "./handouts";
import { createSupplier, recordPurchase } from "./purchases";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** A building under contract with a visit today, a worker, and a store with cleaner, bags and buckets. */
async function arrange() {
  const site = await test.rows.insert("Site", { division: "BUILDING", address: "حي النصر، عمارة B7" } as never);
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "BUILDING",
    serviceType: "CONTRACT",
    stage: "CONTRACTED",
    contractedAt: "2026-10-01T08:00:00.000Z",
  } as never);
  const visit = await test.rows.insert("Visit", {
    fileId: file.id,
    visitDate: "2026-10-12",
    status: "CONFIRMED",
  } as never);
  const worker = await workerOnFile(test);
  const cleaner = await stockItem(test);
  const bags = await stockItem(test, {
    nameAr: "أكياس نفايات",
    category: "CONSUMABLE",
    unit: "PIECE",
    openingQty: 500,
    minLevel: 100,
  });
  const buckets = await stockItem(test, {
    nameAr: "دلاء",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    openingQty: 3,
    minLevel: 4,
  });
  return { file, visit, worker, cleaner, bags, buckets };
}

const handOut = (input: CreateHandOutInput) => test.transact((ex, ctx) => createHandOut(ex, ctx, input));

describe("a hand-out for a job", () => {
  it("is recorded against the file and the visit, to a named worker, and takes its lines out of the store", async () => {
    const { file, visit, worker, cleaner, bags, buckets } = await arrange();
    const made = await handOut({
      date: "2026-10-12",
      purpose: "JOB",
      fileId: file.id,
      visitId: visit.id,
      workerId: worker.id,
      lines: [
        { itemId: cleaner.id, qty: 2.5 },
        { itemId: bags.id, qty: 20 },
        { itemId: buckets.id, qty: 2, condition: "GOOD" },
      ],
      note: "لتنظيف السلالم",
    });
    expect(made.number).toBe("0001/2026");

    const row = await test.db.selectFrom("HandOut").selectAll().where("id", "=", made.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      date: "2026-10-12",
      purpose: "JOB",
      fileId: file.id,
      visitId: visit.id,
      division: "BUILDING",
      serviceType: "CONTRACT",
      workerId: worker.id,
      note: "لتنظيف السلالم",
      cancelledAt: null,
    });
    expect(await onHandOf(test, cleaner.id)).toBe(27_500);
    expect(await onHandOf(test, bags.id)).toBe(480_000);
    expect(await onHandOf(test, buckets.id)).toBe(1_000);
    const lines = await test.db
      .selectFrom("HandOutLine")
      .select(["itemId", "qty", "condition", "expectReturn"])
      .where("handOutId", "=", made.id)
      .orderBy("createdAt")
      .execute();
    expect(lines).toEqual(
      expect.arrayContaining([
        { itemId: cleaner.id, qty: 2_500, condition: null, expectReturn: 0 },
        { itemId: bags.id, qty: 20_000, condition: null, expectReturn: 0 },
        { itemId: buckets.id, qty: 2_000, condition: "GOOD", expectReturn: 1 },
      ]),
    );
    expect(await verifyChains(test.db)).toMatchObject({ brokenTotals: [] });

    // The log names the worker: the hand-out is about her.
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "entity", "entityLabel", "subjectKind", "subjectId"])
      .where("entity", "=", "HandOut")
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({
      operation: "COLLECT",
      entity: "HandOut",
      entityLabel: "0001/2026",
      subjectKind: "WORKER",
      subjectId: worker.id,
    });
  });

  it("prints its slip from the stored rows, and gives Operations what the order prints", async () => {
    const { file, visit, worker, cleaner, buckets } = await arrange();
    const made = await handOut({
      date: "2026-10-12",
      purpose: "JOB",
      fileId: file.id,
      visitId: visit.id,
      workerId: worker.id,
      lines: [
        { itemId: cleaner.id, qty: 2.5 },
        { itemId: buckets.id, qty: 1, condition: "NEEDS_MAINTENANCE", stayAtSite: true },
      ],
    });
    const detail = await test.transact((ex, ctx) => getHandOut(ex, ctx, { handOutId: made.id }));
    expect(detail.slip).toMatchObject({
      number: "0001/2026",
      date: "2026-10-12",
      place: "أم البواقي",
      purpose: "JOB",
      workerName: "حداد سميرة",
      workerNumber: worker.number,
      job: { fileNumber: file.number, division: "BUILDING", serviceType: "CONTRACT", visitDate: "2026-10-12" },
      cancelled: null,
    });
    expect(detail.slip.job?.siteAddress).toContain("حي النصر");
    expect(detail.slip.lines).toEqual([
      {
        kind: "MATERIAL",
        itemName: "منظف أرضيات",
        unitCode: null,
        qty: 2_500,
        unit: "LITRE",
        condition: null,
        stayAtSite: false,
      },
      {
        kind: "EQUIPMENT",
        itemName: "دلاء",
        unitCode: null,
        qty: 1_000,
        unit: "PIECE",
        condition: "NEEDS_MAINTENANCE",
        stayAtSite: true,
      },
    ]);
    expect(detail.lines.map((line) => line.outstanding)).toEqual([2_500, 1_000]);

    const forOrder = await test.transact((ex, ctx) => getHandOutsForVisit(ex, ctx, { visitId: visit.id }));
    expect(forOrder.map((line) => [line.itemName, line.qty, line.unit, line.workerName])).toEqual([
      ["منظف أرضيات", 2_500, "LITRE", "حداد سميرة"],
      ["دلاء", 1_000, "PIECE", "حداد سميرة"],
    ]);
    expect(Object.keys(forOrder[0])).not.toContain("unitCost");
    const [listed] = await test.transact((ex, ctx) => listHandOuts(ex, ctx, {}));
    expect(listed).toMatchObject({
      number: "0001/2026",
      fileNumber: file.number,
      lines: 2,
      stillOut: 1,
      cancelled: false,
    });
  });

  it("refuses what the store does not hold, an unknown job, and equipment with no condition", async () => {
    const { file, visit, worker, cleaner, buckets } = await arrange();
    const base = {
      date: "2026-10-12",
      purpose: "JOB" as const,
      fileId: file.id,
      visitId: visit.id,
      workerId: worker.id,
    };
    await expect(handOut({ ...base, lines: [{ itemId: cleaner.id, qty: 31 }] })).rejects.toThrow(
      "There is not enough of this item in the store.",
    );
    // Two lines of one item are counted together.
    await expect(
      handOut({
        ...base,
        lines: [
          { itemId: cleaner.id, qty: 20 },
          { itemId: cleaner.id, qty: 11 },
        ],
      }),
    ).rejects.toThrow("There is not enough of this item in the store.");
    await expect(handOut({ ...base, lines: [{ itemId: buckets.id, qty: 1 }] })).rejects.toThrow(
      "Say in what condition the equipment is handed over.",
    );
    await expect(handOut({ ...base, lines: [] })).rejects.toThrow("A hand-out needs at least one line.");
    await expect(handOut({ ...base, lines: [{ itemId: cleaner.id, qty: 0 }] })).rejects.toThrow(
      "A quantity must be more than zero.",
    );
    await expect(handOut({ ...base, fileId: null, lines: [{ itemId: cleaner.id, qty: 1 }] })).rejects.toThrow(
      "Choose the job this hand-out is for.",
    );
    await expect(handOut({ ...base, workerId: "nobody", lines: [{ itemId: cleaner.id, qty: 1 }] })).rejects.toThrow(
      "Choose the worker who receives the hand-out.",
    );
    await expect(handOut({ ...base, date: "2026-10-13", lines: [{ itemId: cleaner.id, qty: 1 }] })).rejects.toThrow(
      "A hand-out cannot be dated after today.",
    );
    const other = await test.rows.insert("Visit", { visitDate: "2026-10-12" } as never);
    await expect(handOut({ ...base, visitId: other.id, lines: [{ itemId: cleaner.id, qty: 1 }] })).rejects.toThrow(
      "This visit is not one of this file's visits.",
    );
    expect(await onHandOf(test, cleaner.id)).toBe(30_000);
    expect(await test.db.selectFrom("HandOut").select("id").execute()).toEqual([]);
  });

  it("can be a worker's own kit, with no job", async () => {
    const { worker } = await arrange();
    const gloves = await stockItem(test, {
      nameAr: "قفازات",
      category: "PPE",
      unit: "PAIR",
      openingQty: 100,
      minLevel: 30,
    });
    const made = await handOut({
      date: "2026-10-12",
      purpose: "WORKER_KIT",
      fileId: "ignored",
      workerId: worker.id,
      lines: [{ itemId: gloves.id, qty: 2 }],
    });
    const row = await test.db.selectFrom("HandOut").selectAll().where("id", "=", made.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      purpose: "WORKER_KIT",
      fileId: null,
      visitId: null,
      division: null,
      serviceType: null,
    });
    const detail = await test.transact((ex, ctx) => getHandOut(ex, ctx, { handOutId: made.id }));
    expect(detail.slip.job).toBeNull();
  });
});

describe("what comes back", () => {
  it("returns equipment to the store, and says what was lost or damaged", async () => {
    const { file, worker, buckets } = await arrange();
    const made = await handOut({
      date: "2026-10-12",
      purpose: "JOB",
      fileId: file.id,
      workerId: worker.id,
      lines: [{ itemId: buckets.id, qty: 3, condition: "GOOD" }],
    });
    const [line] = (await test.transact((ex, ctx) => getHandOut(ex, ctx, { handOutId: made.id }))).lines;
    expect(await onHandOf(test, buckets.id)).toBe(0);

    const back = (input: Omit<Parameters<typeof recordHandOutReturn>[2], "handOutLineId" | "date">) =>
      test.transact((ex, ctx) =>
        recordHandOutReturn(ex, ctx, { handOutLineId: line.id, date: "2026-10-12", ...input }),
      );
    await expect(back({ qtyReturned: 1 })).rejects.toThrow("Say in what condition the equipment came back.");
    await expect(back({ qtyReturned: 0 })).rejects.toThrow("Say what came back, was lost or was damaged.");
    await expect(back({ qtyReturned: 2, qtyLost: 1, condition: "GOOD" })).rejects.toThrow(
      "Say what happened to what was lost or damaged.",
    );
    await expect(back({ qtyReturned: 4, condition: "GOOD" })).rejects.toThrow("This is more than what is still out.");

    const first = await back({ qtyReturned: 1, condition: "GOOD" });
    expect(first.outstanding).toBe(2_000);
    expect(await onHandOf(test, buckets.id)).toBe(1_000);

    // People listens for what did not come back whole.
    expect(listenersOf("handout.returnedShort")).toEqual([]);
    const second = await back({ qtyReturned: 1, qtyDamaged: 1, condition: "GOOD", note: "دلو مكسور عند الدرج" });
    expect(second.outstanding).toBe(0);
    // Only what came back whole is on the shelf again.
    expect(await onHandOf(test, buckets.id)).toBe(2_000);
    await expect(back({ qtyReturned: 1, condition: "GOOD" })).rejects.toThrow("This is more than what is still out.");
    const [listed] = await test.transact((ex, ctx) => listHandOuts(ex, ctx, { fileId: file.id }));
    expect(listed.stillOut).toBe(0);
    expect(await verifyChains(test.db)).toMatchObject({ brokenTotals: [] });
  });

  it("cancels a hand-out typed by mistake, giving everything back, once and before any return", async () => {
    const { file, worker, cleaner, buckets } = await arrange();
    const made = await handOut({
      date: "2026-10-12",
      purpose: "JOB",
      fileId: file.id,
      workerId: worker.id,
      lines: [
        { itemId: cleaner.id, qty: 5 },
        { itemId: buckets.id, qty: 1, condition: "GOOD" },
      ],
    });
    const supervisor = await test.sessionFor("SUPERVISOR");
    await expect(
      test.transact((ex, ctx) => cancelHandOut(ex, ctx, { handOutId: made.id, reason: "خطأ" }), supervisor),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => cancelHandOut(ex, ctx, { handOutId: made.id, reason: "" })),
    ).rejects.toThrow("A reason is required.");
    await test.transact((ex, ctx) => cancelHandOut(ex, ctx, { handOutId: made.id, reason: "سُجّل على ملف آخر" }));
    expect(await onHandOf(test, cleaner.id)).toBe(30_000);
    expect(await onHandOf(test, buckets.id)).toBe(3_000);
    const reversals = await test.db
      .selectFrom("StockMovement")
      .select(["qty", "reason"])
      .where("type", "=", "REVERSAL")
      .orderBy("qty")
      .execute();
    expect(reversals).toEqual([
      { qty: 1_000, reason: "سُجّل على ملف آخر" },
      { qty: 5_000, reason: "سُجّل على ملف آخر" },
    ]);
    await expect(
      test.transact((ex, ctx) => cancelHandOut(ex, ctx, { handOutId: made.id, reason: "ثانية" })),
    ).rejects.toThrow("This hand-out is already cancelled.");
    const detail = await test.transact((ex, ctx) => getHandOut(ex, ctx, { handOutId: made.id }));
    expect(detail.slip.cancelled).toEqual({ date: "2026-10-12", reason: "سُجّل على ملف آخر" });

    const again = await handOut({
      date: "2026-10-12",
      purpose: "JOB",
      fileId: file.id,
      workerId: worker.id,
      lines: [{ itemId: buckets.id, qty: 1, condition: "GOOD" }],
    });
    const [line] = (await test.transact((ex, ctx) => getHandOut(ex, ctx, { handOutId: again.id }))).lines;
    await test.transact((ex, ctx) =>
      recordHandOutReturn(ex, ctx, { handOutLineId: line.id, date: "2026-10-12", qtyReturned: 1, condition: "GOOD" }),
    );
    await expect(
      test.transact((ex, ctx) => cancelHandOut(ex, ctx, { handOutId: again.id, reason: "خطأ" })),
    ).rejects.toThrow("A hand-out with a return cannot be cancelled.");
  });
});

describe("equipment lost or damaged", () => {
  it("goes on the worker's ledger at what it cost the store", async () => {
    const worker = await workerOnFile(test);
    const buckets = await stockItem(test, {
      nameAr: "دلاء",
      kind: "EQUIPMENT",
      category: "TOOL",
      unit: "PIECE",
      openingQty: 0,
    });
    const { id: supplierId } = await test.transact((ex, ctx) => createSupplier(ex, ctx, { name: "مؤسسة الصفاء" }));
    await test.transact((ex, ctx) =>
      recordPurchase(ex, ctx, {
        date: "2026-10-12",
        supplierId,
        division: "COMMON",
        method: "CASH",
        lines: [{ itemId: buckets.id, qty: 4, unitPrice: 45_000 }],
      }),
    );
    const handOut = await test.transact((ex, ctx) =>
      createHandOut(ex, ctx, {
        date: "2026-10-12",
        purpose: "WORKER_KIT",
        workerId: worker.id,
        lines: [{ itemId: buckets.id, qty: 3, condition: "GOOD" }],
      }),
    );
    const [line] = await test.db.selectFrom("HandOutLine").select("id").where("handOutId", "=", handOut.id).execute();
    const back = await test.transact((ex, ctx) =>
      recordHandOutReturn(ex, ctx, {
        handOutLineId: line.id,
        date: "2026-10-12",
        qtyReturned: 1,
        condition: "GOOD",
        qtyLost: 1,
        qtyDamaged: 1,
        note: "سقط دلو من السطح وانكسر آخر",
      }),
    );
    const debts = await test.db
      .selectFrom("StaffDebtEntry")
      .select(["staffId", "direction", "reason", "amount", "balanceAfter", "handOutReturnId"])
      .where("handOutReturnId", "=", back.id)
      .orderBy("seq")
      .execute();
    expect(debts).toEqual([
      {
        staffId: worker.id,
        direction: "INCREASE",
        reason: "LOSS",
        amount: 45_000,
        balanceAfter: 45_000,
        handOutReturnId: back.id,
      },
      {
        staffId: worker.id,
        direction: "INCREASE",
        reason: "DAMAGE",
        amount: 45_000,
        balanceAfter: 90_000,
        handOutReturnId: back.id,
      },
    ]);
  });
});

describe("what the hand-out form offers", () => {
  it("lists the jobs in hand, the workers on file and what the store holds", async () => {
    const { file, worker, cleaner } = await arrange();
    await stockItem(test, {
      nameAr: "آلة تنظيف الأرضيات",
      kind: "EQUIPMENT",
      category: "MACHINE",
      unit: "PIECE",
      openingQty: 0,
    });
    const choices = await test.transact((ex, ctx) => getHandOutChoices(ex, ctx));
    expect(choices.files).toEqual([
      {
        id: file.id,
        number: file.number,
        clientName: expect.any(String),
        division: "BUILDING",
        serviceType: "CONTRACT",
      },
    ]);
    expect(choices.workers).toEqual([{ id: worker.id, number: worker.number, name: "حداد سميرة" }]);
    // Nothing on the shelf, nothing to hand out.
    expect(choices.items.map((item) => item.name)).toEqual(["دلاء", "منظف أرضيات", "أكياس نفايات"]);
    expect(choices.items.find((item) => item.id === cleaner.id)).toMatchObject({ unit: "LITRE", onHandQty: 30_000 });
    expect(choices.pieces).toEqual([]);
  });

  it("names the pieces in the store of a machine followed one by one", async () => {
    const vacuum = await stockItem(test, {
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
        lines: [{ itemId: vacuum.id, qty: 2, unitPrice: 2_500_000 }],
      }),
    );
    const choices = await test.transact((ex, ctx) => getHandOutChoices(ex, ctx));
    expect(choices.pieces).toEqual([
      { id: expect.any(String), itemId: vacuum.id, number: expect.any(String), condition: "GOOD" },
      { id: expect.any(String), itemId: vacuum.id, number: expect.any(String), condition: "GOOD" },
    ]);
  });
});
