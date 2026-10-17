import { requireSection } from "@/lib/access/session";
import { staffName } from "@/lib/text/names";
import type { VisitRow } from "@/lib/db/models";
import { hydrate } from "@/lib/db/rows";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import type { LocalDate } from "@/lib/units";

import type { BoardService, DayBoardVisit } from "../components/day-board/day-board-data";
import { readFileServices } from "./upstream";

/**
 * The day board (#10, #11): every visit of one day with its team, its zone,
 * its service and its status. A visit cancelled because the programme changed
 * does not exist for anyone, so it is not on the board.
 */
export async function listDayBoard(
  ex: Executor,
  ctx: ServiceContext,
  input: { date: LocalDate; supervisorId?: string | null },
): Promise<DayBoardVisit[]> {
  requireSection(ctx, "REQUESTS", "READ");
  let query = ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("Zone", "Zone.id", "Visit.zoneId")
    .leftJoin("StaffMember as Supervisor", "Supervisor.id", "Visit.supervisorEmployeeId")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.fileId",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.workersNeeded",
      "Visit.status",
      "Visit.arrivalReportedAt",
      "File.division",
      "File.serviceType",
      "Site.commonName",
      "Site.address",
      "Zone.name as zoneName",
      "Supervisor.id as supervisorId",
      "Supervisor.firstName as supervisorFirstName",
      "Supervisor.lastName as supervisorLastName",
    ])
    .where("Visit.visitDate", "=", input.date)
    .where((eb) => eb.or([eb("Visit.statusReason", "is", null), eb("Visit.statusReason", "!=", "PROGRAMME_CHANGED")]));
  // One supervisor's day, as he sees it on the home screen (F-36b).
  if (input.supervisorId) query = query.where("Visit.supervisorEmployeeId", "=", input.supervisorId);
  const rows = await query.orderBy("Visit.plannedStartTime").orderBy("Visit.number").execute();
  if (rows.length === 0) return [];

  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
    .select([
      "VisitWorker.visitId",
      "VisitWorker.seatStatus",
      "VisitWorker.arrivedTime",
      "StaffMember.firstName",
      "StaffMember.lastName",
    ])
    .where(
      "VisitWorker.visitId",
      "in",
      rows.map((row) => row.id),
    )
    .orderBy("VisitWorker.createdAt")
    .execute();
  const services = await readFileServices(
    ex,
    rows.map((row) => row.fileId),
  );

  return rows.map((row) => {
    const own = seats.filter((seat) => seat.visitId === row.id);
    const ticks = services.get(row.fileId) ?? [];
    const programmed = ticks.filter((tick) => tick.list === "PROGRAMMED");
    const shown: BoardService[] = (programmed.length > 0 ? programmed : ticks).slice(0, 2);
    const visit = hydrate<VisitRow>("Visit", {
      id: row.id,
      number: row.number,
      visitDate: row.visitDate,
      plannedStartTime: row.plannedStartTime,
      plannedDurationMin: row.plannedDurationMin,
      workersNeeded: row.workersNeeded,
      status: row.status,
      arrivalReportedAt: row.arrivalReportedAt,
    }) as VisitRow;
    return {
      visit,
      file: { division: row.division, serviceType: row.serviceType },
      site: { commonName: row.commonName, address: row.address },
      zone: row.zoneName ? { name: row.zoneName } : null,
      supervisor: row.supervisorId
        ? {
            id: row.supervisorId,
            name: staffName({ firstName: row.supervisorFirstName ?? "", lastName: row.supervisorLastName ?? "" }),
          }
        : null,
      team: own
        .filter((seat) => seat.seatStatus === "ASSIGNED")
        .map((seat) => ({ firstName: seat.firstName, lastName: seat.lastName })),
      arrivalTyped: own.some((seat) => seat.arrivedTime !== null),
      services: shown,
    };
  });
}

/** One line of a file's visits (File › الزيارات). */
export interface FileVisitLine {
  id: string;
  number: string;
  origin: string;
  visitDate: LocalDate;
  plannedStartTime: string;
  plannedDurationMin: number;
  workersNeeded: number;
  /** Seats held (ASSIGNED). */
  seated: number;
  status: string;
  orderPrinted: boolean;
  entryState: string | null;
}

