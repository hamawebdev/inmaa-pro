import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countDues } from "../alerts";
import { centreReady, contractedFile, da, NOVEMBER_TUESDAYS, openDay, visitOn } from "../testing/fixtures";

import { fileCredit } from "./credit";
import { getPaymentReminder } from "./debts";
import { getFilePaymentSummary, syncDues } from "./dues";
import { issueInvoice, listInvoiceCandidates, prepareInvoice, voidInvoice } from "./invoices";
import { issueReceiptBatch, listCollectors, recordPayment } from "./payments";
import { clearVisitBilling, setVisitBilling } from "./visit-billing";

/**
 * The final independent review's findings on Money's dues and invoices (snapshot e83d8dc), each proved by
 * the test that carries its id.
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const sync = (fileId: string) => test.transact((ex, ctx) => syncDues(ex, ctx, { fileId }));
const liveDues = (fileId: string) =>
  test.db
    .selectFrom("PaymentDue")
    .select(["id", "kind", "periodStart", "periodEnd", "dueDate", "expectedAmount", "amount", "paidAmount"])
    .where("fileId", "=", fileId)
    .where("cancelledAt", "is", null)
    .orderBy("seq")
    .execute();

/** The quote the client accepted: a first deep clean, then so much a period. */
async function acceptedQuote(fileId: string, lines: { kind: string; amount: number }[], discount = 0) {
  const total = lines.reduce((sum, line) => sum + line.amount, 0) - discount;
  const quote = await test.rows.insert("Quote", { fileId, result: "ACCEPTED", total, discount } as never);
  for (const [index, line] of lines.entries()) {
    await test.rows.insert("QuoteLine", { quoteId: quote.id, seq: index + 1, ...line } as never);
  }
  return quote;
}

