import { afterEach, beforeEach, expect, it } from "vitest";

import { saveClientIdentifiers } from "@/features/clients/services/clients";
import { moveFileStage, registerFile } from "@/features/clients/services/files";
import { stampDuty } from "@/features/money/rules/stamp-duty";
import { issueInvoice } from "@/features/money/services/invoices";
import { readStampSettings } from "@/features/money/services/money-settings";
import { recordPayment } from "@/features/money/services/payments";
import { setSetting } from "@/lib/settings";
import { localDate } from "@/lib/units";

import { createTestDatabase, type TestDatabase } from "../../database";
import { at, contractInput, doVisit, MONTH, openEachMorning, visitsOf } from "./helpers";

/**
 * Money's figures as they reach paper (docs/checker/acceptance.md, A9 and A10),
 * against the build notes' rules (plan/src/notes-en.md, "Invoicing"):
 *  - cash carries stamp duty: 1 DA per 100 DA from 300 to 30 000 DA, 1.5 DA up
 *    to 100 000 DA, 2 DA above, 5 DA at least;
 *  - cleaning VAT is 19%; an IFU invoice shows no VAT and carries its mention.
 * The expected figures are worked out here by hand, not by Money's code.
 */

/** A scenario builds a database and walks many steps: room for a machine six teammates are loading. */
const LONG = { timeout: 180_000 };

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase({ demo: ["people", "money"] });
}, LONG.timeout);
afterEach(() => test?.close());

const DA = (dinars: number) => Math.round(dinars * 100);

// The settings' scale, read whole-amount (the band of the amount sets one rate for all of it, the default
// `stamp.mode`), a started hundred counting as a hundred.
const BANDS: [amount: number, duty: number, why: string][] = [
  [299.99, 0, "below 300 DA: none"],
  [300, 5, "3 hundreds at 1 DA is 3 DA: the 5 DA minimum"],
  [500, 5, "5 hundreds at 1 DA"],
  [500.01, 6, "a started sixth hundred"],
  [12_000, 120, "the demo's receipt"],
  [30_000, 300, "the top of the first band"],
  [30_000.01, 451.5, "301 hundreds at 1.5 DA"],
  [60_000, 900, "600 hundreds at 1.5 DA"],
  [100_000, 1_500, "the top of the second band"],
  [100_000.01, 2_002, "1001 hundreds at 2 DA"],
  [250_000, 5_000, "2500 hundreds at 2 DA"],
];

it("stamp duty on cash follows the build notes' scale, from the settings the program holds", LONG, async () => {
  const settings = await readStampSettings(test.db);
  for (const [amount, duty, why] of BANDS) {
    expect(stampDuty(DA(amount), settings), `${amount} DA: ${why}`).toBe(DA(duty));
  }
});

it("the demo's cash invoice and receipt carry their stamp duty and their total in words", LONG, async () => {
  const invoice = await test.db
    .selectFrom("Invoice")
    .selectAll()
    .where("id", "=", test.demo.money.invoicePaid)
    .executeTakeFirstOrThrow();
  expect(invoice).toMatchObject({ taxMode: "IFU", vatAmount: 0, paymentMethod: "CASH" });
  expect(invoice.totalHT).toBe(invoice.grossAmount - invoice.discountAmount);
  expect(invoice.totalTTC).toBe(invoice.totalHT);
  expect(invoice.stampDuty).toBe(Math.max(DA(5), Math.ceil(invoice.totalTTC / DA(100)) * DA(1)));
  expect(invoice.netToPay).toBe(invoice.totalTTC + invoice.stampDuty);
  expect(JSON.parse(String(invoice.ifuMention))).toMatchObject({
    ar: expect.stringContaining("الضريبة الجزافية الوحيدة"),
  });
  expect(invoice.amountWordsAr).toBeTruthy();
  expect(invoice.amountWordsFr).toBeTruthy();

  const payment = await test.db
    .selectFrom("Payment")
    .selectAll()
    .where("id", "=", test.demo.money.paymentCash)
    .executeTakeFirstOrThrow();
  expect(payment.stampDuty).toBe(Math.ceil(payment.amount / DA(100)) * DA(1));
  expect(payment.totalReceived).toBe(payment.amount + payment.stampDuty);
});

