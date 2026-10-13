import type { OnEvent } from "@/lib/events";
import type { Executor } from "@/lib/service/context";

import { syncDues } from "./services/dues";
import { postPayoutExpenses, removePayoutExpenses } from "./services/wages";

/**
 * What Money does when another owner's record changes
 * (docs/data-model/CONTRACTS.md section 4). Each handler runs inside the
 * emitter's transaction, after Operations where the contract says so (the
 * visits exist before the dues are counted from them), and never refuses: a
 * file whose terms are not all written simply has no dues yet.
 *
 *  - `file.contracted`: the due schedule is built from the file's terms (A7).
 *  - `file.termsChanged`: the dues nobody invoiced or paid follow the new terms.
 *  - `file.ended`: what was still to come after the day it ended is cancelled.
 *  - `visit.signedOff`, `visit.statusChanged`: a contract paid «بعد كل زيارة»
 *    has one due per visit, so its dues follow its visits; a signed-off visit
 *    is then ready to invoice (services/invoices.ts reads it as billable).
 *  - **A payout is recorded or voided** (People): its wage goes into the
 *    expenses on its day, split by the payslip's minutes per division, and
 *    comes out again when the payout is voided (services/wages.ts).
 */
async function fileOfVisit(ex: Executor, visitId: string): Promise<string | null> {
  const visit = await ex.selectFrom("Visit").select("fileId").where("id", "=", visitId).executeTakeFirst();
  return visit?.fileId ?? null;
}

export function registerEvents(on: OnEvent) {
  on("file.contracted", async (ex, ctx, { fileId }) => {
    await syncDues(ex, ctx, { fileId });
  });
  on("file.termsChanged", async (ex, ctx, { fileId }) => {
    await syncDues(ex, ctx, { fileId });
  });
  on("file.ended", async (ex, ctx, { fileId }) => {
    await syncDues(ex, ctx, { fileId });
  });
  on("visit.signedOff", async (ex, ctx, { visitId }) => {
    const fileId = await fileOfVisit(ex, visitId);
    if (fileId) await syncDues(ex, ctx, { fileId });
  });
  on("visit.statusChanged", async (ex, ctx, { visitId }) => {
    const fileId = await fileOfVisit(ex, visitId);
    if (fileId) await syncDues(ex, ctx, { fileId });
  });
  on("payout.recorded", async (ex, ctx, { staffPayoutId }) => {
    await postPayoutExpenses(ex, ctx, { staffPayoutId });
  });
  on("payout.voided", async (ex, ctx, { staffPayoutId }) => {
    await removePayoutExpenses(ex, ctx, { staffPayoutId });
  });
}
