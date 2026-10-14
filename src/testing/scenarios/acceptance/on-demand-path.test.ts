import { afterEach, beforeEach, expect, it } from "vitest";

import { DEMO_FILES } from "@/features/clients/demo";
import { saveClientIdentifiers } from "@/features/clients/services/clients";
import { saveCostStudy } from "@/features/clients/services/cost-study";
import { moveFileStage, registerFile, type RegisterFileInput } from "@/features/clients/services/files";
import { saveFirstVisit } from "@/features/clients/services/first-visits";
import { decideQuote, issueQuote, recordQuoteResult, saveQuote, submitQuote } from "@/features/clients/services/quotes";
import { emptyFirstVisit } from "@/features/clients/validators/first-visit";
import type { CostStudyInput, QuoteInput } from "@/features/clients/validators/pricing";
import { issueInvoice } from "@/features/money/services/invoices";
import { recordPayment } from "@/features/money/services/payments";
import { getIncomeData } from "@/features/money/services/reports";
import { verifyChains } from "@/lib/chain";
import { dinarsToMoney, localDate, toQty } from "@/lib/units";

import { createTestDatabase, type TestDatabase } from "../../database";
import { at, doVisit, logOf, openEachMorning, visitsOf } from "./helpers";

/**
 * Acceptance, part A on demand (docs/checker/acceptance.md): a request in
 * المنازل and in المؤسسات, from the form to the paid invoice, through the first
 * visit, the cost study and the quote. Buildings and complexes have no
 * on-demand form.
 *
 * Every step is an owner's exported service, called as the role that does it:
 * reception registers, plans and answers; the manager studies the cost and
 * approves the quote (`cost.read`, `quote.approve`); operations runs the job;
 * the accountant invoices and collects.
 */

/** A scenario builds a database and walks many steps: room for a machine six teammates are loading. */
const LONG = { timeout: 180_000 };

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase({ demo: ["people"] });
}, LONG.timeout);
afterEach(() => test?.close());

/** Clients' demo jobs, with the visit date taken off the form: the first visit below writes it. */
function job(name: "housingJob" | "orgJob"): RegisterFileInput {
  const model = DEMO_FILES.find((file) => file.name === name);
  if (!model) throw new Error(`acceptance: Clients' demo has no ${name}`);
  const input = structuredClone(model.input) as RegisterFileInput;
  delete input.values.firstVisitDate;
  return input;
}

const STUDY: CostStudyInput = {
  workers: 2,
  perVisitMin: 360,
  visitsPerWeek: null,
  weeks: null,
  hourlyRate: 40000,
  lines: [
    { code: "LABOUR", label: null, amount: 0, rateBp: null },
    { code: "MATERIALS", label: null, amount: 350000, rateBp: null },
    { code: "TRANSPORT", label: null, amount: 100000, rateBp: null },
  ],
  marginPercent: 3000,
  discount: 0,
};

const quoteFor = (label: string, dinars: number): QuoteInput => ({
  date: "2026-10-12",
  validUntil: null,
  includedText: null,
  excludedText: null,
  materialsIncluded: true,
  equipmentIncluded: true,
  workers: 2,
  duration: null,
  visits: null,
  discount: 0,
  amountBasis: null,
  lines: [
    { kind: "INITIAL_JOB", label, description: null, quantity: toQty(1), unit: null, unitPrice: dinarsToMoney(dinars) },
  ],
});

const JOBS = [
  {
    name: "المنازل",
    model: "housingJob" as const,
    division: "HOUSING",
    price: 18000,
    method: "CASH" as const,
    ids: null,
  },
  {
    name: "المؤسسات",
    model: "orgJob" as const,
    division: "ORGANISATION",
    price: 45000,
    method: "BANK_TRANSFER" as const,
    ids: {
      legalForm: "SARL",
      rcNumber: "04/00-7654321 B 21",
      nis: "001204076543210",
      nif: "001204076543210",
      articleNumber: "04017654321",
    },
  },
];

