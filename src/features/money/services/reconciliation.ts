import { requireCapability, requireSection, can } from "@/lib/access/session";
import { requireBooks } from "@/lib/sync/books";
import { appendChained } from "@/lib/chain";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, money, type LocalDate } from "@/lib/units";

import { isIsoDate } from "../rules/dates";
import { COLLECTOR_KINDS, type CollectorKind } from "../validators/option-codes";

import { MONEY_PATHS, PAYMENTS_PATH } from "./paths";

/**
 * «المطابقة اليومية» (feature 32): at the end of a day, each collector's
 * receipts are accounted for, and the cash handed in is counted against them.
 *
 * A day of one collector holds the receipts of the blocks handed to him that
 * day, and, for the office, the receipts it wrote at the desk. Each receipt
 * ends in one of three ways: USED (a payment was typed in against it), VOIDED
 * (returned unused, or its payment was voided) or MISSING (lost). The cash
 * expected is what the used receipts say was received, stamp duty included.
 * Closing the day writes the reconciliation and its lines, final; a later
 * correction is a new row pointing at it, once.
 */

export const RECONCILIATION_OUTCOMES = ["USED", "VOIDED", "MISSING"] as const;
export type ReconciliationOutcome = (typeof RECONCILIATION_OUTCOMES)[number];

export interface CollectorKey {
  date: string;
  collectorKind: CollectorKind;
  collectorStaffId: string | null;
}

export interface ReconciliationReceipt {
  id: string;
  number: string;
  /** Null while the receipt is still blank and nobody said what became of it. */
  outcome: ReconciliationOutcome | null;
  paymentId: string | null;
  clientName: string | null;
  fileNumber: string | null;
  /** What the receipt says was received, stamp duty included. */
  total: number | null;
  /** Why it was voided or is missing, as typed. */
  reason: string | null;
}

export interface ClosedReconciliation {
  id: string;
  countedCash: number;
  expectedCash: number;
  difference: number;
  note: string | null;
  closedAt: string;
  closedBy: string;
}

export interface ReconciliationDay extends CollectorKey {
  date: LocalDate;
  collectorName: string | null;
  receipts: ReconciliationReceipt[];
  expectedCash: number;
  /** Receipts still to account for. */
  pending: number;
  closed: ClosedReconciliation | null;
}

const keyOf = (key: CollectorKey) => `${key.date}|${key.collectorKind}|${key.collectorStaffId ?? ""}`;

