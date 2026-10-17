import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSettings } from "@/lib/settings";
import { localDate, type LocalDate } from "@/lib/units";

import { minutesOf } from "../rules/calendar";
import { countCallsToMake } from "./calls";
import { nextWorkingDay } from "./day-sheets";

/**
 * The counts behind Operations' home-screen tiles (DESIGN.md section 13). Each
 * is a read, outside any transaction, as the reader. A visit cancelled because
 * the programme changed counts nowhere.
 */

/** Today's visits past their start plus the grace, still waiting, with no arrival typed (`visit.noArrival`). */
export async function countNoArrival(ex: Executor, ctx: ServiceContext): Promise<number> {
  const settings = await getSettings(ex, ["work.arrivalGraceMin"]);
  const rows = await ex
    .selectFrom("Visit")
    .select(["Visit.id", "Visit.plannedStartTime"])
    .where("Visit.visitDate", "=", ctx.today)
    .where("Visit.status", "in", ["CONFIRMED", "AWAITING_CONFIRMATION"])
    .where("Visit.arrivalReportedAt", "is", null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("VisitWorker")
            .select("VisitWorker.id")
            .whereRef("VisitWorker.visitId", "=", "Visit.id")
            .where("VisitWorker.arrivedTime", "is not", null),
        ),
      ),
    )
    .execute();
  const now = minutesOf(ctx.nowTime);
  return rows.filter((row) => minutesOf(row.plannedStartTime) + settings["work.arrivalGraceMin"] < now).length;
}

/** Visits still to come that wait for their team or the client's confirmation (`seats.open`). */
export async function countSeatsOpen(ex: Executor, ctx: ServiceContext): Promise<number> {
  const row = await ex
    .selectFrom("Visit")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("visitDate", ">=", ctx.today)
    .where("status", "=", "AWAITING_CONFIRMATION")
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

/** Visits before today still open, or done without a complete returned order (`orders.notReturned`). */
export async function countOrdersNotReturned(ex: Executor, ctx: ServiceContext): Promise<number> {
  const row = await ex
    .selectFrom("Visit")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("Visit.visitDate", "<", ctx.today)
    .where((eb) =>
      eb.or([
        eb("Visit.status", "in", ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS"]),
        eb.and([
          eb("Visit.status", "=", "DONE"),
          eb.or([eb("VisitReport.entryState", "is", null), eb("VisitReport.entryState", "!=", "COMPLETE")]),
        ]),
      ]),
    )
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

/** Live contracts that have no visit at all (`contract.noVisits`). */
export async function countContractsWithoutVisits(ex: Executor, _ctx: ServiceContext): Promise<number> {
  const row = await ex
    .selectFrom("File")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("stage", "=", "CONTRACTED")
    .where("closedAt", "is", null)
    .where("deletedAt", "is", null)
    .where((eb) =>
      eb.not(eb.exists(eb.selectFrom("Visit").select("Visit.id").whereRef("Visit.fileId", "=", "File.id"))),
    )
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

/** Complaints not answered whose target is passed or within the warning time (`complaint.late`). */
export async function countLateComplaints(ex: Executor, ctx: ServiceContext, warnMin = 30): Promise<number> {
  const soon = new Date(Date.parse(ctx.now) + warnMin * 60_000).toISOString();
  const row = await ex
    .selectFrom("Complaint")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("firstResponseAt", "is", null)
    .where("status", "in", ["NEW", "IN_PROGRESS"])
    .where("dueAt", "<=", soon)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

/** Corrective tasks still open past their date (`corrective.overdue`). */
export async function countOverdueCorrective(ex: Executor, ctx: ServiceContext): Promise<number> {
  const row = await ex
    .selectFrom("CorrectiveTask")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "in", ["OPEN", "IN_PROGRESS"])
    .where("dueDate", "<", ctx.today)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

/** Planned inspections whose day has come (`inspection.due`). */
export async function countInspectionsDue(ex: Executor, ctx: ServiceContext): Promise<number> {
  const row = await ex
    .selectFrom("Inspection")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "=", "PLANNED")
    .where("plannedDate", "<=", ctx.today)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

/** The calls to make today about the next working day's visits (`calls.tomorrow`), and the list's address. */
export async function countCallsTomorrow(
  ex: Executor,
  ctx: ServiceContext,
): Promise<{ count: number; route: string; date: LocalDate }> {
  const date = await nextWorkingDay(ex, localDate(ctx.today));
  // The visits of tomorrow's list whose client no call has reached yet (#16): the tile empties as the calls are made.
  const count = await countCallsToMake(ex, date);
  return { count, route: `/dashboard/visits?list=calls&date=${date}`, date };
}
