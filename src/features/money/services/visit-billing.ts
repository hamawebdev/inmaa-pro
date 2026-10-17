import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { money } from "@/lib/units";

import { syncDues } from "./dues";
import { MONEY_PATHS } from "./paths";

/**
 * «قرار الفوترة» (MON-05): the office's own decision on one visit, which wins over what Operations
 * reads of it (DESIGN.md, the coordinator's ruling: the billing decision is Money's `VisitBilling`).
 *
 *  - **Billed or not**, with the reason typed: a visit done that the centre agrees not to charge, or one
 *    the client made impossible that it charges after all.
 *  - **An extra visit's price**: a visit of origin EXTRA billed with an amount gets a due of its own
 *    (kind `EXTRA`), invoiced on its own line.
 *
 * A visit already on an invoice keeps the decision that invoice was issued with: the invoice is voided
 * first. The file's dues follow at once (`syncDues`).
 */

export interface VisitBillingInput {
  visitId: string;
  billable: boolean;
  reason: string;
  /** In centimes: the price of an extra visit that is billed. Ignored for any other visit. */
  amount?: number | null;
}

async function visitOf(ex: Executor, visitId: string) {
  const visit = await ex
    .selectFrom("Visit")
    .select(["id", "fileId", "origin", "number"])
    .where("id", "=", visitId)
    .executeTakeFirst();
  if (!visit) throw new ServiceError("This visit does not exist.");
  const onInvoice = await ex
    .selectFrom("InvoiceVisit")
    .select("InvoiceVisit.id")
    .where("InvoiceVisit.visitId", "=", visit.id)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.invoiceId", "=", "InvoiceVisit.invoiceId")
            .where("LegalEvent.type", "=", "VOIDED"),
        ),
      ),
    )
    .executeTakeFirst();
  if (onInvoice)
    throw new ServiceError("This visit is on an invoice: void the invoice before changing how it is billed.");
  return visit;
}

export async function setVisitBilling(
  ex: Executor,
  ctx: ServiceContext,
  input: VisitBillingInput,
): Promise<{ visitId: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  requireCapability(ctx, "invoice.issue");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const visit = await visitOf(ex, input.visitId);
  const priced = visit.origin === "EXTRA" && input.billable;
  const amount = priced ? (input.amount ?? null) : null;
  if (priced && (amount === null || !Number.isSafeInteger(amount) || amount <= 0)) {
    throw new ServiceError("Enter the price of this extra visit.");
  }

  const values = { billable: input.billable ? 1 : 0, reason, amount: amount === null ? null : money(amount) };
  const before = await ex.selectFrom("VisitBilling").selectAll().where("visitId", "=", visit.id).executeTakeFirst();
  if (before) {
    const { set, changes } = changedColumns(before, values);
    if (!changes) return { visitId: visit.id };
    await ex
      .updateTable("VisitBilling")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
    await logChange(ex, ctx, {
      owner: "MONEY",
      action: "UPDATE",
      entity: "VisitBilling",
      entityId: before.id,
      entityLabel: visit.number,
      changes,
      reason,
    });
  } else {
    const id = newId();
    await ex
      .insertInto("VisitBilling")
      .values({
        id,
        visitId: visit.id,
        ...values,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    await logChange(ex, ctx, {
      owner: "MONEY",
      action: "CREATE",
      entity: "VisitBilling",
      entityId: id,
      entityLabel: visit.number,
      context: values,
      reason,
    });
  }
  await syncDues(ex, ctx, { fileId: visit.fileId });
  return { visitId: visit.id };
}

/** Takes the office's decision back: the visit is billed again as Operations reads it. */
export async function clearVisitBilling(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<{ visitId: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  requireCapability(ctx, "invoice.issue");
  const visit = await visitOf(ex, input.visitId);
  const before = await ex.selectFrom("VisitBilling").selectAll().where("visitId", "=", visit.id).executeTakeFirst();
  if (!before) return { visitId: visit.id };
  await ex.deleteFrom("VisitBilling").where("id", "=", before.id).execute();
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "UPDATE",
    entity: "VisitBilling",
    entityId: before.id,
    entityLabel: visit.number,
    changes: { billable: [before.billable, null], amount: [before.amount, null] },
  });
  await syncDues(ex, ctx, { fileId: visit.fileId });
  return { visitId: visit.id };
}

// ── What the screens call ────────────────────────────────────────────────────

export const setVisitBillingAction = action(setVisitBilling, { revalidate: [...MONEY_PATHS] });
export const clearVisitBillingAction = action(clearVisitBilling, { revalidate: [...MONEY_PATHS] });
