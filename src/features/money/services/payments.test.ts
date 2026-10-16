import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { syncDues } from "./dues";
import { issueInvoice } from "./invoices";
import {
  getReceiptSheet,
  issueReceiptBatch,
  listPayableFiles,
  listPayments,
  recordPayment,
  recordReceiptPrinted,
  voidPayment,
  type RecordPaymentInput,
} from "./payments";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

/** A contract whose November is invoiced (000001/2026, cash), on 3 December. */
async function invoicedNovember() {
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
  return { file, invoice, dueIds: dues.map((due) => due.id) };
}

const pay = (input: RecordPaymentInput) => test.transact((ex, ctx) => recordPayment(ex, ctx, input));
const paidOf = async (fileId: string) =>
  (
    await test.db.selectFrom("PaymentDue").select("paidAmount").where("fileId", "=", fileId).orderBy("seq").execute()
  ).map((due) => due.paidAmount);

describe("a cash payment", () => {
  it("writes its receipt, the payment with its stamp duty, and the allocation", async () => {
    const { file, invoice, dueIds } = await invoicedNovember();
    const paid = await pay({ fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) });
    expect(paid).toMatchObject({
      receiptNumber: "000001/2026",
      stampDuty: da(675),
      totalReceived: da(45_675),
      allocated: da(45_000),
      credit: 0,
    });

    const payment = await test.db.selectFrom("Payment").selectAll().where("id", "=", paid.id).executeTakeFirstOrThrow();
    expect(payment).toMatchObject({
      fileId: file.id,
      division: "BUILDING",
      receivedDate: "2026-12-03",
      method: "CASH",
      amount: da(45_000),
      stampDuty: da(675),
      totalReceived: da(45_675),
      payerName: "رشيد بوزيد",
      place: "مقر المركز",
      collectorKind: "OFFICE",
      collectorStaffId: null,
      receiptId: paid.receiptId,
      receiptReason: `تسديد الفاتورة رقم ${invoice.number}`,
    });
    expect(payment.amountWordsAr).toContain("خمسة وأربعون ألف");
    expect(payment.amountWordsFr).toBe("Quarante-cinq mille six cent soixante-quinze dinars algériens");

    const receipt = await test.db
      .selectFrom("Receipt")
      .selectAll()
      .where("id", "=", paid.receiptId)
      .executeTakeFirstOrThrow();
    expect(receipt).toMatchObject({
      numberSeq: 1,
      numberYear: 2026,
      issueDate: "2026-12-03",
      fileId: file.id,
      batchId: null,
    });

    expect(
      await test.db
        .selectFrom("PaymentAllocation")
        .select(["dueId", "amount"])
        .where("paymentId", "=", paid.id)
        .execute(),
    ).toEqual([{ dueId: dueIds[0], amount: da(45_000) }]);
    // The receivable never includes the stamp: nothing stays open on November.
    expect(await paidOf(file.id)).toEqual([da(45_000), 0, 0]);
    expect(await verifyChains(test.db)).toMatchObject({ ok: true, brokenTotals: [], missingNumbers: [] });

    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "entity", "entityLabel"])
      .where("entity", "=", "Payment")
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({ operation: "COLLECT", action: "CREATE", entity: "Payment", entityLabel: "000001/2026" });
  });

  it("prints its receipt from the stored rows", async () => {
    const { file } = await invoicedNovember();
    const paid = await pay({ fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) });
    const sheet = await test.transact((ex, ctx) => getReceiptSheet(ex, ctx, { receiptId: paid.receiptId ?? "" }));
    expect(sheet.paymentId).toBe(paid.id);
    expect(sheet.receipt).toMatchObject({
      number: "000001/2026",
      issueDate: "2026-12-03",
      fileNumber: file.number,
      collectorKind: "OFFICE",
      voided: null,
      payment: {
        payerName: "رشيد بوزيد",
        amount: da(45_000),
        stampDuty: da(675),
        total: da(45_675),
        reason: "تسديد الفاتورة رقم 000001/2026",
      },
    });
    expect(sheet.receipt.seller.nameAr).toBe("مركز إنماء برو");

    await test.transact((ex, ctx) => recordReceiptPrinted(ex, ctx, { receiptId: paid.receiptId ?? "" }));
    expect(
      await test.db.selectFrom("LegalEvent").select("type").where("receiptId", "=", paid.receiptId).execute(),
    ).toEqual([{ type: "PRINTED" }]);
  });

  it("can be taken at the desk by reception, who has no money section", async () => {
    const { file } = await invoicedNovember();
    const reception = await test.sessionFor("RECEPTION_SALES");
    const paid = await test.transact(
      (ex, ctx) =>
        recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(5_000) }),
      reception,
    );
    expect(paid.stampDuty).toBe(da(50));
    const supervisor = await test.sessionFor("SUPERVISOR");
    await expect(
      test.transact(
        (ex, ctx) =>
          recordPayment(ex, ctx, { fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(5_000) }),
        supervisor,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("a transfer", () => {
  it("needs its reference, has no receipt and no stamp duty", async () => {
    const { file } = await invoicedNovember();
    await expect(
      pay({ fileId: file.id, receivedDate: "2026-12-03", method: "BANK_TRANSFER", amount: da(45_000) }),
    ).rejects.toThrow("A transfer needs its reference number.");
    const paid = await pay({
      fileId: file.id,
      receivedDate: "2026-12-02",
      method: "BANK_TRANSFER",
      amount: da(45_000),
      reference: "VIR-2026-1188",
      payerName: "مصلحة المحاسبة",
    });
    expect(paid).toMatchObject({ receiptId: null, receiptNumber: null, stampDuty: 0, totalReceived: da(45_000) });
    const payment = await test.db.selectFrom("Payment").selectAll().where("id", "=", paid.id).executeTakeFirstOrThrow();
    expect(payment).toMatchObject({
      receivedDate: "2026-12-02",
      reference: "VIR-2026-1188",
      payerName: "مصلحة المحاسبة",
      receiptId: null,
      amountWordsAr: null,
      receiptReason: null,
    });
    expect(await test.db.selectFrom("Receipt").select("id").execute()).toEqual([]);
  });
});

describe("which dues a payment settles", () => {
  it("takes the oldest first, and keeps what is left over as the file's credit", async () => {
    const { file } = await invoicedNovember();
    const first = await pay({
      fileId: file.id,
      receivedDate: "2026-12-03",
      method: "POSTAL_TRANSFER",
      amount: da(100_000),
      reference: "CCP 7781",
    });
    expect(first).toMatchObject({ allocated: da(100_000), credit: 0 });
    expect(await paidOf(file.id)).toEqual([da(45_000), da(45_000), da(10_000)]);

    const second = await pay({
      fileId: file.id,
      receivedDate: "2026-12-03",
      method: "POSTAL_TRANSFER",
      amount: da(50_000),
      reference: "CCP 7782",
    });
    expect(second).toMatchObject({ allocated: da(35_000), credit: da(15_000) });
    expect(await paidOf(file.id)).toEqual([da(45_000), da(45_000), da(45_000)]);
    expect(await test.transact((ex, ctx) => listPayableFiles(ex, ctx))).toEqual([]);
  });

  it("settles the dues the office names, in its order", async () => {
    const { file, dueIds } = await invoicedNovember();
    await pay({
      fileId: file.id,
      receivedDate: "2026-12-03",
      method: "BANK_TRANSFER",
      amount: da(50_000),
      reference: "VIR 1",
      dueIds: [dueIds[2], dueIds[0]],
    });
    expect(await paidOf(file.id)).toEqual([da(5_000), 0, da(45_000)]);
    await expect(
      pay({
        fileId: file.id,
        receivedDate: "2026-12-03",
        method: "BANK_TRANSFER",
        amount: da(1_000),
        reference: "VIR 2",
        dueIds: [dueIds[2]],
      }),
    ).rejects.toThrow("This due is not one of the file's open dues.");
  });

  it("lists who owes what, for the payment form", async () => {
    const { file, invoice } = await invoicedNovember();
    const [payable] = await test.transact((ex, ctx) => listPayableFiles(ex, ctx));
    expect(payable).toMatchObject({ fileId: file.id, division: "BUILDING", methods: ["CASH"], remaining: da(135_000) });
    expect(payable.dues.map((due) => [due.dueDate, due.invoiceNumber, due.remaining])).toEqual([
      ["2026-11-30", invoice.number, da(45_000)],
      ["2026-12-30", null, da(45_000)],
      ["2027-01-30", null, da(45_000)],
    ]);
  });
});

describe("what a payment refuses", () => {
  it("an amount of nothing, a date after today, a file that does not exist", async () => {
    const { file } = await invoicedNovember();
    const base = { fileId: file.id, receivedDate: "2026-12-03", method: "CASH" as const, amount: da(1_000) };
    await expect(pay({ ...base, amount: 0 })).rejects.toThrow("An amount must be more than zero.");
    await expect(pay({ ...base, receivedDate: "2026-12-04" })).rejects.toThrow(
      "A payment cannot be dated after today.",
    );
    await expect(pay({ ...base, receivedDate: "2026-02-30" })).rejects.toThrow("Enter a valid date.");
    await expect(pay({ ...base, fileId: "nope" })).rejects.toThrow("This file does not exist.");
    await expect(pay({ ...base, collectorKind: "WORKER" })).rejects.toThrow("Choose who collected the money.");
    expect(await test.db.selectFrom("Payment").select("id").execute()).toEqual([]);
  });
});

describe("voiding a payment", () => {
  it("reverses its allocations, then voids the payment and its receipt", async () => {
    const { file } = await invoicedNovember();
    const paid = await pay({ fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) });
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => voidPayment(ex, ctx, { paymentId: paid.id, reason: "خطأ" }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(test.transact((ex, ctx) => voidPayment(ex, ctx, { paymentId: paid.id, reason: "" }))).rejects.toThrow(
      "A reason is required.",
    );

    test.clock.advance({ hours: 2 });
    await test.transact((ex, ctx) => voidPayment(ex, ctx, { paymentId: paid.id, reason: "سُجّل على ملف آخر" }));
    expect(await paidOf(file.id)).toEqual([0, 0, 0]);
    expect(
      await test.db
        .selectFrom("PaymentAllocation")
        .select("amount")
        .where("paymentId", "=", paid.id)
        .orderBy("chainSeq")
        .execute(),
    ).toEqual([{ amount: da(45_000) }, { amount: -da(45_000) }]);
    const events = await test.db
      .selectFrom("LegalEvent")
      .select(["type", "paymentId", "receiptId", "reason"])
      .orderBy("chainSeq")
      .execute();
    expect(events).toEqual([
      { type: "VOIDED", paymentId: paid.id, receiptId: null, reason: "سُجّل على ملف آخر" },
      { type: "VOIDED", paymentId: null, receiptId: paid.receiptId, reason: "سُجّل على ملف آخر" },
    ]);
    await expect(
      test.transact((ex, ctx) => voidPayment(ex, ctx, { paymentId: paid.id, reason: "ثانية" })),
    ).rejects.toThrow("This payment is already voided.");

    const sheet = await test.transact((ex, ctx) => getReceiptSheet(ex, ctx, { receiptId: paid.receiptId ?? "" }));
    expect(sheet.receipt.voided).toEqual({ date: "2026-12-03", reason: "سُجّل على ملف آخر" });
    const [row] = await test.transact((ex, ctx) => listPayments(ex, ctx, {}));
    expect(row).toMatchObject({ id: paid.id, voided: true, receiptNumber: "000001/2026" });
    expect(await verifyChains(test.db)).toMatchObject({ ok: true, brokenTotals: [] });

    // The next cash payment takes the next number: the voided one keeps its own.
    const again = await pay({ fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) });
    expect(again.receiptNumber).toBe("000002/2026");
  });
});

describe("blank receipts for a collector", () => {
  it("are numbered when printed, and one is filled in when its payment is typed", async () => {
    const { file } = await invoicedNovember();
    const collector = await test.rows.insert("StaffMember", { lastName: "حداد", firstName: "سميرة" });
    await expect(
      test.transact((ex, ctx) =>
        issueReceiptBatch(ex, ctx, { count: 0, collectorKind: "WORKER", collectorStaffId: collector.id }),
      ),
    ).rejects.toThrow("A block of receipts holds 1 to 50 receipts.");
    const batch = await test.transact((ex, ctx) =>
      issueReceiptBatch(ex, ctx, { count: 3, collectorKind: "WORKER", collectorStaffId: collector.id }),
    );
    expect([batch.firstNumber, batch.lastNumber]).toEqual(["000001/2026", "000003/2026"]);
    const blank = await test.transact((ex, ctx) => getReceiptSheet(ex, ctx, { receiptId: batch.receiptIds[1] }));
    expect(blank.receipt).toMatchObject({
      number: "000002/2026",
      payment: null,
      collectorKind: "WORKER",
      collectorName: "حداد سميرة",
      collectorNumber: collector.number,
      fileNumber: null,
    });
    expect(blank.receipt.stampScaleNote).toContain("حق الطابع");

    const paid = await pay({
      fileId: file.id,
      receivedDate: "2026-12-03",
      method: "CASH",
      amount: da(45_000),
      collectorKind: "WORKER",
      collectorStaffId: collector.id,
      receiptId: batch.receiptIds[1],
    });
    expect(paid.receiptNumber).toBe("000002/2026");
    await expect(
      pay({
        fileId: file.id,
        receivedDate: "2026-12-03",
        method: "CASH",
        amount: da(1_000),
        receiptId: batch.receiptIds[1],
      }),
    ).rejects.toThrow("This receipt was already used or voided.");
    // A payment at the office meanwhile takes the number after the block.
    const office = await pay({ fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(1_000) });
    expect(office.receiptNumber).toBe("000004/2026");
  });
});

describe("a reprinted cash receipt (INV-X2)", () => {
  it("names the client and the file as the payment froze them, whatever the rows say since (INV-X2)", async () => {
    const { file } = await invoicedNovember();
    const paid = await pay({ fileId: file.id, receivedDate: "2026-12-03", method: "CASH", amount: da(45_000) });
    const receiptId = paid.receiptId ?? "";
    const before = await test.transact((ex, ctx) => getReceiptSheet(ex, ctx, { receiptId }));

    await test.db.updateTable("Client").set({ name: "اسم جديد للعميل" }).where("id", "=", file.clientId).execute();
    await test.db.updateTable("File").set({ number: "99/BLC" }).where("id", "=", file.id).execute();

    const after = await test.transact((ex, ctx) => getReceiptSheet(ex, ctx, { receiptId }));
    expect(after.receipt.clientName).toBe(before.receipt.clientName);
    expect(after.receipt.fileNumber).toBe(before.receipt.fileNumber);
    expect(after.receipt.clientName).not.toBe("اسم جديد للعميل");
    const row = await test.db
      .selectFrom("Payment")
      .select(["clientName", "fileNumber"])
      .where("id", "=", paid.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ clientName: before.receipt.clientName, fileNumber: before.receipt.fileNumber });
  });
});
