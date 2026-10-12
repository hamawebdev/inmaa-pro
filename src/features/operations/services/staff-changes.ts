import type { EventPayloads } from "@/lib/events";
import { logChange } from "@/lib/log";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { localDate, type LocalDate } from "@/lib/units";

import { addDays } from "../rules/calendar";
import { settleVisitTeam } from "./assignment";
import { OPEN_STATUSES } from "./programme";

/**
 * Visits that follow a change made elsewhere (CONTRACTS.md section 4).
 *
 *  - `site.changed` (Clients saved a site's commune, zone or office block):
 *    the site's visits still to come take the site's zone and that zone's
 *    supervisor; an order already printed keeps what it printed and is marked
 *    «تغيّر بعد الطباعة».
 *  - `staff.unavailable` (People: a worker left, or a sanction was set on her):
 *    she loses her seats in that range at once (RULINGS-NEEDED 11) and each
 *    visit goes back to «بانتظار التأكيد» for the office to fill. A worker who
 *    left also leaves the file teams, her team and her supervisor. Lifting a
 *    sanction writes nothing: she is simply offered again.
 *
 * Both run inside the other owner's action and never refuse: a site or a
 * worker that cannot be found leaves everything as it is.
 */

// ── A site changed ──────────────────────────────────────────────────────────

/** The supervisors of a zone, latest assignment first (the same reading as the generation's). */
async function zoneSupervisors(ex: Executor, zoneId: string | null) {
  if (!zoneId) return [];
  return ex
    .selectFrom("SupervisorAssignment")
    .select(["supervisorEmployeeId", "fromDate", "toDate"])
    .where("zoneId", "=", zoneId)
    .orderBy("fromDate", "desc")
    .execute();
}

function supervisorOn(rows: Awaited<ReturnType<typeof zoneSupervisors>>, date: string): string | null {
  return rows.find((row) => row.fromDate <= date && (!row.toDate || row.toDate >= date))?.supervisorEmployeeId ?? null;
}

/** The handler of `site.changed`. Returns how many visits took the new stamp, and how many printed ones were marked. */
export async function applySiteChange(
  ex: Executor,
  ctx: ServiceContext,
  input: EventPayloads["site.changed"],
): Promise<{ restamped: number; marked: number }> {
  const outcome = { restamped: 0, marked: 0 };
  const site = await ex
    .selectFrom("Site")
    .select(["id", "zoneId", "commonName"])
    .where("id", "=", input.siteId)
    .executeTakeFirst();
  if (!site) return outcome;

  const visits = await ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.visitDate",
      "Visit.zoneId",
      "Visit.supervisorEmployeeId",
      "Visit.orderPrintedAt",
      "Visit.planChangedAt",
    ])
    .where("File.siteId", "=", site.id)
    .where("Visit.visitDate", ">=", ctx.today)
    .where("Visit.status", "in", [...OPEN_STATUSES])
    .orderBy("Visit.visitDate")
    .orderBy("Visit.plannedStartTime")
    .execute();
  if (visits.length === 0) return outcome;

  const supervisors = await zoneSupervisors(ex, site.zoneId);
  const changes: Record<string, readonly [unknown, unknown]> = {};
  for (const visit of visits) {
    const target = { zoneId: site.zoneId, supervisorEmployeeId: supervisorOn(supervisors, visit.visitDate) };
    if (!visit.orderPrintedAt) {
      const { set, changes: stamped } = changedColumns(visit, target);
      if (!stamped) continue;
      await ex
        .updateTable("Visit")
        .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", visit.id)
        .execute();
      for (const [field, pair] of Object.entries(stamped)) changes[`${visit.number}.${field}`] = pair;
      outcome.restamped += 1;
      continue;
    }
    // A printed order names its zone's supervisor and carries the site's instructions: it is now out of date.
    const stale =
      input.profileChanged ||
      visit.zoneId !== target.zoneId ||
      visit.supervisorEmployeeId !== target.supervisorEmployeeId;
    if (!stale) continue;
    await ex
      .updateTable("Visit")
      .set({ planChangedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", visit.id)
      .execute();
    changes[`${visit.number}.planChangedAt`] = [visit.planChangedAt, ctx.now];
    outcome.marked += 1;
  }

  if (outcome.restamped + outcome.marked > 0) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "UPDATE",
      entity: "Site",
      entityId: site.id,
      entityLabel: site.commonName ?? undefined,
      changes,
      context: { cause: "SITE_CHANGED", zoneChanged: input.zoneChanged, profileChanged: input.profileChanged },
    });
  }
  return outcome;
}

// ── A worker is no longer available ─────────────────────────────────────────

/** What the handler of `staff.unavailable` changed. */
export interface StaffUnavailableOutcome {
  /** Seats that became REMOVED, and the visits they were on. */
  seatsRemoved: number;
  visits: number;
  /** File teams she was on: ended the day before, or removed when they had not started. */
  assignmentsEnded: number;
  assignmentsRemoved: number;
  teamsLeft: number;
  supervisionsEnded: number;
}

