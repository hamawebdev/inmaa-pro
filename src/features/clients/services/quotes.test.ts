import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";
import type { CostStudyInput, QuoteInput } from "../validators/pricing";

import { quotesToFollowUp } from "./alerts";
import { getCostStudy, saveCostStudy } from "./cost-study";
import { registerFile, type RegisterFileInput } from "./files";
import {
  addQuoteFollowUp,
  cancelQuote,
  decideQuote,
  getFileQuotes,
  getQuoteSheet,
  issueQuote,
  listPendingQuotes,
  openQuoteCosts,
  recordQuoteResult,
  reviseQuote,
  saveQuote,
  submitQuote,
} from "./quotes";

let test: TestDatabase;
let fileId: string;
beforeEach(async () => {
  test = await createTestDatabase();
  const input = structuredClone(DEMO_FILES.find((file) => file.name === "housingRequest")!.input) as RegisterFileInput;
  ({ fileId } = await test.transact((ex, ctx) => registerFile(ex, ctx, input)));
});
afterEach(() => test.close());

const QUOTE: QuoteInput = {
  date: "2026-10-12",
  validUntil: null,
  includedText: "تنظيف شامل بعد الترميم",
  excludedText: "الواجهة الخارجية",
  materialsIncluded: true,
  equipmentIncluded: true,
  workers: 3,
  duration: "يوم ونصف",
  visits: "2",
  discount: 50000,
  amountBasis: null,
  lines: [
    {
      kind: "INITIAL_JOB",
      label: "تنظيف شامل وعميق",
      description: null,
      quantity: 1000,
      unit: null,
      unitPrice: 1700000,
    },
    { kind: "EXTRA", label: "إزالة بقع الطلاء", description: null, quantity: 2000, unit: "غرفة", unitPrice: 75000 },
  ],
};

const STUDY: CostStudyInput = {
  workers: 3,
  perVisitMin: 300,
  visitsPerWeek: null,
  weeks: null,
  hourlyRate: 40000,
  lines: [
    { code: "LABOUR", label: null, amount: 0, rateBp: null },
    { code: "MATERIALS", label: null, amount: 350000, rateBp: null },
    { code: "TRANSPORT", label: null, amount: 100000, rateBp: null },
    { code: "RESERVE", label: null, amount: 0, rateBp: 500 },
  ],
  marginPercent: 3000,
  discount: 0,
};

const stageOf = async () =>
  (await test.db.selectFrom("File").select("stage").where("id", "=", fileId).executeTakeFirstOrThrow()).stage;

/** A quote saved, sent to the manager, approved by him and issued. */
async function issued(quote: QuoteInput = QUOTE) {
  const saved = await test.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quote }));
  await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }));
  await test.transact((ex, ctx) =>
    decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: true, note: "السعر مناسب" }),
  );
  await test.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: saved.quoteId }));
  return saved;
}

describe("the cost study", () => {
  it("is saved with what the program works out, read only with cost.read, and never tells the log its figures", async () => {
    const first = await test.transact((ex, ctx) => getCostStudy(ex, ctx, { fileId }));
    // Nothing saved yet: the form's own workers and hours, the centre's materials and transport.
    expect(first.saved).toBe(false);
    expect(first.terms).toMatchObject({ workers: 3, perVisitMin: 300, visitsPerWeek: 2 });
    expect(first.terms.lines.find((line) => line.code === "MATERIALS")?.amount).toBe(350000);

    const saved = await test.transact((ex, ctx) => saveCostStudy(ex, ctx, { fileId, terms: STUDY }));
    // 15 hours at 400,00 = 6.000,00; direct 10.500,00; reserve 525,00; margin 30 %
    expect(saved).toMatchObject({ finalPrice: 1433250, changed: true });
    const row = await test.db
      .selectFrom("CostStudy")
      .selectAll()
      .where("fileId", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ totalCost: 1102500, profitValue: 330750, finalPrice: 1433250, pricePerVisit: 1433250 });
    expect(await test.transact((ex, ctx) => saveCostStudy(ex, ctx, { fileId, terms: STUDY }))).toMatchObject({
      changed: false,
    });

    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(test.transact((ex, ctx) => getCostStudy(ex, ctx, { fileId }), reception)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    await expect(
      test.transact((ex, ctx) => saveCostStudy(ex, ctx, { fileId, terms: STUDY }), reception),
    ).rejects.toThrow("You do not have permission to do this.");

    const log = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "changes"])
      .where("entity", "=", "CostStudy")
      .orderBy("chainSeq")
      .execute();
    expect(log.map((entry) => entry.operation)).toEqual(["CONSULT", "COLLECT"]);
    expect(JSON.stringify(log)).not.toContain("1102500");
  });
});

