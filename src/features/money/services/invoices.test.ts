import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { syncDues } from "./dues";
import {
  getInvoiceSheet,
  issueInvoice,
  listInvoiceCandidates,
  listInvoices,
  prepareInvoice,
  recordInvoicePrinted,
  voidInvoice,
} from "./invoices";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

/** A contract with November's four visits signed off, its dues built, and the clock on 1 December. */
async function novemberDone(outcomes: readonly Parameters<typeof visitOn>[3][] = []) {
  const file = await contractedFile(test);
  for (const [index, date] of NOVEMBER_TUESDAYS.entries()) await visitOn(test, file.id, date, outcomes[index]);
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  await openDay(test, "2026-12-01T08:00:00.000Z");
  const dues = await test.db
    .selectFrom("PaymentDue")
    .selectAll()
    .where("fileId", "=", file.id)
    .orderBy("seq")
    .execute();
  return { file, november: dues[0], dues };
}

const issue = (fileId: string, dueIds: string[], paymentMethod: "CASH" | "BANK_TRANSFER" = "CASH") =>
  test.transact((ex, ctx) => issueInvoice(ex, ctx, { fileId, dueIds, paymentMethod }));

describe("what is ready to invoice", () => {
  it("lists a period once it has ended and its visits are signed off, the ready ones first", async () => {
    const { file, dues } = await novemberDone();
    const candidates = await test.transact((ex, ctx) => listInvoiceCandidates(ex, ctx));
    expect(candidates.map((row) => [row.dueId, row.readiness, row.visits, row.billed])).toEqual([
      [dues[0].id, "READY", 4, 4],
      [dues[1].id, "PERIOD_OPEN", 0, 0],
    ]);
    expect(candidates[0]).toMatchObject({ fileId: file.id, division: "BUILDING", kind: "SCHEDULE" });
  });

  it("waits for a visit still open, and for a done visit whose order is not typed in", async () => {
    const open = await novemberDone(["SIGNED_OFF", "PLANNED"]);
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: open.file.id, dueIds: [open.november.id] }),
    );
    expect(proposal.blockers).toEqual(["VISITS_OPEN"]);
    await expect(issue(open.file.id, [open.november.id])).rejects.toThrow("Some visits to invoice are not closed yet.");
  });

  it("asks for the sign-off only while Settings do", async () => {
    const { file, november } = await novemberDone(["SIGNED_OFF", "DONE_NOT_TYPED"]);
    await expect(issue(file.id, [november.id])).rejects.toThrow("is not signed off yet");
    await test.transact((ex, ctx) => setSetting(ex, ctx, "invoice.requireSignOff", false));
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    expect(proposal.blockers).toEqual([]);
    expect(proposal.visits.map((visit) => visit.billable)).toEqual([true, true, true, true]);
  });

  it("refuses a period that has not ended, and a due that is gone", async () => {
    const { file, dues } = await novemberDone();
    await expect(issue(file.id, [dues[1].id])).rejects.toThrow("This period has not ended yet.");
    await issue(file.id, [dues[0].id]);
    await expect(issue(file.id, [dues[0].id])).rejects.toThrow("This due can no longer be invoiced");
    await expect(issue(file.id, [])).rejects.toThrow("Choose what to invoice.");
    await expect(issue("no-such-file", ["x"])).rejects.toThrow("This file does not exist.");
  });
});

