import { can, requireSection, sectionLevel } from "@/lib/access/session";
import { logDisclose } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { money, type LocalDate } from "@/lib/units";

import { dueState } from "../rules/alerts";
import { amountInWordsAr } from "../rules/amount-in-words-ar";
import { diffDays, formatDate } from "../rules/dates";
import type { PaymentReminderData, ReminderItem } from "../sheets/payment-reminder-sheet";
import { DIVISIONS, type Division, type DueKind, type DueState } from "../validators/option-codes";

import { fileCredit, filesCredit } from "./credit";
import { getFilePaymentSummary, listFileDues, type DueLine, type FilePaymentSummary } from "./dues";
import { readInvoiceList, type InvoiceListRow } from "./invoices";
import { readSeller } from "./parties";
import { readPaymentList, type PaymentListRow } from "./payments";
import { readFileBilling } from "./terms";

/**
 * «التسديد والديون»: what is owed, across the files (the debt list the payment
 * alerts open) and on one file (its part «التسديد»), and the reminder letter
 * printed from it (feature 20, the office form of the plan's WhatsApp).
 *
 * Every figure is read from the stored dues: what an invoice or a payment
 * changed is already in `PaymentDue.amount` and `paidAmount`.
 */

export interface OpenDueRow {
  id: string;
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division;
  /** «مسدد أتعاب» and his phone, as written on the file. */
  payerName: string | null;
  payerPhone: string | null;
  kind: DueKind;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  dueDate: LocalDate;
  amount: number;
  paidAmount: number;
  remaining: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  state: DueState;
  daysLate: number;
  /** The file's credit, when it has some: what the office may set against this due. */
  fileCredit: number;
}

const divisionOf = (value: string): Division =>
  (DIVISIONS as readonly string[]).includes(value) ? (value as Division) : "HOUSING";

/**
 * Every due still owed, on every live file, the oldest date first: the debt
 * list. A due that is fully paid or cancelled is not owed and is left out.
 */
