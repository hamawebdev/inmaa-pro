import { useMemo, useRef, useState } from "react";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { clockOf } from "@/features/operations/rules/calendar";
import type { MoveTarget, WeekProgramme, WeekVisit } from "@/features/operations/services/week-programme";
import { intlLocaleFor } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { CalendarCell } from "./calendar-cell";
import { DragOverlayBlock } from "./drag-overlay-block";
import { VisitBlock } from "./visit-block";
import {
  HOUR_HEIGHT_PX,
  SLOT_HEIGHT_PX,
  blockBox,
  coveredSlots,
  dropProblem,
  gridHours,
  layoutDay,
  slotsOf,
  type DropCell,
} from "./week-layout";

/**
 * The week as a calendar: the academy's weekly calendar
 * (scheduling/_components/weekly-calendar.tsx), with dated days instead of a
 * timeless week, the visits of every team instead of one classroom's sessions
 * (visits at the same time share the day in lanes), and a drop that moves a
 * visit, its team with it. Saturday comes first, at the start of the line: on
 * the right in Arabic.
 */

/** The cell a block lands on: the one under its top edge, to the nearest half hour, at the middle of its width. */
const underTopEdge: CollisionDetection = ({ collisionRect, droppableRects, droppableContainers }) => {
  const x = collisionRect.left + collisionRect.width / 2;
  const y = collisionRect.top + SLOT_HEIGHT_PX / 2;
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id);
    if (rect && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
      return [{ id: container.id, data: { droppableContainer: container, value: 1 } }];
    }
  }
  return [];
};

const cellOf = (data: unknown): DropCell | null => {
  const cell = data as Partial<DropCell> | undefined;
  return cell && typeof cell.date === "string" && typeof cell.minute === "number"
    ? { date: cell.date, minute: cell.minute }
    : null;
};