it.each(JOBS)("$name: a request runs from its form through the quote to a paid invoice", LONG, async (job_) => {
  const reception = await test.sessionFor("RECEPTION_SALES");
  const operations = await test.sessionFor("OPERATIONS");
  const accountant = await test.sessionFor("ACCOUNTANT");
  const input = job(job_.model);

  // A1. The request is registered on his form.
  const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);
  const stage = async () =>
    await test.db
      .selectFrom("File")
      .select(["stage", "closedAt", "endKind"])
      .where("id", "=", file.fileId)
      .executeTakeFirstOrThrow();

  // A2. The first visit is planned, which moves the file to «الزيارة», then typed in from the inspection sheet.
  const inspector = test.demo.people.employeeSupervisor;
  const planned = { ...emptyFirstVisit("2026-10-12"), plannedTime: "10:00", inspectorEmployeeId: inspector };
  const { firstVisitId } = await test.transact(
    (ex, ctx) => saveFirstVisit(ex, ctx, { fileId: file.fileId, visit: planned }),
    reception,
  );
  expect((await stage()).stage).toBe("VISIT");
  test.clock.set(at("2026-10-12", "12:00"));
  await test.transact(
    (ex, ctx) =>
      saveFirstVisit(ex, ctx, {
        fileId: file.fileId,
        firstVisitId,
        visit: {
          ...planned,
          doneDate: "2026-10-12",
          startTime: "10:00",
          endTime: "11:00",
          clientRepresentative: String(input.values.clientName ?? input.values.managerName),
          firstResult: ["SUITABLE"],
        },
      }),
    reception,
  );

  // Before a quote is accepted, «متعاقد» is refused.
  await expect(
    test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "CONTRACTED" }), reception),
  ).rejects.toThrow(/quote|متعاقد|NOT_THE_NEXT_STAGE|cannot jump/);

  // A3. The cost is studied and the quote saved, approved by the manager, issued and accepted by the client.
  test.clock.set(at("2026-10-12", "14:00"));
  await test.transact((ex, ctx) => saveCostStudy(ex, ctx, { fileId: file.fileId, terms: STUDY }));
  const saved = await test.transact(
    (ex, ctx) => saveQuote(ex, ctx, { fileId: file.fileId, quote: quoteFor("تنظيف شامل", job_.price) }),
    reception,
  );
  await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }), reception);
  await test.transact((ex, ctx) =>
    decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: true, note: "السعر مناسب" }),
  );
  await test.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: saved.quoteId }), reception);
  test.clock.set(at("2026-10-12", "17:00"));

  // A4. His yes takes the file to «متعاقد»: `file.contracted` makes the job's visits and its due.
  const answer = await test.transact(
    (ex, ctx) =>
      recordQuoteResult(ex, ctx, {
        quoteId: saved.quoteId,
        result: "ACCEPTED",
        resultDate: "2026-10-12",
        note: "وافق بالهاتف",
        contract: true,
      }),
    reception,
  );
  expect(answer).toMatchObject({ result: "ACCEPTED", contracted: true, closed: false });
  expect((await stage()).stage).toBe("CONTRACTED");
  const visits = await visitsOf(test, file.fileId);
  expect(visits.length).toBeGreaterThan(0);
  const dues = await test.db
    .selectFrom("PaymentDue")
    .select(["id", "amount"])
    .where("fileId", "=", file.fileId)
    .where("cancelledAt", "is", null)
    .execute();
  expect(dues.length).toBe(1);
  expect(dues[0].amount).toBe(dinarsToMoney(job_.price));

  // A5 to A8. The job's visits: team, printed order, returned order with attendance and sign-off.
  for (const visit of visits) {
    await openEachMorning(test, file.fileId, reception, visit.visitDate);
    const seated = await doVisit(test, visit, operations, String(input.values.clientName ?? input.values.managerName));
    expect(seated).toBe(visit.workersNeeded);
  }
  // The last sign-off finishes the job: the file closes as a job done.
  expect(await stage()).toMatchObject({ stage: "CONTRACT_ENDED", endKind: "JOB_DONE" });

  // A9 and A10. The next day the accountant invoices the job and records its payment.
  const last = visits[visits.length - 1].visitDate;
  const nextDay = localDate(new Date(Date.parse(`${last}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
  test.clock.set(at(nextDay, "10:00"));
  if (job_.ids) {
    await test.transact(
      (ex, ctx) => saveClientIdentifiers(ex, ctx, { clientId: file.clientId, identifiers: job_.ids! }),
      reception,
    );
  }
  const invoice = await test.transact(
    (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.fileId, dueIds: [dues[0].id], paymentMethod: job_.method }),
    accountant,
  );
  const payment = await test.transact(
    (ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.fileId,
        reference: job_.method === "CASH" ? undefined : "VIR-2026-0042",
        receivedDate: ctx.today,
        method: job_.method,
        amount: dues[0].amount,
        dueIds: [dues[0].id],
      }),
    accountant,
  );
  expect(Boolean(payment.receiptId), "a receipt for cash only").toBe(job_.method === "CASH");

  // A11. It shows in income, under its division.
  const income = await getIncomeData(test.db, test.ctx(accountant), { from: nextDay, to: localDate("2026-10-31") });
  expect(income.payments.find((row) => row.id === payment.id)).toMatchObject({
    division: job_.division,
    method: job_.method,
    amount: dues[0].amount,
  });

  // After the paid job: the chains hold, and the steps on personal data are in the log.
  expect(await verifyChains(test.db)).toMatchObject({
    ok: true,
    brokenDigests: [],
    missingNumbers: [],
    brokenTotals: [],
  });
  expect((await logOf(test, "File", file.fileId)).map((entry) => entry.operation)).toContain("COLLECT");
  expect((await logOf(test, "Invoice", invoice.id)).length).toBeGreaterThan(0);
  expect((await logOf(test, "Payment", payment.id)).length).toBeGreaterThan(0);
});