export async function listOpenDues(ex: Executor, ctx: ServiceContext): Promise<OpenDueRow[]> {
  requireSection(ctx, "MONEY", "READ");
  const leadDays = await getSetting(ex, "alerts.paymentDueLeadDays");
  const rows = await ex
    .selectFrom("PaymentDue")
    .innerJoin("File", "File.id", "PaymentDue.fileId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .leftJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
    .select([
      "PaymentDue.id",
      "PaymentDue.fileId",
      "PaymentDue.kind",
      "PaymentDue.periodStart",
      "PaymentDue.periodEnd",
      "PaymentDue.dueDate",
      "PaymentDue.amount",
      "PaymentDue.paidAmount",
      "PaymentDue.invoiceId",
      "Invoice.number as invoiceNumber",
      "File.number as fileNumber",
      "File.division",
      "File.payerName",
      "File.payerPhone",
      "Client.name as clientName",
    ])
    .where("PaymentDue.cancelledAt", "is", null)
    .whereRef("PaymentDue.paidAmount", "<", "PaymentDue.amount")
    .where("File.deletedAt", "is", null)
    .orderBy("PaymentDue.dueDate")
    .orderBy("File.number")
    .orderBy("PaymentDue.seq")
    .execute();
  const credits = await filesCredit(
    ex,
    rows.map((row) => row.fileId),
  );
  return rows.map((row) => {
    const remaining = row.amount - row.paidAmount;
    return {
      id: row.id,
      fileId: row.fileId,
      fileNumber: row.fileNumber,
      clientName: row.clientName,
      division: divisionOf(row.division),
      payerName: row.payerName,
      payerPhone: row.payerPhone,
      kind: row.kind as DueKind,
      periodStart: (row.periodStart as LocalDate | null) ?? null,
      periodEnd: (row.periodEnd as LocalDate | null) ?? null,
      dueDate: row.dueDate as LocalDate,
      amount: row.amount,
      paidAmount: row.paidAmount,
      remaining,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      state: dueState(
        { amount: row.amount, paidAmount: row.paidAmount, dueDate: row.dueDate, cancelled: false },
        ctx.today,
        leadDays,
      ),
      daysLate: Math.max(0, diffDays(row.dueDate, ctx.today)),
      fileCredit: credits.get(row.fileId) ?? 0,
    };
  });
}

// ── One file ─────────────────────────────────────────────────────────────────

/**
 * Who may open a file's part «التسديد»: whoever reads the money, whoever takes
 * payments at the desk, and whoever reads the file itself.
 */
function requireFileMoneyRead(ctx: ServiceContext) {
  if (can(ctx, "payment.record") || sectionLevel(ctx, "MONEY") !== null) return;
  requireSection(ctx, "REQUESTS", "READ");
}

export interface FileMoney {
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division;
  payerName: string | null;
  summary: FilePaymentSummary;
  dues: DueLine[];
  invoices: InvoiceListRow[];
  payments: PaymentListRow[];
  /** Money received that no due holds: offered first to the next payment (credit.ts). */
  credit: number;
  /**
   * Two laptops: money paid on dues that were cut on the laptop without the books, waiting for the books' laptop
   * to place it (credit.ts, `rebalanceWaitingFiles`). 0 otherwise.
   */
  creditPending: number;
}

/** A file's part «التسديد»: its dues with their state, its invoices and the payments received. */
export async function getFileMoney(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<FileMoney> {
  requireFileMoneyRead(ctx);
  const file = await ex
    .selectFrom("File")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select(["File.id", "File.number", "File.division", "File.payerName", "Client.name as clientName"])
    .where("File.id", "=", input.fileId)
    .where("File.deletedAt", "is", null)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This file does not exist.");
  const dues = await listFileDues(ex, ctx, { fileId: file.id });
  return {
    fileId: file.id,
    fileNumber: file.number,
    clientName: file.clientName,
    division: divisionOf(file.division),
    payerName: file.payerName,
    summary: await getFilePaymentSummary(ex, ctx, { fileId: file.id }),
    dues,
    invoices: await readInvoiceList(ex, { fileId: file.id }),
    payments: await readPaymentList(ex, { fileId: file.id }),
    credit: await fileCredit(ex, file.id),
    creditPending: dues.reduce((sum, due) => sum + due.pendingExcess, 0),
  };
}

// ── The reminder ─────────────────────────────────────────────────────────────

/** What a due is for, in the words of the invoice that bills it. */
function reminderDescription(due: DueLine): string {
  switch (due.kind) {
    case "SCHEDULE":
      return due.periodStart && due.periodEnd
        ? `خدمة التنظيف من ${formatDate(due.periodStart)} إلى ${formatDate(due.periodEnd)}`
        : "خدمة التنظيف";
    case "VISIT":
      return `زيارة يوم ${formatDate(due.periodStart ?? due.dueDate)}`;
    case "SINGLE":
      return "خدمة تنظيف عند الطلب";
    case "INITIAL_JOB":
      return "عمل أولي (مرة واحدة)";
    case "EXTRA":
      return `زيارة إضافية يوم ${formatDate(due.periodStart ?? due.dueDate)}`;
    case "DEPOSIT":
      return "تسبيق";
    default:
      return "مبلغ مستحق";
  }
}

/**
 * The reminder letter of a file, written from what it owes today: each due
 * whose date has come and that is not paid in whole, with its date and what
 * remains, addressed to «مسدد أتعاب». A due still to come is never asked for
 * (MON-03): the letter says these amounts were not paid by its date. A file
 * that owes nothing today has no reminder.
 */
export async function getPaymentReminder(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<PaymentReminderData> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  const file = await readFileBilling(ex, ctx, input.fileId);
  if (!file) throw new ServiceError("This file does not exist.");
  const client = await ex.selectFrom("Client").select("name").where("id", "=", file.clientId).executeTakeFirstOrThrow();
  const open = (await listFileDues(ex, ctx, { fileId: file.id })).filter((due) => !due.cancelled && due.remaining > 0);
  if (open.length === 0) throw new ServiceError("This file owes nothing: there is no reminder to print.");
  const dues = open.filter((due) => due.dueDate <= ctx.today);
  if (dues.length === 0) throw new ServiceError("Nothing of this file is due yet: there is no reminder to print.");

  const items: ReminderItem[] = dues.map((due) => ({
    invoiceNumber: due.invoiceNumber,
    description: reminderDescription(due),
    dueDate: due.dueDate,
    amount: due.amount,
    paid: due.paidAmount,
    remaining: due.remaining,
    daysLate: diffDays(due.dueDate, ctx.today),
  }));
  const totalRemaining = money(items.reduce((sum, item) => sum + item.remaining, 0));
  const credit = money(await fileCredit(ex, file.id));
  const askedAmount = money(Math.max(0, totalRemaining - credit));
  return {
    date: ctx.today,
    place: await getSetting(ex, "centre.city"),
    seller: await readSeller(ex),
    payerName: file.payerName ?? client.name,
    payerPhone: file.payerPhone,
    clientName: client.name,
    fileNumber: file.number,
    division: file.division,
    items,
    totalRemaining,
    credit,
    askedAmount,
    totalRemainingWordsAr: amountInWordsAr(askedAmount),
    paymentMethods: file.paymentMethods,
    paymentPlace: file.paymentPlace,
  };
}

/** A reminder names a person and what he owes: printing it is a disclosure (DESIGN.md section 9). */
export async function recordReminderPrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<{ fileId: string }> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  const file = await ex
    .selectFrom("File")
    .select(["id", "number", "clientId"])
    .where("id", "=", input.fileId)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This file does not exist.");
  await logDisclose(ex, ctx, {
    owner: "MONEY",
    action: "PRINT",
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    subject: { kind: "CLIENT", id: file.clientId },
    disclosure: "PRINT",
    context: { sheet: "PAYMENT_REMINDER" },
  });
  return { fileId: file.id };
}

// ── What the screens call ────────────────────────────────────────────────────

export const listOpenDuesQuery = query((ex: Executor, ctx: ServiceContext) => listOpenDues(ex, ctx));
export const getFileMoneyQuery = query(getFileMoney);
export const getPaymentReminderQuery = query(getPaymentReminder);
export const recordReminderPrintedAction = action(recordReminderPrinted);