describe("the first deep clean of a contract is billed once, apart (CLI-1, INT-1, MON-01)", () => {
  it("builds one INITIAL_JOB due beside the monthly ones, and invoices it alone once its visit is done (CLI-1, INT-1, MON-01)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    await acceptedQuote(file.id, [
      { kind: "INITIAL_JOB", amount: da(32_000) },
      { kind: "PERIODIC", amount: da(45_000) },
    ]);
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    const dues = await liveDues(file.id);
    // BUILD-NOTES A2: one due per month, plus one INITIAL_JOB due.
    expect(dues.map((due) => [due.kind, due.expectedAmount])).toEqual([
      ["SCHEDULE", da(45_000)],
      ["SCHEDULE", da(45_000)],
      ["SCHEDULE", da(45_000)],
      ["INITIAL_JOB", da(32_000)],
    ]);
    // Asked again, nothing moves: one due per file.
    expect(await sync(file.id)).toEqual({ created: 0, updated: 0, cancelled: 0 });

    // Operations plans the clean on 2 November; it is done and signed off.
    await visitOn(test, file.id, "2026-11-02", "SIGNED_OFF", { origin: "INITIAL", billable: 0 });
    await sync(file.id);
    const initial = (await liveDues(file.id)).find((due) => due.kind === "INITIAL_JOB");
    expect(initial).toMatchObject({ periodStart: "2026-11-02", dueDate: "2026-11-30", expectedAmount: da(32_000) });

    await openDay(test, "2026-11-03T09:00:00.000Z");
    const candidates = await test.transact((ex, ctx) => listInvoiceCandidates(ex, ctx));
    expect(candidates.find((candidate) => candidate.dueId === initial?.id)?.readiness).toBe("READY");
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [initial?.id ?? ""] }),
    );
    expect(proposal.blockers).toEqual([]);
    expect(proposal.lines).toMatchObject([
      { kind: "SERVICE", description: "عمل أولي (مرة واحدة) يوم 02/11/2026", amount: da(32_000) },
    ]);
    expect(proposal.visits).toMatchObject([{ visitDate: "2026-11-02", billable: true }]);
    await test.transact((ex, ctx) => issueInvoice(ex, ctx, { fileId: file.id, dueIds: [initial?.id ?? ""] }));

    // November's invoice bills its period alone: the clean is not on it, nor on its statement.
    for (const day of NOVEMBER_TUESDAYS) await visitOn(test, file.id, day);
    await openDay(test, "2026-12-01T09:00:00.000Z");
    const november = (await liveDues(file.id))[0];
    const period = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    expect(period.lines.map((line) => line.amount)).toEqual([da(45_000)]);
    expect(period.visits.map((visit) => visit.visitDate)).toEqual([...NOVEMBER_TUESDAYS]);
  });

  it("waits for the clean's visit, and may go with the first period's invoice when it is done by then (MON-01)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    await acceptedQuote(file.id, [
      { kind: "INITIAL_JOB", amount: da(30_000) },
      { kind: "PERIODIC", amount: da(45_000) },
    ]);
    await sync(file.id);
    await openDay(test, "2026-11-02T09:00:00.000Z");
    const due = (await liveDues(file.id)).find((row) => row.kind === "INITIAL_JOB");
    expect(due?.expectedAmount).toBe(da(30_000));
    // No visit of the clean yet: nothing done to invoice.
    let candidates = await test.transact((ex, ctx) => listInvoiceCandidates(ex, ctx));
    expect(candidates.find((candidate) => candidate.dueId === due?.id)?.readiness).toBe("NOTHING_DONE");
    // Planned, not done yet.
    const clean = await visitOn(test, file.id, "2026-11-02", "PLANNED", { origin: "INITIAL" });
    candidates = await test.transact((ex, ctx) => listInvoiceCandidates(ex, ctx));
    expect(candidates.find((candidate) => candidate.dueId === due?.id)?.readiness).toBe("VISITS_OPEN");
    await test.db.updateTable("Visit").set({ status: "DONE" }).where("id", "=", clean.id).execute();
    await test.rows.insert("VisitReport", { visitId: clean.id, entryState: "COMPLETE", completion: "FULL" } as never);

    for (const day of NOVEMBER_TUESDAYS) await visitOn(test, file.id, day);
    await openDay(test, "2026-12-01T09:00:00.000Z");
    const november = (await liveDues(file.id))[0];
    const both = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id, due?.id ?? ""] }),
    );
    expect(both.blockers).toEqual([]);
    expect(both.lines.map((line) => line.amount)).toEqual([da(45_000), da(30_000)]);
    expect(both.totals?.totalTTC).toBe(da(75_000));
  });

  it("is nothing apart for a job on demand, or a contract quoted with one-off lines only (CLI-1)", async () => {
    const job = await contractedFile(test, {
      serviceType: "ON_DEMAND",
      paymentFrequency: null,
      endDate: "2026-11-02",
      totalAmount: da(50_000),
    });
    await acceptedQuote(job.id, [{ kind: "INITIAL_JOB", amount: da(50_000) }]);
    await sync(job.id);
    expect((await liveDues(job.id)).map((due) => [due.kind, due.expectedAmount])).toEqual([["SINGLE", da(50_000)]]);

    const once = await contractedFile(test, { totalAmount: da(20_000) });
    await acceptedQuote(once.id, [{ kind: "INITIAL_JOB", amount: da(20_000) }]);
    await sync(once.id);
    expect((await liveDues(once.id)).every((due) => due.kind === "SCHEDULE")).toBe(true);
  });

  it("takes off the clean what the discount leaves beyond the periodic part (CLI-1)", async () => {
    const file = await contractedFile(test, { totalAmount: 0 });
    // A discount of 50 000 on 45 000 a month: the month is free, and 5 000 comes off the clean.
    await acceptedQuote(
      file.id,
      [
        { kind: "INITIAL_JOB", amount: da(32_000) },
        { kind: "PERIODIC", amount: da(45_000) },
      ],
      da(50_000),
    );
    await sync(file.id);
    expect((await liveDues(file.id)).find((due) => due.kind === "INITIAL_JOB")?.expectedAmount).toBe(da(27_000));
  });
});