/** The handler of `staff.unavailable`. */
export async function applyStaffUnavailable(
  ex: Executor,
  ctx: ServiceContext,
  input: EventPayloads["staff.unavailable"],
): Promise<StaffUnavailableOutcome> {
  const outcome: StaffUnavailableOutcome = {
    seatsRemoved: 0,
    visits: 0,
    assignmentsEnded: 0,
    assignmentsRemoved: 0,
    teamsLeft: 0,
    supervisionsEnded: 0,
  };
  if (input.cause === "SANCTION_LIFTED") return outcome;
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "number"])
    .where("id", "=", input.workerId)
    .executeTakeFirst();
  if (!worker) return outcome;
  const changes: Record<string, readonly [unknown, unknown]> = {};
  const stamp = { updatedAt: ctx.now, updatedByUserId: ctx.userId };

  // Her seats on the visits still to happen in the range.
  let query = ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .select([
      "VisitWorker.id",
      "VisitWorker.seatStatus",
      "VisitWorker.replacementReason",
      "Visit.id as visitId",
      "Visit.number as visitNumber",
    ])
    .where("VisitWorker.workerId", "=", worker.id)
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .where("Visit.status", "in", [...OPEN_STATUSES])
    .where("Visit.visitDate", ">=", input.fromDate);
  if (input.toDate) query = query.where("Visit.visitDate", "<=", input.toDate);
  const seats = await query.orderBy("Visit.visitDate").orderBy("Visit.plannedStartTime").execute();
  const replacementReason = input.cause === "LEFT" ? "WORKER_LEFT" : "SANCTION";
  for (const seat of seats) {
    const { set, changes: seatChanges } = changedColumns(seat, { seatStatus: "REMOVED", replacementReason });
    if (!seatChanges) continue;
    await ex
      .updateTable("VisitWorker")
      .set({ ...set, ...stamp })
      .where("id", "=", seat.id)
      .execute();
    changes[`${seat.visitNumber}.seatStatus`] = [seat.seatStatus, "REMOVED"];
    outcome.seatsRemoved += 1;
  }
  const visitIds = [...new Set(seats.map((seat) => seat.visitId))];
  for (const visitId of visitIds) await settleVisitTeam(ex, ctx, visitId);
  outcome.visits = visitIds.length;

  if (input.cause === "LEFT") {
    const lastDay: LocalDate = localDate(addDays(input.fromDate, -1));

    // The file teams she stood in.
    const assignments = await ex
      .selectFrom("FileAssignment")
      .select(["id", "validFrom", "validTo"])
      .where("workerId", "=", worker.id)
      .where("deletedAt", "is", null)
      .execute();
    for (const assignment of assignments) {
      if (assignment.validFrom > lastDay) {
        await ex
          .updateTable("FileAssignment")
          .set({ deletedAt: ctx.now, ...stamp })
          .where("id", "=", assignment.id)
          .execute();
        changes[`FileAssignment.${assignment.id}.deletedAt`] = [null, ctx.now];
        outcome.assignmentsRemoved += 1;
      } else if (assignment.validTo === null || assignment.validTo > lastDay) {
        await ex
          .updateTable("FileAssignment")
          .set({ validTo: lastDay, ...stamp })
          .where("id", "=", assignment.id)
          .execute();
        changes[`FileAssignment.${assignment.id}.validTo`] = [assignment.validTo, lastDay];
        outcome.assignmentsEnded += 1;
      }
    }

    // Her team, and her own supervisor.
    const memberships = await ex
      .selectFrom("TeamMember")
      .select(["id", "toDate"])
      .where("workerId", "=", worker.id)
      .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">", lastDay)]))
      .execute();
    for (const membership of memberships) {
      await ex
        .updateTable("TeamMember")
        .set({ toDate: lastDay, updatedAt: ctx.now })
        .where("id", "=", membership.id)
        .execute();
      changes[`TeamMember.${membership.id}.toDate`] = [membership.toDate, lastDay];
      outcome.teamsLeft += 1;
    }
    const supervisions = await ex
      .selectFrom("SupervisorAssignment")
      .select(["id", "toDate"])
      .where("workerId", "=", worker.id)
      .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">", lastDay)]))
      .execute();
    for (const supervision of supervisions) {
      await ex
        .updateTable("SupervisorAssignment")
        .set({ toDate: lastDay, ...stamp })
        .where("id", "=", supervision.id)
        .execute();
      changes[`SupervisorAssignment.${supervision.id}.toDate`] = [supervision.toDate, lastDay];
      outcome.supervisionsEnded += 1;
    }
  }

  if (Object.keys(changes).length > 0) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "UPDATE",
      entity: "StaffMember",
      entityId: worker.id,
      entityLabel: worker.number,
      subject: { kind: "WORKER", id: worker.id, label: worker.number },
      changes,
      context: { cause: input.cause, fromDate: input.fromDate, toDate: input.toDate ?? null, ...outcome },
    });
  }
  return outcome;
}
