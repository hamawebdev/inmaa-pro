import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { claimNumber, fileSequenceKey, formatNumber, nextNumber, nextNumbers, peekLegalNumber } from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

const d = localDate;

/** Runs one raw statement and returns the database's refusal, or null when it was accepted. */
function refusal(statement: string, ...params: Array<string | number | null>): string | null {
  try {
    test.raw.prepare(statement).run(...params.map((value) => (typeof value === "number" ? BigInt(value) : value)));
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

describe("formatNumber", () => {
  it("writes each kind of number as the centre's papers do", () => {
    expect(formatNumber("FILE_ORG_CONTRACT", 31, 0)).toBe("31");
    expect(formatNumber("FILE_BUILDING_CONTRACT", 31, 0, { suffix: "BLC" })).toBe("31/BLC");
    expect(formatNumber("STAFF_WORKER", 12, 0, { suffix: "F" })).toBe("12/F");
    expect(formatNumber("QUOTE", 31, 2026, { width: 4 })).toBe("0031/2026");
    expect(formatNumber("VISIT", 31, 2026, { width: 5 })).toBe("00031/2026");
    expect(formatNumber("EQUIPMENT_UNIT", 31, 0, { width: 4 })).toBe("0031");
    expect(formatNumber("INVOICE", 31, 2026)).toBe("000031/2026");
    expect(formatNumber("RECEIPT", 7, 2027, { series: "B" })).toBe("B000007/2027");
  });
});

describe("nextNumber", () => {
  it("restarts each year by the document's own date, not by the clock (C6)", async () => {
    const take = (date: string) => test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d(date) }));

    expect((await take("2026-12-31")).display).toBe("0001/2026");
    expect((await take("2027-01-02")).display).toBe("0001/2027");
    expect((await take("2026-12-30")).display).toBe("0002/2026");
  });

  it("never restarts a file number, and keeps one counter per form kind (C4)", async () => {
    const take = (formKind: string, date: string) =>
      test.transact((ex, ctx) => nextNumber(ex, ctx, fileSequenceKey(formKind), { date: d(date) }));

    expect(await take("BUILDING_CONTRACT", "2026-10-12")).toEqual({ seq: 1, year: 0, display: "1/BLC" });
    expect(await take("ORG_CONTRACT", "2026-10-12")).toEqual({ seq: 1, year: 0, display: "1" });
    expect(await take("BUILDING_CONTRACT", "2027-03-01")).toEqual({ seq: 2, year: 0, display: "2/BLC" });
  });

  it("goes on from the paper register when Settings says where, once per key", async () => {
    await test.transact((ex, ctx) => setSetting(ex, ctx, "numbering.startAt", { QUOTE: 40 }));
    const take = (date: string) => test.transact((ex, ctx) => nextNumber(ex, ctx, "QUOTE", { date: d(date) }));

    expect((await take("2026-10-12")).seq).toBe(40);
    expect((await take("2026-10-13")).seq).toBe(41);
    expect((await take("2027-01-04")).seq).toBe(1);
  });

  it("gives a year of visits one unbroken block, and a rolled-back block gives its numbers back (C8)", async () => {
    await expect(
      test.transact(async (ex, ctx) => {
        await nextNumbers(ex, ctx, "VISIT", { date: d("2026-10-12"), count: 52 });
        throw new Error("operations: the generator stopped");
      }),
    ).rejects.toThrow("the generator stopped");

    const block = await test.transact((ex, ctx) => nextNumbers(ex, ctx, "VISIT", { date: d("2026-10-12"), count: 52 }));

    expect(block.map((number) => number.seq)).toEqual(Array.from({ length: 52 }, (_, index) => index + 1));
    expect(block[51].display).toBe("00052/2026");
  });

  it("refuses a legal key: only the insert of the document moves it", async () => {
    await expect(
      test.transact((ex, ctx) => nextNumber(ex, ctx, "INVOICE" as never, { date: d("2026-10-12") })),
    ).rejects.toThrow("legal sequence");
  });
});

