import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { syncDues } from "./dues";
import { createExpense } from "./expenses";
import { buildAccountantExport, csvAmount, csvCell } from "./exports";
import { issueInvoice, voidInvoice } from "./invoices";
import { recordPayment } from "./payments";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

const december = { from: "2026-12-01", to: "2026-12-31" };

/** November invoiced twice (the first voided), paid in cash on 3 December. */
async function decemberBooks() {
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  await openDay(test, "2026-12-01T08:00:00.000Z");
  const [november] = await test.db
    .selectFrom("PaymentDue")
    .select("id")
    .where("fileId", "=", file.id)
    .orderBy("seq")
    .execute();
  const first = await test.transact((ex, ctx) =>
    issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "CASH" }),
  );
  await test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: first.id, reason: "خطأ في الفترة" }));
  const second = await test.transact((ex, ctx) =>
    issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "CASH" }),
  );
  await openDay(test, "2026-12-03T09:00:00.000Z");
  await test.transact((ex, ctx) =>
    recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) }),
  );
  return { file, first, second };
}

it("writes amounts and cells the way a semicolon file needs them", () => {
  expect([csvAmount(1_200_000), csvAmount(-20_050), csvAmount(5)]).toEqual(["12000,00", "-200,50", "0,05"]);
  expect([csvCell("حي 500 مسكن; أم البواقي"), csvCell('قال "نعم"'), csvCell(null)]).toEqual([
    '"حي 500 مسكن; أم البواقي"',
    '"قال ""نعم"""',
    "",
  ]);
});

it("exports the sales journal with the void marked, records the export and logs it as a disclosure", async () => {
  const { first, second } = await decemberBooks();
  const out = await test.transact((ex, ctx) => buildAccountantExport(ex, ctx, { kind: "INVOICES", ...december }));
  expect(out.fileName).toBe("inmaa-journal-ventes-2026-12-01-2026-12-31.csv");
  expect(out.rowCount).toBe(2);
  expect(out.text.startsWith("\uFEFFرقم الفاتورة;تاريخ الفاتورة;")).toBe(true);
  const [, firstLine, secondLine] = out.text.split("\r\n");
  expect(firstLine.split(";")).toEqual(
    expect.arrayContaining([first.number, "01/12/2026", "45000,00", "ملغاة", "خطأ في الفترة"]),
  );
  expect(secondLine.split(";")).toEqual(expect.arrayContaining([second.number, "صادرة", "45675,00"]));

  const batch = await test.db.selectFrom("ExportBatch").selectAll().executeTakeFirstOrThrow();
  expect(batch).toMatchObject({ kind: "INVOICES", periodFrom: "2026-12-01", periodTo: "2026-12-31", rowCount: 2 });
  expect(batch.fileHash).toMatch(/^[0-9a-f]{64}$/);
  const entry = await test.db
    .selectFrom("AuditLog")
    .selectAll()
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirstOrThrow();
  expect(entry).toMatchObject({
    operation: "DISCLOSE",
    entity: "ExportBatch",
    entityId: batch.id,
    disclosure: "EXPORT",
  });
});

it("exports the receipts, the payments and the expenses of the period", async () => {
  await decemberBooks();
  const receipts = await test.transact((ex, ctx) => buildAccountantExport(ex, ctx, { kind: "RECEIPTS", ...december }));
  expect(receipts.rowCount).toBe(1);
  expect(receipts.text.split("\r\n")[1].split(";")).toEqual(
    expect.arrayContaining(["المكتب", "45000,00", "675,00", "45675,00", "مستعمل"]),
  );
  const payments = await test.transact((ex, ctx) => buildAccountantExport(ex, ctx, { kind: "PAYMENTS", ...december }));
  expect(payments.text.split("\r\n")[1].split(";")).toEqual(
    expect.arrayContaining(["03/12/2026", "العمارات", "نقدًا", "45000,00", "صحيح"]),
  );
  const expenses = await test.transact((ex, ctx) => buildAccountantExport(ex, ctx, { kind: "EXPENSES", ...december }));
  expect(expenses.rowCount).toBe(0);
  expect(expenses.text).toBe("\uFEFFالتاريخ;القسم;البند;المبلغ;طريقة الدفع;المستفيد;المصدر;ملاحظة\r\n");
});

it("is the accountant's: reception may not export", async () => {
  const reception = await test.sessionFor("RECEPTION_SALES");
  await expect(
    test.transact((ex, ctx) => buildAccountantExport(ex, ctx, { kind: "PAYMENTS", ...december }), reception),
  ).rejects.toThrow("You do not have permission to do this.");
});

it("words every expense category and dates a void by the centre's day, not UTC's (MON-15)", async () => {
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  await openDay(test, "2026-12-31T08:00:00.000Z");
  const [november] = await test.db
    .selectFrom("PaymentDue")
    .select("id")
    .where("fileId", "=", file.id)
    .orderBy("seq")
    .execute();
  const issued = await test.transact((ex, ctx) => issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }));
  await test.transact((ex, ctx) =>
    createExpense(ex, ctx, {
      values: {
        division: "COMMON",
        category: "LOSSES",
        date: "2026-12-31",
        amount: 300,
        method: "CASH",
        recurrence: "NONE",
      } as never,
    }),
  );
  // Voided at half past midnight in Algeria on 1 January: 23:30 on 31 December in UTC.
  test.clock.set("2026-12-31T23:30:00.000Z");
  await test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: issued.id, reason: "خطأ" }));

  const sales = await test.transact((ex, ctx) =>
    buildAccountantExport(ex, ctx, { kind: "INVOICES", from: "2026-12-01", to: "2026-12-31" }),
  );
  expect(sales.text.split("\r\n")[1].split(";")).toEqual(expect.arrayContaining(["ملغاة", "01/01/2027"]));
  const spent = await test.transact((ex, ctx) =>
    buildAccountantExport(ex, ctx, { kind: "EXPENSES", from: "2026-12-01", to: "2026-12-31" }),
  );
  expect(spent.text).toContain("الخسائر/الإلغاءات");
  expect(spent.text).not.toContain("LOSSES");
});
