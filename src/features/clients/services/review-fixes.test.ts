import { afterEach, beforeEach, expect, it } from "vitest";

import { decideOnTheSpot } from "@/features/people/services/sanction-decisions";
import { setSanction } from "@/features/people/services/sanctions";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";
import type { QuoteInput } from "../validators/pricing";

import { getContractPart, endContract, recordNoRenewal, renewFile } from "./contracts";
import { saveCostStudy } from "./cost-study";
import { getAcceptedQuote, getFileBillingTerms } from "./exports";
import { closeFile, registerFile, type RegisterFileInput } from "./files";
import {
  decideQuote,
  getFileQuotes,
  issueQuote,
  recordQuoteResult,
  reviseQuote,
  saveQuote,
  submitQuote,
} from "./quotes";

/** The final review's findings in this folder (scratchpad/final-review/for-clients.md), one test each. */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase({ demo: ["clients"] });
});
afterEach(() => test.close());

const register = (name: string, patch: Partial<RegisterFileInput["values"]> = {}) => {
  const input = structuredClone(DEMO_FILES.find((file) => file.name === name)!.input) as RegisterFileInput;
  input.values = { ...input.values, ...patch };
  return test.transact((ex, ctx) => registerFile(ex, ctx, input));
};

const quote = (lines: QuoteInput["lines"], more: Partial<QuoteInput> = {}): QuoteInput => ({
  date: "2026-10-12",
  validUntil: null,
  includedText: null,
  excludedText: null,
  materialsIncluded: null,
  equipmentIncluded: null,
  workers: null,
  duration: null,
  visits: null,
  discount: 0,
  amountBasis: "PER_PAYMENT_PERIOD",
  lines,
  ...more,
});
const line = (kind: "INITIAL_JOB" | "PERIODIC", dinars: number) => ({
  kind,
  label: kind === "INITIAL_JOB" ? "تنظيف أولي عميق" : "تنظيف دوري",
  description: null,
  quantity: 1000,
  unit: null,
  unitPrice: dinars * 100,
});

async function issued(fileId: string, input: QuoteInput) {
  const { quoteId } = await test.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quote: input }));
  await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId }));
  await test.transact((ex, ctx) => decideQuote(ex, ctx, { quoteId, approve: true, note: "موافق" }));
  await test.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId }));
  return quoteId;
}

it("CLI-1: a contract keeps its first deep clean on the accepted quote that Money and Operations read", async () => {
  const { fileId } = await register("orgContract");
  const quoteId = await issued(fileId, quote([line("INITIAL_JOB", 30000), line("PERIODIC", 60000)]));
  await test.transact((ex, ctx) =>
    recordQuoteResult(ex, ctx, { quoteId, result: "ACCEPTED", resultDate: "2026-10-12", contract: true }),
  );
  const terms = await test.transact((ex, ctx) => getFileBillingTerms(ex, ctx, { fileId }));
  // «المبلغ إجمالي» is the periodic part (RULINGS 3); the first clean stays on the quote.
  expect(terms).toMatchObject({ stage: "CONTRACTED", totalAmount: 6000000 });
  expect(terms?.acceptedQuoteTotals).toEqual({ INITIAL_JOB: 3000000, PERIODIC: 6000000, EXTRA: 0 });
  expect((await test.transact((ex, ctx) => getAcceptedQuote(ex, ctx, { fileId })))?.totals.INITIAL_JOB).toBe(3000000);
});

it("CLI-2: a per-period contract's suggested quote takes one period of the study, not the whole contract", async () => {
  const { fileId } = await register("orgContract");
  const { finalPrice } = await test.transact((ex, ctx) =>
    saveCostStudy(ex, ctx, {
      fileId,
      terms: {
        workers: 2,
        perVisitMin: 120,
        visitsPerWeek: 5,
        weeks: 13000,
        hourlyRate: 40000,
        lines: [{ code: "LABOUR", label: null, amount: 0, rateBp: null }],
        marginPercent: 2000,
        discount: 0,
      },
    }),
  );
  const study = await test.db
    .selectFrom("CostStudy")
    .select("pricePerMonth")
    .where("fileId", "=", fileId)
    .executeTakeFirstOrThrow();
  const view = await test.transact((ex, ctx) => getFileQuotes(ex, ctx, { fileId }));
  expect(view.suggested.amountBasis).toBe("PER_PAYMENT_PERIOD");
  expect(view.suggested.lines[0]).toMatchObject({ kind: "PERIODIC", unitPrice: study.pricePerMonth });
  expect(study.pricePerMonth).toBeLessThan(finalPrice);
});

it("CLI-3: a signed contract the client cancels before its start ends the day before, with its first visit and due", async () => {
  const fileId = test.demo.clients.housingContract; // starts on 13 October
  await test.transact((ex, ctx) =>
    endContract(ex, ctx, { fileId, endKind: "CANCELLED", endedDate: "2026-10-12", note: "عدل العميل عن العقد" }),
  );
  const file = await test.db
    .selectFrom("File")
    .select(["stage", "endKind", "endedDate"])
    .where("id", "=", fileId)
    .executeTakeFirstOrThrow();
  expect(file).toEqual({ stage: "CONTRACT_ENDED", endKind: "CANCELLED", endedDate: "2026-10-12" });
  const open = await test.db
    .selectFrom("Visit")
    .select("visitDate")
    .where("fileId", "=", fileId)
    .where("status", "<>", "CANCELLED")
    .where("visitDate", ">=", localDate("2026-10-13"))
    .execute();
  expect(open).toEqual([]);
  const dues = await test.db
    .selectFrom("PaymentDue")
    .select("id")
    .where("fileId", "=", fileId)
    .where("cancelledAt", "is", null)
    .execute();
  expect(dues).toEqual([]);
  // A running contract is not cancelled: it is ended.
  test.clock.advance({ days: 1 });
  await expect(
    test.transact((ex, ctx) =>
      endContract(ex, ctx, {
        fileId: test.demo.clients.orgContract,
        endKind: "CANCELLED",
        endedDate: "2026-10-13",
        note: "x",
      }),
    ),
  ).rejects.toThrow("Only a contract that has not started yet is cancelled.");
});