describe("a quote", () => {
  it("is numbered, approved by the manager only, issued, and moves the file to «عرض سعر»", async () => {
    const saved = await test.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quote: QUOTE }));
    expect(saved).toMatchObject({ number: "0001/2026", version: 1 });
    const draft = await test.db
      .selectFrom("Quote")
      .selectAll()
      .where("id", "=", saved.quoteId)
      .executeTakeFirstOrThrow();
    expect(draft).toMatchObject({
      status: "DRAFT",
      result: "PENDING",
      subtotal: 1850000,
      discount: 50000,
      total: 1800000,
    });
    expect(draft.validUntil).toBeNull();

    // A second quote cannot be started beside it; the draft itself can be changed.
    await expect(test.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quote: QUOTE }))).rejects.toThrow(
      "This file already has a quote being prepared.",
    );
    await test.transact((ex, ctx) =>
      saveQuote(ex, ctx, { fileId, quoteId: saved.quoteId, quote: { ...QUOTE, validUntil: "2026-10-27" } }),
    );

    await expect(test.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: saved.quoteId }))).rejects.toThrow(
      "A quote is issued once the manager has approved it.",
    );
    const reception = await test.sessionFor("RECEPTION_SALES");
    expect(await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }), reception)).toMatchObject(
      { status: "AWAITING_APPROVAL" },
    );
    await expect(
      test.transact(
        (ex, ctx) => decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: true, note: "نعم" }),
        reception,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quoteId: saved.quoteId, quote: QUOTE })),
    ).rejects.toThrow("Only a quote being prepared can be changed.");

    // His no sends it back; changed, sent again, his yes.
    await expect(
      test.transact((ex, ctx) => decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: false, note: " " })),
    ).rejects.toThrow("A reason is required.");
    await test.transact((ex, ctx) =>
      decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: false, note: "السعر مرتفع" }),
    );
    await test.transact((ex, ctx) =>
      saveQuote(ex, ctx, { fileId, quoteId: saved.quoteId, quote: { ...QUOTE, discount: 100000 } }),
    );
    await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }), reception);
    await test.transact((ex, ctx) => decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: true, note: "موافق" }));

    await test.transact((ex, ctx) => saveCostStudy(ex, ctx, { fileId, terms: STUDY }));
    expect(await stageOf()).toBe("NEW");
    await test.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: saved.quoteId }), reception);
    const quote = await test.db
      .selectFrom("Quote")
      .selectAll()
      .where("id", "=", saved.quoteId)
      .executeTakeFirstOrThrow();
    expect(quote).toMatchObject({
      status: "ISSUED",
      total: 1750000,
      issuedDate: "2026-10-12",
      vatRate: 1900,
      pricesIncludeVat: 1,
      costTotal: 1102500,
      marginBp: 5873,
      approvalNote: "موافق",
    });
    expect(await stageOf()).toBe("QUOTE");

    // Cost and margin come only through the logged read (audit LOG-6), once a day per reader and quote.
    const costs = await test.transact((ex, ctx) => openQuoteCosts(ex, ctx, { fileId }));
    expect(costs).toEqual({ [saved.quoteId]: { costTotal: 1102500, marginBp: 5873 } });
    await test.transact((ex, ctx) => openQuoteCosts(ex, ctx, { fileId }));
    const consults = await test.db
      .selectFrom("AuditLog")
      .select("id")
      .where("operation", "=", "CONSULT")
      .where("entity", "=", "Quote")
      .execute();
    expect(consults).toHaveLength(1);
    await expect(test.transact((ex, ctx) => openQuoteCosts(ex, ctx, { fileId }), reception)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    // Who cannot read costs sees the quote without them, on screen and on its sheet.
    const seen = await test.transact((ex, ctx) => getFileQuotes(ex, ctx, { fileId }), reception);
    expect(seen.quotes[0]).toMatchObject({ costTotal: null, marginBp: null, steps: ["ANSWER", "REVISE"] });
    const sheet = await test.transact((ex, ctx) => getQuoteSheet(ex, ctx, { quoteId: saved.quoteId }));
    expect(sheet).toMatchObject({ client: { name: "بن صالح كريمة", phone: "0661 45 12 78" } });
    expect(sheet.quote.costTotal).toBeNull();
    expect(sheet.quote.lines.map((line) => line.amount)).toEqual([1700000, 150000]);
  });

  it("accepted, gives the file its amount and takes it to «متعاقد»: the visits and the dues follow", async () => {
    const saved = await issued();
    const view = await test.transact((ex, ctx) => getFileQuotes(ex, ctx, { fileId }));
    expect(view.contract).toEqual({ allowed: true, refusal: null });
    expect(view.canStart).toBe(false);

    await expect(
      test.transact((ex, ctx) =>
        recordQuoteResult(ex, ctx, { quoteId: saved.quoteId, result: "POSTPONED", resultDate: "2026-10-12" }),
      ),
    ).rejects.toThrow("Say until when the client postponed his answer.");
    const answer = await test.transact((ex, ctx) =>
      recordQuoteResult(ex, ctx, {
        quoteId: saved.quoteId,
        result: "ACCEPTED",
        resultDate: "2026-10-12",
        note: "وافقت بالهاتف",
        contract: true,
      }),
    );
    expect(answer).toMatchObject({ result: "ACCEPTED", contracted: true, closed: false });

    const file = await test.db.selectFrom("File").selectAll().where("id", "=", fileId).executeTakeFirstOrThrow();
    // The whole job: 18.500,00 less 500,00.
    expect(file).toMatchObject({ stage: "CONTRACTED", totalAmount: 1800000, amountBasis: "WHOLE_CONTRACT" });
    expect(file.lockedAt).not.toBeNull();
    // `file.contracted` reached Operations and Money.
    const visits = await test.db.selectFrom("Visit").select("visitDate").where("fileId", "=", fileId).execute();
    expect(visits.map((visit) => visit.visitDate).sort()).toEqual(["2026-10-17", "2026-10-18"]);
    const dues = await test.db.selectFrom("PaymentDue").select("amount").where("fileId", "=", fileId).execute();
    expect(dues.reduce((sum, due) => sum + due.amount, 0)).toBe(1800000);

    await expect(
      test.transact((ex, ctx) =>
        recordQuoteResult(ex, ctx, { quoteId: saved.quoteId, result: "REFUSED", resultDate: "2026-10-12" }),
      ),
    ).rejects.toThrow("This file is signed on this quote: its answer can no longer change.");
  });

  it("refused, may close the file where it stopped", async () => {
    const saved = await issued();
    const answer = await test.transact((ex, ctx) =>
      recordQuoteResult(ex, ctx, {
        quoteId: saved.quoteId,
        result: "REFUSED",
        resultDate: "2026-10-12",
        note: "السعر مرتفع",
        close: true,
      }),
    );
    expect(answer).toMatchObject({ closed: true, contracted: false });
    const file = await test.db.selectFrom("File").selectAll().where("id", "=", fileId).executeTakeFirstOrThrow();
    expect(file).toMatchObject({ stage: "QUOTE", closeReason: "QUOTE_REFUSED" });
    expect(file.closedAt).not.toBeNull();
    await expect(test.transact((ex, ctx) => reviseQuote(ex, ctx, { quoteId: saved.quoteId }))).rejects.toThrow(
      "This file is closed and can no longer be changed.",
    );
  });

  it("gets a new version under the same number, which replaces the issued one when issued in turn", async () => {
    const first = await issued();
    await test.transact((ex, ctx) =>
      recordQuoteResult(ex, ctx, { quoteId: first.quoteId, result: "DISCOUNT_REQUESTED", resultDate: "2026-10-12" }),
    );
    const second = await test.transact((ex, ctx) => reviseQuote(ex, ctx, { quoteId: first.quoteId }));
    expect(second.version).toBe(2);
    await test.transact((ex, ctx) =>
      saveQuote(ex, ctx, { fileId, quoteId: second.quoteId, quote: { ...QUOTE, discount: 150000 } }),
    );
    await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: second.quoteId }));
    await test.transact((ex, ctx) =>
      decideQuote(ex, ctx, { quoteId: second.quoteId, approve: true, note: "تخفيض مقبول" }),
    );
    await test.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: second.quoteId }));

    const rows = await test.db
      .selectFrom("Quote")
      .select(["number", "version", "status", "total"])
      .orderBy("version")
      .execute();
    expect(rows).toEqual([
      { number: "0001/2026", version: 1, status: "SUPERSEDED", total: 1800000 },
      { number: "0001/2026", version: 2, status: "ISSUED", total: 1700000 },
    ]);
    // A draft given up needs its reason, and frees the place for another.
    const third = await test.transact((ex, ctx) => reviseQuote(ex, ctx, { quoteId: second.quoteId }));
    await expect(
      test.transact((ex, ctx) => cancelQuote(ex, ctx, { quoteId: third.quoteId, reason: "" })),
    ).rejects.toThrow("A reason is required.");
    await test.transact((ex, ctx) => cancelQuote(ex, ctx, { quoteId: third.quoteId, reason: "خطأ في الإدخال" }));
    await expect(
      test.transact((ex, ctx) => cancelQuote(ex, ctx, { quoteId: second.quoteId, reason: "لا" })),
    ).rejects.toThrow("An issued quote is not cancelled: record the client's answer, or make a new version.");
  });

  it("is followed up: a call noted with its next date takes it off the alert until then", async () => {
    const saved = await issued();
    test.clock.advance({ days: 4 });
    const due = () => test.transact(async (ex, ctx) => (await quotesToFollowUp(ex, ctx, { days: 3 })).count);
    expect(await due()).toBe(1);
    await test.transact((ex, ctx) =>
      addQuoteFollowUp(ex, ctx, {
        quoteId: saved.quoteId,
        date: "2026-10-16",
        note: "ستجيب بعد أسبوع",
        nextFollowUpDate: "2026-10-23",
      }),
    );
    expect(await due()).toBe(0);
    const pending = await test.transact((ex, ctx) => listPendingQuotes(ex, ctx, {}));
    expect(pending).toMatchObject([
      {
        quoteId: saved.quoteId,
        clientName: "بن صالح كريمة",
        lastFollowUp: { date: "2026-10-16", note: "ستجيب بعد أسبوع" },
        nextFollowUpDate: "2026-10-23",
        due: false,
      },
    ]);
    expect(await test.transact((ex, ctx) => listPendingQuotes(ex, ctx, { dueOnly: true }))).toEqual([]);
    const view = await test.transact((ex, ctx) => getFileQuotes(ex, ctx, { fileId }));
    expect(view.quotes[0].followUps).toMatchObject([{ date: "2026-10-16", nextFollowUpDate: "2026-10-23" }]);
  });

  it("needs no approval when the centre's rule says so", async () => {
    await test.transact((ex, ctx) => setSetting(ex, ctx, "quote.approvalRule", "NONE"));
    const saved = await test.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quote: QUOTE }));
    expect(await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }))).toMatchObject({
      status: "APPROVED",
    });
  });
});
