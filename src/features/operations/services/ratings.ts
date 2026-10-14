import { requireSection } from "@/lib/access/session";
import { query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate } from "@/lib/units";

import { isIsoDate } from "../rules/calendar";
import type { SignoffStatus } from "../validators/option-codes";
import type { ComplaintWorker } from "./complaints";

/**
 * Clients' ratings (#15): what the client wrote on each returned order he
 * signed («تقييم الخدمة من 1 إلى 5»: جودة التنظيف، الالتزام بالموعد، سلوك
 * العاملة، جودة المواد، التقييم العام; «هل توصي بالمؤسسة؟ نعم / لا»), and
 * their averages over a period, per file and per worker of the visit's team.
 *
 * Nothing is stored here: the returned order holds the ratings (VisitReport),
 * this reads them.
 */

/** His five criteria, in the order of his homes file (D2 section 22). */
export const RATING_CRITERIA = ["quality", "punctuality", "behaviour", "materials", "overall"] as const;
export type RatingCriterion = (typeof RATING_CRITERIA)[number];
export type RatingScores = Record<RatingCriterion, number | null>;

/** One visit the client signed off, with what he rated. */
export interface RatedVisit {
  visitId: string;
  number: string;
  visitDate: string;
  file: { id: string; number: string; division: string };
  siteName: string | null;
  clientName: string;
  signoffStatus: SignoffStatus;
  ratings: RatingScores;
  wouldRecommend: boolean | null;
  /** The visit's team: the seats held. */
  workers: ComplaintWorker[];
}

/** What a group of signed-off visits adds up to. */
export interface RatingAverage {
  /** Visits signed off in the period. */
  visits: number;
  /** Of them, the visits with at least one rating. */
  rated: number;
  /** Each criterion's average over the visits that rated it; null when none did. */
  averages: RatingScores;
  recommendYes: number;
  recommendNo: number;
  /** «نعم» over the visits that answered «هل توصي»: 0 to 1, null when none answered. */
  recommendShare: number | null;
}

export interface FileRating extends RatingAverage {
  file: { id: string; number: string; division: string };
  siteName: string | null;
  clientName: string;
}

export interface WorkerRating extends RatingAverage {
  worker: ComplaintWorker;
}

export interface RatingsReport {
  visits: RatedVisit[];
  /** Weakest overall first; a file with no rating at the end. */
  files: FileRating[];
  workers: WorkerRating[];
  overall: RatingAverage;
}

const scoresOf = (row: {
  ratingQuality: number | null;
  ratingPunctuality: number | null;
  ratingBehaviour: number | null;
  ratingMaterials: number | null;
  ratingOverall: number | null;
}): RatingScores => ({
  quality: row.ratingQuality,
  punctuality: row.ratingPunctuality,
  behaviour: row.ratingBehaviour,
  materials: row.ratingMaterials,
  overall: row.ratingOverall,
});

/** The averages of a group of visits. Exported for the screen's tests and the evaluation figures. */
export function averageOf(visits: readonly Pick<RatedVisit, "ratings" | "wouldRecommend">[]): RatingAverage {
  const averages = {} as RatingScores;
  for (const criterion of RATING_CRITERIA) {
    const given = visits.map((visit) => visit.ratings[criterion]).filter((score): score is number => score !== null);
    averages[criterion] = given.length === 0 ? null : given.reduce((sum, score) => sum + score, 0) / given.length;
  }
  const recommendYes = visits.filter((visit) => visit.wouldRecommend === true).length;
  const recommendNo = visits.filter((visit) => visit.wouldRecommend === false).length;
  return {
    visits: visits.length,
    rated: visits.filter((visit) => RATING_CRITERIA.some((criterion) => visit.ratings[criterion] !== null)).length,
    averages,
    recommendYes,
    recommendNo,
    recommendShare: recommendYes + recommendNo === 0 ? null : recommendYes / (recommendYes + recommendNo),
  };
}

/** Weakest overall first (the one to look at), then the most visits; nothing rated at the end. */
function weakestFirst(a: RatingAverage, b: RatingAverage): number {
  const left = a.averages.overall;
  const right = b.averages.overall;
  if (left === null || right === null) return left === right ? b.visits - a.visits : left === null ? 1 : -1;
  return left - right || b.visits - a.visits;
}

/**
 * The visits signed off between two dates (the visit's date), with their
 * ratings, and the averages per file and per worker of each visit's team.
 * `fileId` keeps one file's visits, `workerId` the visits she worked on.
 */