/** The receipts of the days asked, grouped by day and collector, each with what became of it. */
async function readDays(ex: Executor, filter: { from?: string; key?: CollectorKey }): Promise<ReconciliationDay[]> {
  let rows = ex
    .selectFrom("Receipt")
    .leftJoin("ReceiptBatch", "ReceiptBatch.id", "Receipt.batchId")
    .leftJoin("Payment", "Payment.receiptId", "Receipt.id")
    .leftJoin("File", "File.id", "Payment.fileId")
    .leftJoin("Client", "Client.id", "File.clientId")
    .select([
      "Receipt.id",
      "Receipt.number",
      "Receipt.numberSeq",
      "Receipt.issueDate",
      "Receipt.collectorKind",
      "Receipt.collectorStaffId",
      "ReceiptBatch.date as batchDate",
      "Payment.id as paymentId",
      "Payment.totalReceived",
      "File.number as fileNumber",
      "Client.name as clientName",
    ])
    .orderBy("Receipt.numberYear")
    .orderBy("Receipt.numberSeq");
  if (filter.from) {
    const from = filter.from;
    rows = rows.where((eb) =>
      eb.or([eb("ReceiptBatch.date", ">=", localDate(from)), eb("Receipt.issueDate", ">=", localDate(from))]),
    );
  }
  const receipts = await rows.execute();
  if (receipts.length === 0) return [];

  const events = await ex
    .selectFrom("LegalEvent")
    .select(["receiptId", "type", "reason"])
    .where(
      "receiptId",
      "in",
      receipts.map((row) => row.id),
    )
    .where("type", "in", ["VOIDED", "MISSING"])
    .execute();
  const eventOf = new Map(events.map((event) => [event.receiptId, event]));

  const days = new Map<string, ReconciliationDay>();
  for (const row of receipts) {
    const key: CollectorKey = {
      date: row.batchDate ?? row.issueDate,
      collectorKind: (COLLECTOR_KINDS as readonly string[]).includes(row.collectorKind)
        ? (row.collectorKind as CollectorKind)
        : "OFFICE",
      collectorStaffId: row.collectorStaffId,
    };
    if (filter.key && keyOf(filter.key) !== keyOf(key)) continue;
    const id = keyOf(key);
    if (!days.has(id)) {
      days.set(id, {
        ...key,
        date: localDate(key.date),
        collectorName: null,
        receipts: [],
        expectedCash: 0,
        pending: 0,
        closed: null,
      });
    }
    const day = days.get(id);
    if (!day) continue;
    const event = eventOf.get(row.id);
    // A voided payment voids its receipt too: the event decides before the payment does.
    const outcome: ReconciliationOutcome | null = event
      ? (event.type as ReconciliationOutcome)
      : row.paymentId
        ? "USED"
        : null;
    day.receipts.push({
      id: row.id,
      number: row.number,
      outcome,
      paymentId: row.paymentId,
      clientName: row.clientName,
      fileNumber: row.fileNumber,
      total: row.totalReceived,
      reason: event?.reason ?? null,
    });
    if (outcome === "USED") day.expectedCash += row.totalReceived ?? 0;
    if (outcome === null) day.pending += 1;
  }

  const list = [...days.values()];
  const staffIds = [...new Set(list.map((day) => day.collectorStaffId).filter((id): id is string => id !== null))];
  const staff = staffIds.length
    ? await ex.selectFrom("StaffMember").select(["id", "firstName", "lastName"]).where("id", "in", staffIds).execute()
    : [];
  const closings = await ex
    .selectFrom("CashReconciliation")
    .innerJoin("User", "User.id", "CashReconciliation.closedByUserId")
    .select([
      "CashReconciliation.id",
      "CashReconciliation.date",
      "CashReconciliation.collectorKind",
      "CashReconciliation.collectorStaffId",
      "CashReconciliation.countedCash",
      "CashReconciliation.expectedCash",
      "CashReconciliation.difference",
      "CashReconciliation.note",
      "CashReconciliation.closedAt",
      "CashReconciliation.correctsReconciliationId",
      "User.displayName",
    ])
    .orderBy("CashReconciliation.createdAt")
    .execute();
  for (const day of list) {
    const person = staff.find((each) => each.id === day.collectorStaffId);
    day.collectorName = person ? `${person.lastName} ${person.firstName}` : null;
    // The latest word on the day: its correction when there is one.
    const own = closings.filter((row) => keyOf(row as unknown as CollectorKey) === keyOf(day));
    const latest = own.at(-1);
    day.closed = latest
      ? {
          id: latest.id,
          countedCash: latest.countedCash,
          expectedCash: latest.expectedCash,
          difference: latest.difference,
          note: latest.note,
          closedAt: latest.closedAt,
          closedBy: latest.displayName,
        }
      : null;
  }
  return list.sort((a, b) =>
    a.date === b.date ? (a.collectorName ?? "").localeCompare(b.collectorName ?? "") : a.date < b.date ? 1 : -1,
  );
}

/** The days of the last two months, and any older one still open: the reconciliation list. */
export async function listReconciliationDays(ex: Executor, ctx: ServiceContext): Promise<ReconciliationDay[]> {
  requireSection(ctx, "MONEY", "READ");
  const recent = await readDays(ex, {});
  const floor = localDate(`${ctx.today.slice(0, 7)}-01`);
  return recent.filter((day) => day.closed === null || day.date >= floor || day.pending > 0);
}

