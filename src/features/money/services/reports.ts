import { requireSection } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSetting } from "@/lib/settings";
import { basisPoints, localDate, money, type LocalDate } from "@/lib/units";

import { getClosedPayroll } from "@/features/people/services/payouts";

import { addDays, addMonths, addToMonth, firstDayOfMonth, lastDayOfMonth, monthOf } from "../rules/dates";
import { buildDueSchedule } from "../rules/due-schedule";
import { buildForecast, renewedTerms, type Forecast } from "../rules/forecast";
import {
  divisionIncome,
  expensesByDivision,
  periodResult,
  type InvoiceMatch,
  type PeriodResult,
} from "../rules/income";
import {
  DIVISIONS,
  isDivision,
  isExpenseDivision,
  type Division,
  type ExpenseDivision,
  type TaxMode,
} from "../validators/option-codes";
import type { IncomeDueView, IncomeInvoiceView, IncomePaymentView } from "../views";

import { readTaxSettings } from "./money-settings";
import { dueTermsOf, readFileBilling } from "./terms";

/**
 * What «المداخيل حسب القسم» is drawn from, read from the stored rows.
 *
 * Income is money collected: the payments received in the period, by the
 * division of their file. A voided payment counts nowhere. Beside it, kept
 * apart, what was invoiced in the period and what is still owed today.
 * The figures themselves are computed by the rules (../rules/income.ts), the
 * same ones the screen was drawn with before any row existed.
 */
export interface IncomeData {
  payments: IncomePaymentView[];
  /** How those payments settle invoices: what splits a payment before tax under VAT. */
  matches: InvoiceMatch[];
  invoices: IncomeInvoiceView[];
  /** Every due still open today, whatever the period. */
  dues: IncomeDueView[];
  /** The regime in force. Not chosen yet reads as the flat tax: no VAT is split out. */
  taxMode: TaxMode;
  vatRate: number;
}

export async function getIncomeData(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: LocalDate; to: LocalDate },
): Promise<IncomeData> {
  requireSection(ctx, "MONEY", "READ");
  const tax = await readTaxSettings(ex);

  const paymentRows = await ex
    .selectFrom("Payment")
    .innerJoin("File", "File.id", "Payment.fileId")
    .innerJoin("Client", "Client.id", "Payment.clientId")
    .leftJoin("Receipt", "Receipt.id", "Payment.receiptId")
    .select([
      "Payment.id",
      "Payment.receivedDate",
      "Payment.division",
      "Payment.method",
      "Payment.amount",
      "Payment.stampDuty",
      "Payment.payerName",
      "Client.name as clientName",
      "File.number as fileNumber",
      "Receipt.number as receiptNumber",
    ])
    .where("Payment.receivedDate", ">=", input.from)
    .where("Payment.receivedDate", "<=", input.to)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.paymentId", "=", "Payment.id")
            .where("LegalEvent.type", "=", "VOIDED"),
        ),
      ),
    )
    .orderBy("Payment.receivedDate", "desc")
    .orderBy("Payment.chainSeq", "desc")
    .execute();

  const matches = paymentRows.length
    ? await ex
        .selectFrom("PaymentAllocation")
        .innerJoin("PaymentDue", "PaymentDue.id", "PaymentAllocation.dueId")
        .innerJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
        .select([
          "PaymentAllocation.paymentId",
          "PaymentAllocation.amount",
          "Invoice.totalHT as invoiceTotalHT",
          "Invoice.totalTTC as invoiceTotalTTC",
        ])
        .where(
          "PaymentAllocation.paymentId",
          "in",
          paymentRows.map((payment) => payment.id),
        )
        .where("PaymentAllocation.amount", ">", money(0))
        .orderBy("PaymentAllocation.chainSeq")
        .execute()
    : [];

  const invoices = await ex
    .selectFrom("Invoice")
    .select(["Invoice.id", "Invoice.division", "Invoice.issueDate", "Invoice.totalHT", "Invoice.totalTTC"])
    .select(({ exists, selectFrom }) =>
      exists(
        selectFrom("LegalEvent")
          .select("LegalEvent.id")
          .whereRef("LegalEvent.invoiceId", "=", "Invoice.id")
          .where("LegalEvent.type", "=", "VOIDED"),
      ).as("voided"),
    )
    .where("Invoice.issueDate", ">=", input.from)
    .where("Invoice.issueDate", "<=", input.to)
    .execute();

  const dues = await ex
    .selectFrom("PaymentDue")
    .innerJoin("File", "File.id", "PaymentDue.fileId")
    .select(["PaymentDue.id", "PaymentDue.amount", "PaymentDue.paidAmount", "File.division"])
    .where("PaymentDue.cancelledAt", "is", null)
    .whereRef("PaymentDue.paidAmount", "<", "PaymentDue.amount")
    .execute();

  return {
    payments: paymentRows,
    matches,
    invoices: invoices.map((invoice) => ({ ...invoice, voided: Boolean(invoice.voided) })),
    dues: dues.map((due) => ({ ...due, cancelled: false })),
    taxMode: tax.mode ?? "IFU",
    vatRate: tax.vatRate,
  };
}

