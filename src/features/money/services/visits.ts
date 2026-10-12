import type { Executor } from "@/lib/service/context";
import { getSetting } from "@/lib/settings";
import type { LocalDate } from "@/lib/units";

/**
 * What Money reads of a file's visits: enough for the dues, for "billable" and
 * for the visit statement of an invoice.
 *
 * `Visit`, `VisitReport` and `VisitWorker` are Operations' tables. CONTRACTS.md
 * section 2 lets Money read them (statement, dues per visit, sign-off, actual
 * hours) until Operations exports `listVisitsForBilling`. Nothing here writes.
 *
 * A visit cancelled because the programme changed does not exist for any count
 * or statement (CONTRACTS.md, definitions): it is left out here, once.
 */
export interface BillingVisit {
  id: string;
  number: string;
  fileId: string;
  /** CONTRACT, ON_DEMAND, INITIAL, EXTRA, REDO, MAKEUP. */
  origin: string;
  sourceVisitId: string | null;
  visitDate: LocalDate;
  status: string;
  statusReason: string | null;
  /** Operations' own flag: done, and neither a redo nor the first deep clean. */
  doneBillable: boolean;
  clientAtFault: boolean;
  /** The returned order was typed in whole: the visit is signed off. */
  signedOff: boolean;
  completion: string | null;
  signoffStatus: string | null;
  signoffAbsentReason: string | null;
  signoffName: string | null;
  /** The earliest arrival and the latest departure of the workers who came. */
  arrival: string | null;
  departure: string | null;
  workersCount: number;
  workedMin: number | null;
  /** Money's own decision on this visit, when the office took one. It wins. */
  decision: { billable: boolean; reason: string; amount: number | null } | null;
}

const OPEN_STATUSES: ReadonlySet<string> = new Set(["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS"]);

/** Still to come, or under way: nothing can be said yet of what it will cost. */
export const isOpenVisit = (visit: Pick<BillingVisit, "status">) => OPEN_STATUSES.has(visit.status);

/** Planned in the file's programme: what a period's amount is the price of. A make-up stands in for its source. */
export const isProgrammeVisit = (visit: Pick<BillingVisit, "origin">) =>
  visit.origin === "CONTRACT" || visit.origin === "ON_DEMAND";

/**
 * Whether a visit is billed.
 *
 *  - The office's own decision (`VisitBilling`) wins, either way.
 *  - Otherwise a visit is billed when Operations says it was done (and it is
 *    neither a redo nor the first deep clean), and, when setting
 *    `invoice.requireSignOff` asks for it, its returned order was typed in whole.
 *  - A visit the client made impossible (late cancellation, closed door) is
 *    billed too (question 15 of the plan).
 */
export function isBilled(visit: BillingVisit, requireSignOff: boolean): boolean {
  if (visit.decision) return visit.decision.billable;
  if (visit.clientAtFault) return true;
  return visit.doneBillable && (!requireSignOff || visit.signedOff);
}

/** Done, but its order is not typed in whole yet: the invoice waits for it. */
export function awaitsSignOff(visit: BillingVisit, requireSignOff: boolean): boolean {
  return requireSignOff && !visit.decision && visit.status === "DONE" && !visit.signedOff;
}

export async function readRequireSignOff(ex: Executor): Promise<boolean> {
  return getSetting(ex, "invoice.requireSignOff");
}

/** The visits of a file, oldest first, optionally inside a range of dates (both ends included). */
export async function readBillingVisits(
  ex: Executor,
  input: { fileId: string; from?: LocalDate | null; to?: LocalDate | null; visitIds?: readonly string[] },
): Promise<BillingVisit[]> {
  if (input.visitIds && input.visitIds.length === 0) return [];
  let query = ex
    .selectFrom("Visit")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .leftJoin("VisitBilling", "VisitBilling.visitId", "Visit.id")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.fileId",
      "Visit.origin",
      "Visit.sourceVisitId",
      "Visit.visitDate",
      "Visit.status",
      "Visit.statusReason",
      "Visit.billable",
      "Visit.clientAtFault",
      "VisitReport.entryState",
      "VisitReport.completion",
      "VisitReport.signoffStatus",
      "VisitReport.signoffAbsentReason",
      "VisitReport.signoffName",
      "VisitBilling.id as decisionId",
      "VisitBilling.billable as decisionBillable",
      "VisitBilling.reason as decisionReason",
      "VisitBilling.amount as decisionAmount",
    ])
    .where("Visit.fileId", "=", input.fileId)
    .where((eb) =>
      eb.or([
        eb("Visit.status", "!=", "CANCELLED"),
        eb("Visit.statusReason", "is", null),
        eb("Visit.statusReason", "!=", "PROGRAMME_CHANGED"),
      ]),
    );
  if (input.from) query = query.where("Visit.visitDate", ">=", input.from);
  if (input.to) query = query.where("Visit.visitDate", "<=", input.to);
  if (input.visitIds) query = query.where("Visit.id", "in", [...input.visitIds]);
  const rows = await query.orderBy("Visit.visitDate").orderBy("Visit.plannedStartTime").orderBy("Visit.id").execute();
  if (rows.length === 0) return [];

  // The seats of the workers who came: an absent or removed seat has no times.
  const seats = await ex
    .selectFrom("VisitWorker")
    .select(["visitId", "arrivedTime", "leftTime", "workedMin"])
    .where(
      "visitId",
      "in",
      rows.map((row) => row.id),
    )
    .where("seatStatus", "=", "ASSIGNED")
    .execute();

  return rows.map((row) => {
    const present = seats.filter((seat) => seat.visitId === row.id && (seat.arrivedTime || seat.leftTime));
    const arrivals = present.flatMap((seat) => (seat.arrivedTime ? [seat.arrivedTime] : [])).sort();
    const departures = present.flatMap((seat) => (seat.leftTime ? [seat.leftTime] : [])).sort();
    const worked = present.flatMap((seat) => (seat.workedMin === null ? [] : [seat.workedMin]));
    return {
      id: row.id,
      number: row.number,
      fileId: row.fileId,
      origin: row.origin,
      sourceVisitId: row.sourceVisitId,
      visitDate: row.visitDate as LocalDate,
      status: row.status,
      statusReason: row.statusReason,
      doneBillable: row.billable === 1,
      clientAtFault: row.clientAtFault === 1,
      signedOff: row.entryState === "COMPLETE",
      completion: row.completion,
      signoffStatus: row.signoffStatus,
      signoffAbsentReason: row.signoffAbsentReason,
      signoffName: row.signoffName,
      arrival: arrivals[0] ?? null,
      departure: departures[departures.length - 1] ?? null,
      workersCount: present.length,
      workedMin: worked.length > 0 ? worked.reduce((sum, minutes) => sum + minutes, 0) : null,
      decision: row.decisionId
        ? { billable: row.decisionBillable === 1, reason: row.decisionReason ?? "", amount: row.decisionAmount }
        : null,
    };
  });
}