export async function getReconciliationDay(
  ex: Executor,
  ctx: ServiceContext,
  input: CollectorKey,
): Promise<ReconciliationDay> {
  if (!can(ctx, "payment.record")) requireSection(ctx, "MONEY", "READ");
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  const [day] = await readDays(ex, { key: input });
  if (!day) throw new ServiceError("No receipt was written on this day for this collector.");
  return day;
}

/**
 * Says what became of a blank receipt: returned unused (VOIDED) or lost
 * (MISSING). An event on the receipt's chain, with the reason typed; a
 * receipt a payment was typed against cannot be declared either.
 */
export async function declareReceipt(
  ex: Executor,
  ctx: ServiceContext,
  input: { receiptId: string; outcome: "VOIDED" | "MISSING"; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  requireCapability(ctx, "reconciliation.close");
  await requireBooks(ex, ctx);
  if (ctx.userId === null) throw new Error("money: a receipt is declared by somebody");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const receipt = await ex
    .selectFrom("Receipt")
    .select(["id", "number"])
    .where("id", "=", input.receiptId)
    .executeTakeFirst();
  if (!receipt) throw new ServiceError("This receipt does not exist.");
  const used = await ex.selectFrom("Payment").select("id").where("receiptId", "=", receipt.id).executeTakeFirst();
  const ended = await ex
    .selectFrom("LegalEvent")
    .select("id")
    .where("receiptId", "=", receipt.id)
    .where("type", "in", ["VOIDED", "MISSING"])
    .executeTakeFirst();
  if (used || ended) throw new ServiceError("This receipt was already used or voided.");
  const closed = await ex
    .selectFrom("CashReconciliationLine")
    .select("id")
    .where("receiptId", "=", receipt.id)
    .executeTakeFirst();
  if (closed) throw new ServiceError("This day is already closed.");

  await appendChained(ex, ctx, "LegalEvent", {
    id: newId(),
    invoiceId: null,
    paymentId: null,
    receiptId: receipt.id,
    type: input.outcome,
    reason,
    createdAt: ctx.now,
    createdByUserId: ctx.userId,
  });
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: input.outcome === "VOIDED" ? "VOID" : "CANCEL",
    reason,
    entity: "Receipt",
    entityId: receipt.id,
    entityLabel: receipt.number,
    context: { outcome: input.outcome },
  });
  return { id: receipt.id };
}

/**
 * Closes a collector's day: every receipt accounted for, the cash counted.
 * The difference is the counted cash less what the used receipts say; a
 * difference or a missing receipt needs a word. Final: a correction is a new
 * closing that points at this one (`corrects`), once.
 */
