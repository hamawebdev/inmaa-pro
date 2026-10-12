import { afterEach, beforeEach, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { divisionIncome, invoicedByDivision, outstandingByDivision } from "../rules/income";
import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";
import type { Division } from "../validators/option-codes";

import { syncDues } from "./dues";
import { issueInvoice } from "./invoices";
import { recordPayment, voidPayment } from "./payments";
import { getIncomeData } from "./reports";

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
