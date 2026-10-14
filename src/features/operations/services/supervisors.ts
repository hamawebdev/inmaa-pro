import { setWorkerZone } from "@/features/people/services/staff-exports";
import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { phoneText } from "@/lib/text/phone";
import { staffName } from "@/lib/text/names";
import { localDate, type LocalDate } from "@/lib/units";

import { addDays } from "../rules/calendar";
import { OPEN_STATUSES, VISITS_PATH } from "./programme";
import { readWorkers } from "./upstream";

/**
 * Who supervises which zone (#36). A zone has one supervisor at a time: naming
 * a new one ends the one before the day before, and the zone's visits still to
 * come take the new name (an order already printed is marked changed instead).
 */

export const SUPERVISORS_PATH = "/dashboard/supervisors";

export async function assignZoneSupervisor(
  ex: Executor,
  ctx: ServiceContext,
  input: { zoneId: string; supervisorEmployeeId: string; fromDate: LocalDate },
): Promise<{ assignmentId: string; visitsRestamped: number; ordersMarked: number }> {
  requireSection(ctx, "EMPLOYEES", "WRITE");
  const zone = await ex.selectFrom("Zone").select(["id", "name"]).where("id", "=", input.zoneId).executeTakeFirst();
  if (!zone) throw new ServiceError("This zone does not exist.");
  const supervisor = await ex
    .selectFrom("StaffMember")
    .select(["id", "kind", "number"])
    .where("id", "=", input.supervisorEmployeeId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!supervisor || supervisor.kind !== "EMPLOYEE") throw new ServiceError("Choose an employee as supervisor.");

  // The assignment in force on that day ends the day before; one that starts later is left as planned.
  const current = await ex
    .selectFrom("SupervisorAssignment")
    .select(["id", "supervisorEmployeeId", "fromDate"])
    .where("zoneId", "=", zone.id)
    .where("fromDate", "<=", input.fromDate)
    .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", input.fromDate)]))
    .execute();
  for (const row of current) {
    if (row.fromDate === input.fromDate) {
      // Named the same day: the row is replaced, not ended before it began.
      await ex.deleteFrom("SupervisorAssignment").where("id", "=", row.id).execute();
    } else {
      await ex
        .updateTable("SupervisorAssignment")
        .set({ toDate: localDate(addDays(input.fromDate, -1)), updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", row.id)
        .execute();
    }
  }
  const assignmentId = newId();
  await ex
    .insertInto("SupervisorAssignment")
    .values({
      id: assignmentId,
      supervisorEmployeeId: supervisor.id,
      zoneId: zone.id,
      fromDate: input.fromDate,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();

  // The zone's visits from that day on that are still to happen.
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "orderPrintedAt", "supervisorEmployeeId"])
    .where("zoneId", "=", zone.id)
    .where("visitDate", ">=", input.fromDate)
    .where("status", "in", [...OPEN_STATUSES])
    .execute();
  const changed = visits.filter((visit) => visit.supervisorEmployeeId !== supervisor.id);
  const unprinted = changed.filter((visit) => visit.orderPrintedAt === null).map((visit) => visit.id);
  const printed = changed.filter((visit) => visit.orderPrintedAt !== null).map((visit) => visit.id);
  if (unprinted.length > 0) {
    await ex
      .updateTable("Visit")
      .set({ supervisorEmployeeId: supervisor.id, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "in", unprinted)
      .execute();
  }
  if (printed.length > 0) {
    await ex
      .updateTable("Visit")
      .set({
        supervisorEmployeeId: supervisor.id,
        planChangedAt: ctx.now,
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "in", printed)
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "Zone",
    entityId: zone.id,
    entityLabel: zone.name,
    subject: { kind: "EMPLOYEE", id: supervisor.id, label: supervisor.number },
    changes: { supervisorEmployeeId: [current[0]?.supervisorEmployeeId ?? null, supervisor.id] },
    context: { fromDate: input.fromDate, visitsRestamped: unprinted.length, ordersMarked: printed.length },
  });
  return { assignmentId, visitsRestamped: unprinted.length, ordersMarked: printed.length };
}

/** One zone as the supervisors' screen lists it. */
export interface ZoneLine {
  id: string;
  name: string;
  communes: string[];
  supervisor: { id: string; name: string; phone: string } | null;
  workers: number;
  visitsToday: number;
}

/** Every active zone with its supervisor on a day, its communes, its workers and that day's visits. */
export async function listZonesWithSupervisors(
  ex: Executor,
  ctx: ServiceContext,
  input: { date?: LocalDate } = {},
): Promise<ZoneLine[]> {
  requireSection(ctx, "EMPLOYEES", "READ");
  const date = input.date ?? ctx.today;
  const zones = await ex.selectFrom("Zone").select(["id", "name"]).where("isActive", "=", 1).orderBy("name").execute();
  if (zones.length === 0) return [];
  const ids = zones.map((zone) => zone.id);
  const communes = await ex
    .selectFrom("Commune")
    .select(["zoneId", "nameAr"])
    .where("zoneId", "in", ids)
    .orderBy("nameAr")
    .execute();
  const supervision = await ex
    .selectFrom("SupervisorAssignment")
    .innerJoin("StaffMember", "StaffMember.id", "SupervisorAssignment.supervisorEmployeeId")
    .select([
      "SupervisorAssignment.zoneId",
      "SupervisorAssignment.fromDate",
      "StaffMember.id",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "StaffMember.phone",
    ])
    .where("SupervisorAssignment.zoneId", "in", ids)
    .where("SupervisorAssignment.fromDate", "<=", date)
    .where((eb) =>
      eb.or([eb("SupervisorAssignment.toDate", "is", null), eb("SupervisorAssignment.toDate", ">=", date)]),
    )
    .orderBy("SupervisorAssignment.fromDate", "desc")
    .execute();
  const workers = await ex
    .selectFrom("StaffMember")
    .select(["zoneId", (eb) => eb.fn.countAll<number>().as("count")])
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .where("engagementStatus", "in", ["ON_TRIAL", "ACCEPTED"])
    .where("zoneId", "in", ids)
    .groupBy("zoneId")
    .execute();
  const visits = await ex
    .selectFrom("Visit")
    .select(["zoneId", (eb) => eb.fn.countAll<number>().as("count")])
    .where("visitDate", "=", date)
    .where("status", "not in", ["CANCELLED", "POSTPONED"])
    .where("zoneId", "in", ids)
    .groupBy("zoneId")
    .execute();
  return zones.map((zone) => {
    const row = supervision.find((each) => each.zoneId === zone.id);
    return {
      id: zone.id,
      name: zone.name,
      communes: communes.filter((each) => each.zoneId === zone.id).map((each) => each.nameAr),
      supervisor: row ? { id: row.id, name: staffName(row), phone: phoneText(row.phone) } : null,
      workers: Number(workers.find((each) => each.zoneId === zone.id)?.count ?? 0),
      visitsToday: Number(visits.find((each) => each.zoneId === zone.id)?.count ?? 0),
    };
  });
}

/** The employees who may supervise: those in a supervisor's post first, then the others in post. */
export async function listSupervisorCandidates(
  ex: Executor,
  ctx: ServiceContext,
): Promise<Array<{ id: string; name: string; jobPosition: string | null }>> {
  requireSection(ctx, "EMPLOYEES", "READ");
  const rows = await ex
    .selectFrom("StaffMember")
    .select(["id", "firstName", "lastName", "jobPosition"])
    .where("kind", "=", "EMPLOYEE")
    .where("deletedAt", "is", null)
    .where("engagementStatus", "in", ["ON_TRIAL", "ACCEPTED"])
    .orderBy("lastName")
    .execute();
  return rows
    .map((row) => ({ id: row.id, name: staffName(row), jobPosition: row.jobPosition }))
    .sort((a, b) => Number(b.jobPosition === "SUPERVISOR") - Number(a.jobPosition === "SUPERVISOR"));
}

/** A worker's supervisor on a day: her own row, else her zone's (#36). Exported for People. */
export async function getWorkerSupervisor(
  ex: Executor,
  _ctx: ServiceContext,
  input: { workerId: string; date: LocalDate },
): Promise<{ supervisorEmployeeId: string; via: "WORKER" | "ZONE" } | null> {
  const covering = <T extends { fromDate: string; toDate: string | null }>(rows: T[]) =>
    rows.find((row) => row.fromDate <= input.date && (!row.toDate || row.toDate >= input.date));
  const own = await ex
    .selectFrom("SupervisorAssignment")
    .select(["supervisorEmployeeId", "fromDate", "toDate"])
    .where("workerId", "=", input.workerId)
    .orderBy("fromDate", "desc")
    .execute();
  const mine = covering(own);
  if (mine) return { supervisorEmployeeId: mine.supervisorEmployeeId, via: "WORKER" };
  const worker = await ex
    .selectFrom("StaffMember")
    .select("zoneId")
    .where("id", "=", input.workerId)
    .executeTakeFirst();
  if (!worker?.zoneId) return null;
  const zone = await ex
    .selectFrom("SupervisorAssignment")
    .select(["supervisorEmployeeId", "fromDate", "toDate"])
    .where("zoneId", "=", worker.zoneId)
    .orderBy("fromDate", "desc")
    .execute();
  const theirs = covering(zone);
  return theirs ? { supervisorEmployeeId: theirs.supervisorEmployeeId, via: "ZONE" } : null;
}

/** The workers, with their zone, for the second view. */
export async function listWorkerZones(
  ex: Executor,
  ctx: ServiceContext,
): Promise<Array<{ id: string; number: string; name: string; zoneId: string | null; zoneName: string | null }>> {
  requireSection(ctx, "EMPLOYEES", "READ");
  const workers = await readWorkers(ex, ctx, { date: ctx.today });
  return workers.map((worker) => ({
    id: worker.id,
    number: worker.number,
    name: staffName(worker),
    zoneId: worker.zoneId,
    zoneName: worker.zoneName,
  }));
}

/** A worker moves to another zone, through People's own function (the column is theirs). */
export async function moveWorkerToZone(
  ex: Executor,
  ctx: ServiceContext,
  input: { workerId: string; zoneId: string | null },
): Promise<void> {
  requireSection(ctx, "EMPLOYEES", "WRITE");
  await setWorkerZone(ex, ctx, input);
}

export const listZonesWithSupervisorsQuery = query(listZonesWithSupervisors);
export const listSupervisorCandidatesQuery = query(listSupervisorCandidates);
export const listWorkerZonesQuery = query(listWorkerZones);
export const moveWorkerToZoneAction = action(moveWorkerToZone, {
  revalidate: [SUPERVISORS_PATH, "/dashboard/workers"],
});
export const assignZoneSupervisorAction = action(assignZoneSupervisor, {
  revalidate: [SUPERVISORS_PATH, VISITS_PATH],
});
