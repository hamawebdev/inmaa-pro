import { requireSection } from "@/lib/access/session";
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
  input: { date: LocalDate },
): Promise<DayBoardVisit[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const rows = await ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("Zone", "Zone.id", "Visit.zoneId")
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
    ])
    .where("Visit.visitDate", "=", input.date)
    .where((eb) => eb.or([eb("Visit.statusReason", "is", null), eb("Visit.statusReason", "!=", "PROGRAMME_CHANGED")]))
    .orderBy("Visit.plannedStartTime")
    .orderBy("Visit.number")
    .execute();
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

export const listDayBoardQuery = query(listDayBoard);
export const listFileVisitsQuery = query(listFileVisits);
