import { isDate } from "@/features/people/rules/dates";
import type { Executor } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate } from "@/lib/units";

/**
 * Days a closed pay run has paid (PEO-03). A run pays its own month only: a
 * check, an absence, a leave or a correction typed afterwards for a day of a
 * closed month would never reach a payslip, so it is refused, whether or not
 * the person had a payslip in that run. The run is the person's kind's and
 * branch's.
 */
export async function closedPayRunOn(
  ex: Executor,
  input: { staffId: string; from: string; to?: string },
): Promise<boolean> {
  const to = input.to ?? input.from;
  if (!isDate(input.from) || !isDate(to)) return false;
  const person = await ex
    .selectFrom("StaffMember")
    .select(["kind", "branchId"])
    .where("id", "=", input.staffId)
    .executeTakeFirst();
  if (!person) return false;
  const closed = await ex
    .selectFrom("PayRun")
    .select("id")
    .where("staffKind", "=", person.kind)
    .where("branchId", "=", person.branchId)
    .where("status", "=", "CLOSED")
    .where("periodStart", "<=", localDate(to))
    .where("periodEnd", ">=", localDate(input.from))
    .executeTakeFirst();
  return closed !== undefined;
}

/** Refuses a day, or a span of days, that a closed pay run has paid. */
export async function refuseClosedPayDay(
  ex: Executor,
  input: { staffId: string; from: string; to?: string },
): Promise<void> {
  if (await closedPayRunOn(ex, input)) {
    throw new ServiceError("This day is in a closed pay run: it can no longer be corrected.");
  }
}
