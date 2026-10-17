import { closeFile } from "@/features/clients/services/files";
import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, localTime, minutes, type LocalDate, type LocalTime } from "@/lib/units";

import { isClockTime, isIsoDate } from "../rules/calendar";
import type { VisitStatus } from "../validators/option-codes";
import { OPEN_COMPLAINT_STATUSES } from "./complaints";
import { VISITS_PATH } from "./programme";

/**
 * What a signed-off visit may still call for (#15, #17).
 *
 *  - «هل تحتاج إلى زيارة إضافية؟ نعم» on the returned order: the visit is
 *    listed as a proposal until the office plans an extra visit from it
 *    (origin EXTRA, pointing back at it). Nothing is written at sign-off.
 *  - The last visit of an on-demand job: once nothing of the job is left to do,
 *    the job ends (`onDemandJobFinished`; Clients' `closeFile` with JOB_DONE).
 */

/** Origins of the visits an on-demand job is made of. */
const JOB_ORIGINS = ["ON_DEMAND", "MAKEUP", "REDO", "EXTRA"] as const;
/** A visit of the job in one of these is still to be done. */
const STILL_TO_DO: readonly VisitStatus[] = ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS"];

// ── Proposals ───────────────────────────────────────────────────────────────

/** A visit whose order asked for an extra visit that has not been planned. */
export interface ExtraVisitProposal {
  visitId: string;
  visitNumber: string;
  visitDate: LocalDate;
  plannedStartTime: LocalTime;
  plannedDurationMin: number;
  workersNeeded: number;
  fileId: string;
  fileNumber: string;
  division: string;
  siteName: string | null;
  siteAddress: string;
  clientName: string;
  /** What the order said: «حالة الإنجاز», the percentage, why it was not finished, the worker's notes. */
  completion: string | null;
  completionPercent: number | null;
  incompleteReason: string | null;
  workerNotes: string | null;
}

/** Visits whose returned order says an extra visit is needed and that no extra visit names yet, oldest first. */
export async function listExtraVisitProposals(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId?: string | null } = {},
): Promise<ExtraVisitProposal[]> {
  requireSection(ctx, "REQUESTS", "READ");
  let rows = ex
    .selectFrom("VisitReport")
    .innerJoin("Visit", "Visit.id", "VisitReport.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select([
      "Visit.id as visitId",
      "Visit.number as visitNumber",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.workersNeeded",
      "File.id as fileId",
      "File.number as fileNumber",
      "File.division",
      "Site.commonName as siteName",
      "Site.address as siteAddress",
      "Client.name as clientName",
      "VisitReport.completion",
      "VisitReport.completionPercent",
      "VisitReport.incompleteReason",
      "VisitReport.workerNotes",
    ])
    .where("VisitReport.needsExtraVisit", "=", 1)
    .where("File.deletedAt", "is", null)
    // The office said no: «لا حاجة لزيارة إضافية» is its decision on the visit.
    .where((eb) =>
      eb.or([eb("Visit.actionTaken", "is", null), eb("Visit.actionTaken", "not like", `${NO_EXTRA_VISIT}%`)]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("Visit as extra")
            .select("extra.id")
            .whereRef("extra.sourceVisitId", "=", "Visit.id")
            .where("extra.origin", "=", "EXTRA"),
        ),
      ),
    );
  if (input.fileId) rows = rows.where("Visit.fileId", "=", input.fileId);
  return rows.orderBy("Visit.visitDate").orderBy("Visit.number").execute();
}

export interface PlanExtraVisitInput {
  /** The visit whose order asked for it. */
  sourceVisitId: string;
  date: string;
  /** Each defaults to the source visit's. */
  startTime?: string | null;
  durationMin?: number | null;
  workersNeeded?: number | null;
}

/**
 * The office plans the extra visit an order asked for: a visit of origin EXTRA
 * pointing back at its source, outside the weekly programme (no slot, no
 * programme date), with its own number in the year of its date, the source's
 * zone and supervisor, and no team yet. It waits for the office to give its
 * seats and confirm it with the client.
 */
export async function planExtraVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: PlanExtraVisitInput,
): Promise<{ visitId: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const source = await ex
    .selectFrom("Visit")
    .select([
      "id",
      "number",
      "fileId",
      "plannedStartTime",
      "plannedDurationMin",
      "workersNeeded",
      "zoneId",
      "supervisorEmployeeId",
    ])
    .where("id", "=", input.sourceVisitId)
    .executeTakeFirst();
  if (!source) throw new ServiceError("This visit does not exist.");

  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  if (input.date < ctx.today) throw new ServiceError("An extra visit is planned for today or later.");
  const startTime = input.startTime?.trim() || source.plannedStartTime;
  if (!isClockTime(startTime)) throw new ServiceError("Enter a time as HH:MM.");
  const durationMin = input.durationMin ?? source.plannedDurationMin;
  const workersNeeded = input.workersNeeded ?? source.workersNeeded;
  for (const value of [durationMin, workersNeeded]) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ServiceError("A number must be a whole number of at least 1.");
  }
  const planned = await ex
    .selectFrom("Visit")
    .select("id")
    .where("sourceVisitId", "=", source.id)
    .where("origin", "=", "EXTRA")
    .where("status", "!=", "CANCELLED")
    .executeTakeFirst();
  if (planned) throw new ServiceError("An extra visit is already planned for this visit.");

  const date = localDate(input.date);
  const number = await nextNumber(ex, ctx, "VISIT", { date });
  const id = newId();
  const values = {
    origin: "EXTRA",
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
      fileId: source.fileId,
      fileSlotId: null,
      sourceVisitId: source.id,
      slotDate: null,
      ...values,
      zoneId: source.zoneId,
      supervisorEmployeeId: source.supervisorEmployeeId,
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
    context: { sourceVisit: source.number, sourceVisitId: source.id },
  });
  return { visitId: id, number: number.display };
}

