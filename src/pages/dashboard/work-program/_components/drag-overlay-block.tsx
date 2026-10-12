import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import type { WeekVisit } from "@/features/operations/services/week-programme";
import { cn } from "@/lib/utils";

import { BlockBody } from "./visit-block";
import { visitLook } from "./visit-look";

/**
 * The block under the pointer while a visit is dragged: the academy's drag
 * overlay (scheduling/_components/drag-overlay-block.tsx), the size of the
 * block it lifts, raised, with the day and time it would land on.
 */
export function DragOverlayBlock({
  visit,
  height,
  landing,
  refused,
}: {
  visit: WeekVisit;
  height: number;
  /** The day and the start it would land on, while over the grid. */
  landing: { day: string; time: string } | null;
  refused: boolean;
}) {
  const t = useTranslations("WeekProgramme");
  const look = visitLook(visit.status);
  return (
    <div
      style={{ height }}
      className={cn(
        "pointer-events-none flex size-full flex-col gap-px overflow-hidden rounded border border-s-4 bg-card bg-linear-to-b px-1.5 py-0.5 text-start opacity-95 shadow-lg",
        look.edge,
        look.wash,
        refused && "ring-2 ring-destructive",
      )}
    >
      {landing && (
        <span
          className={cn(
            "w-fit rounded px-1 text-xs leading-tight font-bold",
            refused ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {t("LandsOn", { day: landing.day })} <Ltr>{landing.time}</Ltr>
        </span>
      )}
      <BlockBody visit={visit} height={height} />
    </div>
  );
}
