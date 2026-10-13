import type {
  CommuneRow,
  FileRow,
  SiteRow,
  StaffMemberRow,
  VisitChecklistItemRow,
  VisitReportRow,
  VisitRow,
  VisitWorkerRow,
  ZoneRow,
} from "@/lib/db/models";

import type { Seat } from "../../rules/working-time";
import type { ProblemKind } from "../../validators/option-codes";
import type { ReturnedOrderValues } from "../../validators/returned-order";
import { staffName } from "@/lib/text/names";

/**
 * What the visit page reads to type a returned order: the visit, its site, its
 * team with each worker's other seats that week, its checklist and what has
 * already been typed. Every part is picked from the generated row types, so a
 * renamed column shows up here as a type error.
 *
 * A service will build this object from the database; until then
 * ./samples.ts stands in.
 */
export interface VisitEntryData {
  visit: Pick<
    VisitRow,
    | "id"
    | "number"
    | "visitDate"
    | "plannedStartTime"
    | "plannedDurationMin"
    | "workersNeeded"
    | "status"
    | "arrivalReportedAt"
    | "orderPrintedAt"
  >;
  file: Pick<FileRow, "id" | "number" | "division" | "serviceType">;
  site: Pick<SiteRow, "id" | "commonName" | "address">;
  commune: Pick<CommuneRow, "nameAr"> | null;
  zone: Pick<ZoneRow, "name"> | null;
  supervisor: Pick<StaffMemberRow, "firstName" | "lastName"> | null;
  workers: readonly VisitEntryWorker[];
  checklist: readonly VisitEntryChecklistItem[];
  /** What was typed before, or null for an order not typed yet. */
  report: VisitEntryReport | null;
  /** The problem kinds already reported from this visit's sheet. */
  problemKinds: readonly ProblemKind[];
}

export interface VisitEntryWorker {
  seat: Pick<
    VisitWorkerRow,
    | "id"
    | "workerId"
    | "role"
    | "seatStatus"
    | "arrivedTime"
    | "workStartTime"
    | "workEndTime"
    | "leftTime"
    | "presenceProof"
    | "lateReason"
  >;
  worker: Pick<
    StaffMemberRow,
    "id" | "number" | "firstName" | "lastName" | "sex" | "weeklyCapacityMin" | "availableDays"
  >;
  /** Her other seats that week, as worked or planned, for the working-time rules. */
  otherSeats: readonly Seat[];
  /** The days of the week a recorded absence or leave covers. */
  absentDates: readonly string[];
}

export type VisitEntryChecklistItem = Pick<
  VisitChecklistItemRow,
  | "id"
  | "kind"
  | "groupLabel"
  | "label"
  | "frequency"
  | "priority"
  | "carriedFromItemId"
  | "sortOrder"
  | "done"
  | "note"
>;

export type VisitEntryReport = Pick<
  VisitReportRow,
  | "returnedDate"
  | "completion"
  | "completionPercent"
  | "incompleteReason"
  | "needsExtraVisit"
  | "needsSupervisor"
  | "workerNotes"
  | "problemOnSite"
  | "signoffStatus"
  | "signoffAbsentReason"
  | "signoffName"
  | "signoffRole"
  | "signoffDate"
  | "signoffNotes"
  | "signedOnPaper"
  | "workerSigned"
  | "wantsOtherService"
  | "otherServiceText"
  | "ratingQuality"
  | "ratingPunctuality"
  | "ratingBehaviour"
  | "ratingMaterials"
  | "ratingOverall"
  | "wouldRecommend"
>;

/** The worker's name as the office reads it. */
export function workerName(worker: Pick<StaffMemberRow, "firstName" | "lastName">): string {
  return staffName(worker);
}

/** The form's starting values: what was typed before, else a blank sheet. */
export function entryValuesOf(data: VisitEntryData, today: string): ReturnedOrderValues {
  const report = data.report;
  return {
    returnedDate: report?.returnedDate ?? today,
    workers: data.workers.map(({ seat }) => ({
      seatId: seat.id,
      attended: seat.seatStatus !== "ABSENT",
      arrivedTime: seat.arrivedTime ?? "",
      workStartTime: seat.workStartTime ?? "",
      workEndTime: seat.workEndTime ?? "",
      leftTime: seat.leftTime ?? "",
      arrivalInitialled: seat.presenceProof === "BOTH" || seat.presenceProof === "ARRIVAL_ONLY",
      departureInitialled: seat.presenceProof === "BOTH" || seat.presenceProof === "DEPARTURE_ONLY",
      lateReason: seat.lateReason ?? "",
    })),
    checklist: [...data.checklist]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ id: item.id, done: item.done === true })),
    problemOnSite: report?.problemOnSite ?? null,
    problemKinds: [...data.problemKinds],
    problemDetails: report?.workerNotes ?? "",
    completion: (report?.completion as ReturnedOrderValues["completion"]) ?? null,
    completionPercent: report?.completionPercent ?? null,
    incompleteReason: report?.incompleteReason ?? "",
    needsExtraVisit: report?.needsExtraVisit ?? null,
    needsSupervisor: report?.needsSupervisor ?? null,
    signoffStatus: (report?.signoffStatus as ReturnedOrderValues["signoffStatus"]) ?? null,
    signoffAbsentReason: report?.signoffAbsentReason ?? "",
    signoffName: report?.signoffName ?? "",
    signoffRole: report?.signoffRole ?? "",
    signoffDate: report?.signoffDate ?? "",
    signoffNotes: report?.signoffNotes ?? "",
    wantsOtherService: report?.wantsOtherService ?? null,
    otherServiceText: report?.otherServiceText ?? "",
    ratings: {
      quality: report?.ratingQuality ?? null,
      punctuality: report?.ratingPunctuality ?? null,
      behaviour: report?.ratingBehaviour ?? null,
      materials: report?.ratingMaterials ?? null,
      overall: report?.ratingOverall ?? null,
    },
    wouldRecommend: report?.wouldRecommend ?? null,
    signedOnPaper: report?.signedOnPaper ?? false,
    workerSigned: report?.workerSigned ?? false,
  };
}
