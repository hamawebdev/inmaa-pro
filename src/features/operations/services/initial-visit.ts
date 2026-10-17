import { getAcceptedQuote } from "@/features/clients/services/exports";
import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, localTime, minutes, type LocalDate } from "@/lib/units";

import { isClockTime, isIsoDate } from "../rules/calendar";
import { settleVisitTeam } from "./assignment";
import { VISITS_PATH } from "./paths";
import { seatStandingMembers } from "./programme-changes";
import { readFileForScheduling } from "./upstream";

/**
 * The first deep clean of a contract (RULINGS item 3; CONTRACTS section 4, OPS-08): when the accepted quote holds
 * an INITIAL_JOB line, File › الزيارات offers one visit of origin INITIAL, its date chosen there. It is seated and
 * ordered as any visit; its sign-off makes Money's INITIAL_JOB due billable.
 */

export interface InitialVisitOffer {
  /** The accepted quote holds a first deep clean. */
  offered: boolean;
  visit: { id: string; number: string; visitDate: LocalDate; status: string } | null;
  /** What the form proposes for it: the arrival time and the team's size. */
  startTime: string | null;
  workersNeeded: number;
}

async function initialVisitOf(ex: Executor, fileId: string) {
  return ex
    .selectFrom("Visit")
    .select(["id", "number", "visitDate", "status"])
    .where("fileId", "=", fileId)
    .where("origin", "=", "INITIAL")
    .where("status", "!=", "CANCELLED")
    .executeTakeFirst();
}

export async function getInitialVisitOffer(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<InitialVisitOffer> {
  requireSection(ctx, "REQUESTS", "READ");
  const file = await readFileForScheduling(ex, input.fileId);
  if (!file) throw new ServiceError("This client file does not exist.");
  const quote = file.serviceType === "CONTRACT" ? await getAcceptedQuote(ex, ctx, { fileId: file.id }) : null;
  const visit = await initialVisitOf(ex, file.id);
  return {
    offered: (quote?.totals.INITIAL_JOB ?? 0) > 0,
    visit: visit ?? null,
    startTime: file.arrivalTime,
    workersNeeded: file.workersCount ?? 1,
  };
}

/** The first deep clean's visit, on the day chosen: numbered in its year, the standing team seated under the rules. */
export async function planInitialVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    fileId: string;
    date: string;
    startTime?: string | null;
    durationMin?: number | null;
    workersNeeded?: number | null;
  },
): Promise<{ visitId: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const file = await readFileForScheduling(ex, input.fileId);
  if (!file) throw new ServiceError("This client file does not exist.");
  if (file.stage !== "CONTRACTED" || file.closedAt)
    throw new ServiceError("Visits are made for a contracted file only.");
  const offer = await getInitialVisitOffer(ex, ctx, { fileId: file.id });
  if (!offer.offered) throw new ServiceError("This contract's accepted quote holds no first deep clean.");
  if (offer.visit) throw new ServiceError("The first deep clean is already planned.");
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date < ctx.today) throw new ServiceError("An extra visit is planned for today or later.");
  const startTime = input.startTime?.trim() || file.arrivalTime || "08:00";
  if (!isClockTime(startTime)) throw new ServiceError("Enter a time as HH:MM.");
  const durationMin = input.durationMin ?? 240;
  const workersNeeded = input.workersNeeded ?? file.workersCount ?? 1;
  for (const value of [durationMin, workersNeeded]) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ServiceError("A number must be a whole number of at least 1.");
  }
  const anyVisit = await ex
    .selectFrom("Visit")
    .select(["zoneId", "supervisorEmployeeId"])
    .where("fileId", "=", file.id)
    .orderBy("visitDate")
    .executeTakeFirst();
  const date = localDate(input.date);
  const number = await nextNumber(ex, ctx, "VISIT", { date });
  const id = newId();
  const values = {
    origin: "INITIAL",
    visitDate: date,
    plannedStartTime: localTime(startTime),
    plannedDurationMin: minutes(durationMin),
    workersNeeded,
    status: "AWAITING_CONFIRMATION",
  } as const;
  await ex
    .insertInto("Visit")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      fileId: file.id,
      fileSlotId: null,
      slotDate: null,
      ...values,
      zoneId: anyVisit?.zoneId ?? null,
      supervisorEmployeeId: anyVisit?.supervisorEmployeeId ?? null,
      statusChangedAt: ctx.now,
      statusChangedByUserId: ctx.userId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "Visit",
    entityId: id,
    entityLabel: number.display,
    changes: Object.fromEntries(Object.entries(values).map(([field, value]) => [field, [null, value] as const])),
    context: { cause: "INITIAL_JOB", file: file.number },
  });
  await seatStandingMembers(ex, ctx, id);
  await settleVisitTeam(ex, ctx, id);
  return { visitId: id, number: number.display };
}

export const getInitialVisitOfferQuery = query(getInitialVisitOffer);
export const planInitialVisitAction = action(planInitialVisit, {
  revalidate: (_data, input) => [VISITS_PATH, `/dashboard/files/${input.fileId}`],
});