/** Every visit of a file, earliest first, except those a programme change dropped. */
export async function listFileVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<FileVisitLine[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const rows = await ex
    .selectFrom("Visit")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.origin",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.workersNeeded",
      "Visit.status",
      "Visit.orderPrintedAt",
      "VisitReport.entryState",
      (eb) =>
        eb
          .selectFrom("VisitWorker")
          .select((inner) => inner.fn.countAll<number>().as("count"))
          .whereRef("VisitWorker.visitId", "=", "Visit.id")
          .where("VisitWorker.seatStatus", "=", "ASSIGNED")
          .as("seated"),
    ])
    .where("Visit.fileId", "=", input.fileId)
    .where((eb) => eb.or([eb("Visit.statusReason", "is", null), eb("Visit.statusReason", "!=", "PROGRAMME_CHANGED")]))
    .orderBy("Visit.visitDate")
    .orderBy("Visit.plannedStartTime")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    origin: row.origin,
    visitDate: row.visitDate,
    plannedStartTime: row.plannedStartTime,
    plannedDurationMin: row.plannedDurationMin,
    workersNeeded: row.workersNeeded,
    seated: Number(row.seated ?? 0),
    status: row.status,
    orderPrinted: row.orderPrintedAt !== null,
    entryState: row.entryState,
  }));
}

/** A visit an alert tile points at: what it is, where, and how far its team and its order are. */
export interface VisitToAct extends FileVisitLine {
  siteName: string;
  fileId: string;
}

/**
 * The lists behind two home tiles: past visits whose order is not typed in
 * («أوامر لم تُرجع»), and visits still to come that wait for their team or
 * the client's confirmation («بانتظار التأكيد»).
 */
export async function listVisitsToAct(
  ex: Executor,
  ctx: ServiceContext,
  input: { kind: "not-returned" | "awaiting" },
): Promise<VisitToAct[]> {
  requireSection(ctx, "REQUESTS", "READ");
  let rows = ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.origin",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.workersNeeded",
      "Visit.status",
      "Visit.orderPrintedAt",
      "Visit.fileId",
      "VisitReport.entryState",
      "Site.commonName",
      "Site.address",
      (eb) =>
        eb
          .selectFrom("VisitWorker")
          .select((inner) => inner.fn.countAll<number>().as("count"))
          .whereRef("VisitWorker.visitId", "=", "Visit.id")
          .where("VisitWorker.seatStatus", "=", "ASSIGNED")
          .as("seated"),
    ]);
  if (input.kind === "awaiting") {
    rows = rows.where("Visit.visitDate", ">=", ctx.today).where("Visit.status", "=", "AWAITING_CONFIRMATION");
  } else {
    rows = rows
      .where("Visit.visitDate", "<", ctx.today)
      .where((eb) =>
        eb.or([
          eb("Visit.status", "in", ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS"]),
          eb.and([
            eb("Visit.status", "=", "DONE"),
            eb.or([eb("VisitReport.entryState", "is", null), eb("VisitReport.entryState", "!=", "COMPLETE")]),
          ]),
        ]),
      );
  }
  const found = await rows
    .orderBy("Visit.visitDate", input.kind === "awaiting" ? "asc" : "desc")
    .orderBy("Visit.plannedStartTime")
    .limit(500)
    .execute();
  return found.map((row) => ({
    id: row.id,
    number: row.number,
    origin: row.origin,
    visitDate: row.visitDate,
    plannedStartTime: row.plannedStartTime,
    plannedDurationMin: row.plannedDurationMin,
    workersNeeded: row.workersNeeded,
    seated: Number(row.seated ?? 0),
    status: row.status,
    orderPrinted: row.orderPrintedAt !== null,
    entryState: row.entryState,
    siteName: row.commonName ?? row.address,
    fileId: row.fileId,
  }));
}

export const listDayBoardQuery = query(listDayBoard);
export const listVisitsToActQuery = query(listVisitsToAct);
export const listFileVisitsQuery = query(listFileVisits);

/**
 * The supervisor the home's day board opens on (F-36b): the signed-in account's own employee, when he supervises
 * a zone that day; null otherwise (the board shows every supervisor's visits).
 */
export async function getOwnSupervision(
  ex: Executor,
  ctx: ServiceContext,
  input: { date: LocalDate },
): Promise<{ supervisorId: string | null }> {
  requireSection(ctx, "REQUESTS", "READ");
  if (!ctx.staffMemberId) return { supervisorId: null };
  const row = await ex
    .selectFrom("SupervisorAssignment")
    .select("id")
    .where("supervisorEmployeeId", "=", ctx.staffMemberId)
    .where("zoneId", "is not", null)
    .where("fromDate", "<=", input.date)
    .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", input.date)]))
    .executeTakeFirst();
  return { supervisorId: row ? ctx.staffMemberId : null };
}

export const getOwnSupervisionQuery = query(getOwnSupervision);
