import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendChained } from "@/lib/chain";
import { emit } from "@/lib/events";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getFilePaymentSummary, listFileDues, syncDues } from "./dues";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const da = (dinars: number) => Math.round(dinars * 100);

/** A contract at «متعاقد»: 45 000,00 a month for three months, paid at each month's end. */
async function monthlyContract(over: Record<string, unknown> = {}) {
  return test.rows.insert("File", {
    stage: "CONTRACTED",
    serviceType: "CONTRACT",
    startDate: "2026-11-01",
    endDate: "2027-01-31",
    paymentFrequency: "MONTHLY",
    totalAmount: da(45_000),
    amountBasis: "PER_PAYMENT_PERIOD",
    firstDueDate: "2026-11-30",
    ...over,
  } as never);
}

async function visit(fileId: string, visitDate: string, over: Record<string, unknown> = {}) {
  return test.rows.insert("Visit", { fileId, visitDate, origin: "CONTRACT", status: "CONFIRMED", ...over } as never);
}

const sync = (fileId: string) => test.transact((ex, ctx) => syncDues(ex, ctx, { fileId }));
const duesOf = (fileId: string) =>
  test.db
    .selectFrom("PaymentDue")
    .select(["seq", "kind", "periodStart", "periodEnd", "dueDate", "expectedAmount", "amount", "cancelledAt"])
    .where("fileId", "=", fileId)
    .orderBy("seq")
    .execute();

describe("the dues of a contract paid by period", () => {
  it("builds one due per month from the terms, dated from «تاريخ تسديد»", async () => {
    const file = await monthlyContract();
    expect(await sync(file.id)).toEqual({ created: 3, updated: 0, cancelled: 0 });
    expect(await duesOf(file.id)).toEqual([
      {
        seq: 1,
        kind: "SCHEDULE",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        dueDate: "2026-11-30",
        expectedAmount: da(45_000),
        amount: da(45_000),
        cancelledAt: null,
      },
      {
        seq: 2,
        kind: "SCHEDULE",
        periodStart: "2026-12-01",
        periodEnd: "2026-12-31",
        dueDate: "2026-12-30",
        expectedAmount: da(45_000),
        amount: da(45_000),
        cancelledAt: null,
      },
      {
        seq: 3,
        kind: "SCHEDULE",
        periodStart: "2027-01-01",
        periodEnd: "2027-01-31",
        dueDate: "2027-01-30",
        expectedAmount: da(45_000),
        amount: da(45_000),
        cancelledAt: null,
      },
    ]);
  });

  it("writes nothing when called again with nothing changed", async () => {
    const file = await monthlyContract();
    await sync(file.id);
    const before = await test.db.selectFrom("PaymentDue").select(["id", "updatedAt"]).execute();
    test.clock.advance({ days: 1 });
    expect(await sync(file.id)).toEqual({ created: 0, updated: 0, cancelled: 0 });
    expect(await test.db.selectFrom("PaymentDue").select(["id", "updatedAt"]).execute()).toEqual(before);
  });

  it("follows new terms on the dues nobody touched, and leaves a paid one as it is", async () => {
    const file = await monthlyContract();
    await sync(file.id);
    const [first] = await test.db
      .selectFrom("PaymentDue")
      .select("id")
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    // November was paid in part: an allocation, which the database turns into paidAmount.
    await test.transact(async (ex, ctx) => {
      const payment = await test.rows.insert(
        "Payment",
        {
          fileId: file.id,
          fileNumber: file.number,
          clientName: "رشيد بوزيد",
          amount: da(10_000),
          totalReceived: da(10_000),
        } as never,
        { ex, ctx },
      );
      await appendChained(ex, ctx, "PaymentAllocation", {
        id: "allocation-1",
        paymentId: payment.id,
        dueId: first.id,
        amount: da(10_000),
        reversesAllocationId: null,
        createdAt: ctx.now,
        createdByUserId: ctx.userId,
      });
    });

    // The price goes up and the contract is cut to two months.
    await test.db
      .updateTable("File")
      .set({ totalAmount: da(50_000), endDate: "2026-12-31" } as never)
      .where("id", "=", file.id)
      .execute();
    expect(await sync(file.id)).toEqual({ created: 0, updated: 1, cancelled: 1 });

    const dues = await test.db
      .selectFrom("PaymentDue")
      .select(["seq", "expectedAmount", "paidAmount", "cancelledAt", "cancelReason"])
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    expect(dues[0]).toMatchObject({ expectedAmount: da(45_000), paidAmount: da(10_000), cancelledAt: null });
    expect(dues[1]).toMatchObject({ expectedAmount: da(50_000), cancelledAt: null });
    expect(dues[2].cancelledAt).not.toBeNull();
    expect(dues[2].cancelReason).toBe("TERMS_CHANGED");
  });

  it("gives a cancelled period's slot back: the same month can be asked for again", async () => {
    const file = await monthlyContract();
    await sync(file.id);
    await test.db
      .updateTable("File")
      .set({ endDate: "2026-12-31" } as never)
      .where("id", "=", file.id)
      .execute();
    await sync(file.id);
    await test.db
      .updateTable("File")
      .set({ endDate: "2027-01-31" } as never)
      .where("id", "=", file.id)
      .execute();
    expect(await sync(file.id)).toEqual({ created: 1, updated: 0, cancelled: 0 });
    const dues = await duesOf(file.id);
    expect(dues.map((due) => [due.seq, due.periodStart, due.cancelledAt === null])).toEqual([
      [1, "2026-11-01", true],
      [2, "2026-12-01", true],
      [3, "2027-01-01", false],
      [4, "2027-01-01", true],
    ]);
  });

  it("expects nothing of a file that is not contracted, or whose terms are not all written", async () => {
    const draft = await monthlyContract({ stage: "QUOTE" });
    const noFrequency = await monthlyContract({ paymentFrequency: null });
    const noAmount = await monthlyContract({ totalAmount: null });
    const backwards = await monthlyContract({ endDate: "2026-10-01" });
    for (const file of [draft, noFrequency, noAmount, backwards]) {
      expect(await sync(file.id)).toEqual({ created: 0, updated: 0, cancelled: 0 });
    }
    expect(await sync("no-such-file")).toEqual({ created: 0, updated: 0, cancelled: 0 });
  });
});