describe("issuing an invoice", () => {
  it("writes the invoice, its line and its visit statement through the chain, and marks the due", async () => {
    const { file, november } = await novemberDone();
    const issued = await issue(file.id, [november.id]);
    expect(issued.number).toBe("000001/2026");

    const invoice = await test.db
      .selectFrom("Invoice")
      .selectAll()
      .where("id", "=", issued.id)
      .executeTakeFirstOrThrow();
    expect(invoice).toMatchObject({
      numberSeq: 1,
      numberYear: 2026,
      fileId: file.id,
      division: "BUILDING",
      serviceType: "CONTRACT",
      issueDate: "2026-12-01",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      taxMode: "IFU",
      vatRate: 0,
      vatAmount: 0,
      grossAmount: da(45_000),
      discountAmount: 0,
      totalHT: da(45_000),
      totalTTC: da(45_000),
      paymentMethod: "CASH",
      // 45 000,00 in cash: 1,50 per 100 on the whole amount.
      stampDuty: da(675),
      netToPay: da(45_675),
      dueDate: "2026-12-01",
      paymentPlace: "مقر المركز",
    });
    expect(invoice.amountWordsAr).toContain("خمسة وأربعون ألف");
    expect(JSON.parse(invoice.sellerSnapshot)).toMatchObject({ nameAr: "مركز إنماء برو", rc: "04/00-0123456A21" });
    // Clients' buyer block: the site's address with its commune (getClientForInvoice).
    expect(JSON.parse(invoice.buyerSnapshot)).toMatchObject({
      address: expect.stringContaining("حي النصر، عمارة B7"),
      payerName: "رشيد بوزيد",
    });
    expect(JSON.parse(invoice.ifuMention ?? "{}")).toHaveProperty("ar");

    const lines = await test.db.selectFrom("InvoiceLine").selectAll().where("invoiceId", "=", issued.id).execute();
    expect(lines).toMatchObject([
      {
        seq: 1,
        kind: "SERVICE",
        description: "خدمة التنظيف من 01/11/2026 إلى 30/11/2026",
        quantity: 1000,
        unitLabel: "شهر",
        unitPrice: da(45_000),
        amount: da(45_000),
        dueId: november.id,
      },
    ]);
    const visits = await test.db
      .selectFrom("InvoiceVisit")
      .selectAll()
      .where("invoiceId", "=", issued.id)
      .orderBy("seq")
      .execute();
    expect(visits.map((row) => [row.seq, row.visitDate, row.dayName, row.arrival, row.departure])).toEqual([
      [1, "2026-11-03", "الثلاثاء", "08:00", "11:00"],
      [2, "2026-11-10", "الثلاثاء", "08:00", "11:00"],
      [3, "2026-11-17", "الثلاثاء", "08:00", "11:00"],
      [4, "2026-11-24", "الثلاثاء", "08:00", "11:00"],
    ]);
    expect(visits[0]).toMatchObject({
      workersCount: 2,
      workedMin: 360,
      completion: "مكتملة بالكامل",
      signOff: "تم قبول الخدمة",
      signedBy: "مرابط بلقاسم",
      billable: 1,
    });

    const due = await test.db
      .selectFrom("PaymentDue")
      .select(["invoiceId", "amount", "expectedAmount"])
      .where("id", "=", november.id)
      .executeTakeFirstOrThrow();
    expect(due).toEqual({ invoiceId: issued.id, amount: da(45_000), expectedAmount: da(45_000) });

    expect(await verifyChains(test.db)).toMatchObject({ ok: true, brokenDigests: [], missingNumbers: [] });
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "entity", "entityLabel", "subjectKind"])
      .where("ownerCode", "=", "MONEY")
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({
      operation: "CHANGE",
      action: "ISSUE",
      entity: "Invoice",
      entityLabel: "000001/2026",
      subjectKind: "CLIENT",
    });
  });

  it("takes a missed visit off the period, and gives the due what the invoice comes to", async () => {
    const { file, november } = await novemberDone(["SIGNED_OFF", "CANCELLED", "SIGNED_OFF", "CLIENT_AT_FAULT"]);
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    expect(proposal.lines.map((line) => [line.kind, line.quantity, line.unitPrice, line.amount])).toEqual([
      ["SERVICE", 1000, da(45_000), da(45_000)],
      // One of four was missed; the visit the client made impossible is billed.
      ["MISSED_VISIT", 1000, -da(11_250), -da(11_250)],
    ]);
    expect(proposal.lines[1].description).toBe("زيارات غير منجزة (1 من 4)");
    expect(proposal.visits.map((visit) => [visit.completion, visit.billable, visit.remark])).toEqual([
      ["مكتملة بالكامل", true, null],
      ["ملغاة", false, null],
      ["مكتملة بالكامل", true, null],
      ["ملغاة", true, "تعذرت بسبب العميل"],
    ]);
    expect(proposal.totals).toMatchObject({
      grossAmount: da(45_000),
      discountAmount: da(11_250),
      totalTTC: da(33_750),
    });

    const issued = await issue(file.id, [november.id], "BANK_TRANSFER");
    const invoice = await test.db
      .selectFrom("Invoice")
      .selectAll()
      .where("id", "=", issued.id)
      .executeTakeFirstOrThrow();
    expect(invoice).toMatchObject({
      totalTTC: da(33_750),
      stampDuty: 0,
      netToPay: da(33_750),
      paymentMethod: "BANK_TRANSFER",
    });
    const due = await test.db
      .selectFrom("PaymentDue")
      .select("amount")
      .where("id", "=", november.id)
      .executeTakeFirstOrThrow();
    expect(due.amount).toBe(da(33_750));
  });

  it("counts a make-up visit in place of the one it replaces", async () => {
    const file = await contractedFile(test);
    const [first, ...rest] = NOVEMBER_TUESDAYS;
    const postponed = await visitOn(test, file.id, first, "PLANNED", { status: "POSTPONED", statusReason: "OTHER" });
    await visitOn(test, file.id, "2026-11-05", "SIGNED_OFF", { origin: "MAKEUP", sourceVisitId: postponed.id });
    for (const date of rest) await visitOn(test, file.id, date);
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    await openDay(test, "2026-12-01T08:00:00.000Z");
    const [november] = await test.db
      .selectFrom("PaymentDue")
      .select("id")
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    expect(proposal.blockers).toEqual([]);
    expect(proposal.lines.map((line) => line.kind)).toEqual(["SERVICE"]);
    expect(proposal.visits.find((visit) => visit.remark === "زيارة تعويضية")?.visitDate).toBe("2026-11-05");
  });

  it("invoices several visits of a contract paid after each visit, each due taking its share", async () => {
    const file = await contractedFile(test, {
      paymentFrequency: "PER_VISIT",
      totalAmount: da(3_500),
      firstDueDate: null,
      paymentMethods: JSON.stringify(["CASH"]),
    });
    const first = await visitOn(test, file.id, "2026-11-03");
    const second = await visitOn(test, file.id, "2026-11-10");
    await visitOn(test, file.id, "2026-11-17", "PLANNED");
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    await openDay(test, "2026-11-11T08:00:00.000Z");

    const dues = await test.db
      .selectFrom("PaymentDue")
      .selectAll()
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    expect(dues.map((due) => due.visitId)).toEqual([first.id, second.id, expect.any(String)]);
    await expect(issue(file.id, [dues[2].id])).rejects.toThrow("Some visits to invoice are not closed yet.");

    const issued = await issue(file.id, [dues[0].id, dues[1].id]);
    const lines = await test.db
      .selectFrom("InvoiceLine")
      .selectAll()
      .where("invoiceId", "=", issued.id)
      .orderBy("seq")
      .execute();
    expect(lines.map((line) => [line.kind, line.description, line.amount, line.visitId])).toEqual([
      ["VISIT", "زيارة يوم 03/11/2026", da(3_500), first.id],
      ["VISIT", "زيارة يوم 10/11/2026", da(3_500), second.id],
    ]);
    const after = await test.db
      .selectFrom("PaymentDue")
      .select(["invoiceId", "amount"])
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    expect(after).toEqual([
      { invoiceId: issued.id, amount: da(3_500) },
      { invoiceId: issued.id, amount: da(3_500) },
      { invoiceId: null, amount: da(3_500) },
    ]);
  });

  it("splits the amount under VAT when the price includes it", async () => {
    await test.transact((ex, ctx) => setSetting(ex, ctx, "tax.mode", "VAT"));
    const { file, november } = await novemberDone();
    const issued = await issue(file.id, [november.id], "BANK_TRANSFER");
    const invoice = await test.db
      .selectFrom("Invoice")
      .selectAll()
      .where("id", "=", issued.id)
      .executeTakeFirstOrThrow();
    expect(invoice).toMatchObject({
      taxMode: "VAT",
      vatRate: 1900,
      // The lines are before tax under VAT; the price agreed with its tax is the total with tax.
      pricesIncludeVat: 0,
      totalTTC: da(45_000),
      totalHT: da(37_815.13),
      vatAmount: da(7_184.87),
      ifuMention: null,
    });
  });

  it("is refused until the centre's tax file and the client's are complete", async () => {
    const { file, november } = await novemberDone();
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.nif", ""));
    await expect(issue(file.id, [november.id])).rejects.toThrow("NIS, NIF, article number and address are needed");
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.nif", "198104010012345"));

    await test.db
      .updateTable("Client")
      // An organisation with a trade register and its NIF and NIS, but no RC typed: Clients' card says it lacks the RC.
      .set({
        clientType: "ORGANISATION",
        hasTradeRegister: 1,
        rcNumber: null,
        nif: "000416012345678",
        nis: "000416012345678",
      })
      .where("id", "=", file.clientId)
      .execute();
    await expect(issue(file.id, [november.id])).rejects.toThrow("trade register number is needed");
    await test.db.updateTable("Client").set({ rcNumber: "04/00-0999999B20" }).where("id", "=", file.clientId).execute();

    await test.db.deleteFrom("Setting").where("key", "=", "tax.mode").execute();
    await expect(issue(file.id, [november.id])).rejects.toThrow("Choose the centre's tax regime");
  });

  it("is for those who may issue invoices", async () => {
    const { file, november } = await novemberDone();
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact((ex, ctx) => issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }), reception),
    ).rejects.toThrow("You do not have permission to do this.");
    const accountant = await test.sessionFor("ACCOUNTANT");
    const issued = await test.transact(
      (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
      accountant,
    );
    expect(issued.number).toBe("000001/2026");
  });
});