describe("the reminder asks only for what is due (MON-03)", () => {
  it("lists and asks for the late month alone, never the months still to come (MON-03)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    await sync(file.id);
    await openDay(test, "2026-12-02T09:00:00.000Z");
    const letter = await test.transact((ex, ctx) => getPaymentReminder(ex, ctx, { fileId: file.id }));
    expect(letter.items.map((item) => [item.dueDate, item.daysLate])).toEqual([["2026-11-30", 2]]);
    expect(letter).toMatchObject({ totalRemaining: da(45_000), askedAmount: da(45_000) });
  });

  it("has no reminder while nothing is due yet (MON-03)", async () => {
    const file = await contractedFile(test);
    await sync(file.id);
    await expect(test.transact((ex, ctx) => getPaymentReminder(ex, ctx, { fileId: file.id }))).rejects.toThrow(
      "Nothing of this file is due yet: there is no reminder to print.",
    );
  });
});

describe("a contract ended early owes nothing for what lay after its end (INT-2)", () => {
  async function endOn(fileId: string, endedDate: string, endKind = "ENDED_BY_CLIENT") {
    await test.db
      .updateTable("File")
      .set({ stage: "CONTRACT_ENDED", endedDate, endKind } as never)
      .where("id", "=", fileId)
      .execute();
    // Operations cancels the visits after the end.
    await test.db
      .updateTable("Visit")
      .set({ status: "CANCELLED", statusReason: "CONTRACT_ENDED" })
      .where("fileId", "=", fileId)
      .where("visitDate", ">", localDate(endedDate))
      .execute();
    await test.transact((ex, ctx) => emit(ex, ctx, "file.ended", { fileId, endKind, endedDate: localDate(endedDate) }));
  }

  it("cancels the period the client stopped before any visit, so no debt is left that cannot be invoiced (INT-2)", async () => {
    const file = await contractedFile(test);
    for (const day of NOVEMBER_TUESDAYS) await visitOn(test, file.id, day, "PLANNED");
    await sync(file.id);
    await endOn(file.id, "2026-11-02");
    expect(await liveDues(file.id)).toEqual([]);

    await openDay(test, "2026-12-05T09:00:00.000Z");
    const summary = await test.transact((ex, ctx) => getFilePaymentSummary(ex, ctx, { fileId: file.id }));
    expect(summary).toMatchObject({ remaining: 0, overdue: 0 });
    expect(await test.transact((ex, ctx) => countDues(ex, ctx, { state: "OVERDUE", leadDays: 3 }))).toBe(0);
  });

  it("cuts the period that holds the last day to the visits planned before it (INT-2)", async () => {
    const file = await contractedFile(test);
    for (const day of NOVEMBER_TUESDAYS)
      await visitOn(test, file.id, day, day <= "2026-11-12" ? "SIGNED_OFF" : "PLANNED");
    await sync(file.id);
    await endOn(file.id, "2026-11-12");
    expect(await liveDues(file.id)).toMatchObject([
      { kind: "SCHEDULE", periodStart: "2026-11-01", periodEnd: "2026-11-12", amount: da(22_500) },
    ]);
    // Ended again (the event comes twice): nothing more moves.
    expect(await sync(file.id)).toEqual({ created: 0, updated: 0, cancelled: 0 });
    await centreReady(test);
    await openDay(test, "2026-11-13T09:00:00.000Z");
    const due = (await liveDues(file.id))[0];
    const proposal = await test.transact((ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [due.id] }));
    expect(proposal.blockers).toEqual([]);
    expect(proposal.totals?.totalTTC).toBe(da(22_500));
  });

  it("gives back to the file what was paid ahead on a month that will not come (INT-2)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    for (const day of NOVEMBER_TUESDAYS) await visitOn(test, file.id, day, "PLANNED");
    await sync(file.id);
    const [, december] = await liveDues(file.id);
    await openDay(test, "2026-11-02T09:00:00.000Z");
    await test.transact((ex, ctx) =>
      recordPayment(ex, ctx, {
        fileId: file.id,
        receivedDate: "2026-11-02",
        method: "BANK_TRANSFER",
        reference: "VIR-12",
        amount: da(45_000),
        dueIds: [december.id],
      }),
    );
    await endOn(file.id, "2026-11-02");
    expect(await liveDues(file.id)).toEqual([]);
    expect(await test.transact((ex) => fileCredit(ex, file.id))).toBe(da(45_000));
  });

  it("owes nothing for a job on demand stopped before anything of it was done (INT-2)", async () => {
    const job = await contractedFile(test, {
      serviceType: "ON_DEMAND",
      paymentFrequency: null,
      endDate: "2026-11-05",
      totalAmount: da(16_000),
    });
    await visitOn(test, job.id, "2026-11-05", "PLANNED", { origin: "ON_DEMAND" });
    await sync(job.id);
    expect(await liveDues(job.id)).toHaveLength(1);
    await endOn(job.id, "2026-11-02");
    expect(await liveDues(job.id)).toEqual([]);
  });
});