// ── «التقارير والمؤشرات» ──────────────────────────────────────────────────────

export interface ContractLine {
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division;
  /** Invoiced and received in the period; owed today. */
  invoiced: number;
  received: number;
  outstanding: number;
}

export interface PeriodReport {
  from: LocalDate;
  to: LocalDate;
  /** Income (collected, before tax), expenses and result, per division and in total. «عام» is a line of its own. */
  result: PeriodResult;
  /** Everything that came in, with tax and stamp duty: what the cash box and the bank saw. */
  received: number;
  invoiced: number;
  /** Owed today, whatever the period, and the part of it past its date. */
  outstanding: number;
  overdue: number;
  counts: {
    invoices: number;
    payments: number;
    /** Visits dated in the period: all of them, those done, and those that did not take place. */
    visits: number;
    visitsDone: number;
    visitsNotDone: number;
    /** Orders printed for a day up to today and not typed in whole yet (the end-of-day count). */
    ordersNotReturned: number;
  };
  forecast: Forecast;
  contracts: ContractLine[];
}

const NOT_DONE: ReadonlySet<string> = new Set(["CANCELLED", "POSTPONED", "PROBLEM"]);

/**
 * The report of a period (features 22, 39, 41): what came in and went out on
 * each division and what is left, the indicators of the work done, the
 * forecast of the coming months, and each file's invoiced, received and owed.
 *
 * The period is the screen's: today is the end-of-day report, the last seven
 * days the week's, the month the month's. Every figure is computed from the
 * stored rows by the rules the income and expenses screens use, so the three
 * screens can never disagree.
 */
