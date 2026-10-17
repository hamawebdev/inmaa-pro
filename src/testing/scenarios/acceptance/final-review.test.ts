import { afterEach, describe, expect, it } from "vitest";

import { DEMO_FILES } from "@/features/clients/demo";
import { saveClientIdentifiers } from "@/features/clients/services/clients";
import { endContract } from "@/features/clients/services/contracts";
import { saveCostStudy } from "@/features/clients/services/cost-study";
import { moveFileStage, registerFile, type RegisterFileInput } from "@/features/clients/services/files";
import { decideQuote, issueQuote, recordQuoteResult, saveQuote, submitQuote } from "@/features/clients/services/quotes";
import type { CostStudyInput, QuoteInput } from "@/features/clients/validators/pricing";
import { fileCredit } from "@/features/money/services/credit";
import { getPaymentReminder } from "@/features/money/services/debts";
import { issueInvoice, prepareInvoice } from "@/features/money/services/invoices";
import { recordPayment } from "@/features/money/services/payments";
import { getIncomeData } from "@/features/money/services/reports";
import { openComplaint, settleComplaint } from "@/features/operations/services/complaints";
import { planInitialVisit } from "@/features/operations/services/initial-visit";
import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { recordEmployeeAbsence } from "@/features/people/services/employee-attendance";
import { registerEmployee } from "@/features/people/services/employees";
import { decideHiring } from "@/features/people/services/hiring";
import { getPayRun, getPayslip, preparePayRun } from "@/features/people/services/pay-runs";
import { readmitWorker, recordWorkerLeaving, registerWorker } from "@/features/people/services/workers";
import { payslipColumns } from "@/features/people/sheets/payslip-columns";
import { emptyEmployeeValues } from "@/features/people/validators/employee";
import type { WorkerFormValues } from "@/features/people/validators/worker";
import { verifyChains } from "@/lib/chain";
import { dinarsToMoney, localDate, toQty } from "@/lib/units";

import { createTestDatabase, type TestDatabase } from "../../database";
import { at, contractInput, doVisit, MONTH, openEachMorning, visitsOf } from "./helpers";

/**
 * The paths the final code review found untested (scratchpad/final-review),
 * walked from scratch through the owners' services, each step as the role that
 * does it: a contract with a first deep clean, a contract ended early, a
 * complaint settled with a discount, and pay for people not, or no longer, or
 * again in post.
 */

/** A scenario builds a database and walks many steps: room for a machine six teammates are loading. */
const LONG = { timeout: 180_000 };

let test: TestDatabase;
afterEach(() => test?.close());

const DA = dinarsToMoney;
const ORG_IDS = { legalForm: "SARL", rcNumber: "04/00-7777777 B 22", nis: "001204077777777", nif: "001204077777777" };

const liveDues = (fileId: string) =>
  test.db
    .selectFrom("PaymentDue")
    .select([
      "id",
      "kind",
      "periodStart",
      "periodEnd",
      "dueDate",
      "expectedAmount",
      "amount",
      "paidAmount",
      "invoiceId",
    ])
    .where("fileId", "=", fileId)
    .where("cancelledAt", "is", null)
    .orderBy("periodStart")
    .orderBy("kind")
    .execute();

/** Visits up to a day, every origin, done one after the other as the office lives them. */
async function doVisitsUpTo(fileId: string, last: string, signer: string, first = "0000-00-00") {
  const reception = await test.sessionFor("RECEPTION_SALES");
  const operations = await test.sessionFor("OPERATIONS");
  for (const visit of (await visitsOf(test, fileId)).filter((one) => one.visitDate >= first && one.visitDate <= last)) {
    await openEachMorning(test, fileId, reception, visit.visitDate);
    await doVisit(test, visit, operations, signer);
  }
}