describe("voiding an invoice", () => {
  it("writes the reason as an event, frees the due, and keeps the number", async () => {
    const { file, november } = await novemberDone();
    const issued = await issue(file.id, [november.id]);
    await expect(
      test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: issued.id, reason: "  " })),
    ).rejects.toThrow("A reason is required.");
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: issued.id, reason: "خطأ في المبلغ" }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");

    test.clock.advance({ hours: 1 });
    await test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: issued.id, reason: "خطأ في المبلغ" }));
    await expect(
      test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: issued.id, reason: "مرة ثانية" })),
    ).rejects.toThrow("This invoice is already voided.");

    const due = await test.db
      .selectFrom("PaymentDue")
      .select(["invoiceId", "amount"])
      .where("id", "=", november.id)
      .executeTakeFirstOrThrow();
    expect(due).toEqual({ invoiceId: null, amount: da(45_000) });
    expect(await test.db.selectFrom("Invoice").select("number").execute()).toEqual([{ number: "000001/2026" }]);

    // The same due is invoiced again, under the next number.
    const again = await issue(file.id, [november.id]);
    expect(again.number).toBe("000002/2026");
    const list = await test.transact((ex, ctx) => listInvoices(ex, ctx, {}));
    expect(list.map((row) => [row.number, row.voided, row.paymentState])).toEqual([
      ["000002/2026", false, "UNPAID"],
      ["000001/2026", true, null],
    ]);
    expect(await verifyChains(test.db)).toMatchObject({ ok: true });

    const log = await test.db
      .selectFrom("AuditLog")
      .select(["action", "reason"])
      .where("entityId", "=", issued.id)
      .orderBy("chainSeq")
      .execute();
    expect(log).toEqual([
      { action: "ISSUE", reason: "STANDARD:ISSUE" },
      { action: "VOID", reason: "خطأ في المبلغ" },
    ]);
  });
});