export async function getPeriodReport(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: LocalDate; to: LocalDate },
): Promise<PeriodReport> {
  requireSection(ctx, "MONEY", "READ");
  const data = await getIncomeData(ex, ctx, input);
  const income = divisionIncome({
    payments: data.payments
      .filter((payment) => isDivision(payment.division))
      .map((payment) => ({
        id: payment.id,
        division: payment.division as Division,
        receivedDate: payment.receivedDate,
        amount: payment.amount,
        stampDuty: payment.stampDuty,
        voided: false,
      })),
    matches: data.matches,
    from: input.from,
    to: input.to,
    taxMode: data.taxMode,
    vatRate: basisPoints(data.vatRate),
  });

  const expenseRows = await ex
    .selectFrom("Expense")
    .select(["division", "date", "amount", "recurrence", "source"])
    .where("deletedAt", "is", null)
    .where("date", ">=", localDate(addMonths(firstDayOfMonth(monthOf(ctx.today)), -3)))
    .execute();
  const recent = expenseRows.filter((row) => isExpenseDivision(row.division));
  const expenses = expensesByDivision(
    // Expenses older than the three months read for the forecast are read apart, below.
    recent.map((row) => ({
      division: row.division as ExpenseDivision,
      date: row.date,
      amount: row.amount,
      deleted: false,
    })),
    input.from,
    input.to,
  );
  const floor = addMonths(firstDayOfMonth(monthOf(ctx.today)), -3);
  if (input.from < floor) {
    const older = await ex
      .selectFrom("Expense")
      .select(["division", "amount"])
      .where("deletedAt", "is", null)
      .where("date", ">=", input.from)
      .where("date", "<", localDate(floor < input.to ? floor : addDays(input.to, 1)))
      .execute();
    for (const row of older) if (isExpenseDivision(row.division)) expenses[row.division] += row.amount;
  }

  const result = periodResult({
    income: Object.fromEntries(
      DIVISIONS.map((division) => [division, income.byDivision[division].collected]),
    ) as Record<Division, number>,
    expenses,
    spreadCommon: false,
  });

  const liveInvoices = data.invoices.filter((invoice) => !invoice.voided);
  const openDues = await ex
    .selectFrom("PaymentDue")
    .innerJoin("File", "File.id", "PaymentDue.fileId")
    .select(["PaymentDue.fileId", "PaymentDue.dueDate", "PaymentDue.amount", "PaymentDue.paidAmount"])
    .where("PaymentDue.cancelledAt", "is", null)
    .whereRef("PaymentDue.paidAmount", "<", "PaymentDue.amount")
    .where("File.deletedAt", "is", null)
    .execute();
  const owed = openDues.map((due) => ({
    fileId: due.fileId,
    dueDate: due.dueDate,
    remaining: due.amount - due.paidAmount,
  }));

  // ── The work done ──
  const visits = await ex
    .selectFrom("Visit")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .select(["Visit.status", "Visit.statusReason", "Visit.visitDate", "Visit.orderPrintedAt", "VisitReport.entryState"])
    .where("Visit.visitDate", ">=", input.from)
    .where("Visit.visitDate", "<=", input.to)
    .execute();
  // A visit taken out because the programme changed never was a visit of the period.
  const counted = visits.filter(
    (visit) => !(visit.status === "CANCELLED" && visit.statusReason === "PROGRAMME_CHANGED"),
  );
  const ordersNotReturned = counted.filter(
    (visit) =>
      visit.orderPrintedAt !== null &&
      visit.visitDate <= ctx.today &&
      !NOT_DONE.has(visit.status) &&
      visit.entryState !== "COMPLETE",
  ).length;

  // ── The coming months ──
  const months = await getSetting(ex, "forecast.months");
  const thisMonth = monthOf(ctx.today);
  const monthly = expenseRows.filter((row) => row.recurrence === "MONTHLY");
  const lastMonthly = monthly.reduce((latest, row) => (monthOf(row.date) > latest ? monthOf(row.date) : latest), "");
  const recurringExpenses = monthly
    .filter((row) => monthOf(row.date) === lastMonthly)
    .reduce((sum, row) => sum + row.amount, 0);
  const closedMonths = [1, 2, 3].map((back) => addToMonth(thisMonth, -back));
  const otherExpensesOfLastMonths = closedMonths.map((month) =>
    expenseRows
      .filter((row) => monthOf(row.date) === month && row.recurrence !== "MONTHLY" && row.source !== "PAYROLL")
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const payroll = await getClosedPayroll(ex, ctx, { from: firstDayOfMonth(closedMonths[2]), to: ctx.today });
  const lastRunEnd = payroll.reduce((latest, row) => (row.periodEnd > latest ? row.periodEnd : latest), "");
  const lastPayRun = payroll
    .filter((row) => row.periodEnd === lastRunEnd)
    .reduce((sum, row) => sum + row.gross + row.employerContributions, 0);
  const forecast = buildForecast({
    today: ctx.today,
    months,
    dues: owed,
    duesIfRenewed: await renewalDues(ex, ctx, lastDayOfMonth(addToMonth(thisMonth, months))),
    recurringExpenses,
    lastPayRun,
    otherExpensesOfLastMonths,
  });

  // ── Each file ──
  const invoicedByFile = await ex
    .selectFrom("Invoice")
    .select(["Invoice.fileId", "Invoice.totalTTC"])
    .where("Invoice.issueDate", ">=", input.from)
    .where("Invoice.issueDate", "<=", input.to)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.invoiceId", "=", "Invoice.id")
            .where("LegalEvent.type", "=", "VOIDED"),
        ),
      ),
    )
    .execute();
  const receivedByFile = await ex
    .selectFrom("Payment")
    .select(["Payment.fileId", "Payment.amount"])
    .where("Payment.receivedDate", ">=", input.from)
    .where("Payment.receivedDate", "<=", input.to)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.paymentId", "=", "Payment.id")
            .where("LegalEvent.type", "=", "VOIDED"),
        ),
      ),
    )
    .execute();
  const lines = new Map<string, { invoiced: number; received: number; outstanding: number }>();
  const lineOf = (fileId: string) => {
    if (!lines.has(fileId)) lines.set(fileId, { invoiced: 0, received: 0, outstanding: 0 });
    return lines.get(fileId) ?? { invoiced: 0, received: 0, outstanding: 0 };
  };
  for (const row of invoicedByFile) lineOf(row.fileId).invoiced += row.totalTTC;
  for (const row of receivedByFile) lineOf(row.fileId).received += row.amount;
  for (const row of owed) lineOf(row.fileId).outstanding += row.remaining;
  const files = lines.size
    ? await ex
        .selectFrom("File")
        .innerJoin("Client", "Client.id", "File.clientId")
        .select(["File.id", "File.number", "File.division", "Client.name as clientName"])
        .where("File.id", "in", [...lines.keys()])
        .orderBy("File.number")
        .execute()
    : [];

  return {
    from: input.from,
    to: input.to,
    result,
    received: income.total.received,
    invoiced: liveInvoices.reduce((sum, invoice) => sum + invoice.totalTTC, 0),
    outstanding: owed.reduce((sum, due) => sum + due.remaining, 0),
    overdue: owed.filter((due) => due.dueDate < ctx.today).reduce((sum, due) => sum + due.remaining, 0),
    counts: {
      invoices: liveInvoices.length,
      payments: data.payments.length,
      visits: counted.length,
      visitsDone: counted.filter((visit) => visit.status === "DONE").length,
      visitsNotDone: counted.filter((visit) => NOT_DONE.has(visit.status)).length,
      ordersNotReturned,
    },
    forecast,
    contracts: files
      .filter((file) => isDivision(file.division))
      .map((file) => ({
        fileId: file.id,
        fileNumber: file.number,
        clientName: file.clientName,
        division: file.division as Division,
        ...lineOf(file.id),
      })),
  };
}

