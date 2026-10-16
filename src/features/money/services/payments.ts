import { can, requireCapability, requireSection } from "@/lib/access/session";
import { linkUpload } from "@/lib/attachments";
import { appendChained } from "@/lib/chain";
import { assertClockSane } from "@/lib/clock/sanity";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logCollect, logDisclose } from "@/lib/log";
import { peekLegalNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import type { LocalDate } from "@/lib/units";

import { amountInWordsAr } from "../rules/amount-in-words-ar";
import { amountInWordsFr } from "../rules/amount-in-words-fr";
import { parseCodes } from "../rules/codes";
import { isIsoDate } from "../rules/dates";
import { stampDuty } from "../rules/stamp-duty";
import type { CashReceiptData } from "../sheets/cash-receipt-sheet";
import type { SellerSnapshot } from "../sheets/invoice-sheet";
import { stampScaleNote } from "../sheets/stamp-scale-note";
import {
  COLLECTOR_KINDS,
  DIVISIONS,
  PAYMENT_METHODS,
  type CollectorKind,
  type Division,
  type PaymentMethod,
} from "../validators/option-codes";

import { readStampSettings } from "./money-settings";
import { readFileParty, readSeller } from "./parties";
import { MONEY_PATHS } from "./paths";
import { readFileBilling } from "./terms";

/**
 * «التسديد» (#20) and «سند القبض» (#32).
 *
 * A payment is money received from a file's client, on the day it was
 * received: that day and the file's division are what put it in the income.
 * It is applied to the file's open dues, oldest first unless the office names
 * them; what it does not cover stays as the file's credit.
 *
 * Cash carries stamp duty, charged on each cash payment and never part of the
 * receivable: 45 000,00 in cash is 45 000,00 on the dues and 675,00 of stamp.
 * A cash payment always has its receipt: receipt, payment, allocations, in
 * that order and one transaction, all through Foundation's chain. The payment
 * row is what the receipt says.
 *
 * A wrong payment is voided with a reason, never edited: one reversing
 * allocation per live one, then the payment's `VOIDED` event, then its
 * receipt's.
 */

// ── Recording ────────────────────────────────────────────────────────────────

export interface RecordPaymentInput {
  fileId: string;
  /** «تاريخ الدفع». */
  receivedDate: string;
  method: PaymentMethod;
  /** In centimes: the part applied to dues. Stamp duty is added to it for cash, never taken from it. */
  amount: number;
  /** «مسدد أتعاب». Left empty: the file's payer, else the client. */
  payerName?: string | null;
  /** The transfer's or the postal order's number. Required unless cash. */
  reference?: string | null;
  place?: string | null;
  collectorKind?: CollectorKind;
  /** People's row, for a collector who is not the office. */
  collectorStaffId?: string | null;
  /** The dues to settle, in this order. Left out: the oldest open ones first. */
  dueIds?: readonly string[];
  /** A receipt printed blank for a collector, now filled in. Left out, a cash payment gets a new one. */
  receiptId?: string | null;
  /** The scan of the transfer slip, saved before the action (`saveManagedUpload`). */
  proofUrl?: string | null;
  note?: string | null;
  confirmedClockJump?: boolean;
}

export interface RecordedPayment {
  id: string;
  receiptId: string | null;
  receiptNumber: string | null;
  stampDuty: number;
  totalReceived: number;
  /** What went onto dues, and what stays as the file's credit. */
  allocated: number;
  credit: number;
}

const text = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);

async function isVoided(ex: Executor, column: "paymentId" | "receiptId", id: string): Promise<boolean> {
  const event = await ex
    .selectFrom("LegalEvent")
    .select("id")
    .where(column, "=", id)
    .where("type", "in", ["VOIDED", "MISSING"])
    .executeTakeFirst();
  return event !== undefined;
}

