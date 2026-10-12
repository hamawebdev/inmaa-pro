import { memo } from "react";

import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";

import { SLOT_HEIGHT_PX } from "./week-layout";

/**
 * One half hour of one day, where a visit can be dropped: the academy's
 * calendar cell (scheduling/_components/calendar-cell.tsx). The hour lines are
 * solid, the half-hour lines dashed. While a block is dragged, the half hours
 * it would cover light up, red when the screen already knows the move will be
 * refused.
 */
export const CalendarCell = memo(function CalendarCell({
  date,
  minute,
  lit,
  refused,
}: {
  date: string;
  /** Minutes after midnight. */
  minute: number;
  /** Covered by the block being dragged. */
  lit: boolean;
  refused: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `cell-${date}-${minute}`, data: { date, minute } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-b transition-colors",
        minute % 60 === 0 ? "border-dashed border-border/40" : "border-border/70",
        lit && !refused && "bg-primary/10",
        lit && refused && "bg-destructive/15",
      )}
      style={{ height: SLOT_HEIGHT_PX }}
    />
  );
});