describe("the dues of a contract paid «بعد كل زيارة»", () => {
  it("has one due per visit, and follows the visits", async () => {
    const file = await monthlyContract({
      paymentFrequency: "PER_VISIT",
      totalAmount: da(3_500),
      firstDueDate: null,
      endDate: "2026-11-30",
    });
    const first = await visit(file.id, "2026-11-03");
    const second = await visit(file.id, "2026-11-10");
    const third = await visit(file.id, "2026-11-17");
    expect(await sync(file.id)).toEqual({ created: 3, updated: 0, cancelled: 0 });

    // The second is cancelled by the centre, the third by the client at the door.
    await test.db
      .updateTable("Visit")
      .set({ status: "CANCELLED", statusReason: "OTHER" } as never)
      .where("id", "=", second.id)
      .execute();
    await test.db
      .updateTable("Visit")
      .set({ status: "CANCELLED", statusReason: "CLIENT_ABSENT", clientAtFault: 1 } as never)
      .where("id", "=", third.id)
      .execute();
    expect(await sync(file.id)).toEqual({ created: 0, updated: 0, cancelled: 1 });

    const dues = await test.db
      .selectFrom("PaymentDue")
      .select(["kind", "visitId", "dueDate", "expectedAmount", "cancelledAt"])
      .where("fileId", "=", file.id)
      .orderBy("seq")
      .execute();
    expect(
      dues.map((due) => [due.kind, due.visitId, due.dueDate, due.expectedAmount, due.cancelledAt === null]),
    ).toEqual([
      ["VISIT", first.id, "2026-11-03", da(3_500), true],
      ["VISIT", second.id, "2026-11-10", da(3_500), false],
      ["VISIT", third.id, "2026-11-17", da(3_500), true],
    ]);
  });

  it("leaves out a visit cancelled because the programme changed", async () => {
    const file = await monthlyContract({ paymentFrequency: "PER_VISIT", totalAmount: da(3_500), firstDueDate: null });
    await visit(file.id, "2026-11-03");
    await visit(file.id, "2026-11-10", { status: "CANCELLED", statusReason: "PROGRAMME_CHANGED" });
    expect(await sync(file.id)).toEqual({ created: 1, updated: 0, cancelled: 0 });
  });
});