describe("the sheet of an invoice", () => {
  it("prints from the stored rows, with its statement, and says so when voided", async () => {
    const { file, november } = await novemberDone();
    const issued = await issue(file.id, [november.id]);
    const sheet = await test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: issued.id }));
    expect(sheet.invoice).toMatchObject({
      number: "000001/2026",
      issueDate: "2026-12-01",
      place: "أم البواقي",
      fileNumber: file.number,
      division: "BUILDING",
      taxMode: "IFU",
      netToPay: da(45_675),
      voided: null,
    });
    expect(sheet.invoice.ifuMention?.ar).toContain("الضريبة الجزافية");
    expect(sheet.invoice.lines).toHaveLength(1);
    expect(sheet.statement?.rows).toHaveLength(4);
    expect(sheet.statement).toMatchObject({
      invoiceNumber: "000001/2026",
      siteAddress: expect.stringContaining("حي النصر"),
    });

    await test.transact((ex, ctx) => recordInvoicePrinted(ex, ctx, { invoiceId: issued.id }));
    expect(
      await test.db.selectFrom("LegalEvent").select(["type", "invoiceId"]).where("invoiceId", "=", issued.id).execute(),
    ).toEqual([{ type: "PRINTED", invoiceId: issued.id }]);

    test.clock.advance({ days: 1 });
    await test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: issued.id, reason: "خطأ في العميل" }));
    const voided = await test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: issued.id }));
    expect(voided.invoice.voided).toEqual({ date: "2026-12-02", reason: "خطأ في العميل" });
    await expect(test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: "nope" }))).rejects.toThrow(
      "This invoice does not exist.",
    );
  });
});
