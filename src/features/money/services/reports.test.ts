import { afterEach, beforeEach, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { localDate, minutes } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { divisionIncome, invoicedByDivision, outstandingByDivision } from "../rules/income";
import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";
import type { Division } from "../validators/option-codes";

import { syncDues } from "./dues";
import { createExpense } from "./expenses";
import { issueInvoice } from "./invoices";
import { recordPayment, voidPayment } from "./payments";
import { getIncomeData, getPeriodReport } from "./reports";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const december = { from: "2026-12-01", to: "2026-12-31" } as never;

async function novemberInvoiced(method: "CASH" | "BANK_TRANSFER") {
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
  await test.transact((ex, ctx) =>
    issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: method }),
  );
  await openDay(test, "2026-12-03T09:00:00.000Z");
  return file;
}

function figures(data: Awaited<ReturnType<typeof getIncomeData>>) {
  const report = divisionIncome({
    payments: data.payments.map((payment) => ({
      id: payment.id,
      division: payment.division as Division,
      receivedDate: payment.receivedDate,
      amount: payment.amount,
      stampDuty: payment.stampDuty,
      voided: false,
    })),
    matches: data.matches,
    from: "2026-12-01",
    to: "2026-12-31",
    taxMode: data.taxMode,
    vatRate: data.vatRate,
  });
  return report.byDivision.BUILDING;
}

it("puts a cash payment in its division's income on the day it was received, the stamp apart", async () => {
  await centreReady(test);
  const file = await novemberInvoiced("CASH");
  await test.transact((ex, ctx) =>
    recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) }),
  );

  const data = await test.transact((ex, ctx) => getIncomeData(ex, ctx, december));
  expect(data.taxMode).toBe("IFU");
  expect(data.payments).toMatchObject([
    {
      receivedDate: "2026-12-03",
      division: "BUILDING",
      method: "CASH",
      amount: da(45_000),
      stampDuty: da(675),
      fileNumber: file.number,
      receiptNumber: "000001/2026",
    },
  ]);
  expect(figures(data)).toEqual({
    collected: da(45_000),
    vatCollected: 0,
    stampCollected: da(675),
    received: da(45_675),
  });
  expect(invoicedByDivision(data.invoices as never, "2026-12-01", "2026-12-31").BUILDING).toEqual({
    beforeTax: da(45_000),
    withTax: da(45_000),
  });
  // November is settled; December and January are still owed.
  expect(outstandingByDivision(data.dues as never).BUILDING).toBe(da(90_000));

  // Nothing of it belongs to November.
  const november = await test.transact((ex, ctx) =>
    getIncomeData(ex, ctx, { from: "2026-11-01", to: "2026-11-30" } as never),
  );
  expect(november.payments).toEqual([]);
  expect(november.invoices).toEqual([]);
});

it("splits a payment before tax by the invoice it settles, under VAT", async () => {
  await centreReady(test, "VAT");
  const file = await novemberInvoiced("BANK_TRANSFER");
  await test.transact((ex, ctx) =>
    recordPayment(ex, ctx, {
      fileId: file.id,
      receivedDate: "2026-12-03",
      method: "BANK_TRANSFER",
      amount: da(45_000),
      reference: "VIR 88",
    }),
  );
  const data = await test.transact((ex, ctx) => getIncomeData(ex, ctx, december));
  expect(data).toMatchObject({ taxMode: "VAT", vatRate: 1900 });
  expect(data.matches).toEqual([
    { paymentId: data.payments[0].id, amount: da(45_000), invoiceTotalHT: da(37_815.13), invoiceTotalTTC: da(45_000) },
  ]);
  expect(figures(data)).toEqual({
    collected: da(37_815.13),
    vatCollected: da(7_184.87),
    stampCollected: 0,
    received: da(45_000),
  });
});

it("leaves a voided payment out of the income, and its due is owed again", async () => {
  await centreReady(test);
  const file = await novemberInvoiced("CASH");
  const paid = await test.transact((ex, ctx) =>
    recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) }),
  );
  await test.transact((ex, ctx) => voidPayment(ex, ctx, { paymentId: paid.id, reason: "خطأ في الملف" }));
  const data = await test.transact((ex, ctx) => getIncomeData(ex, ctx, december));
  expect(data.payments).toEqual([]);
  expect(outstandingByDivision(data.dues as never).BUILDING).toBe(da(135_000));
});

it("reads as the flat tax until the regime is chosen, and is closed to those without the money section", async () => {
  const data = await test.transact((ex, ctx) => getIncomeData(ex, ctx, december));
  expect(data).toMatchObject({ taxMode: "IFU", payments: [], invoices: [], dues: [] });
  await test.transact((ex, ctx) => setSetting(ex, ctx, "tax.mode", "VAT"));
  expect((await test.transact((ex, ctx) => getIncomeData(ex, ctx, december))).taxMode).toBe("VAT");
  const supervisor = await test.sessionFor("SUPERVISOR");
  await expect(test.transact((ex, ctx) => getIncomeData(ex, ctx, december), supervisor)).rejects.toThrow(
    "You do not have permission to do this.",
  );
});