describe("a complaint settled with an agreed discount reaches the next invoice (INT-3, MON-04)", () => {
  async function settledComplaint(fileId: string, amount: number) {
    return test.rows.insert("Complaint", {
      fileId,
      status: "SETTLED",
      settlement: "DISCOUNT",
      settlementAmount: amount,
      settledAt: "2026-11-20T10:00:00.000Z",
    } as never);
  }

  it("proposes the discount line once, on the invoice it reduces, and again if that invoice is voided (INT-3, MON-04)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    for (const day of NOVEMBER_TUESDAYS) await visitOn(test, file.id, day);
    await sync(file.id);
    const complaint = await settledComplaint(file.id, da(5_000));
    await openDay(test, "2026-12-01T09:00:00.000Z");
    const [november, december] = await liveDues(file.id);

    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    expect(proposal.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["SERVICE", da(45_000)],
      ["DISCOUNT", -da(5_000)],
    ]);
    expect(proposal.lines[1].description).toContain("خصم متفق عليه");
    expect(proposal.totals?.totalTTC).toBe(da(40_000));
    const issued = await test.transact((ex, ctx) => issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }));
    const line = await test.db
      .selectFrom("InvoiceLine")
      .select(["kind", "amount", "complaintId"])
      .where("invoiceId", "=", issued.id)
      .where("kind", "=", "DISCOUNT")
      .executeTakeFirstOrThrow();
    expect(line).toEqual({ kind: "DISCOUNT", amount: -da(5_000), complaintId: complaint.id });
    expect((await liveDues(file.id))[0].amount).toBe(da(40_000));

    // Used: December's invoice does not take it again.
    for (const day of ["2026-12-01", "2026-12-08"]) await visitOn(test, file.id, day);
    await openDay(test, "2027-01-02T09:00:00.000Z");
    const next = await test.transact((ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [december.id] }));
    expect(next.lines.map((row) => row.kind)).toEqual(["SERVICE"]);

    // The November invoice voided: its discount is proposed again.
    await test.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: issued.id, reason: "خطأ في المبلغ" }));
    const again = await test.transact((ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }));
    expect(again.lines.map((row) => [row.kind, row.amount])).toContainEqual(["DISCOUNT", -da(5_000)]);
  });

  it("never takes an invoice below zero: what is left of the discount waits for the next one (INT-3, MON-04)", async () => {
    await centreReady(test);
    const job = await contractedFile(test, {
      serviceType: "ON_DEMAND",
      paymentFrequency: null,
      endDate: "2026-11-03",
      totalAmount: da(18_000),
    });
    await visitOn(test, job.id, "2026-11-03", "SIGNED_OFF", { origin: "ON_DEMAND" });
    await sync(job.id);
    await settledComplaint(job.id, da(20_000));
    await openDay(test, "2026-11-04T09:00:00.000Z");
    const [due] = await liveDues(job.id);
    const proposal = await test.transact((ex, ctx) => prepareInvoice(ex, ctx, { fileId: job.id, dueIds: [due.id] }));
    expect(proposal.lines.map((line) => line.amount)).toEqual([da(18_000), -da(18_000)]);
    expect(proposal.blockers).toContain("NOTHING_TO_INVOICE");
  });
});

