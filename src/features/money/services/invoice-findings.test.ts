import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { syncDues } from "./dues";
import { getInvoiceSheet, issueInvoice, prepareInvoice } from "./invoices";

/** The audit's findings on invoicing (scratchpad/audit/for-money.md), each held by a test. */
let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await centreReady(test);
});
afterEach(() => test.close());

async function novemberReady(
  over: Record<string, unknown> = {},
  outcomes = ["SIGNED_OFF", "SIGNED_OFF", "SIGNED_OFF", "SIGNED_OFF"],
) {
  const file = await contractedFile(test, over);
  for (const [index, outcome] of outcomes.entries()) {
    await visitOn(test, file.id, NOVEMBER_TUESDAYS[index], outcome as never);
  }
  await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
  await openDay(test, "2026-12-01T08:00:00.000Z");
  const [november] = await test.db
    .selectFrom("PaymentDue")
    .select("id")
    .where("fileId", "=", file.id)
    .orderBy("seq")
    .execute();
  return { file, november };
}

const blockers = (fileId: string, dueId: string) =>
  test.transact(async (ex, ctx) => (await prepareInvoice(ex, ctx, { fileId, dueIds: [dueId] })).blockers);

describe("INV-3: the centre's identity", () => {
  it("needs its article number and its address before the first invoice", async () => {
    const { file, november } = await novemberReady();
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.articleNumber", ""));
    expect(await blockers(file.id, november.id)).toContain("SELLER_INCOMPLETE");
    await test.transact(async (ex, ctx) => {
      await setSetting(ex, ctx, "centre.articleNumber", "04011234567");
      await setSetting(ex, ctx, "centre.address", "");
    });
    expect(await blockers(file.id, november.id)).toContain("SELLER_INCOMPLETE");
  });
});

describe("INV-4: an organisation's identifiers", () => {
  async function organisation(client: Record<string, unknown>) {
    const ready = await novemberReady({ division: "ORGANISATION", formKind: "ORG_CONTRACT" });
    await test.db
      .updateTable("Client")
      .set({ clientType: "ORGANISATION", ...client })
      .where("id", "=", ready.file.clientId)
      .execute();
    return ready;
  }

  it("waits for «السجل التجاري» to be answered", async () => {
    const { file, november } = await organisation({
      hasTradeRegister: null,
      nif: "000416012345678",
      nis: "000416012345678",
    });
    expect(await blockers(file.id, november.id)).toContain("BUYER_TRADE_REGISTER_UNANSWERED");
  });

  it("needs the RC when it has one, and its NIF and NIS always", async () => {
    let ready = await organisation({
      hasTradeRegister: 1,
      rcNumber: null,
      nif: "000416012345678",
      nis: "000416012345678",
    });
    expect(await blockers(ready.file.id, ready.november.id)).toEqual(["BUYER_NO_TRADE_REGISTER"]);
    test.close();
    test = await createTestDatabase();
    await centreReady(test);
    ready = await organisation({ hasTradeRegister: 0, rcNumber: null, nif: "000416012345678", nis: null });
    expect(await blockers(ready.file.id, ready.november.id)).toEqual(["BUYER_NO_NIS"]);
  });

  it("issues once all is there", async () => {
    const { file, november } = await organisation({
      hasTradeRegister: 1,
      rcNumber: "04/00-0987654B19",
      nif: "000416012345678",
      nis: "000416012345678",
    });
    expect(await blockers(file.id, november.id)).toEqual([]);
  });
});

describe("INV-6: every line multiplies out", () => {
  it("prints a deduction that does not divide by visit as one lump sum, the count in its words", async () => {
    // 10 000,00 for three visits, two of them missed: 6 666,67 off, not 2 × 3 333,33.
    const { file, november } = await novemberReady({ totalAmount: da(10_000) }, [
      "SIGNED_OFF",
      "CANCELLED",
      "CANCELLED",
    ]);
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    const missed = proposal.lines.find((line) => line.kind === "MISSED_VISIT");
    expect(missed).toMatchObject({
      quantity: 1000,
      unitLabel: "جزافي",
      unitPrice: -666_667,
      amount: -666_667,
      description: "زيارات غير منجزة (2 من 3)",
    });
    for (const line of proposal.lines) expect((line.quantity * line.unitPrice) / 1000).toBe(line.amount);
  });
});