it("reports a period: the result per division, the work done, the forecast and each file", async () => {
  await centreReady(test);
  const file = await novemberInvoiced("CASH");
  await test.transact(async (ex, ctx) => {
    await recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) });
    await createExpense(ex, ctx, {
      values: {
        division: "BUILDING",
        category: "TRANSPORT",
        date: "2026-12-02",
        amount: 2_500,
        method: "CASH",
        recurrence: "NONE",
      } as never,
    });
    await createExpense(ex, ctx, {
      values: {
        division: "COMMON",
        category: "RENT",
        date: "2026-12-01",
        amount: 30_000,
        method: "BANK_TRANSFER",
        recurrence: "MONTHLY",
      } as never,
    });
  });

  const november = await test.transact((ex, ctx) =>
    getPeriodReport(ex, ctx, { from: "2026-11-01", to: "2026-11-30" } as never),
  );
  expect(november.counts).toMatchObject({ visits: 4, visitsDone: 4, visitsNotDone: 0, invoices: 0, payments: 0 });
  expect(november.result.profit).toBe(0);

  const report = await test.transact((ex, ctx) => getPeriodReport(ex, ctx, december));
  expect(report.result.byDivision.BUILDING).toEqual({
    income: da(45_000),
    expenses: da(2_500),
    commonShare: 0,
    result: da(42_500),
  });
  expect(report.result).toMatchObject({
    commonExpenses: da(30_000),
    totalIncome: da(45_000),
    totalExpenses: da(32_500),
    profit: da(12_500),
  });
  // With the stamp duty of a cash payment: what the cash box saw.
  expect(report.received).toBe(da(45_675));
  expect(report.invoiced).toBe(da(45_000));
  // December and January are still to pay; neither is past its date on 3 December.
  expect(report).toMatchObject({ outstanding: da(90_000), overdue: 0 });
  expect(report.counts).toMatchObject({ invoices: 1, payments: 1 });
  expect(report.contracts).toEqual([
    {
      fileId: file.id,
      fileNumber: file.number,
      clientName: expect.any(String),
      division: "BUILDING",
      invoiced: da(45_000),
      received: da(45_000),
      outstanding: da(90_000),
    },
  ]);
  // Three months ahead by default; January's due comes in, the rent goes out every month.
  expect(report.forecast.months.map((month) => [month.month, month.receipts, month.expenses])).toEqual([
    ["2027-01", da(45_000), da(30_000)],
    ["2027-02", 0, da(30_000)],
    ["2027-03", 0, da(30_000)],
  ]);
  expect(report.forecast.restOfCurrentMonth).toBe(da(45_000));
});

it("is closed to who does not read the money", async () => {
  const reception = await test.sessionFor("RECEPTION_SALES");
  await expect(test.transact((ex, ctx) => getPeriodReport(ex, ctx, december), reception)).rejects.toThrow(
    "You do not have permission to do this.",
  );
});

it("counts in the forecast what an ending contract would bring if renewed, unless the office said it will not be", async () => {
  await centreReady(test);
  // November to January at 45 000,00 a month, paid on the 30th: it ends inside the three months of the forecast.
  const file = await contractedFile(test);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  await openDay(test, "2026-12-03T09:00:00.000Z");

  const report = await test.transact((ex, ctx) => getPeriodReport(ex, ctx, december));
  // Renewed from 1 February to 30 April, paid on the 30th: February and March fall inside the horizon.
  expect(report.forecast.months.map((month) => [month.month, month.receiptsIfRenewed])).toEqual([
    ["2027-01", 0],
    ["2027-02", da(45_000)],
    ["2027-03", da(45_000)],
  ]);

  await test.raw.exec(`update "File" set "renewalDecision" = 'WILL_NOT_RENEW' where id = '${file.id}'`);
  const declined = await test.transact((ex, ctx) => getPeriodReport(ex, ctx, december));
  expect(declined.forecast.months.every((month) => month.receiptsIfRenewed === 0)).toBe(true);
});

it("reports each worker's period: the visits done, the hours, the lateness and what the store handed him", async () => {
  await centreReady(test);
  const file = await contractedFile(test);
  for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
  const seat = await test.db
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .select(["VisitWorker.id", "VisitWorker.workerId"])
    .where("Visit.visitDate", "=", localDate(NOVEMBER_TUESDAYS[0]))
    .executeTakeFirstOrThrow();
  await test.db
    .updateTable("VisitWorker")
    .set({ lateMin: minutes(15) })
    .where("id", "=", seat.id)
    .execute();
  await test.rows.insert("HandOut", { workerId: seat.workerId, date: "2026-11-03" } as never);

  const report = await test.transact((ex, ctx) =>
    getPeriodReport(ex, ctx, { from: "2026-11-01", to: "2026-11-30" } as never),
  );
  // Two workers on each of the four visits, three hours each.
  expect(report.workers).toHaveLength(8);
  expect(report.workers.every((worker) => worker.visits === 1 && worker.workedMin === 180)).toBe(true);
  expect(report.workers.find((worker) => worker.workerId === seat.workerId)).toMatchObject({
    lateArrivals: 1,
    handOuts: 1,
    lostOrDamaged: 0,
  });
});