it("VAT mode: an organisation's month at prices including VAT, 19%, paid in cash", LONG, async () => {
  const reception = await test.sessionFor("RECEPTION_SALES");
  const operations = await test.sessionFor("OPERATIONS");
  const accountant = await test.sessionFor("ACCOUNTANT");
  const input = contractInput("ORG_CONTRACT");
  const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);
  await test.transact(
    (ex, ctx) =>
      saveClientIdentifiers(ex, ctx, {
        clientId: file.clientId,
        identifiers: { rcNumber: "04/00-1234567 B 20", nis: "001204012345678", nif: "001204012345678" },
      }),
    reception,
  );
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "QUOTE" }), reception);
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "CONTRACTED" }), reception);
  for (const visit of (await visitsOf(test, file.fileId)).filter((visit) => visit.visitDate <= MONTH.end)) {
    await openEachMorning(test, file.fileId, reception, visit.visitDate);
    await doVisit(test, visit, operations, String(input.values.managerName ?? input.values.clientName));
  }
  const due = await test.db
    .selectFrom("PaymentDue")
    .select(["id", "amount"])
    .where("fileId", "=", file.fileId)
    .where("periodStart", "=", localDate(MONTH.start))
    .executeTakeFirstOrThrow();
  await openEachMorning(test, file.fileId, reception, MONTH.after);
  test.clock.set(at(MONTH.after, "10:00"));
  await test.transact((ex, ctx) => setSetting(ex, ctx, "tax.mode", "VAT"));

  const issued = await test.transact(
    (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.fileId, dueIds: [due.id], paymentMethod: "CASH" }),
    accountant,
  );
  const invoice = await test.db.selectFrom("Invoice").selectAll().where("id", "=", issued.id).executeTakeFirstOrThrow();
  const ttc = due.amount;
  const ht = Math.round(ttc / 1.19);
  expect(invoice).toMatchObject({
    taxMode: "VAT",
    vatRate: 1900,
    pricesIncludeVat: 0,
    totalTTC: ttc,
    totalHT: ht,
    vatAmount: ttc - ht,
    ifuMention: null,
  });
  expect(
    Math.abs(invoice.vatAmount - Math.round(ht * 0.19)),
    "the VAT is 19% of the amount before tax",
  ).toBeLessThanOrEqual(1);
  expect(invoice.stampDuty, "cash: stamp duty on the amount with tax").toBe(
    Math.max(DA(5), Math.ceil(ttc / DA(100)) * (ttc <= DA(30_000) ? DA(1) : ttc <= DA(100_000) ? DA(1.5) : DA(2))),
  );
  expect(invoice.netToPay).toBe(ttc + invoice.stampDuty);

  // The invoices issued before the switch keep their IFU mention.
  const before = await test.db
    .selectFrom("Invoice")
    .select(["taxMode", "ifuMention"])
    .where("id", "=", test.demo.money.invoicePaid)
    .executeTakeFirstOrThrow();
  expect(before.taxMode).toBe("IFU");

  const payment = await test.transact(
    (ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.fileId,
        receivedDate: ctx.today,
        method: "CASH",
        amount: ttc,
        dueIds: [due.id],
      }),
    accountant,
  );
  expect(payment.receiptId).toBeTruthy();
  const stored = await test.db
    .selectFrom("Payment")
    .select(["stampDuty", "totalReceived"])
    .where("id", "=", payment.id)
    .executeTakeFirstOrThrow();
  expect(stored).toEqual({ stampDuty: invoice.stampDuty, totalReceived: ttc + invoice.stampDuty });
});
