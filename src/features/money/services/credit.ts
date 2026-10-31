import { sql } from "kysely";

import { appendChained } from "@/lib/chain";
import { newId } from "@/lib/db/rows";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { holdsBooks } from "@/lib/sync/books/guard";

/**
 * A file's credit: money received that no due holds (RULINGS, INV-2).
 *
 * An invoice or a void can bring a due below what was already paid on it: a
 * missed visit comes off a month paid in advance; a VAT-exclusive invoice paid
 * in full is voided and its due falls back to the amount before tax. The
 * excess is never lost. In the same transaction it is taken off the due (each
 * live allocation reversed, the part the due still holds allocated again) and
 * moved to the file's next open dues, oldest first; what nothing can take
 * stays unallocated, the file's credit, shown on its part «التسديد», the debt
 * list and the reminder, and offered first to the next payment.
 *
 * An allocation is reversed once and whole (`PaymentAllocation_one_reversal`),
 * so moving part of one is a reversal and a new allocation of what stays.
 */

interface LiveAllocation {
  id: string;
  paymentId: string;
  dueId: string;
  amount: number;
}

/** The voided payments of a file: their money is nobody's credit. */
async function voidedPayments(ex: Executor, fileId: string): Promise<Set<string>> {
  const rows = await ex
    .selectFrom("LegalEvent")
    .innerJoin("Payment", "Payment.id", "LegalEvent.paymentId")
    .select("Payment.id")
    .where("Payment.fileId", "=", fileId)
    .where("LegalEvent.type", "=", "VOIDED")
    .execute();
  return new Set(rows.map((row) => row.id));
}

/** The allocations of a file that are in force: positive rows nobody reversed, the latest first. */
async function liveAllocations(ex: Executor, fileId: string): Promise<LiveAllocation[]> {
  return ex
    .selectFrom("PaymentAllocation")
    .innerJoin("PaymentDue", "PaymentDue.id", "PaymentAllocation.dueId")
    .select([
      "PaymentAllocation.id",
      "PaymentAllocation.paymentId",
      "PaymentAllocation.dueId",
      "PaymentAllocation.amount",
    ])
    .where("PaymentDue.fileId", "=", fileId)
    .where("PaymentAllocation.reversesAllocationId", "is", null)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("PaymentAllocation as Reversal")
            .select("Reversal.id")
            .whereRef("Reversal.reversesAllocationId", "=", "PaymentAllocation.id"),
        ),
      ),
    )
    .orderBy("PaymentAllocation.chainSeq", "desc")
    .execute();
}

/**
 * Allocations are written by somebody: an invoice, its void or a payment, never the program alone. When the
 * books' laptop moves them for a change made on the other laptop, they are that change's author's (`byUserId`).
 */
function author(ctx: ServiceContext, byUserId?: string | null): string {
  if (byUserId) return byUserId;
  if (ctx.userId === null) throw new Error("money: an allocation is moved by somebody");
  return ctx.userId;
}

async function allocate(
  ex: Executor,
  ctx: ServiceContext,
  row: { paymentId: string; dueId: string; amount: number; byUserId?: string | null },
) {
  await appendChained(ex, ctx, "PaymentAllocation", {
    id: newId(),
    paymentId: row.paymentId,
    dueId: row.dueId,
    amount: row.amount,
    reversesAllocationId: null,
    createdAt: ctx.now,
    createdByUserId: author(ctx, row.byUserId),
  });
}

async function reverse(ex: Executor, ctx: ServiceContext, allocation: LiveAllocation, byUserId?: string | null) {
  await appendChained(ex, ctx, "PaymentAllocation", {
    id: newId(),
    paymentId: allocation.paymentId,
    dueId: allocation.dueId,
    amount: -allocation.amount,
    reversesAllocationId: allocation.id,
    createdAt: ctx.now,
    createdByUserId: author(ctx, byUserId),
  });
}

/** What each live payment of the file has not placed on a due, the oldest payment first. */
async function unplaced(ex: Executor, fileId: string): Promise<{ paymentId: string; credit: number }[]> {
  const voided = await voidedPayments(ex, fileId);
  const payments = await ex
    .selectFrom("Payment")
    .select(["id", "amount"])
    .where("fileId", "=", fileId)
    .orderBy("chainSeq")
    .execute();
  if (payments.length === 0) return [];
  const placed = await ex
    .selectFrom("PaymentAllocation")
    .select(["paymentId", "amount"])
    .where(
      "paymentId",
      "in",
      payments.map((payment) => payment.id),
    )
    .execute();
  return payments
    .filter((payment) => !voided.has(payment.id))
    .map((payment) => ({
      paymentId: payment.id,
      credit:
        payment.amount - placed.filter((row) => row.paymentId === payment.id).reduce((sum, row) => sum + row.amount, 0),
    }))
    .filter((row) => row.credit > 0);
}