describe("INV-7, INV-8, INV-X1: a reprint says what the invoice said", () => {
  it("keeps the place, the site's address and the file number of the day it was issued", async () => {
    const { file, november } = await novemberReady();
    const issued = await test.transact((ex, ctx) =>
      issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "CASH" }),
    );
    const before = await test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: issued.id }));

    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.city", "عين البيضاء"));
    await test.db.updateTable("Site").set({ address: "حي 1000 مسكن" }).where("id", "=", file.siteId).execute();
    await test.db.updateTable("File").set({ number: "99/BLC" }).where("id", "=", file.id).execute();

    const after = await test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: issued.id }));
    expect(after.invoice.place).toBe(before.invoice.place);
    expect(after.invoice.fileNumber).toBe(before.invoice.fileNumber);
    expect(after.statement?.siteAddress).toBe(before.statement?.siteAddress);
    expect(after.statement?.siteAddress).toContain("حي النصر، عمارة B7");
  });

  it("prints a billing address alone, without the site's commune", async () => {
    const { file, november } = await novemberReady();
    await test.db
      .updateTable("Client")
      .set({ billingAddress: "المنطقة الصناعية، عين البيضاء، أم البواقي" })
      .where("id", "=", file.clientId)
      .execute();
    const issued = await test.transact((ex, ctx) =>
      issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "CASH" }),
    );
    const sheet = await test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: issued.id }));
    expect(sheet.invoice.buyer).toMatchObject({
      address: "المنطقة الصناعية، عين البيضاء، أم البواقي",
      commune: null,
      wilayaCode: null,
    });
  });
});

describe("Decree 05-468 under VAT: each line before tax, the totals as agreed", () => {
  it("brings a price typed with its tax back before tax line by line, without moving the totals by a centime", async () => {
    await test.transact(async (ex, ctx) => {
      await setSetting(ex, ctx, "tax.mode", "VAT");
      await setSetting(ex, ctx, "tax.pricesIncludeVat", true);
    });
    // 45 000,00 a month with its tax in it; one of four visits cancelled by the centre: 33 750,00 with tax.
    const { file, november } = await novemberReady({}, ["SIGNED_OFF", "CANCELLED", "SIGNED_OFF", "SIGNED_OFF"]);
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    const totals = proposal.totals;
    if (!totals) throw new Error("money: no totals");

    expect(totals).toMatchObject({ totalTTC: da(33_750), totalHT: da(28_361.34), vatAmount: da(5_388.66) });
    // The lines are before tax, add up to the total before tax, and each multiplies out.
    expect(proposal.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(totals.totalHT);
    for (const line of proposal.lines) expect((line.quantity * line.unitPrice) / 1000).toBe(line.amount);
    expect(proposal.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["SERVICE", da(37_815.12)],
      ["MISSED_VISIT", -da(9_453.78)],
    ]);
    expect(totals.grossAmount - totals.discountAmount).toBe(totals.totalHT);

    // Issued, the invoice holds the same: the agreed total with tax, its lines before tax.
    const issued = await test.transact((ex, ctx) =>
      issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id], paymentMethod: "BANK_TRANSFER" }),
    );
    const sheet = await test.transact((ex, ctx) => getInvoiceSheet(ex, ctx, { invoiceId: issued.id }));
    expect(sheet.invoice).toMatchObject({ totalTTC: da(33_750), totalHT: da(28_361.34), vatAmount: da(5_388.66) });
    expect(sheet.invoice.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(da(28_361.34));
  });

  it("leaves a price typed before tax as typed, the tax added on the total", async () => {
    await test.transact(async (ex, ctx) => {
      await setSetting(ex, ctx, "tax.mode", "VAT");
      await setSetting(ex, ctx, "tax.pricesIncludeVat", false);
    });
    const { file, november } = await novemberReady();
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    expect(proposal.lines.map((line) => [line.unitPrice, line.amount])).toEqual([[da(45_000), da(45_000)]]);
    expect(proposal.totals).toMatchObject({ totalHT: da(45_000), vatAmount: da(8_550), totalTTC: da(53_550) });
  });
});
