import type { FileRow, SiteRow, StaffMemberRow, VisitRow, ZoneRow } from "@/lib/db/models";
import { staffName } from "@/lib/text/names";

import { noArrivalReported } from "../../rules/arrival-flag";
import { minutesOf, type ClockTime, type IsoDate } from "../../rules/calendar";
import { endTimeOf } from "../../rules/visit-dates";
import { VISIT_STATUSES, type VisitStatus } from "../../validators/option-codes";

/**
 * The day board: the visits of one day, as his study's «جدول العمليات اليومية»
 * lists them (الوقت، العميل، المنطقة، العاملة، الخدمة، الحالة), with the "no
 * arrival reported" flag.
 *
 * One row per visit, picked from the generated row types. A service will read
 * them from the database; until then ./samples.ts stands in.
 */
export interface DayBoardVisit {
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
  >;
  file: Pick<FileRow, "division" | "serviceType">;
  /** «اسم المتداول»: the name the site is known by. */
  site: Pick<SiteRow, "commonName" | "address">;
  zone: Pick<ZoneRow, "name"> | null;
  team: readonly Pick<StaffMemberRow, "firstName" | "lastName">[];
  /** An arrival is typed for at least one worker of the visit. */
  arrivalTyped: boolean;
  /** «الخدمة» on his table: the file's first ticks of «الخدمات المبرمجة» or «الخدمات المقدمة». */
  services: readonly BoardService[];
}

/** How the office heard the team was there, besides the returned order. */
export const ARRIVAL_VIAS = ["PHONE_WORKER", "PHONE_SUPERVISOR", "PHONE_CLIENT"] as const;
export type ArrivalVia = (typeof ARRIVAL_VIAS)[number];

/** One tick of the file's service lists: a code, or a line the office filled in. */
export interface BoardService {
  list: string;
  code: string | null;
  customLabel: string | null;
}

export interface DayBoardRow {
  visit: DayBoardVisit;
  endTime: ClockTime;
  noArrival: boolean;
  /** Seats still to fill: workers needed and not named. */
  openSeats: number;
}

/** The rows of the board, earliest first, each with its flag worked out for the clock given. */
export function boardRows(
  visits: readonly DayBoardVisit[],
  clock: { today: IsoDate; nowTime: ClockTime },
  graceMin = 15,
): DayBoardRow[] {
  return [...visits]
    .sort(
      (a, b) =>
        minutesOf(a.visit.plannedStartTime) - minutesOf(b.visit.plannedStartTime) ||
        a.visit.number.localeCompare(b.visit.number),
    )
    .map((visit) => ({
      visit,
      endTime: endTimeOf({ startTime: visit.visit.plannedStartTime, durationMin: visit.visit.plannedDurationMin }),
      noArrival: noArrivalReported(
        {
          date: visit.visit.visitDate,
          plannedStartTime: visit.visit.plannedStartTime,
          status: visit.visit.status as VisitStatus,
          arrivalReported: visit.visit.arrivalReportedAt !== null || visit.arrivalTyped,
        },
        clock,
        graceMin,
      ),
      openSeats: Math.max(0, visit.visit.workersNeeded - visit.team.length),
    }));
}

/** How many visits of the day are in each status, in the order of the seven, and how many are flagged. */
export function boardCounts(rows: readonly DayBoardRow[]): {
  byStatus: { status: VisitStatus; count: number }[];
  noArrival: number;
  total: number;
} {
  return {
    byStatus: VISIT_STATUSES.map((status) => ({
      status,
      count: rows.filter((row) => row.visit.visit.status === status).length,
    })).filter((entry) => entry.count > 0),
    noArrival: rows.filter((row) => row.noArrival).length,
    total: rows.length,
  };
}

/**
 * Arabic folds a few letters together for searching: alif with or without
 * hamza, alif maqsura and ya, ta marbuta and ha; diacritics and tatweel drop.
 */
export function searchKey(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();
}

/** True when the query is found in the site, the address, the zone, a worker's name, the order number or the service. */
export function rowMatches(
  row: DayBoardRow,
  query: string,
  serviceText: (service: BoardService) => string | null = (service) => service.customLabel,
): boolean {
  const wanted = searchKey(query);
  if (!wanted) return true;
  const { visit } = row;
  const haystack = [
    visit.site.commonName,
    visit.site.address,
    visit.zone?.name,
    visit.visit.number,
    ...visit.services.map(serviceText),
    ...visit.team.map((worker) => staffName(worker)),
  ]
    .filter(Boolean)
    .map((part) => searchKey(String(part)))
    .join(" | ");
  return wanted.split(/\s+/).every((word) => haystack.includes(word));
}