/** The file's credit: what its live payments hold that no due does. */
export async function fileCredit(ex: Executor, fileId: string): Promise<number> {
  return (await unplaced(ex, fileId)).reduce((sum, row) => sum + row.credit, 0);
}

/** The credit of several files at once, for a list. */
export async function filesCredit(ex: Executor, fileIds: readonly string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const fileId of new Set(fileIds)) {
    const credit = await fileCredit(ex, fileId);
    if (credit > 0) result.set(fileId, credit);
  }
  return result;
}

/** Places the file's credit on its open dues, the oldest first. Answers what is left unplaced. */
export async function settleCredit(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; byUserId?: string | null },
): Promise<number> {
  const credits = await unplaced(ex, input.fileId);
  if (credits.length === 0) return 0;
  const open = (
    await ex
      .selectFrom("PaymentDue")
      .select(["id", "amount", "paidAmount"])
      .where("fileId", "=", input.fileId)
      .where("cancelledAt", "is", null)
      .orderBy("dueDate")
      .orderBy("seq")
      .execute()
  )
    .map((due) => ({ id: due.id, room: due.amount - due.paidAmount }))
    .filter((due) => due.room > 0);
  let left = 0;
  for (const credit of credits) {
    let available = credit.credit;
    for (const due of open) {
      if (available <= 0) break;
      if (due.room <= 0) continue;
      const part = Math.min(available, due.room);
      await allocate(ex, ctx, { paymentId: credit.paymentId, dueId: due.id, amount: part, byUserId: input.byUserId });
      due.room -= part;
      available -= part;
    }
    left += available;
  }
  return left;
}

/**
 * Brings every due of the file back within its amount, then places the money
 * freed on the file's open dues. Called by an invoice and by its void, after
 * they changed the dues' amounts.
 */
export async function rebalanceFile(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; byUserId?: string | null },
): Promise<{ moved: number; credit: number }> {
  const over = (
    await ex
      .selectFrom("PaymentDue")
      .select(["id", "amount", "paidAmount"])
      .where("fileId", "=", input.fileId)
      .execute()
  ).filter((due) => due.paidAmount > due.amount);
  let moved = 0;
  if (over.length > 0) {
    const live = await liveAllocations(ex, input.fileId);
    for (const due of over) {
      let excess = due.paidAmount - Math.max(0, due.amount);
      for (const allocation of live.filter((row) => row.dueId === due.id)) {
        if (excess <= 0) break;
        const take = Math.min(allocation.amount, excess);
        await reverse(ex, ctx, allocation, input.byUserId);
        if (allocation.amount - take > 0) {
          await allocate(ex, ctx, {
            paymentId: allocation.paymentId,
            dueId: due.id,
            amount: allocation.amount - take,
            byUserId: input.byUserId,
          });
        }
        excess -= take;
        moved += take;
      }
    }
  }
  const credit = await settleCredit(ex, ctx, input);
  return { moved, credit };
}

/**
 * Two laptops (coordinator's ruling): a change made on the laptop without the
 * books (a programme cut, a cancelled due) cannot move allocations, which are
 * a legal chain. It leaves the due holding more than it asks for; the books'
 * laptop brings every such file back here, after applying the other laptop's
 * changes and at the start of its day. The moves are the author's of the
 * change that made them needed (the due's last editor). Idempotent: a file
 * already in order is not touched. Nothing on the laptop without the books.
 */
export async function rebalanceWaitingFiles(ex: Executor, ctx: ServiceContext): Promise<{ files: number }> {
  if (!(await holdsBooks(ex, ctx))) return { files: 0 };
  const rows = await ex
    .selectFrom("PaymentDue")
    .select(["fileId", "updatedByUserId", "createdByUserId", "updatedAt"])
    .where(sql<boolean>`"paidAmount" > MAX("amount", 0)`)
    .orderBy("fileId")
    .orderBy("updatedAt", "desc")
    .execute();
  const files = new Map<string, string | null>();
  for (const row of rows) {
    if (!files.has(row.fileId)) files.set(row.fileId, row.updatedByUserId ?? row.createdByUserId ?? null);
  }
  if (files.size === 0) return { files: 0 };
  // A due the program itself changed names nobody: the move is then the manager's, the centre's own account.
  const manager = await ex
    .selectFrom("User")
    .select("id")
    .where("roleId", "=", "MANAGER")
    .orderBy("createdAt")
    .limit(1)
    .executeTakeFirst();
  for (const [fileId, byUserId] of files) {
    await rebalanceFile(ex, ctx, { fileId, byUserId: byUserId ?? ctx.userId ?? manager?.id ?? null });
  }
  return { files: files.size };
}
