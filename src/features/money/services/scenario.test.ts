import { afterEach, beforeEach, expect, it } from "vitest";

import { createHandOut, getHandOutsForVisit } from "@/features/stock/services/handouts";
import { createStockItem } from "@/features/stock/services/items";
import { verifyChains } from "@/lib/chain";
import { emit } from "@/lib/events";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { divisionIncome } from "../rules/income";
import { centreReady, contractedFile, da, openDay, visitOn } from "../testing/fixtures";
import type { Division } from "../validators/option-codes";

import { getFilePaymentSummary } from "./dues";
import { getInvoiceSheet, issueInvoice, listInvoiceCandidates, listInvoices } from "./invoices";
import { getReceiptSheet, recordPayment } from "./payments";
import { getIncomeData } from "./reports";

/**
 * Round 1's path, through Money's and Stock's services and the events they
 * follow: a contract paid after each visit becomes «متعاقد»; a hand-out is
 * recorded against the job; a visit is signed off; it is invoiced; the invoice
 * is paid in cash; the amount is in the division's income.
 *
 * What Clients, Operations and People would have written is put there by hand
 * (`test.rows.insert`) and announced with their events, as their services do.
 */
let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

it("takes a signed-off visit to a paid invoice in its division's income, with a hand-out against the job", async () => {
  // ── Monday 2 November: the contract is signed (Clients), its visits exist (Operations) ──
  await openDay(test, "2026-11-02T08:00:00.000Z");
  const file = await contractedFile(test, {
    division: "BUILDING",
    paymentFrequency: "PER_VISIT",
    totalAmount: da(3_500),
    firstDueDate: null,
    endDate: "2026-11-30",
  });
  const first = await visitOn(test, file.id, "2026-11-03", "PLANNED");
  await visitOn(test, file.id, "2026-11-10", "PLANNED");
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));

  // Money followed: one due per visit, nothing invoiced, nothing ready.
  const summary = await test.transact((ex, ctx) => getFilePaymentSummary(ex, ctx, { fileId: file.id }));
  expect(summary).toMatchObject({ amount: da(7_000), paid: 0, state: "UNPAID", nextDueDate: "2026-11-03" });
  expect(await test.transact((ex, ctx) => listInvoiceCandidates(ex, ctx))).toEqual([]);

  // ── The same day: the storekeeper hands the team its materials for tomorrow's visit (Stock) ──
  const worker = await test.rows.insert("StaffMember", {
    kind: "WORKER",
    lastName: "حداد",
    firstName: "سميرة",
    engagementStatus: "ACCEPTED",
  } as never);
  const cleaner = await test.transact((ex, ctx) =>
    createStockItem(ex, ctx, {
      values: {
        nameAr: "منظف أرضيات",
        kind: "MATERIAL",
        unit: "LITRE",
        tracking: "QUANTITY",
        minLevel: 10,
        openingQty: 30,
      },
    }),
  );
  const handOut = await test.transact((ex, ctx) =>
    createHandOut(ex, ctx, {
      date: "2026-11-02",
      purpose: "JOB",
      fileId: file.id,
      visitId: first.id,
      workerId: worker.id,
      lines: [{ itemId: cleaner.id, qty: 2 }],
    }),
  );
  expect(handOut.number).toBe("0001/2026");
  // Operations prints it on the mission order.
  expect(await test.transact((ex, ctx) => getHandOutsForVisit(ex, ctx, { visitId: first.id }))).toMatchObject([
    { handOutNumber: "0001/2026", itemName: "منظف أرضيات", qty: 2_000, workerName: "حداد سميرة" },
  ]);
  expect(
    (await test.db.selectFrom("StockItem").select("onHandQty").where("id", "=", cleaner.id).executeTakeFirstOrThrow())
      .onHandQty,
  ).toBe(28_000);

  // ── Tuesday 3 November: the visit is done and its order typed in whole (Operations) ──
  await openDay(test, "2026-11-03T16:00:00.000Z");
  await test.db.updateTable("Visit").set({ status: "DONE", billable: 1 }).where("id", "=", first.id).execute();
  await test.rows.insert("VisitWorker", {
    visitId: first.id,
    workerId: worker.id,
    seatStatus: "ASSIGNED",
    arrivedTime: "08:00",
    leftTime: "11:00",
    workedMin: 180,
  } as never);
  await test.rows.insert("VisitReport", {
    visitId: first.id,
    entryState: "COMPLETE",
    completion: "FULL",
    signoffStatus: "ACCEPTED",
    signoffName: "مرابط بلقاسم",
  } as never);
  await test.transact((ex, ctx) => emit(ex, ctx, "visit.signedOff", { visitId: first.id }));

  // The signed-off visit is now ready to invoice; the one to come is not.
  const candidates = await test.transact((ex, ctx) => listInvoiceCandidates(ex, ctx));
  expect(candidates.map((row) => [row.kind, row.periodStart, row.readiness])).toEqual([
    ["VISIT", "2026-11-03", "READY"],
  ]);

  // ── Wednesday 4 November: invoiced, then paid in cash at the desk (Money) ──
  await openDay(test, "2026-11-04T09:00:00.000Z");
  const invoice = await test.transact((ex, ctx) =>
    issueInvoice(ex, ctx, { fileId: file.id, dueIds: [candidates[0].dueId], paymentMethod: "CASH" }),
  );
  expect(invoice.number).toBe("000001/2026");
  const sheet = await test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: invoice.id }));
  expect(sheet.invoice).toMatchObject({ totalTTC: da(3_500), stampDuty: da(35), netToPay: da(3_535) });
  expect(sheet.statement?.rows).toMatchObject([
    { visitDate: "2026-11-03", workersCount: 1, workedMin: 180, completion: "مكتملة بالكامل", billable: true },
  ]);

  const paid = await test.transact((ex, ctx) =>
    recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-11-04", method: "CASH", amount: da(3_500) }),
  );
  expect(paid).toMatchObject({ receiptNumber: "000001/2026", stampDuty: da(35), totalReceived: da(3_535), credit: 0 });
  const receipt = await test.transact((ex, ctx) => getReceiptSheet(ex, ctx, { receiptId: paid.receiptId ?? "" }));
  expect(receipt.receipt.payment?.reason).toBe("تسديد الفاتورة رقم 000001/2026");

  // ── What must hold ──
  const [listed] = await test.transact((ex, ctx) => listInvoices(ex, ctx, {}));
  expect(listed).toMatchObject({ number: "000001/2026", paymentState: "PAID", remaining: 0, voided: false });
  expect(await test.transact((ex, ctx) => getFilePaymentSummary(ex, ctx, { fileId: file.id }))).toMatchObject({
    amount: da(7_000),
    paid: da(3_500),
    remaining: da(3_500),
    state: "PARTIAL",
    nextDueDate: "2026-11-10",
  });

  // The amount is in the building division's income for November, on the day it was received; the stamp is not income.
  const data = await test.transact((ex, ctx) =>
    getIncomeData(ex, ctx, { from: "2026-11-01", to: "2026-11-30" } as never),
  );
  const income = divisionIncome({
    payments: data.payments.map((payment) => ({
      id: payment.id,
      division: payment.division as Division,
      receivedDate: payment.receivedDate,
      amount: payment.amount,
      stampDuty: payment.stampDuty,
      voided: false,
    })),
    matches: data.matches,
    from: "2026-11-01",
    to: "2026-11-30",
    taxMode: data.taxMode,
    vatRate: data.vatRate,
  });
  expect(income.byDivision.BUILDING).toEqual({
    collected: da(3_500),
    vatCollected: 0,
    stampCollected: da(35),
    received: da(3_535),
  });
  expect(income.byDivision.HOUSING.collected).toBe(0);
  expect(income.total.collected).toBe(da(3_500));

  expect(await verifyChains(test.db)).toMatchObject({
    ok: true,
    brokenDigests: [],
    missingNumbers: [],
    brokenTotals: [],
  });
});