it("CLI-4: the client's yes cancels the versions still being prepared, and none can be issued after it", async () => {
  const { fileId } = await register("housingRequest");
  const first = await issued(fileId, quote([line("INITIAL_JOB", 18000)], { amountBasis: "WHOLE_CONTRACT" }));
  const second = await test.transact((ex, ctx) => reviseQuote(ex, ctx, { quoteId: first }));
  await test.transact((ex, ctx) =>
    recordQuoteResult(ex, ctx, { quoteId: first, result: "ACCEPTED", resultDate: "2026-10-12" }),
  );
  const row = await test.db
    .selectFrom("Quote")
    .select(["status"])
    .where("id", "=", second.quoteId)
    .executeTakeFirstOrThrow();
  expect(row.status).toBe("CANCELLED");
  const view = await test.transact((ex, ctx) => getFileQuotes(ex, ctx, { fileId }));
  expect(view.quotes.find((one) => one.id === second.quoteId)?.steps).toEqual([]);
  await expect(test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: second.quoteId }))).rejects.toThrow(
    "This file's quote is already accepted.",
  );
});

it("CLI-5: «لن يُجدَّد» is recorded with its reason and takes the renewal off the contract", async () => {
  const fileId = test.demo.clients.orgContract;
  await expect(test.transact((ex, ctx) => recordNoRenewal(ex, ctx, { fileId, reason: " " }))).rejects.toThrow(
    "A reason is required.",
  );
  await test.transact((ex, ctx) => recordNoRenewal(ex, ctx, { fileId, reason: "الشركة تنتقل إلى ولاية أخرى" }));
  const file = await test.db
    .selectFrom("File")
    .select(["renewalDecision", "renewalNote"])
    .where("id", "=", fileId)
    .executeTakeFirstOrThrow();
  expect(file).toEqual({ renewalDecision: "WILL_NOT_RENEW", renewalNote: "الشركة تنتقل إلى ولاية أخرى" });
  expect(await test.transact((ex, ctx) => getContractPart(ex, ctx, { fileId }))).toMatchObject({
    canRefuseRenewal: false,
  });
  const logged = await test.db
    .selectFrom("AuditLog")
    .select("reason")
    .where("entityId", "=", fileId)
    .orderBy("chainSeq", "desc")
    .executeTakeFirstOrThrow();
  expect(logged.reason).toBe("الشركة تنتقل إلى ولاية أخرى");
});

it("CLI-6: a renewal passes the sanction gate: refused for a penalised client until the manager says yes", async () => {
  const fileId = test.demo.clients.housingContract;
  const clientId = test.demo.clients.housingContractClient;
  const { sanctionId } = await test.transact((ex, ctx) =>
    setSanction(ex, ctx, {
      subjectKind: "CLIENT",
      subjectId: clientId,
      state: "PENALISED",
      reason: "تأخر",
      startDate: "2026-10-12",
    }),
  );
  await expect(test.transact((ex, ctx) => renewFile(ex, ctx, { fileId }))).rejects.toThrow(
    "This person is suspended or penalised. The manager must allow the registration first.",
  );
  const { decisionId } = await test.transact((ex, ctx) =>
    decideOnTheSpot(ex, ctx, {
      context: "CLIENT_FILE",
      subjectKind: "CLIENT",
      subjectId: clientId,
      identity: { name: "بوزيد سليم", phones: ["0661 20 31 42"] },
      sanctionId,
      allow: true,
      reason: "يجدد بعد التسوية",
    }),
  );
  await expect(test.transact((ex, ctx) => renewFile(ex, ctx, { fileId, decisionId }))).resolves.toMatchObject({
    number: "2",
  });
});

it("CLI-7, INT-9: a renewal closed unsigned gives the contract back its decision and does not block another", async () => {
  const fileId = test.demo.clients.housingContract;
  const first = await test.transact((ex, ctx) => renewFile(ex, ctx, { fileId }));
  await test.transact((ex, ctx) => closeFile(ex, ctx, { fileId: first.fileId, reason: "NO_ANSWER" }));
  const part = await test.transact((ex, ctx) => getContractPart(ex, ctx, { fileId }));
  expect(part).toMatchObject({ canRenew: true, renewedBy: null, renewalDecision: null });
  const second = await test.transact((ex, ctx) => renewFile(ex, ctx, { fileId }));
  const rows = await test.db
    .selectFrom("File")
    .select(["id", "renewalOfFileId"])
    .where("id", "in", [first.fileId, second.fileId])
    .execute();
  expect(rows.find((row) => row.id === second.fileId)?.renewalOfFileId).toBe(fileId);
  expect(rows.find((row) => row.id === first.fileId)?.renewalOfFileId).toBeNull();
});

it("CLI-9: the yes can take a file priced only by its quote to «متعاقد»", async () => {
  const { fileId } = await register("housingRequest", { totalAmount: undefined });
  await issued(fileId, quote([line("INITIAL_JOB", 18000)], { amountBasis: "WHOLE_CONTRACT" }));
  expect((await test.transact((ex, ctx) => getFileQuotes(ex, ctx, { fileId }))).contract).toEqual({
    allowed: true,
    refusal: null,
  });
});
