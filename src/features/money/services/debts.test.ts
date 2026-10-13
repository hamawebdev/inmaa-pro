import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { getFileMoney, getPaymentReminder, listOpenDues, recordReminderPrinted } from "./debts";
import { syncDues } from "./dues";
import { issueInvoice } from "./invoices";
import { recordPayment } from "./payments";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

/** A contract with its three monthly dues; November invoiced, then 20 000,00 paid on it in cash, on 3 December. */
async function partlyPaidNovember() {
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  await openDay(test, "2026-12-01T08:00:00.000Z");
  const dues = await test.db
    .selectFrom("PaymentDue")
    .select("id")
    .where("fileId", "=", file.id)
    .orderBy("seq")
    .execute();
  const invoice = await test.transact((ex, ctx) =>
    issueInvoice(ex, ctx, { fileId: file.id, dueIds: [dues[0].id], paymentMethod: "CASH" }),
  );
  await openDay(test, "2026-12-03T09:00:00.000Z");
  await test.transact((ex, ctx) =>
    recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(20_000) }),
  );
  return { file, invoice, dueIds: dues.map((due) => due.id) };
}

describe("the debt list", () => {
  it("lists what is still owed, oldest first, with its state on today", async () => {
    const { file, invoice } = await partlyPaidNovember();
    const rows = await test.transact((ex, ctx) => listOpenDues(ex, ctx));
    expect(rows.map((row) => [row.dueDate, row.remaining, row.state, row.invoiceNumber])).toEqual([
      ["2026-11-30", da(25_000), "OVERDUE", invoice.number],
      ["2026-12-30", da(45_000), "UPCOMING", null],
      ["2027-01-30", da(45_000), "UPCOMING", null],
    ]);
    expect(rows[0]).toMatchObject({ fileId: file.id, division: "BUILDING", payerName: "رشيد بوزيد", daysLate: 3 });
  });

  it("leaves out what is paid and what is cancelled", async () => {
    const { file, dueIds } = await partlyPaidNovember();
    await test.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.id,
        receivedDate: "2026-12-03",
        method: "CASH",
        amount: da(25_000),
        dueIds: [dueIds[0]],
      }),
    );
    await test.raw.exec(`update "PaymentDue" set "cancelledAt" = '2026-12-03T08:00:00.000Z' where id = '${dueIds[2]}'`);
    const rows = await test.transact((ex, ctx) => listOpenDues(ex, ctx));
    expect(rows.map((row) => row.id)).toEqual([dueIds[1]]);
  });

  it("is read by those who read the money only", async () => {
    await partlyPaidNovember();
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(test.transact((ex, ctx) => listOpenDues(ex, ctx), reception)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});

describe("a file's part «التسديد»", () => {
  it("gives the dues, the invoices and the payments of the file", async () => {
    const { file, invoice } = await partlyPaidNovember();
    const part = await test.transact((ex, ctx) => getFileMoney(ex, ctx, { fileId: file.id }));
    expect(part.summary).toMatchObject({ amount: da(135_000), paid: da(20_000), remaining: da(115_000) });
    expect(part.dues).toHaveLength(3);
    expect(part.invoices.map((row) => row.number)).toEqual([invoice.number]);
    expect(part.payments.map((row) => [row.amount, row.stampDuty])).toEqual([[da(20_000), da(200)]]);
  });

  it("opens for reception, who takes payments at the desk, though the money section is closed to it", async () => {
    const { file } = await partlyPaidNovember();
    const reception = await test.sessionFor("RECEPTION_SALES");
    const part = await test.transact((ex, ctx) => getFileMoney(ex, ctx, { fileId: file.id }), reception);
    expect(part.payments).toHaveLength(1);
  });
});

describe("the reminder letter", () => {
  it("is written from what the file owes today, addressed to its payer", async () => {
    const { file, invoice } = await partlyPaidNovember();
    const reminder = await test.transact((ex, ctx) => getPaymentReminder(ex, ctx, { fileId: file.id }));
    expect(reminder).toMatchObject({
      date: "2026-12-03",
      payerName: "رشيد بوزيد",
      division: "BUILDING",
      paymentMethods: ["CASH"],
      paymentPlace: "مقر المركز",
      totalRemaining: da(115_000),
    });
    expect(reminder.items[0]).toMatchObject({
      invoiceNumber: invoice.number,
      description: "خدمة التنظيف من 01/11/2026 إلى 30/11/2026",
      dueDate: "2026-11-30",
      paid: da(20_000),
      remaining: da(25_000),
      daysLate: 3,
    });
    expect(reminder.totalRemainingWordsAr).toContain("مائة");
  });

  it("is refused for a file that owes nothing", async () => {
    const file = await contractedFile(test);
    await expect(test.transact((ex, ctx) => getPaymentReminder(ex, ctx, { fileId: file.id }))).rejects.toThrow(
      "This file owes nothing: there is no reminder to print.",
    );
  });

  it("is logged as a disclosure when printed", async () => {
    const { file } = await partlyPaidNovember();
    await test.transact((ex, ctx) => recordReminderPrinted(ex, ctx, { fileId: file.id }));
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "DISCLOSE", entity: "File", entityId: file.id });
  });
});
