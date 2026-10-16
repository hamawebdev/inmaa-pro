import { requireSection } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, localTime, type LocalDate } from "@/lib/units";

import { addDays, isIsoDate } from "../rules/calendar";

/**
 * One worker's figures over a period, for People's periodic evaluation (article
 * 16 of his regulations; CONTRACTS section 3, `getWorkerQualityFigures`): the
 * visits she worked, how late she arrived, what the clients rated, and the
 * complaints, inspections and damage reports that name her. Read only; the
 * period is by the visit's date, the complaint's day of receipt, the
 * inspection's day done and the report's day of the problem, both ends
 * included.
 */
export interface WorkerQualityFigures {
  workerId: string;
  from: LocalDate;
  to: LocalDate;
  visits: {
    /** Visits done (or done with a problem) on which her seat stayed hers. */
    done: number;
    /** Of those, the ones whose returned order carries her arrival time. */
    withTimes: number;
  };
  lateness: {
    /** Visits on which she arrived after the planned start. */
    count: number;
    /** Their late minutes added up, and the longest. */
    totalMin: number;
    longestMin: number;
  };
  ratings: {
    /** Visits she worked whose client gave the overall mark at sign-off. */
    count: number;
    /** The average overall mark (1 to 5), two decimals; null with none. */
    average: number | null;
    /** The average of «سلوك العامل(ة)» (1 to 5), two decimals; null with none. */
    behaviourAverage: number | null;
  };
  complaints: {
    /** Complaints received in the period that name her. */
    count: number;
    /** Of those, the ones settled with the centre at fault. */
    atFault: number;
    items: Array<{
      id: string;
      number: string;
      date: LocalDate;
      kind: string;
      status: string;
      centreAtFault: string | null;
    }>;
  };
  inspections: {
    /** Inspections done in the period that note her, present or not. */
    count: number;
    /** The average score of those inspections (0 to 100), one decimal; null with none. */
    averageScore: number | null;
    /** Of those, the ones under their threshold. */
    belowThreshold: number;
    /** The supervisor's remarks about her, and the times he found her absent. */
    remarks: number;
    absent: number;
  };
  problemReports: {
    /** «تلف أو كسر» reports on visits she worked. */
    damage: number;
  };
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
const average = (values: number[], places: number) =>
  values.length === 0 ? null : round(values.reduce((sum, each) => sum + each, 0) / values.length, places);

/** Exported for People (CONTRACTS section 3): `getWorkerQualityFigures({ workerId, from, to })`. */
export async function getWorkerQualityFigures(
  ex: Executor,
  ctx: ServiceContext,
  input: { workerId: string; from: string; to: string },
): Promise<WorkerQualityFigures> {
  requireSection(ctx, "WORKERS", "READ");
  if (!isIsoDate(input.from) || !isIsoDate(input.to) || input.to < input.from) {
    throw new ServiceError("Enter a valid period.");
  }
  const from = localDate(input.from);
  const to = localDate(input.to);
  const worker = await ex
    .selectFrom("StaffMember")
    .select("id")
    .where("id", "=", input.workerId)
    .where("kind", "=", "WORKER")
    .executeTakeFirst();
  if (!worker) throw new ServiceError("This worker does not exist.");

  // Her seats on the visits done in the period, with the sign-off of each.
  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .select([
      "Visit.id as visitId",
      "VisitWorker.arrivedTime",
      "VisitWorker.lateMin",
      "VisitReport.ratingOverall",
      "VisitReport.ratingBehaviour",
    ])
    .where("VisitWorker.workerId", "=", worker.id)
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .where("Visit.status", "in", ["DONE", "PROBLEM"])
    .where("Visit.visitDate", ">=", from)
    .where("Visit.visitDate", "<=", to)
    .execute();
  const late = seats.map((seat) => seat.lateMin ?? 0).filter((minutes) => minutes > 0);
  const overall = seats.flatMap((seat) => (seat.ratingOverall === null ? [] : [seat.ratingOverall]));
  const behaviour = seats.flatMap((seat) => (seat.ratingBehaviour === null ? [] : [seat.ratingBehaviour]));

  // Complaints by the day they came in, in the centre's time.
  const midnight = localTime("00:00");
  const startsAt = ctx.toInstant(from, midnight);
  const endsBefore = ctx.toInstant(localDate(addDays(to, 1)), midnight);
  const complaints = await ex
    .selectFrom("Complaint")
    .select(["id", "number", "receivedAt", "kind", "status", "centreAtFault"])
    .where("workerId", "=", worker.id)
    .where("receivedAt", ">=", startsAt)
    .where("receivedAt", "<", endsBefore)
    .orderBy("receivedAt")
    .execute();

  const notes = await ex
    .selectFrom("InspectionWorkerNote")
    .innerJoin("Inspection", "Inspection.id", "InspectionWorkerNote.inspectionId")
    .select([
      "Inspection.id",
      "Inspection.scoreTotal",
      "Inspection.belowThreshold",
      "InspectionWorkerNote.present",
      "InspectionWorkerNote.remark",
    ])
    .where("InspectionWorkerNote.workerId", "=", worker.id)
    .where("Inspection.status", "=", "DONE")
    .where("Inspection.doneDate", ">=", from)
    .where("Inspection.doneDate", "<=", to)
    .execute();

  const damage = await ex
    .selectFrom("ProblemReport")
    .innerJoin("VisitWorker", "VisitWorker.visitId", "ProblemReport.visitId")
    .select((eb) => eb.fn.count<number>("ProblemReport.id").distinct().as("count"))
    .where("VisitWorker.workerId", "=", worker.id)
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .where("ProblemReport.kind", "=", "DAMAGE_DURING_WORK")
    .where("ProblemReport.occurredDate", ">=", from)
    .where("ProblemReport.occurredDate", "<=", to)
    .executeTakeFirst();

  return {
    workerId: worker.id,
    from,
    to,
    visits: { done: seats.length, withTimes: seats.filter((seat) => seat.arrivedTime !== null).length },
    lateness: {
      count: late.length,
      totalMin: late.reduce((sum, minutes) => sum + minutes, 0),
      longestMin: late.length === 0 ? 0 : Math.max(...late),
    },
    ratings: { count: overall.length, average: average(overall, 2), behaviourAverage: average(behaviour, 2) },
    complaints: {
      count: complaints.length,
      atFault: complaints.filter((each) => each.status === "SETTLED" && each.centreAtFault === "YES").length,
      items: complaints.map((each) => ({
        id: each.id,
        number: each.number,
        date: ctx.toLocal(each.receivedAt).date,
        kind: each.kind,
        status: each.status,
        centreAtFault: each.centreAtFault,
      })),
    },
    inspections: {
      count: notes.length,
      averageScore: average(
        notes.flatMap((note) => (note.scoreTotal === null ? [] : [note.scoreTotal])),
        1,
      ),
      belowThreshold: notes.filter((note) => note.belowThreshold === 1).length,
      remarks: notes.filter((note) => (note.remark ?? "").trim() !== "").length,
      absent: notes.filter((note) => note.present === 0).length,
    },
    problemReports: { damage: Number(damage?.count ?? 0) },
  };
}

export const getWorkerQualityFiguresQuery = query(getWorkerQualityFigures);