// ── The end of an on-demand job ─────────────────────────────────────────────

/**
 * True when a live on-demand job has nothing left to do: no visit of the job
 * (origin ON_DEMAND, MAKEUP, REDO or EXTRA) still confirmed, awaiting
 * confirmation, under way or postponed, no redo visit open (a redo that hit a
 * problem is still open), and no complaint new or being dealt with on the file.
 *
 * A postponed visit that has been given its new date (`rescheduledToVisitId`)
 * no longer counts: the visit it moved to does. The `visit.signedOff` handler
 * also checks that the visit just signed off is done.
 */
export async function onDemandJobFinished(ex: Executor, fileId: string): Promise<boolean> {
  const file = await ex
    .selectFrom("File")
    .select(["serviceType", "stage", "closedAt"])
    .where("id", "=", fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!file || file.serviceType !== "ON_DEMAND" || file.stage !== "CONTRACTED" || file.closedAt !== null) return false;

  const open = await ex
    .selectFrom("Visit")
    .select("id")
    .where("fileId", "=", fileId)
    .where((eb) =>
      eb.or([
        eb.and([eb("origin", "in", [...JOB_ORIGINS]), eb("status", "in", [...STILL_TO_DO])]),
        eb.and([
          eb("origin", "in", [...JOB_ORIGINS]),
          eb("status", "=", "POSTPONED"),
          eb("rescheduledToVisitId", "is", null),
        ]),
        eb.and([eb("origin", "=", "REDO"), eb("status", "not in", ["DONE", "CANCELLED"])]),
      ]),
    )
    .executeTakeFirst();
  if (open) return false;

  const complaint = await ex
    .selectFrom("Complaint")
    .select("id")
    .where("fileId", "=", fileId)
    .where("status", "in", [...OPEN_COMPLAINT_STATUSES])
    .executeTakeFirst();
  return !complaint;
}

/**
 * Closes an on-demand job that has nothing left to do (RULINGS-NEEDED 15): no visit of the job open, no complaint
 * open, no extra visit proposed. The end date is its last visit done. Called after a sign-off, a dismissed
 * proposal, and a complaint settled or rejected (INT-6). True when it closed the job.
 */
export async function closeJobIfFinished(ex: Executor, ctx: ServiceContext, fileId: string): Promise<boolean> {
  if (!(await onDemandJobFinished(ex, fileId))) return false;
  if ((await listExtraVisitProposals(ex, ctx, { fileId })).length > 0) return false;
  const last = await ex
    .selectFrom("Visit")
    .select((eb) => eb.fn.max("visitDate").as("lastDate"))
    .where("fileId", "=", fileId)
    .where("status", "=", "DONE")
    .executeTakeFirst();
  if (!last?.lastDate) return false;
  const result = await closeFile(ex, ctx, { fileId, reason: "JOB_DONE", endedDate: last.lastDate });
  return result.closed;
}

/** The office's decision written on a visit whose order asked for an extra visit it will not plan. */
export const NO_EXTRA_VISIT = "لا حاجة لزيارة إضافية";

/**
 * «لا حاجة لزيارة إضافية»: the proposal of a returned order is dismissed, with
 * the reason the user typed (kept on the visit as the office's decision, and
 * in the log). When it was the last thing keeping an on-demand job open, the
 * job ends as it would have on its last sign-off.
 */
export async function dismissExtraVisitProposal(
  ex: Executor,
  ctx: ServiceContext,
  input: { sourceVisitId: string; reason: string },
): Promise<{ jobClosed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("Write why no extra visit is needed.");
  const proposals = await listExtraVisitProposals(ex, ctx, {});
  const proposal = proposals.find((each) => each.visitId === input.sourceVisitId);
  if (!proposal) throw new ServiceError("This visit has no extra visit waiting to be planned.");
  await ex
    .updateTable("Visit")
    .set({ actionTaken: `${NO_EXTRA_VISIT}: ${reason}`, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", input.sourceVisitId)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "REFUSE",
    reason,
    entity: "Visit",
    entityId: input.sourceVisitId,
    entityLabel: proposal.visitNumber,
    context: { extraVisit: "DISMISSED" },
  });
  // The job may now be over: same test as the sign-off's.
  const visit = await ex
    .selectFrom("Visit")
    .select(["fileId", "status", "visitDate"])
    .where("id", "=", input.sourceVisitId)
    .executeTakeFirstOrThrow();
  const stillProposed = (await listExtraVisitProposals(ex, ctx, { fileId: visit.fileId })).length > 0;
  if (stillProposed || !(await onDemandJobFinished(ex, visit.fileId))) return { jobClosed: false };
  const last = await ex
    .selectFrom("Visit")
    .select((eb) => eb.fn.max("visitDate").as("lastDate"))
    .where("fileId", "=", visit.fileId)
    .where("status", "=", "DONE")
    .executeTakeFirst();
  const result = await closeFile(ex, ctx, {
    fileId: visit.fileId,
    reason: "JOB_DONE",
    endedDate: last?.lastDate ?? visit.visitDate,
  });
  return { jobClosed: result.closed };
}

export const listExtraVisitProposalsQuery = query(listExtraVisitProposals);
export const dismissExtraVisitProposalAction = action(dismissExtraVisitProposal, {
  revalidate: [VISITS_PATH, "/dashboard/files"],
});
export const planExtraVisitAction = action(planExtraVisit, { revalidate: [VISITS_PATH, "/dashboard/files"] });