export async function closeReconciliation(
  ex: Executor,
  ctx: ServiceContext,
  input: CollectorKey & { countedCash: number; note?: string | null; corrects?: string | null },
): Promise<{ id: string; difference: number }> {
  requireSection(ctx, "MONEY", "WRITE");
  requireCapability(ctx, "reconciliation.close");
  await requireBooks(ex, ctx);
  if (ctx.userId === null) throw new Error("money: a day is closed by somebody");
  if (!Number.isSafeInteger(input.countedCash) || input.countedCash < 0) {
    throw new ServiceError("An amount cannot be negative.");
  }
  if (input.date > ctx.today) throw new ServiceError("A day cannot be closed before it has come.");
  const day = await getReconciliationDay(ex, ctx, input);
  if (day.pending > 0) throw new ServiceError("Say what became of every receipt before closing the day.");
  if (day.closed && !input.corrects) throw new ServiceError("This day is already closed.");
  if (input.corrects && day.closed?.id !== input.corrects) {
    throw new ServiceError("Only the last closing of a day can be corrected.");
  }
  const missing = day.receipts.filter((receipt) => receipt.outcome === "MISSING").length;
  const difference = input.countedCash - day.expectedCash;
  const note = input.note?.trim() || null;
  if ((difference !== 0 || missing > 0) && !note) {
    throw new ServiceError("Say why the cash differs or a receipt is missing.");
  }

  const id = newId();
  await ex
    .insertInto("CashReconciliation")
    .values({
      id,
      date: day.date,
      collectorKind: day.collectorKind,
      collectorStaffId: day.collectorStaffId,
      receiptsIssued: day.receipts.length,
      receiptsUsed: day.receipts.filter((receipt) => receipt.outcome === "USED").length,
      receiptsVoided: day.receipts.filter((receipt) => receipt.outcome === "VOIDED").length,
      receiptsMissing: missing,
      expectedCash: money(day.expectedCash),
      countedCash: money(input.countedCash),
      difference: money(difference),
      note,
      correctsReconciliationId: input.corrects ?? null,
      branchId: ctx.branchId,
      closedByUserId: ctx.userId,
      closedAt: ctx.now,
      createdAt: ctx.now,
    })
    .execute();
  for (const receipt of day.receipts) {
    await ex
      .insertInto("CashReconciliationLine")
      .values({
        id: newId(),
        reconciliationId: id,
        receiptId: receipt.id,
        outcome: receipt.outcome ?? "MISSING",
        paymentId: receipt.outcome === "USED" ? receipt.paymentId : null,
        createdAt: ctx.now,
      })
      .execute();
  }
  // The blocks of the day are back with the office.
  await ex
    .updateTable("ReceiptBatch")
    .set({ returnedAt: ctx.now, updatedAt: ctx.now })
    .where("date", "=", day.date)
    .where("collectorKind", "=", day.collectorKind)
    .where((eb) =>
      day.collectorStaffId === null
        ? eb("collectorStaffId", "is", null)
        : eb("collectorStaffId", "=", day.collectorStaffId),
    )
    .where("returnedAt", "is", null)
    .execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "CREATE",
    entity: "CashReconciliation",
    entityId: id,
    entityLabel: day.date,
    context: {
      collectorKind: day.collectorKind,
      receipts: day.receipts.length,
      missing,
      corrects: input.corrects ?? null,
    },
  });
  return { id, difference };
}

/** The blank receipts of a day before today that nobody accounted for: the `receipts.unreconciled` tile. */
export async function countUnreconciledReceipts(ex: Executor, ctx: ServiceContext): Promise<number> {
  const rows = await ex
    .selectFrom("Receipt")
    .innerJoin("ReceiptBatch", "ReceiptBatch.id", "Receipt.batchId")
    .select("Receipt.id")
    .where("ReceiptBatch.date", "<", ctx.today)
    .where(({ not, exists, selectFrom }) =>
      not(exists(selectFrom("Payment").select("Payment.id").whereRef("Payment.receiptId", "=", "Receipt.id"))),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.receiptId", "=", "Receipt.id")
            .where("LegalEvent.type", "in", ["VOIDED", "MISSING"]),
        ),
      ),
    )
    .execute();
  return rows.length;
}

// ── What the screens call ────────────────────────────────────────────────────

export const RECONCILIATION_PATH = `${PAYMENTS_PATH}/reconciliation`;

/** The address of one collector's day. */
export function reconciliationHref(day: CollectorKey): string {
  const params = new URLSearchParams({ date: day.date, kind: day.collectorKind });
  if (day.collectorStaffId) params.set("staff", day.collectorStaffId);
  return `${RECONCILIATION_PATH}?${params.toString()}`;
}
const REFRESH = [...MONEY_PATHS, RECONCILIATION_PATH] as const;

export const listReconciliationDaysQuery = query((ex: Executor, ctx: ServiceContext) =>
  listReconciliationDays(ex, ctx),
);
export const getReconciliationDayQuery = query(getReconciliationDay);
export const declareReceiptAction = action(declareReceipt, { revalidate: [...REFRESH] });
export const closeReconciliationAction = action(closeReconciliation, { revalidate: [...REFRESH] });
