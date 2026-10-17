import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveUpload } from "@/lib/attachments";
import { RECEIPT_UPLOAD_RULE } from "@/lib/uploads";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { da } from "../testing/fixtures";
import type { ExpenseFormValues } from "../validators/expense";

import { createExpense, deleteExpense, listExpenses, updateExpense } from "./expenses";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** Monday 12 October 2026: fuel for the building team, paid in cash. */
const FUEL: ExpenseFormValues = {
  division: "BUILDING",
  category: "TRANSPORT",
  date: "2026-10-12",
  amount: 2_500.5,
  method: "CASH",
  paidTo: "محطة نفطال",
  spentByName: "سميرة حداد",
  recurrence: "NONE",
  note: undefined,
};

const october = { from: "2026-10-01", to: "2026-10-31" } as never;

describe("an expense typed by hand", () => {
  it("is stored in centimes on its division, and listed for its period", async () => {
    const { id } = await test.transact((ex, ctx) => createExpense(ex, ctx, { values: FUEL }));
    const row = await test.db.selectFrom("Expense").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      date: "2026-10-12",
      division: "BUILDING",
      category: "TRANSPORT",
      amount: da(2_500.5),
      method: "CASH",
      paidTo: "محطة نفطال",
      spentByName: "سميرة حداد",
      recurrence: "NONE",
      source: "MANUAL",
      receiptUrl: null,
      note: null,
      branchId: "branch-main",
      deletedAt: null,
    });
    const listed = await test.transact((ex, ctx) => listExpenses(ex, ctx, october));
    expect(listed).toEqual([
      {
        id,
        date: "2026-10-12",
        division: "BUILDING",
        category: "TRANSPORT",
        amount: da(2_500.5),
        method: "CASH",
        paidTo: "محطة نفطال",
        spentByName: "سميرة حداد",
        recurrence: "NONE",
        source: "MANUAL",
        receiptUrl: null,
        note: null,
        fileId: null,
      },
    ]);
    expect(
      await test.transact((ex, ctx) => listExpenses(ex, ctx, { from: "2026-11-01", to: "2026-11-30" } as never)),
    ).toEqual([]);
  });

  it("is checked by the dialog's own rules", async () => {
    const save = (values: Partial<ExpenseFormValues>) =>
      test.transact((ex, ctx) => createExpense(ex, ctx, { values: { ...FUEL, ...values } }));
    await expect(save({ date: "2026-10-13" })).rejects.toThrow("An expense cannot be dated after today.");
    await expect(save({ amount: 0 })).rejects.toThrow("An amount must be more than zero.");
    await expect(save({ amount: 10.005 })).rejects.toThrow("An amount has at most two decimals.");
    await expect(save({ division: "OTHER" as never })).rejects.toThrow("Choose one of the options.");
    expect(await test.db.selectFrom("Expense").select("id").execute()).toEqual([]);
  });

  it("keeps its receipt, and takes a replaced one off", async () => {
    const upload = (name: string) =>
      saveUpload(test.db, test.ctx(), test.files, {
        entity: "Expense",
        field: "receiptUrl",
        rule: RECEIPT_UPLOAD_RULE,
        file: { name, type: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) },
      });
    const first = await upload("receipt-1.png");
    const { id } = await test.transact((ex, ctx) => createExpense(ex, ctx, { values: FUEL, receiptUrl: first.url }));
    expect(
      (await test.db.selectFrom("Upload").select("ownerId").where("url", "=", first.url).executeTakeFirstOrThrow())
        .ownerId,
    ).toBe(id);

    const second = await upload("receipt-2.png");
    await test.transact((ex, ctx) => updateExpense(ex, ctx, { id, values: FUEL, receiptUrl: second.url }));
    const uploads = await test.db
      .selectFrom("Upload")
      .select(["url", "ownerId", "removedAt"])
      .orderBy("createdAt")
      .execute();
    expect(uploads.find((row) => row.url === first.url)?.removedAt).not.toBeNull();
    expect(uploads.find((row) => row.url === second.url)).toMatchObject({ ownerId: id, removedAt: null });
    expect(
      (await test.db.selectFrom("Expense").select("receiptUrl").where("id", "=", id).executeTakeFirstOrThrow())
        .receiptUrl,
    ).toBe(second.url);
  });

  it("saves only what changed, and logs it", async () => {
    const { id } = await test.transact((ex, ctx) => createExpense(ex, ctx, { values: FUEL }));
    test.clock.advance({ hours: 1 });
    await test.transact((ex, ctx) =>
      updateExpense(ex, ctx, { id, values: { ...FUEL, amount: 3_000, recurrence: "MONTHLY" } }),
    );
    const row = await test.db.selectFrom("Expense").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ amount: da(3_000), recurrence: "MONTHLY", paidTo: "محطة نفطال" });
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["action", "changes"])
      .where("entityId", "=", id)
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(entry.action).toBe("UPDATE");
    expect(JSON.parse(entry.changes ?? "{}")).toEqual({
      amount: [da(2_500.5), da(3_000)],
      recurrence: ["NONE", "MONTHLY"],
    });

    // Saved again unchanged: nothing is written.
    const before = row.updatedAt;
    test.clock.advance({ hours: 1 });
    await test.transact((ex, ctx) =>
      updateExpense(ex, ctx, { id, values: { ...FUEL, amount: 3_000, recurrence: "MONTHLY" } }),
    );
    expect(
      (await test.db.selectFrom("Expense").select("updatedAt").where("id", "=", id).executeTakeFirstOrThrow())
        .updatedAt,
    ).toBe(before);
  });

  it("is removed with a reason, kept in the log, and never erased", async () => {
    const { id } = await test.transact((ex, ctx) => createExpense(ex, ctx, { values: FUEL }));
    await expect(test.transact((ex, ctx) => deleteExpense(ex, ctx, { id, reason: " " }))).rejects.toThrow(
      "A reason is required.",
    );
    await test.transact((ex, ctx) => deleteExpense(ex, ctx, { id, reason: "سُجّل مرتين" }));
    const row = await test.db.selectFrom("Expense").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.deletedAt).not.toBeNull();
    expect(row.deleteReason).toBe("سُجّل مرتين");
    expect(await test.transact((ex, ctx) => listExpenses(ex, ctx, october))).toEqual([]);
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "reason"])
      .where("entityId", "=", id)
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({ operation: "ERASE", action: "SOFT_DELETE", reason: "سُجّل مرتين" });
    await expect(test.transact((ex, ctx) => updateExpense(ex, ctx, { id, values: FUEL }))).rejects.toThrow(
      "This expense does not exist.",
    );
  });
});

describe("what the expense screen may not do", () => {
  it("leaves an expense the program wrote to the screen it came from", async () => {
    const purchase = await test.rows.insert("Purchase", {});
    const row = await test.rows.insert("Expense", {
      source: "PURCHASE",
      purchaseId: purchase.id,
      category: "MATERIALS",
    });
    await expect(test.transact((ex, ctx) => updateExpense(ex, ctx, { id: row.id, values: FUEL }))).rejects.toThrow(
      "it is changed where it came from",
    );
    await expect(test.transact((ex, ctx) => deleteExpense(ex, ctx, { id: row.id, reason: "خطأ" }))).rejects.toThrow(
      "it is changed where it came from",
    );
  });

  it("is for those with the money section", async () => {
    const supervisor = await test.sessionFor("SUPERVISOR");
    await expect(test.transact((ex, ctx) => createExpense(ex, ctx, { values: FUEL }), supervisor)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    const administration = await test.sessionFor("ADMINISTRATION");
    // Read only: the list opens, the dialog does not save.
    expect(await test.transact((ex, ctx) => listExpenses(ex, ctx, october), administration)).toEqual([]);
    await expect(test.transact((ex, ctx) => createExpense(ex, ctx, { values: FUEL }), administration)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});