/** A contract signed through the form, as in contract-path.test.ts. */
async function signed(kind: "BUILDING_CONTRACT" | "ORG_CONTRACT") {
  const reception = await test.sessionFor("RECEPTION_SALES");
  const input = contractInput(kind);
  const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "QUOTE" }), reception);
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "CONTRACTED" }), reception);
  return { ...file, signer: String(input.values.clientName ?? input.values.managerName ?? "") };
}

describe("a contract with a first deep clean", () => {
  it(
    "is quoted with its clean and its month, signed on the month, cleaned once, and the clean is invoiced once beside the first month, paid and in income",
    LONG,
    async () => {
      test = await createTestDatabase({ demo: ["people"] });
      const reception = await test.sessionFor("RECEPTION_SALES");
      const accountant = await test.sessionFor("ACCOUNTANT");
      const model = DEMO_FILES.find((one) => one.name === "contractWithInitialJob");
      if (!model) throw new Error("acceptance: Clients' demo has no contractWithInitialJob");
      const input = structuredClone(model.input) as RegisterFileInput;
      input.values.issuedDate = "2026-10-12";

      // Registered from his organisation contract form, with the client's identifiers.
      const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);
      await test.transact(
        (ex, ctx) => saveClientIdentifiers(ex, ctx, { clientId: file.clientId, identifiers: ORG_IDS }),
        reception,
      );

      // The manager costs it; reception quotes a first deep clean and a monthly service; the manager approves.
      const study: CostStudyInput = {
        workers: 2,
        perVisitMin: 120,
        visitsPerWeek: 3,
        weeks: 13_000,
        hourlyRate: DA(400),
        lines: [
          { code: "LABOUR", label: null, amount: 0, rateBp: null },
          { code: "MATERIALS", label: null, amount: DA(5000), rateBp: null },
        ],
        marginPercent: 3000,
        discount: 0,
      };
      await test.transact((ex, ctx) => saveCostStudy(ex, ctx, { fileId: file.fileId, terms: study }));
      const quote: QuoteInput = {
        date: "2026-10-12",
        validUntil: null,
        includedText: null,
        excludedText: null,
        materialsIncluded: true,
        equipmentIncluded: true,
        workers: 2,
        duration: null,
        visits: "3 في الأسبوع",
        discount: 0,
        amountBasis: "PER_PAYMENT_PERIOD",
        lines: [
          {
            kind: "INITIAL_JOB",
            label: "تنظيف أولي عميق قبل بداية العقد",
            description: null,
            quantity: toQty(1),
            unit: null,
            unitPrice: DA(25000),
          },
          {
            kind: "PERIODIC",
            label: "تنظيف دوري: ثلاث زيارات في الأسبوع",
            description: null,
            quantity: toQty(1),
            unit: "شهر",
            unitPrice: DA(45000),
          },
        ],
      };
      const saved = await test.transact((ex, ctx) => saveQuote(ex, ctx, { fileId: file.fileId, quote }), reception);
      await test.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }), reception);
      await test.transact((ex, ctx) => decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: true, note: "مطابق" }));
      await test.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: saved.quoteId }), reception);
      const answer = await test.transact(
        (ex, ctx) =>
          recordQuoteResult(ex, ctx, {
            quoteId: saved.quoteId,
            result: "ACCEPTED",
            resultDate: "2026-10-12",
            note: "وقّع العقد في المركز",
            contract: true,
          }),
        reception,
      );
      expect(answer).toMatchObject({ contracted: true });

      // The contract's amount is the monthly part; the clean is one INITIAL_JOB due beside the monthly ones.
      const signedFile = await test.db
        .selectFrom("File")
        .select(["stage", "totalAmount", "amountBasis"])
        .where("id", "=", file.fileId)
        .executeTakeFirstOrThrow();
      expect(signedFile).toEqual({ stage: "CONTRACTED", totalAmount: DA(45000), amountBasis: "PER_PAYMENT_PERIOD" });
      const dues = await liveDues(file.fileId);
      expect(dues.filter((due) => due.kind === "INITIAL_JOB").map((due) => due.expectedAmount)).toEqual([DA(25000)]);
      const months = dues.filter((due) => due.kind === "SCHEDULE");
      expect(months.length).toBe(3);
      expect(new Set(months.map((due) => due.expectedAmount))).toEqual(new Set([DA(45000)]));

      // Operations plans the clean on a day without a programme visit, once.
      const initial = await test.transact((ex, ctx) =>
        planInitialVisit(ex, ctx, { fileId: file.fileId, date: "2026-10-20", durationMin: 300 }),
      );
      await expect(
        test.transact((ex, ctx) => planInitialVisit(ex, ctx, { fileId: file.fileId, date: "2026-10-22" })),
      ).rejects.toThrow("The first deep clean is already planned.");
      const origin = await test.db
        .selectFrom("Visit")
        .select(["origin", "visitDate"])
        .where("id", "=", initial.visitId)
        .executeTakeFirstOrThrow();
      expect(origin).toEqual({ origin: "INITIAL", visitDate: "2026-10-20" });

      // The first month, the clean included: seated, ordered, signed off.
      const first = months[0];
      await doVisitsUpTo(file.fileId, String(first.periodEnd), String(input.values.managerName));
      const clean = await test.db
        .selectFrom("Visit")
        .select("status")
        .where("id", "=", initial.visitId)
        .executeTakeFirstOrThrow();
      expect(clean.status, "the clean is done and signed off like any visit").toBe("DONE");

      // The day after the month: one invoice for the month and the clean, the clean on one line.
      const reception2 = await test.sessionFor("RECEPTION_SALES");
      const after = localDate(
        new Date(Date.parse(`${String(first.periodEnd)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
      );
      await openEachMorning(test, file.fileId, reception2, after);
      test.clock.set(at(after, "10:00"));
      const cleanDue = (await liveDues(file.fileId)).find((due) => due.kind === "INITIAL_JOB")!;
      const both = [first.id, cleanDue.id];
      const proposal = await test.transact(
        (ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.fileId, dueIds: both }),
        accountant,
      );
      expect(proposal.blockers).toEqual([]);
      expect(proposal.lines.map((line) => line.amount).sort((a, b) => a - b)).toEqual([DA(25000), DA(45000)]);
      expect(proposal.totals?.totalTTC).toBe(DA(70000));
      const invoice = await test.transact(
        (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.fileId, dueIds: both, paymentMethod: "CASH" }),
        accountant,
      );
      const invoiced = await liveDues(file.fileId);
      expect(
        invoiced
          .filter((due) => due.invoiceId === invoice.id)
          .map((due) => due.kind)
          .sort(),
      ).toEqual(["INITIAL_JOB", "SCHEDULE"]);
      // Once: no other due of the clean, and the next month's due carries none of it.
      expect(invoiced.filter((due) => due.kind === "INITIAL_JOB")).toHaveLength(1);
      expect(invoiced.find((due) => due.id === months[1].id)?.expectedAmount).toBe(DA(45000));

      // Paid in cash, and in income under its division.
      const payment = await test.transact(
        (ex, ctx) =>
          recordPayment(ex, ctx, {
            fileId: file.fileId,
            receivedDate: ctx.today,
            method: "CASH",
            amount: DA(70000),
            dueIds: both,
          }),
        accountant,
      );
      expect(payment.receiptId).toBeTruthy();
      const income = await getIncomeData(test.db, test.ctx(accountant), { from: after, to: localDate("2026-12-31") });
      expect(income.payments.find((row) => row.id === payment.id)).toMatchObject({
        division: "ORGANISATION",
        amount: DA(70000),
      });
      expect(await verifyChains(test.db)).toMatchObject({ ok: true });
    },
  );
});

describe("a contract ended early", () => {
  /** A building contract cleaned through November and invoiced on 1 December, then ended on 15 December. */
  async function endedOn15December(options: { payNovember: boolean; payDecemberAhead: boolean }) {
    const reception = await test.sessionFor("RECEPTION_SALES");
    const accountant = await test.sessionFor("ACCOUNTANT");
    const file = await signed("BUILDING_CONTRACT");
    await doVisitsUpTo(file.fileId, MONTH.end, file.signer);
    await openEachMorning(test, file.fileId, reception, MONTH.after);
    test.clock.set(at(MONTH.after, "10:00"));
    const [november, december] = await liveDues(file.fileId);
    await test.transact(
      (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.fileId, dueIds: [november.id], paymentMethod: "CASH" }),
      accountant,
    );
    const pay = (due: { id: string; amount: number }) =>
      test.transact(
        (ex, ctx) =>
          recordPayment(ex, ctx, {
            fileId: file.fileId,
            receivedDate: ctx.today,
            method: "CASH",
            amount: due.amount,
            dueIds: [due.id],
          }),
        accountant,
      );
    if (options.payNovember) await pay(november);
    await openEachMorning(test, file.fileId, reception, "2026-12-02");
    test.clock.set(at("2026-12-02", "10:00"));
    if (options.payDecemberAhead) await pay(december);
    await openEachMorning(test, file.fileId, reception, "2026-12-15");
    test.clock.set(at("2026-12-15", "11:00"));
    await test.transact(
      (ex, ctx) =>
        endContract(ex, ctx, {
          fileId: file.fileId,
          endKind: "ENDED_BY_CLIENT",
          endedDate: "2026-12-15",
          note: "انتقلت الجمعية إلى شركة أخرى",
        }),
      reception,
    );
    const visits = await test.db
      .selectFrom("Visit")
      .select(["visitDate", "status"])
      .where("fileId", "=", file.fileId)
      .execute();
    const reminder = () => test.transact((ex, ctx) => getPaymentReminder(ex, ctx, { fileId: file.fileId }), accountant);
    return { file, november, december, visits, reminder };
  }

  it(
    "cancels the visits and the months after its end, cuts the last month, and keeps what was paid ahead as credit",
    LONG,
    async () => {
      test = await createTestDatabase({ demo: ["people"] });
      const { file, december, visits, reminder } = await endedOn15December({
        payNovember: true,
        payDecemberAhead: true,
      });

      const later = visits.filter((visit) => visit.visitDate > "2026-12-15");
      expect(later.length).toBeGreaterThan(0);
      expect(new Set(later.map((visit) => visit.status)), "every visit after the end is cancelled").toEqual(
        new Set(["CANCELLED"]),
      );

      const live = await liveDues(file.fileId);
      expect(
        live.every((due) => String(due.periodStart) <= "2026-12-15"),
        "no due after the end",
      ).toBe(true);
      const cut = live.find((due) => due.id === december.id)!;
      const inDecember = visits.filter((visit) => visit.visitDate >= "2026-12-01" && visit.visitDate <= "2026-12-31");
      const before = inDecember.filter((visit) => visit.visitDate <= "2026-12-15");
      expect(cut.periodEnd).toBe("2026-12-15");
      expect(
        Math.abs(cut.amount - Math.round((december.amount * before.length) / inDecember.length)),
        "the last month is cut to the visits planned before its end",
      ).toBeLessThanOrEqual(1);

      // December was paid in full on the 2nd: what the cut month no longer needs is the file's credit.
      expect(await test.transact((ex) => fileCredit(ex, file.fileId))).toBe(december.amount - cut.amount);
      // It owes nothing: there is no reminder to print.
      await expect(reminder()).rejects.toThrow("This file owes nothing: there is no reminder to print.");
    },
  );

  it(
    "asks, in its reminder, only for what is due: the late month, never the months that will not come",
    LONG,
    async () => {
      test = await createTestDatabase({ demo: ["people"] });
      const { file, november, december, reminder } = await endedOn15December({
        payNovember: false,
        payDecemberAhead: false,
      });
      const letter = await reminder();
      expect(letter.items.map((item) => [item.dueDate, item.remaining])).toEqual([["2026-11-30", november.amount]]);
      expect(letter).toMatchObject({ totalRemaining: november.amount, askedAmount: november.amount, credit: 0 });
      // December, cut to its first half, is not due before the 30th; the months after the end are gone.
      const live = await liveDues(file.fileId);
      expect(live.map((due) => due.id)).toEqual([november.id, december.id]);
    },
  );
});

describe("a complaint settled with a discount", () => {
  it("puts the discount on the next invoice, once", LONG, async () => {
    test = await createTestDatabase({ demo: ["people"] });
    const reception = await test.sessionFor("RECEPTION_SALES");
    const accountant = await test.sessionFor("ACCOUNTANT");
    const file = await signed("BUILDING_CONTRACT");

    await doVisitsUpTo(file.fileId, "2026-11-18", file.signer);
    // 19 November: the client complains; the manager settles it with 5.000 DA off.
    test.clock.set(at("2026-11-19", "09:00"));
    const opened = await test.transact(
      (ex, ctx) =>
        openComplaint(ex, ctx, {
          channel: "PHONE",
          clientId: file.clientId,
          fileId: file.fileId,
          kind: "QUALITY",
          description: "الدرج لم يُنظّف جيدًا",
        }),
      reception,
    );
    await test.transact((ex, ctx) =>
      settleComplaint(ex, ctx, {
        complaintId: opened.complaintId,
        centreAtFault: "YES",
        settlement: "DISCOUNT",
        amount: DA(5000),
        resolutionNote: "خصم متفق عليه",
      }),
    );

    await doVisitsUpTo(file.fileId, MONTH.end, file.signer, "2026-11-19");
    await openEachMorning(test, file.fileId, reception, MONTH.after);
    test.clock.set(at(MONTH.after, "10:00"));
    const [november, december] = await liveDues(file.fileId);
    const proposal = await test.transact(
      (ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.fileId, dueIds: [november.id] }),
      accountant,
    );
    expect(proposal.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["SERVICE", november.amount],
      ["DISCOUNT", -DA(5000)],
    ]);
    expect(proposal.totals?.totalTTC).toBe(november.amount - DA(5000));
    await test.transact(
      (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.fileId, dueIds: [november.id], paymentMethod: "CASH" }),
      accountant,
    );

    // December: billed in full, the discount already used.
    await doVisitsUpTo(file.fileId, "2026-12-31", file.signer, "2026-12-01");
    await openEachMorning(test, file.fileId, reception, "2027-01-01");
    test.clock.set(at("2027-01-01", "10:00"));
    const next = await test.transact(
      (ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.fileId, dueIds: [december.id] }),
      accountant,
    );
    expect(next.lines.map((line) => line.kind)).toEqual(["SERVICE"]);
    expect(next.totals?.totalTTC).toBe(december.amount);
  });
});

describe("pay", () => {
  let phones = 0;
  const worker = (over: Partial<WorkerFormValues> = {}): WorkerFormValues => {
    phones += 1;
    return {
      ...emptyWorkerValues("2026-08-01"),
      sex: "FEMALE",
      lastName: "بوعلام",
      firstName: `سعاد ${phones}`,
      birthDate: "1995-05-05",
      phone: `0556 70 80 ${String(phones).padStart(2, "0")}`,
      hiringDecision: "ACCEPTED",
      issuedDate: "2026-08-01",
      payBasis: "MONTHLY",
      payRate: "30000",
      payPeriod: "MONTHLY",
      cnasDeclared: false,
      ...over,
    };
  };

  it(
    "pays neither a candidate nor a refused worker, pays a readmitted worker from her return, and a payslip's columns add up to its net",
    LONG,
    async () => {
      test = await createTestDatabase();
      const hr = await test.sessionFor("HR_OFFICER");
      const register = async (values: WorkerFormValues) =>
        (await test.transact((ex, ctx) => registerWorker(ex, ctx, values))).id;

      const candidate = await register(worker({ hiringDecision: undefined, registrationDate: "2026-09-01" }));
      const refused = await register(
        worker({ hiringDecision: "REFUSED_FINAL", registrationDate: "2026-09-01", issuedDate: "2026-09-01" }),
      );
      const inPost = await register(worker());
      const returning = await register(worker());

      // She leaves on 20 August and comes back on 26 September; the administration takes her back that day.
      await test.transact(
        (ex, ctx) => recordWorkerLeaving(ex, ctx, { id: returning, leftDate: "2026-08-20", reason: "ظروف عائلية" }),
        hr,
      );
      test.clock.set("2026-09-26T08:00:00.000Z");
      await test.transact((ex, ctx) => readmitWorker(ex, ctx, { id: returning }), hr);
      await test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: returning, decision: "ACCEPTED" }));
      test.clock.set("2026-10-12T08:00:00.000Z");

      const accountant = await test.sessionFor("ACCOUNTANT");
      const { payRunId } = await test.transact(
        (ex, ctx) => preparePayRun(ex, ctx, { staffKind: "WORKER", month: "2026-09" }),
        accountant,
      );
      const run = await test.transact((ex, ctx) => getPayRun(ex, ctx, { payRunId }), accountant);
      const paid = new Map(run.payslips.map((slip) => [slip.staffId, slip.grossAmount]));
      expect(paid.has(candidate), "a candidate never decided on is not paid").toBe(false);
      expect(paid.has(refused), "a refused worker is not paid").toBe(false);
      expect(paid.get(inPost), "a month in post").toBe(DA(30000));
      expect(paid.get(returning), "26 to 30 September: five days of thirty").toBe(DA(5000));

      // An employee with an unpaid day off: what is earned less what is taken off is the net.
      const employee = (
        await test.transact(
          (ex, ctx) =>
            registerEmployee(ex, ctx, {
              ...emptyEmployeeValues("2026-08-01"),
              sex: "MALE",
              lastName: "زياني",
              firstName: "كمال",
              birthDate: "1988-02-02",
              phone: "0661 44 55 66",
              jobPosition: "ACCOUNTANT",
              startDate: "2026-08-01",
              payBasis: "MONTHLY",
              payRate: "41600",
              cnasDeclared: true,
              cnasNumber: "880202001234",
            }),
          hr,
        )
      ).id;
      await test.transact(
        (ex, ctx) =>
          recordEmployeeAbsence(ex, ctx, {
            staffId: employee,
            date: "2026-09-15",
            type: "FULL_DAY",
            justified: false,
            paid: false,
          }),
        hr,
      );
      const employees = await test.transact(
        (ex, ctx) => preparePayRun(ex, ctx, { staffKind: "EMPLOYEE", month: "2026-09" }),
        accountant,
      );
      const slipId = (
        await test.transact((ex, ctx) => getPayRun(ex, ctx, { payRunId: employees.payRunId }), accountant)
      ).payslips.find((slip) => slip.staffId === employee)!.id;
      const slip = await test.transact((ex, ctx) => getPayslip(ex, ctx, { payslipId: slipId }), accountant);
      const columns = payslipColumns(slip.items);
      console.log("payslip", {
        gross: slip.grossAmount,
        net: slip.netAmount,
        ...columns,
        items: slip.items.map((item) => [item.type, item.amount]),
      });
      expect(columns.earned, "the earned column is the gross").toBe(slip.grossAmount);
      expect(columns.earned - columns.takenOff, "earned less taken off is the net").toBe(slip.netAmount);
      expect(slip.grossAmount, "an unpaid day is taken off a monthly wage").toBeLessThan(DA(41600));
    },
  );
});