export async function listRatings(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: string; to: string; fileId?: string | null; workerId?: string | null },
): Promise<RatingsReport> {
  requireSection(ctx, "REQUESTS", "READ");
  if (!isIsoDate(input.from) || !isIsoDate(input.to)) throw new ServiceError("Enter a valid date.");
  if (input.to < input.from) throw new ServiceError("The end date must not be before the start date.");

  let rows = ex
    .selectFrom("VisitReport")
    .innerJoin("Visit", "Visit.id", "VisitReport.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select([
      "Visit.id as visitId",
      "Visit.number",
      "Visit.visitDate",
      "File.id as fileId",
      "File.number as fileNumber",
      "File.division",
      "Site.commonName as siteName",
      "Client.name as clientName",
      "VisitReport.signoffStatus",
      "VisitReport.ratingQuality",
      "VisitReport.ratingPunctuality",
      "VisitReport.ratingBehaviour",
      "VisitReport.ratingMaterials",
      "VisitReport.ratingOverall",
      "VisitReport.wouldRecommend",
    ])
    .where("VisitReport.signoffStatus", "is not", null)
    .where("Visit.visitDate", ">=", localDate(input.from))
    .where("Visit.visitDate", "<=", localDate(input.to));
  if (input.fileId) rows = rows.where("Visit.fileId", "=", input.fileId);
  const workerId = input.workerId;
  if (workerId) {
    rows = rows.where((eb) =>
      eb.exists(
        eb
          .selectFrom("VisitWorker")
          .select("VisitWorker.id")
          .whereRef("VisitWorker.visitId", "=", "Visit.id")
          .where("VisitWorker.workerId", "=", workerId)
          .where("VisitWorker.seatStatus", "=", "ASSIGNED"),
      ),
    );
  }
  const found = await rows.orderBy("Visit.visitDate", "desc").orderBy("Visit.number", "desc").execute();

  const seats =
    found.length === 0
      ? []
      : await ex
          .selectFrom("VisitWorker")
          .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
          .select([
            "VisitWorker.visitId",
            "StaffMember.id",
            "StaffMember.number",
            "StaffMember.firstName",
            "StaffMember.lastName",
          ])
          .where(
            "VisitWorker.visitId",
            "in",
            found.map((row) => row.visitId),
          )
          .where("VisitWorker.seatStatus", "=", "ASSIGNED")
          .orderBy("StaffMember.lastName")
          .orderBy("StaffMember.firstName")
          .execute();

  const visits: RatedVisit[] = found.map((row) => ({
    visitId: row.visitId,
    number: row.number,
    visitDate: row.visitDate,
    file: { id: row.fileId, number: row.fileNumber, division: row.division },
    siteName: row.siteName,
    clientName: row.clientName,
    signoffStatus: row.signoffStatus as SignoffStatus,
    ratings: scoresOf(row),
    wouldRecommend: row.wouldRecommend === null ? null : row.wouldRecommend === 1,
    workers: seats
      .filter((seat) => seat.visitId === row.visitId)
      .map(({ id, number, firstName, lastName }) => ({ id, number, firstName, lastName })),
  }));

  const byFile = new Map<string, RatedVisit[]>();
  const byWorker = new Map<string, { worker: ComplaintWorker; visits: RatedVisit[] }>();
  for (const visit of visits) {
    byFile.set(visit.file.id, [...(byFile.get(visit.file.id) ?? []), visit]);
    for (const worker of visit.workers) {
      const entry = byWorker.get(worker.id) ?? { worker, visits: [] };
      entry.visits.push(visit);
      byWorker.set(worker.id, entry);
    }
  }
  const files: FileRating[] = [...byFile.values()]
    .map((group) => ({
      file: group[0].file,
      siteName: group[0].siteName,
      clientName: group[0].clientName,
      ...averageOf(group),
    }))
    .sort((a, b) => weakestFirst(a, b) || a.clientName.localeCompare(b.clientName, "ar"));
  const workers: WorkerRating[] = [...byWorker.values()]
    .filter((entry) => !workerId || entry.worker.id === workerId)
    .map((entry) => ({ worker: entry.worker, ...averageOf(entry.visits) }))
    .sort((a, b) => weakestFirst(a, b) || a.worker.lastName.localeCompare(b.worker.lastName, "ar"));

  return { visits, files, workers, overall: averageOf(visits) };
}

export const listRatingsQuery = query(listRatings);