describe("the office decides how a visit is billed, and an extra visit is priced on its own (MON-05)", () => {
  it("prices an extra visit: it gets its own due and its own invoice line, and leaves the month's statement (MON-05)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    const visits = [];
    for (const day of NOVEMBER_TUESDAYS) visits.push(await visitOn(test, file.id, day));
    const extra = await visitOn(test, file.id, "2026-11-12", "SIGNED_OFF", {
      origin: "EXTRA",
      sourceVisitId: visits[1].id,
    });
    await sync(file.id);
    const accountant = await test.sessionFor("ACCOUNTANT");
    await test.transact(
      (ex, ctx) =>
        setVisitBilling(ex, ctx, { visitId: extra.id, billable: true, reason: "طلب العميل", amount: da(6_000) }),
      accountant,
    );
    const due = (await liveDues(file.id)).find((row) => row.kind === "EXTRA");
    expect(due).toMatchObject({ periodStart: "2026-11-12", expectedAmount: da(6_000) });

    await openDay(test, "2026-12-01T09:00:00.000Z");
    const alone = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [due?.id ?? ""] }),
    );
    expect(alone.blockers).toEqual([]);
    expect(alone.lines).toMatchObject([
      { kind: "EXTRA", description: "زيارة إضافية يوم 12/11/2026", amount: da(6_000), visitId: extra.id },
    ]);
    const november = (await liveDues(file.id))[0];
    const month = await test.transact((ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }));
    expect(month.visits.map((visit) => visit.visitDate)).toEqual([...NOVEMBER_TUESDAYS]);

    // Taken back: the due goes, the visit is the month's again.
    await test.transact((ex, ctx) => clearVisitBilling(ex, ctx, { visitId: extra.id }), accountant);
    expect((await liveDues(file.id)).some((row) => row.kind === "EXTRA")).toBe(false);
  });

  it("lets the office waive a visit the program would bill, with the reason in the log (MON-05)", async () => {
    const file = await contractedFile(test, {
      paymentFrequency: "PER_VISIT",
      totalAmount: da(3_500),
      firstDueDate: null,
    });
    const missed = await visitOn(test, file.id, "2026-11-03", "CLIENT_AT_FAULT");
    await sync(file.id);
    expect(await liveDues(file.id)).toHaveLength(1);
    await test.transact((ex, ctx) =>
      setVisitBilling(ex, ctx, { visitId: missed.id, billable: false, reason: "اتفاق مع العميل" }),
    );
    expect(await liveDues(file.id)).toEqual([]);
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("entity", "=", "VisitBilling")
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(entry.reason).toBe("اتفاق مع العميل");
  });

  it("refuses an extra visit billed without its price, a reader of the section, and a visit already invoiced (MON-05)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    const visit = await visitOn(test, file.id, "2026-11-03");
    const extra = await visitOn(test, file.id, "2026-11-05", "SIGNED_OFF", {
      origin: "EXTRA",
      sourceVisitId: visit.id,
    });
    await expect(
      test.transact((ex, ctx) => setVisitBilling(ex, ctx, { visitId: extra.id, billable: true, reason: "طلب" })),
    ).rejects.toThrow("Enter the price of this extra visit.");
    const administration = await test.sessionFor("ADMINISTRATION");
    await expect(
      test.transact(
        (ex, ctx) => setVisitBilling(ex, ctx, { visitId: visit.id, billable: false, reason: "خطأ" }),
        administration,
      ),
    ).rejects.toThrow();

    for (const day of NOVEMBER_TUESDAYS.slice(1)) await visitOn(test, file.id, day);
    await sync(file.id);
    await openDay(test, "2026-12-01T09:00:00.000Z");
    const november = (await liveDues(file.id))[0];
    await test.transact((ex, ctx) => issueInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }));
    await expect(
      test.transact((ex, ctx) => setVisitBilling(ex, ctx, { visitId: visit.id, billable: false, reason: "خطأ" })),
    ).rejects.toThrow("This visit is on an invoice: void the invoice before changing how it is billed.");
  });
});