describe("the due of a job on demand, and the end of a contract", () => {
  it("has one due for the whole job, on «تاريخ التسديد»", async () => {
    const file = await monthlyContract({
      serviceType: "ON_DEMAND",
      startDate: "2026-10-17",
      endDate: "2026-10-18",
      paymentFrequency: null,
      totalAmount: da(18_000),
      firstDueDate: "2026-10-18",
    });
    await sync(file.id);
    expect(await duesOf(file.id)).toMatchObject([
      { kind: "SINGLE", periodStart: "2026-10-17", periodEnd: "2026-10-18", dueDate: "2026-10-18", amount: da(18_000) },
    ]);
  });

  it("cancels what lay after the day a contract ended, cuts the month that holds it (INT-2), and keeps the due of a finished job", async () => {
    const contract = await monthlyContract();
    await sync(contract.id);
    await test.db
      .updateTable("File")
      .set({ stage: "CONTRACT_ENDED", endedDate: "2026-12-10", endKind: "ENDED_BY_CLIENT" } as never)
      .where("id", "=", contract.id)
      .execute();
    expect(await sync(contract.id)).toEqual({ created: 0, updated: 1, cancelled: 1 });
    const dues = await test.db
      .selectFrom("PaymentDue")
      .select(["periodStart", "periodEnd", "amount", "cancelReason"])
      .where("fileId", "=", contract.id)
      .orderBy("seq")
      .execute();
    // No visit planned: the month weighs its days, ten of thirty-one.
    expect(dues).toEqual([
      { periodStart: "2026-11-01", periodEnd: "2026-11-30", amount: da(45_000), cancelReason: null },
      { periodStart: "2026-12-01", periodEnd: "2026-12-10", amount: 1_451_613, cancelReason: null },
      { periodStart: "2027-01-01", periodEnd: "2027-01-31", amount: da(45_000), cancelReason: "CONTRACT_ENDED" },
    ]);

    const job = await monthlyContract({ serviceType: "ON_DEMAND", paymentFrequency: null });
    await sync(job.id);
    await test.db
      .updateTable("File")
      .set({ stage: "CONTRACT_ENDED", endedDate: "2026-10-20", endKind: "JOB_DONE" } as never)
      .where("id", "=", job.id)
      .execute();
    expect(await sync(job.id)).toEqual({ created: 0, updated: 0, cancelled: 0 });
  });
});

describe("the events Money follows", () => {
  it("builds the dues when Clients says the file is «متعاقد», and again when its terms change", async () => {
    const file = await monthlyContract();
    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
    expect(await duesOf(file.id)).toHaveLength(3);

    await test.db
      .updateTable("File")
      .set({ totalAmount: da(40_000) } as never)
      .where("id", "=", file.id)
      .execute();
    await test.transact((ex, ctx) => emit(ex, ctx, "file.termsChanged", { fileId: file.id }));
    expect((await duesOf(file.id)).map((due) => due.expectedAmount)).toEqual([da(40_000), da(40_000), da(40_000)]);
  });

  it("gives a per-visit contract its due when a visit is signed off or moved", async () => {
    const file = await monthlyContract({ paymentFrequency: "PER_VISIT", totalAmount: da(3_500), firstDueDate: null });
    const done = await visit(file.id, "2026-11-03", { status: "DONE", billable: 1 });
    await test.transact((ex, ctx) => emit(ex, ctx, "visit.signedOff", { visitId: done.id }));
    expect(await duesOf(file.id)).toHaveLength(1);

    const added = await visit(file.id, "2026-11-10");
    await test.transact((ex, ctx) => emit(ex, ctx, "visit.statusChanged", { visitId: added.id }));
    expect(await duesOf(file.id)).toHaveLength(2);
  });
});

describe("reading a file's dues", () => {
  it("says what is due, paid and late on the day it is read", async () => {
    const file = await monthlyContract();
    await sync(file.id);
    test.clock.set("2026-12-05T09:00:00.000Z");
    const lines = await test.transact((ex, ctx) => listFileDues(ex, ctx, { fileId: file.id }));
    expect(lines.map((line) => [line.dueDate, line.state, line.daysLate, line.remaining])).toEqual([
      ["2026-11-30", "OVERDUE", 5, da(45_000)],
      ["2026-12-30", "UPCOMING", 0, da(45_000)],
      ["2027-01-30", "UPCOMING", 0, da(45_000)],
    ]);
    const summary = await test.transact((ex, ctx) => getFilePaymentSummary(ex, ctx, { fileId: file.id }));
    expect(summary).toEqual({
      amount: da(135_000),
      paid: 0,
      remaining: da(135_000),
      overdue: da(45_000),
      nextDueDate: "2026-11-30",
      state: "UNPAID",
    });
  });
});
