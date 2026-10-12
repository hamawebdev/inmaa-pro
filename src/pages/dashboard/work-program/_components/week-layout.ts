import { clockOf, minutesOf } from "@/features/operations/rules/calendar";
import { seatsClash, type Seat } from "@/features/operations/rules/working-time";
import type { WeekVisit, WeekWorker } from "@/features/operations/services/week-programme";

/**
 * The geometry of the week's calendar, apart from React so that it can be
 * tested: the academy's grid (an hour is 64 px, a drop snaps to the half hour:
 * its src/data/schedule.ts), the hours it covers, where each visit's block
 * sits, and what the screen can tell before a drop is sent.
 */

export const HOUR_HEIGHT_PX = 64;
export const SLOT_MIN = 30;
export const SLOT_HEIGHT_PX = (HOUR_HEIGHT_PX * SLOT_MIN) / 60;
/** The shortest block, so that a site's name can always be read. */
export const MIN_BLOCK_PX = 24;

/** The academy's grid runs 08:00 to 22:00; a cleaning day starts earlier. It grows to hold any visit of the week. */
export const DEFAULT_HOURS = { start: 6, end: 22 } as const;

/** What the geometry needs of a visit: its start ("HH:MM") and its length in minutes. */
type Timed = { startTime: string; durationMin: number };

export const startMinOf = (visit: Timed) => minutesOf(visit.startTime);
export const endMinOf = (visit: Timed) => minutesOf(visit.startTime) + visit.durationMin;
/** The visit's end on the clock; past midnight it reads as the next day's time. */
export const endTimeOf = (visit: Timed) => clockOf(endMinOf(visit));

/** The hours the grid shows: the default day, widened to the earliest start and latest end of the week. */
export function gridHours(visits: readonly Timed[]): { start: number; end: number } {
  let start: number = DEFAULT_HOURS.start;
  let end: number = DEFAULT_HOURS.end;
  for (const visit of visits) {
    start = Math.min(start, Math.floor(startMinOf(visit) / 60));
    end = Math.max(end, Math.ceil(endMinOf(visit) / 60));
  }
  return { start: Math.max(0, start), end: Math.min(24, end) };
}

/** The half hours of the grid, as minutes after midnight. */
export function slotsOf(grid: { start: number; end: number }): number[] {
  const slots: number[] = [];
  for (let minute = grid.start * 60; minute < grid.end * 60; minute += SLOT_MIN) slots.push(minute);
  return slots;
}

/** A block's place in its day: its lane among the visits it overlaps, and how many lanes they need. */
export interface Lane {
  lane: number;
  lanes: number;
}

/**
 * Visits at the same time on different sites are the rule here, not a clash:
 * each group of visits that overlap shares the day's width in lanes, the
 * earliest and longest first, as a desk calendar draws them.
 */
export function layoutDay(visits: readonly (Timed & { id: string })[]): Map<string, Lane> {
  const placed = new Map<string, Lane>();
  const ordered = [...visits].sort(
    (a, b) => startMinOf(a) - startMinOf(b) || b.durationMin - a.durationMin || a.id.localeCompare(b.id),
  );
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;
  const close = () => {
    for (const item of group) placed.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const visit of ordered) {
    const start = startMinOf(visit);
    const end = Math.max(endMinOf(visit), start + SLOT_MIN);
    if (start >= groupEnd) close();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    group.push({ id: visit.id, lane });
    groupEnd = group.length === 1 ? end : Math.max(groupEnd, end);
  }
  close();
  return placed;
}

/** Where a block sits in its day's column, in pixels: cut at the grid's end (a night visit runs on past midnight). */
export function blockBox(visit: Timed, grid: { start: number; end: number }): { top: number; height: number } {
  const start = startMinOf(visit);
  const top = ((start - grid.start * 60) / 60) * HOUR_HEIGHT_PX;
  const shown = Math.min(endMinOf(visit), grid.end * 60) - start;
  return { top, height: Math.max((shown / 60) * HOUR_HEIGHT_PX, MIN_BLOCK_PX) };
}

/** The half hours a block dropped on `minute` would cover, to light them while dragging. */
export function coveredSlots(minute: number, durationMin: number): { from: number; to: number } {
  return { from: minute, to: minute + Math.max(durationMin, SLOT_MIN) };
}

/** Where a drop lands: the day, and the start as minutes after midnight. */
export interface DropCell {
  date: string;
  minute: number;
}

/**
 * Why the move would be refused, as far as the screen can tell before asking:
 * a day already past, or a seated worker with another visit then (the travel
 * time between two sites counted). The service decides; this only colours the
 * cells under the block while it is dragged, as the academy's calendar does.
 */
export function dropProblem(
  visit: Pick<WeekVisit, "id" | "siteId" | "durationMin" | "team">,
  cell: DropCell,
  context: { today: string; workers: ReadonlyMap<string, Pick<WeekWorker, "seats">>; travelGapMin: number },
): "PAST" | "OVERLAP" | null {
  if (cell.date < context.today) return "PAST";
  const moved: Seat = {
    visitId: visit.id,
    siteId: visit.siteId,
    date: cell.date,
    startTime: clockOf(cell.minute),
    durationMin: visit.durationMin,
  };
  const busy = visit.team.some((member) =>
    (context.workers.get(member.workerId)?.seats ?? []).some(
      (seat) => seat.visitId !== visit.id && seatsClash(moved, seat, context.travelGapMin),
    ),
  );
  return busy ? "OVERLAP" : null;
}
