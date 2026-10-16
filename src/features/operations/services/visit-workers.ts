import { requireSection } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { staffName } from "@/lib/text/names";

/** One seat of a visit, as another owner reads it. */
export interface VisitWorkerSeat {
  seatId: string;
  workerId: string;
  number: string;
  /** Surname then first name (`staffName`). */
  name: string;
  role: string | null;
  /** ASSIGNED, ABSENT, RESTING, REPLACED or REMOVED. */
  seatStatus: string;
  /** The seat this one took over, for a replacement. */
  replacesSeatId: string | null;
}

/**
 * The seats of a visit, in the order they were given (CONTRACTS.md section 3,
 * `listVisitWorkers(visitId)`): for Money's hand-out recipient picker. Every
 * seat is listed with its status; a picker keeps the ASSIGNED ones.
 */
export async function listVisitWorkers(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<VisitWorkerSeat[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const rows = await ex
    .selectFrom("VisitWorker")
    .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
    .select([
      "VisitWorker.id",
      "VisitWorker.workerId",
      "VisitWorker.role",
      "VisitWorker.seatStatus",
      "VisitWorker.replacesVisitWorkerId",
      "StaffMember.number",
      "StaffMember.firstName",
      "StaffMember.lastName",
    ])
    .where("VisitWorker.visitId", "=", input.visitId)
    .orderBy("VisitWorker.createdAt")
    .execute();
  return rows.map((row) => ({
    seatId: row.id,
    workerId: row.workerId,
    number: row.number,
    name: staffName(row),
    role: row.role,
    seatStatus: row.seatStatus,
    replacesSeatId: row.replacesVisitWorkerId,
  }));
}

export const listVisitWorkersQuery = query(listVisitWorkers);
