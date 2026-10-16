import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { fileCredit } from "./credit";
import { getFileMoney } from "./debts";
import { syncDues } from "./dues";
import { issueInvoice, voidInvoice } from "./invoices";
import { recordPayment, voidPayment } from "./payments";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

const dues = async (fileId: string) =>
  (
    await test.db
      .selectFrom("PaymentDue")
      .select(["amount", "paidAmount"])
      .where("fileId", "=", fileId)
      .orderBy("seq")
      .execute()
  ).map((due) => [due.amount, due.paidAmount]);

describe("money paid before the invoice lowered its due (INV-2)", () => {
  it("moves to the next due when a missed visit comes off a month paid in advance", async () => {
    // November: three Tuesdays done, the fourth cancelled by the centre.
    const file = await contractedFile(test);
    for (const date of NOVEMBER_TUESDAYS.slice(0, 3)) await visitOn(test, file.id, date);
    await visitOn(test, file.id, NOVEMBER_TUESDAYS[3], "CANCELLED");
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    // The client pays November in full by transfer on 30 November.
    await openDay(test, "2026-11-30T09:00:00.000Z");
    await test.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.id,
        receivedDate: "2026-11-30",
        method: "BANK_TRANSFER",
        reference: "VIR-0042",
        amount: da(45_000),
      }),
    );
    // On 1 December November is invoiced for its three visits: 33 750,00.
    await openDay(test, "2026-12-01T08:00:00.000Z");
    const [november] = await test.db
      .selectFrom("PaymentDue")
      .select("id")
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    await test.transact((ex, ctx) =>
      issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "BANK_TRANSFER" }),
    );

    // November keeps what it is owed; the 11 250,00 left over goes to December.
    expect(await dues(file.id)).toEqual([
      [da(33_750), da(33_750)],
      [da(45_000), da(11_250)],
      [da(45_000), 0],
    ]);
    const part = await test.transact((ex, ctx) => getFileMoney(ex, ctx, { fileId: file.id }));
    expect(part.summary).toMatchObject({ paid: da(45_000), remaining: da(78_750) });
    expect(part.credit).toBe(0);
    expect((await test.transact((ex) => verifyChains(ex))).ok).toBe(true);
  });

  it("stays as the file's credit when no due can take it, and goes first to the next payment's dues", async () => {
    // A VAT-exclusive invoice of 53 550,00 is paid in full, then voided: its due falls back to 45 000,00.
    await test.transact(async (ex, ctx) => {
      await setSetting(ex, ctx, "tax.mode", "VAT");
      await setSetting(ex, ctx, "tax.pricesIncludeVat", false);
    });
    const file = await contractedFile(test, { endDate: "2026-11-30" });
    for (const date of NOVEMBER_TUESDAYS) await visitOn(test, file.id, date);
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    await openDay(test, "2026-12-01T08:00:00.000Z");
    const [november] = await test.db.selectFrom("PaymentDue").select("id").where("fileId", "=", file.id).execute();
    const invoice = await test.transact((ex, ctx) =>
      issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "BANK_TRANSFER" }),
    );
    await test.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.id,
        receivedDate: "2026-12-01",
        method: "BANK_TRANSFER",
        reference: "VIR-0043",
        amount: da(53_550),
      }),
    );
    await test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: invoice.id, reason: "خطأ في نسبة الرسم" }));

    // The only due holds its 45 000,00; the 8 550,00 nothing can take is the file's credit.
    expect(await dues(file.id)).toEqual([[da(45_000), da(45_000)]]);
    expect(await test.transact((ex) => fileCredit(ex, file.id))).toBe(da(8_550));
    const part = await test.transact((ex, ctx) => getFileMoney(ex, ctx, { fileId: file.id }));
    expect(part.credit).toBe(da(8_550));

    // Invoiced again, at 53 550,00: the credit goes back onto the due before anything else.
    await test.transact((ex, ctx) =>
      issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "BANK_TRANSFER" }),
    );
    expect(await dues(file.id)).toEqual([[da(53_550), da(53_550)]]);
    expect(await test.transact((ex) => fileCredit(ex, file.id))).toBe(0);
    expect((await test.transact((ex) => verifyChains(ex))).ok).toBe(true);
  });

  it("lets a payment that was moved still be voided whole", async () => {
    const file = await contractedFile(test);
    for (const date of NOVEMBER_TUESDAYS.slice(0, 3)) await visitOn(test, file.id, date);
    await visitOn(test, file.id, NOVEMBER_TUESDAYS[3], "CANCELLED");
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    await openDay(test, "2026-11-30T09:00:00.000Z");
    const paid = await test.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.id,
        receivedDate: "2026-11-30",
        method: "BANK_TRANSFER",
        reference: "VIR-0044",
        amount: da(45_000),
      }),
    );
    await openDay(test, "2026-12-01T08:00:00.000Z");
    const [november] = await test.db
      .selectFrom("PaymentDue")
      .select("id")
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    await test.transact((ex, ctx) =>
      issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "BANK_TRANSFER" }),
    );
    await test.transact((ex, ctx) => voidPayment(ex, ctx, { paymentId: paid.id, reason: "تحويل مرفوض من البنك" }));
    expect(await dues(file.id)).toEqual([
      [da(33_750), 0],
      [da(45_000), 0],
      [da(45_000), 0],
    ]);
    expect(await test.transact((ex) => fileCredit(ex, file.id))).toBe(0);
  });
});
