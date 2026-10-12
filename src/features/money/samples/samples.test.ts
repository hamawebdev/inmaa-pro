import { describe, expect, it } from "vitest";

import { isIsoDate } from "../rules/dates";
import { stampDuty } from "../rules/stamp-duty";
import { expenseFormSchema } from "../validators/expense";
import {
  DIVISIONS,
  EXPENSE_CATEGORIES,
  EXPENSE_DIVISIONS,
  EXPENSE_SOURCES,
  PAYMENT_METHODS,
  RECURRENCES,
} from "../validators/option-codes";

import { sampleExpenses } from "./expenses";
import { sampleIncome } from "./income";

/**
 * The sample rows the screens show until the services exist are held to the
 * rules the real rows will follow, so the screens are never shown something
 * the program could not have written.
 */

const TODAY = "2026-11-20";
const within = <T extends string>(list: readonly T[], value: string) => (list as readonly string[]).includes(value);

describe("the sample income", () => {
  const { payments, invoices, dues } = sampleIncome(TODAY);

  it("dates every payment on or before today, on one of his four divisions", () => {
    for (const payment of payments) {
      expect(isIsoDate(payment.receivedDate) && payment.receivedDate <= TODAY, payment.id).toBe(true);
      expect(within(DIVISIONS, payment.division), payment.id).toBe(true);
      expect(within(PAYMENT_METHODS, payment.method), payment.id).toBe(true);
      expect(Number.isSafeInteger(payment.amount) && payment.amount > 0, payment.id).toBe(true);
    }
  });

  it("charges stamp duty and gives a receipt to cash payments only, by the rule", () => {
    for (const payment of payments) {
      const cash = payment.method === "CASH";
      expect(payment.stampDuty, payment.id).toBe(cash ? stampDuty(payment.amount) : 0);
      expect(payment.receiptNumber !== null, payment.id).toBe(cash);
    }
    const numbers = payments.flatMap((payment) => (payment.receiptNumber ? [payment.receiptNumber] : []));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("keeps invoices and dues on his four divisions, nothing paid beyond what is due", () => {
    for (const invoice of invoices) expect(within(DIVISIONS, invoice.division), invoice.id).toBe(true);
    for (const due of dues) {
      expect(within(DIVISIONS, due.division), due.id).toBe(true);
      expect(due.paidAmount <= due.amount, due.id).toBe(true);
    }
  });
});

describe("the sample expenses", () => {
  const expenses = sampleExpenses(TODAY);
  const schema = expenseFormSchema(TODAY);

  it("uses only the stored codes, on the four divisions and «عام»", () => {
    for (const expense of expenses) {
      expect(within(EXPENSE_DIVISIONS, expense.division), expense.id).toBe(true);
      expect(within(EXPENSE_CATEGORIES, expense.category), expense.id).toBe(true);
      expect(within(EXPENSE_SOURCES, expense.source), expense.id).toBe(true);
      expect(within(RECURRENCES, expense.recurrence), expense.id).toBe(true);
    }
    expect(expenses.some((expense) => expense.division === "COMMON")).toBe(true);
  });

  it("leaves the payment method empty only on a maintenance record's expense", () => {
    for (const expense of expenses) expect(expense.method === null, expense.id).toBe(expense.source === "MAINTENANCE");
  });

  it("can open every expense typed by hand in the dialog, as the dialog would save it", () => {
    for (const expense of expenses.filter((row) => row.source === "MANUAL")) {
      const result = schema.safeParse({
        division: expense.division,
        category: expense.category,
        date: expense.date,
        amount: expense.amount / 100,
        method: expense.method,
        paidTo: expense.paidTo ?? "",
        spentByName: expense.spentByName ?? "",
        recurrence: expense.recurrence,
        note: expense.note ?? "",
      });
      expect(result.success, `${expense.id}: ${result.error?.issues[0]?.message}`).toBe(true);
    }
  });
});