describe("a make-up dated in the next period is counted in the period of the visit it stands in for (MON-02)", () => {
  it("waits for the make-up, then bills the month whole and states the make-up with it (MON-02)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    const visits = [];
    for (const day of NOVEMBER_TUESDAYS.slice(0, 3)) visits.push(await visitOn(test, file.id, day));
    const postponed = await visitOn(test, file.id, "2026-11-24", "PLANNED", { status: "POSTPONED" });
    const makeUp = await visitOn(test, file.id, "2026-12-02", "PLANNED", {
      origin: "MAKEUP",
      sourceVisitId: postponed.id,
    });
    await sync(file.id);
    const [november, december] = await liveDues(file.id);

    await openDay(test, "2026-12-01T09:00:00.000Z");
    const waiting = await test.transact((ex, ctx) => listInvoiceCandidates(ex, ctx));
    expect(waiting.find((candidate) => candidate.dueId === november.id)?.readiness).toBe("VISITS_OPEN");

    // The make-up is done and signed off on 2 December.
    await test.db.updateTable("Visit").set({ status: "DONE", billable: 1 }).where("id", "=", makeUp.id).execute();
    await test.rows.insert("VisitReport", { visitId: makeUp.id, entryState: "COMPLETE", completion: "FULL" } as never);
    await openDay(test, "2026-12-03T09:00:00.000Z");
    const proposal = await test.transact((ex, ctx) =>
      prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [november.id] }),
    );
    expect(proposal.blockers).toEqual([]);
    expect(proposal.lines.map((line) => line.kind)).toEqual(["SERVICE"]);
    expect(proposal.totals?.totalTTC).toBe(da(45_000));
    expect(proposal.visits.map((visit) => visit.visitDate)).toContain("2026-12-02");

    // December's statement does not carry it again.
    for (const day of ["2026-12-08", "2026-12-15"]) await visitOn(test, file.id, day);
    await openDay(test, "2027-01-02T09:00:00.000Z");
    const next = await test.transact((ex, ctx) => prepareInvoice(ex, ctx, { fileId: file.id, dueIds: [december.id] }));
    expect(next.visits.map((visit) => visit.visitDate)).toEqual(["2026-12-08", "2026-12-15"]);
  });
});

describe("only a worker authorised to collect takes a block of receipts or a client's money (MON-09)", () => {
  it("leaves out an unauthorised worker, refuses her a block and a payment, and lets an authorised one collect (MON-09)", async () => {
    await centreReady(test);
    const file = await contractedFile(test);
    await sync(file.id);
    const onTrial = await test.rows.insert("StaffMember", {
      kind: "WORKER",
      engagementStatus: "ON_TRIAL",
      canCollectCash: 0,
    } as never);
    const allowed = await test.rows.insert("StaffMember", {
      kind: "WORKER",
      engagementStatus: "ACCEPTED",
      canCollectCash: 1,
      collectAuthFrom: "2026-10-01",
    } as never);

    const collectors = await test.transact((ex, ctx) => listCollectors(ex, ctx));
    expect(collectors.map((row) => row.id)).toContain(allowed.id);
    expect(collectors.map((row) => row.id)).not.toContain(onTrial.id);

    const refusal = "This worker is not authorised to collect money: her card must say so (article 12).";
    await expect(
      test.transact((ex, ctx) =>
        issueReceiptBatch(ex, ctx, { count: 5, collectorKind: "WORKER", collectorStaffId: onTrial.id }),
      ),
    ).rejects.toThrow(refusal);
    await expect(
      test.transact((ex, ctx) =>
        recordPayment(ex, ctx, {
          fileId: file.id,
          receivedDate: "2026-10-12",
          method: "CASH",
          amount: da(10_000),
          collectorKind: "WORKER",
          collectorStaffId: onTrial.id,
        }),
      ),
    ).rejects.toThrow(refusal);

    const block = await test.transact((ex, ctx) =>
      issueReceiptBatch(ex, ctx, { count: 2, collectorKind: "WORKER", collectorStaffId: allowed.id }),
    );
    expect(block.receiptIds).toHaveLength(2);
  });
});
