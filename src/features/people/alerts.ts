import { CalendarClock, FileWarning, Hourglass, ShieldQuestion } from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";
import { addDays } from "@/lib/clock";
import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * People's alerts (DESIGN.md section 13): the home screen's tiles for what
 * waits on People.
 *
 *  - `sanction.pending`: questions «هل نسمح له أم لا؟» waiting for the
 *    manager. Only he answers, so only he sees the tile;
 *  - `document.expiry`: documents handed in that have expired, or expire
 *    within the lead time, of people still with the centre;
 *  - `trial.ending`: workers on trial whose trial ends within the lead time;
 *  - `staffContract.ending`: contracts of employment ending within the lead
 *    time.
 *
 * Each count is the list its tile opens. People who left are not counted.
 */

const WITH_THE_CENTRE = ["CANDIDATE", "ON_TRIAL", "ACCEPTED"];

export async function countPendingDecisions(ex: Executor): Promise<number> {
  const row = await ex
    .selectFrom("SanctionDecision")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("status", "=", "PENDING")
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export async function countDocumentsToRenew(
  ex: Executor,
  ctx: ServiceContext,
  input: { days: number },
): Promise<number> {
  const row = await ex
    .selectFrom("StaffDocument as d")
    .innerJoin("StaffMember as s", "s.id", "d.staffId")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("d.isCurrent", "=", 1)
    .where("d.delivered", "=", 1)
    .where("d.deletedAt", "is", null)
    .where("d.expiryDate", "is not", null)
    .where("d.expiryDate", "<=", addDays(ctx.today, input.days))
    .where("s.deletedAt", "is", null)
    .where("s.engagementStatus", "in", WITH_THE_CENTRE)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export async function countTrialsEnding(ex: Executor, ctx: ServiceContext, input: { days: number }): Promise<number> {
  // Each worker's last decision: a trial whose end is near, while she is still on trial.
  const decisions = await ex
    .selectFrom("HiringDecision as d")
    .innerJoin("StaffMember as s", "s.id", "d.staffId")
    .select(["d.staffId", "d.decision", "d.trialEndDate", "d.decisionDate", "d.createdAt"])
    .where("s.engagementStatus", "=", "ON_TRIAL")
    .where("s.deletedAt", "is", null)
    .orderBy("d.staffId")
    .orderBy("d.decisionDate")
    .orderBy("d.createdAt")
    .execute();
  const last = new Map<string, (typeof decisions)[number]>();
  for (const decision of decisions) last.set(decision.staffId, decision);
  const until = addDays(ctx.today, input.days);
  return [...last.values()].filter(
    (decision) =>
      decision.decision === "ACCEPTED_ON_TRIAL" && decision.trialEndDate !== null && decision.trialEndDate <= until,
  ).length;
}

export async function countContractsEnding(
  ex: Executor,
  ctx: ServiceContext,
  input: { days: number },
): Promise<number> {
  const row = await ex
    .selectFrom("StaffMember")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("deletedAt", "is", null)
    .where("engagementStatus", "in", WITH_THE_CENTRE)
    .where("contractEndDate", "is not", null)
    .where("contractEndDate", "<=", addDays(ctx.today, input.days))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export function registerAlerts(register: RegisterAlert) {
  register({
    key: "sanction.pending",
    section: "workers",
    severity: "danger",
    name: "SanctionPending",
    icon: ShieldQuestion,
    capability: "sanction.answer",
    route: "/dashboard/workers/sanctions",
    count: (ex) => countPendingDecisions(ex),
  });
  register({
    key: "document.expiry",
    section: "workers",
    severity: "warning",
    name: "DocumentExpiry",
    icon: FileWarning,
    leadSetting: "alerts.documentExpiryLeadDays",
    route: "/dashboard/workers?documents=TO_RENEW",
    count: (ex, ctx, { days }) => countDocumentsToRenew(ex, ctx, { days: days ?? 30 }),
  });
  register({
    key: "trial.ending",
    section: "workers",
    severity: "info",
    name: "TrialEnding",
    icon: Hourglass,
    leadSetting: "alerts.trialEndLeadDays",
    route: "/dashboard/workers?status=ON_TRIAL",
    count: (ex, ctx, { days }) => countTrialsEnding(ex, ctx, { days: days ?? 7 }),
  });
  register({
    key: "staffContract.ending",
    section: "employees",
    severity: "warning",
    name: "StaffContractEnding",
    icon: CalendarClock,
    leadSetting: "alerts.staffContractEndLeadDays",
    route: "/dashboard/employees?contract=ENDING",
    count: (ex, ctx, { days }) => countContractsEnding(ex, ctx, { days: days ?? 30 }),
  });
}