export function WeekCalendar({
  week,
  today,
  canMove,
  busy,
  focusWorkerId,
  onOpen,
  onMove,
}: {
  week: WeekProgramme;
  /** The centre's date: days before it are shaded and take no drop. */
  today: string;
  /** The user may move visits (the requests section, to write). */
  canMove: boolean;
  /** A move is being saved, or the week is being read again. */
  busy: boolean;
  /** One worker's week in focus: the other visits are dimmed. */
  focusWorkerId: string | null;
  onOpen: (visit: WeekVisit) => void;
  onMove: (visit: WeekVisit, target: MoveTarget) => void;
}) {
  const t = useTranslations("WeekProgramme");
  const locale = useLocale();
  const weekdayFormat = new Intl.DateTimeFormat(intlLocaleFor(locale), { weekday: "short", timeZone: "UTC" });
  const longWeekdayFormat = new Intl.DateTimeFormat(intlLocaleFor(locale), { weekday: "long", timeZone: "UTC" });
  const dayFormat = new Intl.DateTimeFormat(intlLocaleFor(locale), { day: "numeric", month: "short", timeZone: "UTC" });
  const dayOf = (date: string) => new Date(`${date}T00:00:00Z`);

  const [active, setActive] = useState<{ visit: WeekVisit; height: number } | null>(null);
  const [over, setOver] = useState<DropCell | null>(null);
  // A drag that ends where it began must not also open the visit.
  const draggedAt = useRef(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const grid = useMemo(() => gridHours(week.visits), [week.visits]);
  const slots = useMemo(() => slotsOf(grid), [grid]);
  const hours = useMemo(() => Array.from({ length: grid.end - grid.start }, (_, index) => grid.start + index), [grid]);
  const byDay = useMemo(() => {
    const days = new Map<string, { visits: WeekVisit[]; lanes: ReturnType<typeof layoutDay> }>();
    for (const date of week.dates) {
      const visits = week.visits.filter((visit) => visit.date === date);
      days.set(date, { visits, lanes: layoutDay(visits) });
    }
    return days;
  }, [week.dates, week.visits]);
  const workers = useMemo(() => new Map(week.workers.map((worker) => [worker.id, worker])), [week.workers]);

  const problem =
    active && over ? dropProblem(active.visit, over, { today, workers, travelGapMin: week.rules.travelGapMin }) : null;
  const lit = active && over ? { date: over.date, ...coveredSlots(over.minute, active.visit.durationMin) } : null;

  const handleDragStart = (event: DragStartEvent) => {
    const visit = (event.active.data.current as { visit?: WeekVisit } | undefined)?.visit;
    if (!visit) return;
    setActive({ visit, height: event.active.rect.current.initial?.height ?? blockBox(visit, grid).height });
  };

  const handleDragOver = (event: DragOverEvent) => setOver(cellOf(event.over?.data.current));

  const handleDragEnd = (event: DragEndEvent) => {
    const visit = active?.visit;
    setActive(null);
    setOver(null);
    draggedAt.current = Date.now();
    const cell = cellOf(event.over?.data.current);
    if (!visit || !cell) return;
    const startTime = clockOf(cell.minute);
    if (cell.date === visit.date && startTime === visit.startTime) return;
    onMove(visit, { visitId: visit.id, date: cell.date, startTime });
  };

  const handleDragCancel = () => {
    setActive(null);
    setOver(null);
  };

  const open = (visit: WeekVisit) => {
    if (Date.now() - draggedAt.current < 400) return;
    onOpen(visit);
  };

  return (
    <div
      className={cn("relative overflow-auto rounded-lg border bg-background", busy && "pointer-events-none opacity-60")}
      aria-busy={busy}
      aria-label={t("Calendar")}
      role="region"
    >
      <div className="min-w-[720px]">
        {/* The days */}
        <div className="sticky top-0 z-20 flex border-b bg-background">
          <div className="sticky start-0 z-30 w-14 shrink-0 border-e bg-background" />
          {week.dates.map((date) => {
            const isToday = date === today;
            return (
              <div
                key={date}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex min-w-24 flex-1 flex-col items-center border-e py-2 text-center last:border-e-0",
                  date < today && "bg-muted/40",
                )}
              >
                <span className={cn("text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                  {weekdayFormat.format(dayOf(date))}
                </span>
                <span
                  className={cn(
                    "mt-0.5 rounded-full px-2 text-sm leading-snug font-bold",
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {dayFormat.format(dayOf(date))}
                </span>
              </div>
            );
          })}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={underTopEdge}
          modifiers={[restrictToWindowEdges]}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex">
            {/* The hours */}
            <div className="sticky start-0 z-20 w-14 shrink-0 border-e bg-background">
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{ height: HOUR_HEIGHT_PX }}
                  className="flex items-start justify-end border-b border-border/70 pe-1.5 pt-0.5"
                >
                  <Ltr className="text-xs text-muted-foreground">{`${String(hour).padStart(2, "0")}:00`}</Ltr>
                </div>
              ))}
            </div>

            {week.dates.map((date) => {
              const day = byDay.get(date);
              return (
                <div
                  key={date}
                  className={cn("relative min-w-24 flex-1 border-e last:border-e-0", date < today && "bg-muted/40")}
                >
                  {slots.map((minute) => {
                    const covered = lit !== null && lit.date === date && minute >= lit.from && minute < lit.to;
                    return (
                      <CalendarCell
                        key={minute}
                        date={date}
                        minute={minute}
                        lit={covered}
                        refused={covered && problem !== null}
                      />
                    );
                  })}
                  {day?.visits.map((visit) => (
                    <VisitBlock
                      key={visit.id}
                      visit={visit}
                      box={blockBox(visit, grid)}
                      lane={day.lanes.get(visit.id) ?? { lane: 0, lanes: 1 }}
                      draggable={canMove && visit.movable && !busy}
                      dimmed={focusWorkerId !== null && !visit.team.some((member) => member.workerId === focusWorkerId)}
                      onOpen={open}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {active ? (
              <DragOverlayBlock
                visit={active.visit}
                height={active.height}
                landing={over ? { day: longWeekdayFormat.format(dayOf(over.date)), time: clockOf(over.minute) } : null}
                refused={problem !== null}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
