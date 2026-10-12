import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, type LocalDate } from "@/lib/units";

import { addDays } from "../rules/calendar";
import { OPEN_STATUSES, VISITS_PATH } from "./programme";

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
  requireSection(ctx, "REQUESTS", "WRITE");
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

export const assignZoneSupervisorAction = action(assignZoneSupervisor, {
  revalidate: [SUPERVISORS_PATH, VISITS_PATH],
});
