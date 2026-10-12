import type { ReplacementExclusion, ReplacementTier, Sex } from "../validators/option-codes";

import { weekdayOf, type ClockTime, type IsoDate, type Weekday } from "./calendar";
import {
  DEFAULT_WORK_TIME_SETTINGS,
  checkWorkerSeats,
  loadMin,
  seatsClash,
  type Seat,
  type WorkTimeSettings,
} from "./working-time";

/**
 * Who can take an absent worker's place on a visit, best first.
 *
 * His study: «إذا غابت عاملة صباحًا: لا يجوز أن تبدأ المؤسسة في البحث
 * عشوائيًا» and the list he wants is the reserve first («قائمة احتياطية»,
 * «كل منطقة لها عاملة بديلة»), in the same zone and at the same time.
 *
 * The office always chooses; this only orders the choice and says why the
 * others are left out. It never reads a worker's health answers: only the
 * ability ticks of her form.
 */

/** The empty seat. */
export interface SeatToFill {
  visitId: string;
  siteId: string;
  zoneId: string | null;
  date: IsoDate;
  startTime: ClockTime;
  durationMin: number;
  /** The site's rules, entered by Clients in its office block. */
  womenOnly: boolean;
  requiredAbilities: readonly string[];
}

export interface ReplacementCandidate {
  workerId: string;
  /** Only the last tie-break, so that the order is always the same. */
  name: string;
  sex: Sex;
  zoneId: string | null;
  /** «عاملات احتياط» in his study. */
  isReserve: boolean;
  availableWeekdays: readonly Weekday[];
  /** The «القدرة البدنية» ticks of her form. */
  abilities: readonly string[];
  /** Suspended or penalised. */
  isSanctioned: boolean;
  /** An absence or a leave covers the seat's date. */
  isAbsent: boolean;
  /** The seat's date is her rotated rest day on this file. */
  isResting: boolean;
  weeklyCapacityMin: number | null;
  /** Her seats in the week of the seat to fill, without that seat. */
  weekSeats: readonly Seat[];
  /** How many visits she has done on this site. */
  visitsAtSite: number;
}

export interface RankedCandidate {
  workerId: string;
  tier: ReplacementTier;
  /** She has worked this site before. */
  knowsSite: boolean;
  /** Her planned minutes that week before taking the seat, and after. */
  loadBeforeMin: number;
  loadAfterMin: number;
  /** Taking the seat puts her above the legal week (and under the cap: above it she is left out). */
  overtime: boolean;
  /** Taking the seat puts her on the weekly rest day. */
  onRestDay: boolean;
}

export interface ReplacementRanking {
  ranked: RankedCandidate[];
  excluded: { workerId: string; reasons: ReplacementExclusion[] }[];
}

const TIER_ORDER: readonly ReplacementTier[] = [
  "FILE_ALTERNATE",
  "RESERVE_SAME_ZONE",
  "WORKER_SAME_ZONE",
  "RESERVE_OTHER_ZONE",
  "WORKER_OTHER_ZONE",
];

function tierOf(candidate: ReplacementCandidate, seat: SeatToFill, alternates: ReadonlySet<string>): ReplacementTier {
  if (alternates.has(candidate.workerId)) return "FILE_ALTERNATE";
  const sameZone = seat.zoneId !== null && candidate.zoneId === seat.zoneId;
  if (sameZone) return candidate.isReserve ? "RESERVE_SAME_ZONE" : "WORKER_SAME_ZONE";
  return candidate.isReserve ? "RESERVE_OTHER_ZONE" : "WORKER_OTHER_ZONE";
}

function exclusionsOf(
  candidate: ReplacementCandidate,
  seat: SeatToFill,
  settings: WorkTimeSettings,
): ReplacementExclusion[] {
  const reasons: ReplacementExclusion[] = [];
  if (candidate.isSanctioned) reasons.push("SANCTIONED");
  if (candidate.isAbsent) reasons.push("ABSENT");
  if (candidate.isResting) reasons.push("RESTING");
  if (!candidate.availableWeekdays.includes(weekdayOf(seat.date))) reasons.push("UNAVAILABLE_DAY");
  if (seat.womenOnly && candidate.sex !== "FEMALE") reasons.push("WOMEN_ONLY");
  if (seat.requiredAbilities.some((ability) => !candidate.abilities.includes(ability))) reasons.push("MISSING_ABILITY");

  const taken: Seat = seat;
  if (candidate.weekSeats.some((other) => seatsClash(other, taken, settings.travelGapMin))) reasons.push("OVERLAP");

  // The rules that need the manager are not worth offering: someone else can take the seat.
  const findings = checkWorkerSeats(candidate, [...candidate.weekSeats, taken], settings).filter((finding) =>
    finding.visitIds.includes(seat.visitId),
  );
  for (const code of ["DAY_SPAN_12H", "WEEK_OVER_48H", "NIGHT_WOMAN"] as const) {
    if (findings.some((finding) => finding.code === code)) reasons.push(code);
  }
  return reasons;
}

/**
 * Orders the candidates for one empty seat.
 *
 * Groups, best first: the file's named alternate; reserve workers of the
 * site's zone; other workers of that zone; reserve workers of another zone;
 * everybody else. Inside a group: those who have worked this site before, then
 * the lightest week, then those the seat keeps within the legal week, then the
 * name.
 */
export function rankReplacementCandidates(
  seat: SeatToFill,
  fileAlternateIds: readonly string[],
  candidates: readonly ReplacementCandidate[],
  settings: WorkTimeSettings = DEFAULT_WORK_TIME_SETTINGS,
): ReplacementRanking {
  const alternates = new Set(fileAlternateIds);
  const ranked: (RankedCandidate & { name: string })[] = [];
  const excluded: ReplacementRanking["excluded"] = [];

  for (const candidate of candidates) {
    const reasons = exclusionsOf(candidate, seat, settings);
    if (reasons.length > 0) {
      excluded.push({ workerId: candidate.workerId, reasons });
      continue;
    }
    const before = loadMin(candidate.weekSeats);
    const after = before + seat.durationMin;
    ranked.push({
      workerId: candidate.workerId,
      name: candidate.name,
      tier: tierOf(candidate, seat, alternates),
      knowsSite: candidate.visitsAtSite > 0,
      loadBeforeMin: before,
      loadAfterMin: after,
      overtime: after > settings.weeklyLegalMin,
      onRestDay: weekdayOf(seat.date) === settings.restWeekday,
    });
  }

  ranked.sort(
    (a, b) =>
      TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
      Number(b.knowsSite) - Number(a.knowsSite) ||
      a.loadBeforeMin - b.loadBeforeMin ||
      Number(a.overtime) - Number(b.overtime) ||
      a.name.localeCompare(b.name, "ar") ||
      a.workerId.localeCompare(b.workerId),
  );

  return { ranked: ranked.map(({ name: _name, ...rest }) => rest), excluded };
}
