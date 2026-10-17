import { getPayoutForExpense } from "@/features/people/services/payouts";
import { newId } from "@/lib/db/rows";
import { logChange, logErase } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { localDate, money } from "@/lib/units";

import { shareByWeights } from "../rules/centimes";
import { EXPENSE_DIVISIONS, type ExpenseCategory, type ExpenseDivision } from "../validators/option-codes";

/**
 * Wages in the expenses (RULINGS.md, A1): an expense is money out, so a wage
 * is posted on the day of each payout, split over the divisions by the
 * minutes its payslip worked on each; the payout that completes a payslip
 * posts its contributions with it. Closing a pay run posts nothing.
 *
 * People's `payout.recorded` and `payout.voided` call these (../events.ts).
 * The rows are written with `source = PAYROLL` and point at the payout, so the
 * expenses screen shows them locked: a wage is corrected where it was paid.
 */

/** A total shared over the divisions by minutes; with no minutes to go by, it stays on «عام». */
function splitByMinutes(total: number, divisionMin: Record<string, number>): [ExpenseDivision, number][] {
  const lines = EXPENSE_DIVISIONS.map((division) => [division, Math.max(0, divisionMin[division] ?? 0)] as const);
  const weights = lines.map(([, minutes]) => minutes);
  if (weights.every((minutes) => minutes === 0)) return [["COMMON", total]];
  const shares = shareByWeights(total, weights);
  return lines.map(([division], index) => [division, shares[index]] as [ExpenseDivision, number]);
}

/** Posts the expense of a payout, once. A payout already posted, voided or unknown changes nothing. */
export async function postPayoutExpenses(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffPayoutId: string },
): Promise<{ created: number }> {
  const payout = await getPayoutForExpense(ex, ctx, input);
  if (!payout || payout.voided || payout.amount <= 0) return { created: 0 };
  const already = await ex
    .selectFrom("Expense")
    .select("id")
    .where("staffPayoutId", "=", payout.staffPayoutId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (already) return { created: 0 };

  const minutes = payout.payslip?.divisionMin ?? {};
  const lines: { division: ExpenseDivision; category: ExpenseCategory; amount: number; note: string }[] = [];
  const wageNote = payout.payslip?.number
    ? `أجرة، كشف الأجر رقم ${payout.payslip.number}`
    : payout.kind === "ADVANCE"
      ? "تسبيق على الأجر"
      : "دفع للعامل";
  for (const [division, amount] of splitByMinutes(payout.amount, minutes)) {
    lines.push({ division, category: "WAGES", amount, note: wageNote });
  }
  const contributions = payout.payslip?.contributions;
  // Once per payslip (MON-06): a payslip completed again, after an earlier part payment was voided and paid
  // anew, keeps the contributions its first completion posted. They go only with the payout that posted them.
  const posted =
    contributions && payout.payslip
      ? await ex
          .selectFrom("Expense")
          .innerJoin("StaffPayout", "StaffPayout.id", "Expense.staffPayoutId")
          .select("Expense.id")
          .where("StaffPayout.payslipId", "=", payout.payslip.id)
          .where("Expense.category", "in", ["CONTRIBUTIONS", "TAXES"])
          .where("Expense.deletedAt", "is", null)
          .executeTakeFirst()
      : undefined;
  if (contributions && !posted) {
    const social = contributions.employee + contributions.employer;
    for (const [division, amount] of splitByMinutes(social, minutes)) {
      lines.push({ division, category: "CONTRIBUTIONS", amount, note: "اشتراكات الضمان الاجتماعي" });
    }
    for (const [division, amount] of splitByMinutes(contributions.irg, minutes)) {
      lines.push({ division, category: "TAXES", amount, note: "الضريبة على الدخل الإجمالي" });
    }
  }

  let created = 0;
  for (const line of lines) {
    if (line.amount <= 0) continue;
    await ex
      .insertInto("Expense")
      .values({
        id: newId(),
        date: localDate(payout.date),
        division: line.division,
        category: line.category,
        amount: money(line.amount),
        // The wage is paid the way the payout says; contributions and tax are owed, not yet paid by a method.
        method: line.category === "WAGES" ? payout.method : null,
        paidTo: payout.staffName,
        recurrence: "NONE",
        source: "PAYROLL",
        staffPayoutId: payout.staffPayoutId,
        payRunId: payout.payslip?.payRunId ?? null,
        note: line.note,
        branchId: ctx.branchId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    created += 1;
  }
  if (created > 0) {
    await logChange(ex, ctx, {
      owner: "MONEY",
      action: "CREATE",
      entity: "Expense",
      entityId: payout.staffPayoutId,
      entityLabel: payout.number,
      context: { source: "PAYROLL", lines: created, completesPayslip: payout.payslip?.completes ?? false },
    });
  }
  return { created };
}

/** A voided payout takes its expenses with it: they stay, marked removed, with the reason. */
export async function removePayoutExpenses(
  ex: Executor,
  ctx: ServiceContext,
  input: { staffPayoutId: string },
): Promise<{ removed: number }> {
  const rows = await ex
    .selectFrom("Expense")
    .select("id")
    .where("staffPayoutId", "=", input.staffPayoutId)
    .where("deletedAt", "is", null)
    .execute();
  if (rows.length === 0) return { removed: 0 };
  const reason = "أُلغي الدفع الذي يمثله هذا المصروف";
  await ex
    .updateTable("Expense")
    .set({ deletedAt: ctx.now, deleteReason: reason, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("staffPayoutId", "=", input.staffPayoutId)
    .where("deletedAt", "is", null)
    .execute();
  await logErase(ex, ctx, {
    owner: "MONEY",
    action: "SOFT_DELETE",
    reason,
    entity: "Expense",
    entityId: input.staffPayoutId,
    context: { source: "PAYROLL", lines: rows.length },
  });
  return { removed: rows.length };
}