export async function recordPayment(
  ex: Executor,
  ctx: ServiceContext,
  input: RecordPaymentInput,
): Promise<RecordedPayment> {
  // The capability is the gate, not the section: reception and administration take payments at the desk.
  requireCapability(ctx, "payment.record");
  if (ctx.userId === null) throw new Error("money: a payment is recorded by somebody");
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) {
    throw new Error(`money: unknown payment method ${input.method}`);
  }
  const collectorKind = input.collectorKind ?? "OFFICE";
  if (!(COLLECTOR_KINDS as readonly string[]).includes(collectorKind)) {
    throw new Error(`money: unknown collector ${collectorKind}`);
  }

  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new ServiceError("An amount must be more than zero.");
  }
  if (!isIsoDate(input.receivedDate)) throw new ServiceError("Enter a valid date.");
  if (input.receivedDate > ctx.today) throw new ServiceError("A payment cannot be dated after today.");
  const cash = input.method === "CASH";
  const reference = text(input.reference);
  if (!cash && !reference) throw new ServiceError("A transfer needs its reference number.");
  const collectorStaffId = collectorKind === "OFFICE" ? null : text(input.collectorStaffId);
  if (collectorKind !== "OFFICE" && !collectorStaffId) throw new ServiceError("Choose who collected the money.");

  const file = await readFileBilling(ex, input.fileId);
  if (!file) throw new ServiceError("This file does not exist.");
  const party = await readFileParty(ex, file);

  // ── Which dues it settles ──
  const open = (
    await ex
      .selectFrom("PaymentDue")
      .leftJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
      .select([
        "PaymentDue.id",
        "PaymentDue.seq",
        "PaymentDue.dueDate",
        "PaymentDue.amount",
        "PaymentDue.paidAmount",
        "Invoice.number as invoiceNumber",
      ])
      .where("PaymentDue.fileId", "=", file.id)
      .where("PaymentDue.cancelledAt", "is", null)
      .orderBy("PaymentDue.dueDate")
      .orderBy("PaymentDue.seq")
      .execute()
  ).filter((due) => due.amount - due.paidAmount > 0);
  let targets = open;
  if (input.dueIds && input.dueIds.length > 0) {
    targets = [];
    for (const dueId of new Set(input.dueIds)) {
      const due = open.find((candidate) => candidate.id === dueId);
      if (!due) throw new ServiceError("This due is not one of the file's open dues.");
      targets.push(due);
    }
  }
  const allocations: { dueId: string; amount: number; invoiceNumber: string | null }[] = [];
  let left = input.amount;
  for (const due of targets) {
    if (left <= 0) break;
    const part = Math.min(left, due.amount - due.paidAmount);
    allocations.push({ dueId: due.id, amount: part, invoiceNumber: due.invoiceNumber });
    left -= part;
  }

  // ── Cash: the stamp and the receipt ──
  const duty = cash ? stampDuty(input.amount, await readStampSettings(ex)) : 0;
  const totalReceived = input.amount + duty;
  let receipt: { id: string; number: string } | null = null;
  if (cash) {
    await assertClockSane(ex, ctx, { confirmedJump: input.confirmedClockJump });
    if (input.receiptId) {
      const blank = await ex
        .selectFrom("Receipt")
        .select(["id", "number"])
        .where("id", "=", input.receiptId)
        .executeTakeFirst();
      if (!blank) throw new ServiceError("This receipt does not exist.");
      const used = await ex.selectFrom("Payment").select("id").where("receiptId", "=", blank.id).executeTakeFirst();
      if (used || (await isVoided(ex, "receiptId", blank.id))) {
        throw new ServiceError("This receipt was already used or voided.");
      }
      receipt = blank;
    } else {
      const next = await peekLegalNumber(ex, ctx, "RECEIPT", { date: ctx.today });
      receipt = { id: newId(), number: next.display };
      await appendChained(ex, ctx, "Receipt", {
        id: receipt.id,
        numberSeq: next.seq,
        numberYear: next.year,
        number: next.display,
        // The day it is printed and takes its number: today, whatever day the money came in.
        issueDate: ctx.today,
        batchId: null,
        collectorKind,
        collectorStaffId,
        fileId: file.id,
        branchId: file.branchId,
        sellerSnapshot: JSON.stringify(await readSeller(ex)),
        createdAt: ctx.now,
        createdByUserId: ctx.userId,
      });
    }
  } else if (input.receiptId) {
    throw new Error("money: only a cash payment has a receipt");
  }

  // What the receipt says the money is for: the invoices it settles, else the file.
  const invoiceNumbers = [...new Set(allocations.flatMap((part) => (part.invoiceNumber ? [part.invoiceNumber] : [])))];
  const receiptReason = invoiceNumbers.length
    ? `تسديد الفاتورة رقم ${invoiceNumbers.join("، ")}`
    : `تسديد أتعاب الملف رقم ${file.number}`;

  const paymentId = newId();
  const proofUrl = text(input.proofUrl);
  await appendChained(ex, ctx, "Payment", {
    id: paymentId,
    fileId: file.id,
    clientId: party.clientId,
    division: file.division,
    branchId: file.branchId,
    receivedDate: input.receivedDate,
    method: input.method,
    amount: input.amount,
    stampDuty: duty,
    totalReceived,
    reference,
    payerName: text(input.payerName) ?? text(file.payerName) ?? party.clientName,
    place: text(input.place) ?? text(file.paymentPlace) ?? (await getSetting(ex, "centre.city")),
    collectorKind,
    collectorStaffId,
    receiptId: receipt?.id ?? null,
    amountWordsAr: cash ? amountInWordsAr(totalReceived) : null,
    amountWordsFr: cash ? amountInWordsFr(totalReceived) : null,
    receiptReason: cash ? receiptReason : null,
    proofUrl,
    note: text(input.note),
    enteredByUserId: ctx.userId,
    enteredAt: ctx.now,
    createdAt: ctx.now,
  });
  if (proofUrl) await linkUpload(ex, ctx, proofUrl, paymentId);
  for (const part of allocations) {
    await appendChained(ex, ctx, "PaymentAllocation", {
      id: newId(),
      paymentId,
      dueId: part.dueId,
      amount: part.amount,
      reversesAllocationId: null,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
  }

  await logCollect(ex, ctx, {
    owner: "MONEY",
    action: "CREATE",
    entity: "Payment",
    entityId: paymentId,
    entityLabel: receipt?.number ?? reference ?? file.number,
    subject: { kind: "CLIENT", id: party.clientId, label: party.clientName },
    context: { file: file.number, method: input.method, amount: input.amount },
  });
  await emit(ex, ctx, "payment.recorded", { paymentId });
  const allocated = input.amount - left;
  return {
    id: paymentId,
    receiptId: receipt?.id ?? null,
    receiptNumber: receipt?.number ?? null,
    stampDuty: duty,
    totalReceived,
    allocated,
    credit: left,
  };
}

// ── Voiding ──────────────────────────────────────────────────────────────────

/**
 * Voids a payment recorded by mistake: its allocations are reversed (the dues
 * are owed again), then the payment is marked void, then its receipt. Nothing
 * is erased: the receipt's number stays in the sequence, printed «ملغى».
 */
export async function voidPayment(
  ex: Executor,
  ctx: ServiceContext,
  input: { paymentId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  requireCapability(ctx, "payment.void");
  if (ctx.userId === null) throw new Error("money: a payment is voided by somebody");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const payment = await ex
    .selectFrom("Payment")
    .select(["id", "clientId", "receiptId", "reference"])
    .where("id", "=", input.paymentId)
    .executeTakeFirst();
  if (!payment) throw new ServiceError("This payment does not exist.");
  if (await isVoided(ex, "paymentId", payment.id)) throw new ServiceError("This payment is already voided.");

  const allocations = await ex
    .selectFrom("PaymentAllocation")
    .select(["id", "dueId", "amount"])
    .where("paymentId", "=", payment.id)
    .where("reversesAllocationId", "is", null)
    .orderBy("chainSeq")
    .execute();
  for (const allocation of allocations) {
    await appendChained(ex, ctx, "PaymentAllocation", {
      id: newId(),
      paymentId: payment.id,
      dueId: allocation.dueId,
      amount: -allocation.amount,
      reversesAllocationId: allocation.id,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
  }
  const event = (subject: { paymentId: string | null; receiptId: string | null }) =>
    appendChained(ex, ctx, "LegalEvent", {
      id: newId(),
      invoiceId: null,
      ...subject,
      type: "VOIDED",
      reason,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
  await event({ paymentId: payment.id, receiptId: null });
  if (payment.receiptId) await event({ paymentId: null, receiptId: payment.receiptId });

  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "VOID",
    reason,
    entity: "Payment",
    entityId: payment.id,
    entityLabel: payment.reference ?? undefined,
    subject: { kind: "CLIENT", id: payment.clientId },
  });
  await emit(ex, ctx, "payment.voided", { paymentId: payment.id });
  return { id: payment.id };
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface PaymentListRow {
  id: string;
  receivedDate: LocalDate;
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division;
  method: PaymentMethod;
  amount: number;
  stampDuty: number;
  totalReceived: number;
  payerName: string;
  reference: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  voided: boolean;
}

export interface PaymentListFilter {
  from?: LocalDate | null;
  to?: LocalDate | null;
  fileId?: string | null;
}

/** The payments recorded, the latest first. `from` and `to` are the days the money was received, both included. */
export async function listPayments(
  ex: Executor,
  ctx: ServiceContext,
  input: PaymentListFilter = {},
): Promise<PaymentListRow[]> {
  requireSection(ctx, "MONEY", "READ");
  return readPaymentList(ex, input);
}

/** The list without the section check, for a reader that checked its own way (a file's part «التسديد»). */
export async function readPaymentList(ex: Executor, input: PaymentListFilter): Promise<PaymentListRow[]> {
  let rows = ex
    .selectFrom("Payment")
    .innerJoin("File", "File.id", "Payment.fileId")
    .innerJoin("Client", "Client.id", "Payment.clientId")
    .leftJoin("Receipt", "Receipt.id", "Payment.receiptId")
    .leftJoin("LegalEvent", (join) =>
      join.onRef("LegalEvent.paymentId", "=", "Payment.id").on("LegalEvent.type", "=", "VOIDED"),
    )
    .select([
      "Payment.id",
      "Payment.receivedDate",
      "Payment.fileId",
      "File.number as fileNumber",
      "Client.name as clientName",
      "Payment.division",
      "Payment.method",
      "Payment.amount",
      "Payment.stampDuty",
      "Payment.totalReceived",
      "Payment.payerName",
      "Payment.reference",
      "Payment.receiptId",
      "Receipt.number as receiptNumber",
      "LegalEvent.id as voidId",
    ])
    .orderBy("Payment.receivedDate", "desc")
    .orderBy("Payment.chainSeq", "desc");
  if (input.from) rows = rows.where("Payment.receivedDate", ">=", input.from);
  if (input.to) rows = rows.where("Payment.receivedDate", "<=", input.to);
  if (input.fileId) rows = rows.where("Payment.fileId", "=", input.fileId);
  return (await rows.execute()).map((row) => ({
    id: row.id,
    receivedDate: row.receivedDate as LocalDate,
    fileId: row.fileId,
    fileNumber: row.fileNumber,
    clientName: row.clientName,
    division: (DIVISIONS as readonly string[]).includes(row.division) ? (row.division as Division) : "HOUSING",
    method: row.method as PaymentMethod,
    amount: row.amount,
    stampDuty: row.stampDuty,
    totalReceived: row.totalReceived,
    payerName: row.payerName,
    reference: row.reference,
    receiptId: row.receiptId,
    receiptNumber: row.receiptNumber,
    voided: row.voidId !== null,
  }));
}

export interface PayableFile {
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division;
  methods: PaymentMethod[];
  payerName: string | null;
  remaining: number;
  dues: {
    id: string;
    dueDate: LocalDate;
    periodStart: LocalDate | null;
    periodEnd: LocalDate | null;
    invoiceNumber: string | null;
    remaining: number;
  }[];
}

/** The files that owe something, with their open dues oldest first: what the payment form offers. */
export async function listPayableFiles(ex: Executor, ctx: ServiceContext): Promise<PayableFile[]> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  const rows = await ex
    .selectFrom("PaymentDue")
    .innerJoin("File", "File.id", "PaymentDue.fileId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .leftJoin("Invoice", "Invoice.id", "PaymentDue.invoiceId")
    .select([
      "PaymentDue.id",
      "PaymentDue.fileId",
      "PaymentDue.dueDate",
      "PaymentDue.periodStart",
      "PaymentDue.periodEnd",
      "PaymentDue.amount",
      "PaymentDue.paidAmount",
      "Invoice.number as invoiceNumber",
      "File.number as fileNumber",
      "File.division",
      "File.paymentMethods",
      "File.payerName",
      "Client.name as clientName",
    ])
    .where("PaymentDue.cancelledAt", "is", null)
    .whereRef("PaymentDue.paidAmount", "<", "PaymentDue.amount")
    .where("File.deletedAt", "is", null)
    .orderBy("PaymentDue.dueDate")
    .orderBy("PaymentDue.seq")
    .execute();

  const files = new Map<string, PayableFile>();
  for (const row of rows) {
    let file = files.get(row.fileId);
    if (!file) {
      const methods = parseCodes(row.paymentMethods).filter((code): code is PaymentMethod =>
        (PAYMENT_METHODS as readonly string[]).includes(code),
      );
      file = {
        fileId: row.fileId,
        fileNumber: row.fileNumber,
        clientName: row.clientName,
        division: row.division as Division,
        methods,
        payerName: row.payerName,
        remaining: 0,
        dues: [],
      };
      files.set(row.fileId, file);
    }
    const remaining = row.amount - row.paidAmount;
    file.remaining += remaining;
    file.dues.push({
      id: row.id,
      dueDate: row.dueDate as LocalDate,
      periodStart: (row.periodStart as LocalDate | null) ?? null,
      periodEnd: (row.periodEnd as LocalDate | null) ?? null,
      invoiceNumber: row.invoiceNumber,
      remaining,
    });
  }
  return [...files.values()];
}

// ── Blank receipts for a collector ───────────────────────────────────────────

export interface IssueReceiptBatchInput {
  /** How many numbered blanks are printed. */
  count: number;
  collectorKind: CollectorKind;
  collectorStaffId?: string | null;
  confirmedClockJump?: boolean;
}

/** The most blanks handed out at once: a block a collector can account for at the end of his day. */
export const MAX_RECEIPT_BATCH = 50;

/**
 * Prints numbered receipts blank, for a collector who takes cash at a client's
 * door (#32). Each takes its number now, in the legal sequence, and stays
 * "with the collector" until a payment is typed in against it, or it is
 * declared unused or lost.
 */
export async function issueReceiptBatch(
  ex: Executor,
  ctx: ServiceContext,
  input: IssueReceiptBatchInput,
): Promise<{ batchId: string; receiptIds: string[]; firstNumber: string; lastNumber: string }> {
  requireCapability(ctx, "payment.record");
  if (ctx.userId === null) throw new Error("money: receipts are handed out by somebody");
  if (!(COLLECTOR_KINDS as readonly string[]).includes(input.collectorKind)) {
    throw new Error(`money: unknown collector ${input.collectorKind}`);
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_RECEIPT_BATCH) {
    throw new ServiceError("A block of receipts holds 1 to 50 receipts.");
  }
  const collectorStaffId = input.collectorKind === "OFFICE" ? null : text(input.collectorStaffId);
  if (input.collectorKind !== "OFFICE" && !collectorStaffId) throw new ServiceError("Choose who collected the money.");
  await assertClockSane(ex, ctx, { confirmedJump: input.confirmedClockJump });

  const batchId = newId();
  const first = await peekLegalNumber(ex, ctx, "RECEIPT", { date: ctx.today });
  await ex
    .insertInto("ReceiptBatch")
    .values({
      id: batchId,
      date: ctx.today,
      collectorKind: input.collectorKind,
      collectorStaffId,
      numberYear: first.year,
      firstNumber: first.seq,
      lastNumber: first.seq + input.count - 1,
      issuedByUserId: ctx.userId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .execute();

  const seller = JSON.stringify(await readSeller(ex));
  const receiptIds: string[] = [];
  let lastNumber = first.display;
  for (let index = 0; index < input.count; index += 1) {
    const next = await peekLegalNumber(ex, ctx, "RECEIPT", { date: ctx.today });
    const id = newId();
    await appendChained(ex, ctx, "Receipt", {
      id,
      numberSeq: next.seq,
      numberYear: next.year,
      number: next.display,
      issueDate: ctx.today,
      batchId,
      collectorKind: input.collectorKind,
      collectorStaffId,
      fileId: null,
      branchId: ctx.branchId,
      sellerSnapshot: seller,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
    receiptIds.push(id);
    lastNumber = next.display;
  }
  return { batchId, receiptIds, firstNumber: first.display, lastNumber };
}

// ── The receipt ──────────────────────────────────────────────────────────────

export interface ReceiptSheet {
  id: string;
  paymentId: string | null;
  receipt: CashReceiptData;
}

/** A cash receipt as it was written, for its sheet: blank while no payment points at it, void when its event says so. */
export async function getReceiptSheet(
  ex: Executor,
  ctx: ServiceContext,
  input: { receiptId: string },
): Promise<ReceiptSheet> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  const receipt = await ex.selectFrom("Receipt").selectAll().where("id", "=", input.receiptId).executeTakeFirst();
  if (!receipt) throw new ServiceError("This receipt does not exist.");
  const payment = await ex.selectFrom("Payment").selectAll().where("receiptId", "=", receipt.id).executeTakeFirst();
  const ended = await ex
    .selectFrom("LegalEvent")
    .select(["reason", "createdAt"])
    .where("receiptId", "=", receipt.id)
    .where("type", "in", ["VOIDED", "MISSING"])
    .executeTakeFirst();
  // A receipt printed blank has no file of its own: it is its payment's, once one was typed in against it.
  const fileId = receipt.fileId ?? payment?.fileId ?? null;
  const file = fileId
    ? await ex
        .selectFrom("File")
        .innerJoin("Client", "Client.id", "File.clientId")
        .select(["File.number", "Client.name"])
        .where("File.id", "=", fileId)
        .executeTakeFirst()
    : undefined;
  const collector = receipt.collectorStaffId
    ? await ex
        .selectFrom("StaffMember")
        .select(["firstName", "lastName", "number"])
        .where("id", "=", receipt.collectorStaffId)
        .executeTakeFirst()
    : undefined;
  const cashier = await ex
    .selectFrom("User")
    .select("displayName")
    .where("id", "=", payment?.enteredByUserId ?? receipt.createdByUserId)
    .executeTakeFirst();
  const collectorKind = (COLLECTOR_KINDS as readonly string[]).includes(receipt.collectorKind)
    ? (receipt.collectorKind as CollectorKind)
    : "OFFICE";

  return {
    id: receipt.id,
    paymentId: payment?.id ?? null,
    receipt: {
      number: receipt.number,
      issueDate: receipt.issueDate,
      seller: JSON.parse(receipt.sellerSnapshot) as SellerSnapshot,
      fileNumber: file?.number ?? null,
      clientName: file?.name ?? null,
      collectorKind,
      collectorName: collector ? `${collector.lastName} ${collector.firstName}` : (cashier?.displayName ?? ""),
      collectorNumber: collector?.number ?? null,
      payment: payment
        ? {
            payerName: payment.payerName,
            amount: payment.amount,
            stampDuty: payment.stampDuty,
            total: payment.totalReceived,
            amountWordsAr: payment.amountWordsAr ?? "",
            amountWordsFr: payment.amountWordsFr ?? "",
            reason: payment.receiptReason ?? "",
          }
        : null,
      stampScaleNote: stampScaleNote(await readStampSettings(ex)),
      voided: ended ? { date: ctx.toLocal(ended.createdAt).date, reason: ended.reason ?? "" } : null,
    },
  };
}

/** The receipt went to paper: a `PRINTED` event on its chain, and the disclosure the law asks for. */
export async function recordReceiptPrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { receiptId: string },
): Promise<{ id: string }> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  if (ctx.userId === null) throw new Error("money: a sheet is printed by somebody");
  const receipt = await ex
    .selectFrom("Receipt")
    .select(["id", "number"])
    .where("id", "=", input.receiptId)
    .executeTakeFirst();
  if (!receipt) throw new ServiceError("This receipt does not exist.");
  const payment = await ex
    .selectFrom("Payment")
    .select("clientId")
    .where("receiptId", "=", receipt.id)
    .executeTakeFirst();
  await appendChained(ex, ctx, "LegalEvent", {
    id: newId(),
    invoiceId: null,
    paymentId: null,
    receiptId: receipt.id,
    type: "PRINTED",
    reason: null,
    createdAt: ctx.now,
    createdByUserId: ctx.userId,
  });
  await logDisclose(ex, ctx, {
    owner: "MONEY",
    action: "PRINT",
    entity: "Receipt",
    entityId: receipt.id,
    entityLabel: receipt.number,
    subject: payment ? { kind: "CLIENT", id: payment.clientId } : undefined,
    disclosure: "PRINT",
  });
  return { id: receipt.id };
}

// ── A block of blank receipts ────────────────────────────────────────────────

export interface Collector {
  id: string;
  kind: "EMPLOYEE" | "WORKER";
  number: string;
  name: string;
}

/**
 * Who may be handed a block of blank receipts: the centre's employees and its
 * workers on file who have not left (People's rows, read only). His
 * regulations, article 12, allow a worker to take money only when authorised:
 * the block is that authorisation, on paper.
 */
export async function listCollectors(ex: Executor, ctx: ServiceContext): Promise<Collector[]> {
  requireCapability(ctx, "payment.record");
  const rows = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number", "firstName", "lastName"])
    .where("deletedAt", "is", null)
    .where("kind", "in", ["EMPLOYEE", "WORKER"])
    .where("engagementStatus", "in", ["ON_TRIAL", "ACCEPTED"])
    .orderBy("kind")
    .orderBy("numberSeq")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind === "WORKER" ? "WORKER" : "EMPLOYEE",
    number: row.number,
    name: `${row.lastName} ${row.firstName}`,
  }));
}

export interface ReceiptBatchSheet {
  batchId: string;
  firstNumber: string;
  lastNumber: string;
  receipts: ReceiptSheet[];
}

/** The receipts of a block, in their numbers' order, each as its own sheet shows it. */
export async function getReceiptBatch(
  ex: Executor,
  ctx: ServiceContext,
  input: { batchId: string },
): Promise<ReceiptBatchSheet> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  const batch = await ex.selectFrom("ReceiptBatch").select("id").where("id", "=", input.batchId).executeTakeFirst();
  if (!batch) throw new ServiceError("This receipt does not exist.");
  const ids = await ex
    .selectFrom("Receipt")
    .select("id")
    .where("batchId", "=", batch.id)
    .orderBy("numberSeq")
    .execute();
  const receipts: ReceiptSheet[] = [];
  for (const { id } of ids) receipts.push(await getReceiptSheet(ex, ctx, { receiptId: id }));
  return {
    batchId: batch.id,
    firstNumber: receipts[0]?.receipt.number ?? "",
    lastNumber: receipts.at(-1)?.receipt.number ?? "",
    receipts,
  };
}

/** The block went to paper: each of its receipts is recorded as printed. */
export async function recordReceiptBatchPrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { batchId: string },
): Promise<{ count: number }> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  const ids = await ex
    .selectFrom("Receipt")
    .select("id")
    .where("batchId", "=", input.batchId)
    .orderBy("numberSeq")
    .execute();
  if (ids.length === 0) throw new ServiceError("This receipt does not exist.");
  for (const { id } of ids) await recordReceiptPrinted(ex, ctx, { receiptId: id });
  return { count: ids.length };
}

// ── What the screens call ────────────────────────────────────────────────────

export const listPaymentsQuery = query(listPayments);
export const listPayableFilesQuery = query((ex: Executor, ctx: ServiceContext) => listPayableFiles(ex, ctx));
export const getReceiptSheetQuery = query(getReceiptSheet);
export const recordPaymentAction = action(recordPayment, { revalidate: [...MONEY_PATHS] });
export const issueReceiptBatchAction = action(issueReceiptBatch, { revalidate: [...MONEY_PATHS] });
export const voidPaymentAction = action(voidPayment, { revalidate: [...MONEY_PATHS] });
export const recordReceiptPrintedAction = action(recordReceiptPrinted);
export const getReceiptBatchQuery = query(getReceiptBatch);
export const listCollectorsQuery = query((ex: Executor, ctx: ServiceContext) => listCollectors(ex, ctx));
export const recordReceiptBatchPrintedAction = action(recordReceiptBatchPrinted);