describe("claimNumber", () => {
  it("takes a number typed from paper, raises the counter, and the next number follows it (C4)", async () => {
    const claim = (value: number, reason: string) =>
      test.transact((ex, ctx) => claimNumber(ex, ctx, "FILE_ORG_CONTRACT", { value, date: d("2026-10-12"), reason }));
    const next = () => test.transact((ex, ctx) => nextNumber(ex, ctx, "FILE_ORG_CONTRACT", { date: d("2026-10-12") }));

    expect(await claim(31, "رقم من السجل الورقي")).toEqual({ seq: 31, year: 0, display: "31" });
    expect((await next()).seq).toBe(32);
    // A lower number from paper does not lower the counter.
    expect((await claim(5, "ملف قديم")).display).toBe("5");
    expect((await next()).seq).toBe(33);

    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "CHANGE",
      action: "NUMBER_CLAIM",
      reason: "ملف قديم",
      entityLabel: "FILE_ORG_CONTRACT 5",
    });
  });

  it("is refused when the number is taken, without a reason, and to a role without file.setNumber", async () => {
    const claim = (reason: string, session = test.manager, isFree?: () => Promise<boolean>) =>
      test.transact(
        (ex, ctx) => claimNumber(ex, ctx, "FILE_ORG_CONTRACT", { value: 31, date: d("2026-10-12"), reason, isFree }),
        session,
      );

    await expect(claim("ورق", test.manager, async () => false)).rejects.toThrow("This number is already taken.");
    await expect(claim("  ")).rejects.toThrow("A reason is required.");
    await expect(claim("ورق", await test.sessionFor("RECEPTION_SALES"))).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});

describe("the legal sequences (C1, C2)", () => {
  it("reads the next invoice number and the date floor without moving anything", async () => {
    const peek = (date: string) => test.transact((ex, ctx) => peekLegalNumber(ex, ctx, "INVOICE", { date: d(date) }));

    expect(await peek("2026-10-12")).toEqual({ seq: 1, year: 2026, display: "000001/2026", notBefore: null });
    expect(await peek("2026-10-12")).toEqual({ seq: 1, year: 2026, display: "000001/2026", notBefore: null });
    await test.rows.insert("Invoice", { issueDate: d("2026-10-12") });
    expect(await peek("2026-10-13")).toEqual({ seq: 2, year: 2026, display: "000002/2026", notBefore: "2026-10-12" });
  });

  it("cannot be moved by hand, skipped, reused, or dated out of order", async () => {
    const first = await test.rows.insert("Invoice", { issueDate: d("2026-10-12") });
    expect(first.number).toBe("000001/2026");
    const forged = (over: Record<string, unknown>) => test.rows.insert("Invoice", over as never);

    expect(refusal(`UPDATE "Sequence" SET "lastValue" = 5 WHERE "key" = 'INVOICE'`)).toMatch(/^SEQUENCE:legal_step/);
    await expect(forged({ numberSeq: 3, numberYear: 2026, number: "000003/2026" })).rejects.toThrow(
      "LEGAL_SEQUENCE:Invoice:number",
    );
    await expect(forged({ numberSeq: 1, numberYear: 2026, number: "000001/2026" })).rejects.toThrow(
      "LEGAL_SEQUENCE:Invoice:number",
    );
    // Before the last invoice; in another year than its number; later than the day after it is written.
    await expect(forged({ issueDate: d("2026-10-11") })).rejects.toThrow("LEGAL_SEQUENCE:Invoice:date");
    await test.transact((ex, ctx) => peekLegalNumber(ex, ctx, "INVOICE", { date: d("2027-01-01") }));
    await expect(
      forged({ numberSeq: 1, numberYear: 2027, number: "000001/2027", issueDate: d("2026-10-13") }),
    ).rejects.toThrow("LEGAL_SEQUENCE:Invoice:date");
    await expect(forged({ issueDate: d("2026-10-14") })).rejects.toThrow("LEGAL_SEQUENCE:Invoice:date");

    // Nothing above moved the counter: the next one is 2.
    expect((await forged({ issueDate: d("2026-10-13") })).number).toBe("000002/2026");
  });

  it("leaves no hole after a failed issue or a void", async () => {
    await test.rows.insert("Invoice");
    await expect(
      test.transact(async (ex, ctx) => {
        await test.rows.insert("Invoice", {}, { ex, ctx });
        throw new Error("money: the printer was not ready");
      }),
    ).rejects.toThrow("printer");
    const second = await test.rows.insert("Invoice");
    await test.rows.insert("LegalEvent", { invoiceId: second.id, type: "VOIDED", reason: "خطأ في المبلغ" });
    const third = await test.rows.insert("Invoice");

    expect([second.number, third.number]).toEqual(["000002/2026", "000003/2026"]);
    const numbers = await test.db.selectFrom("Invoice").select("numberSeq").orderBy("numberSeq").execute();
    expect(numbers.map((row) => row.numberSeq)).toEqual([1, 2, 3]);
  });

  it("numbers receipts the same way", async () => {
    const receipts = [await test.rows.insert("Receipt"), await test.rows.insert("Receipt")];

    expect(receipts.map((receipt) => receipt.number)).toEqual(["000001/2026", "000002/2026"]);
    expect(refusal(`UPDATE "Sequence" SET "lastValue" = 1 WHERE "key" = 'RECEIPT'`)).toMatch(/^SEQUENCE:/);
  });
});