/**
 * What the contracts ending before the forecast's horizon would bring in if
 * each were renewed as it stands (`renewedTerms`): one more term from the day
 * after its end. A contract already renewed, ended early, closed, or that the
 * office said will not be renewed brings nothing. A contract paid visit by
 * visit is left out: its next visits are not planned yet.
 */
async function renewalDues(ex: Executor, ctx: ServiceContext, horizon: string) {
  const ending = await ex
    .selectFrom("File")
    .select(["File.id"])
    .where("File.stage", "=", "CONTRACTED")
    .where("File.serviceType", "=", "CONTRACT")
    .where("File.deletedAt", "is", null)
    .where("File.closedAt", "is", null)
    .where("File.endKind", "is", null)
    .where("File.endDate", ">=", ctx.today)
    .where("File.endDate", "<=", localDate(horizon))
    .where((eb) => eb.or([eb("File.renewalDecision", "is", null), eb("File.renewalDecision", "!=", "WILL_NOT_RENEW")]))
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("File as Successor")
            .select("Successor.id")
            .whereRef("Successor.renewalOfFileId", "=", "File.id")
            .where("Successor.deletedAt", "is", null),
        ),
      ),
    )
    .execute();
  const dues: { dueDate: string; remaining: number }[] = [];
  for (const { id } of ending) {
    const billing = await readFileBilling(ex, ctx, id);
    const terms = billing ? dueTermsOf(billing) : null;
    const renewed = terms ? renewedTerms(terms) : null;
    if (!renewed || renewed.frequency === "PER_VISIT") continue;
    for (const due of buildDueSchedule(renewed, [])) dues.push({ dueDate: due.dueDate, remaining: due.expectedAmount });
  }
  return dues;
}

// ── What the screens call ────────────────────────────────────────────────────

export const getIncomeDataQuery = query(getIncomeData);
export const getPeriodReportQuery = query(getPeriodReport);
