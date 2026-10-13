import { useDraggable } from "@dnd-kit/core";
import { Hand, Printer } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import type { WeekVisit } from "@/features/operations/services/week-programme";
import { useCodeLabel } from "@/i18n/use-code-label";
import { cn } from "@/lib/utils";
import { staffName } from "@/lib/text/names";

import { visitLook } from "./visit-look";
import { endTimeOf, type Lane } from "./week-layout";

/**
 * One visit on the week, from its start to its end: the academy's schedule
 * block (scheduling/_components/schedule-block.tsx), coloured by the visit's
 * status instead of the group's level. It shows the site, the order number,
 * the hours and the team, as much of it as its height allows. A click opens
 * the visit; a visit not started yet can be dragged to another day or time.
 */
export function VisitBlock({
  visit,
  box,
  lane,
  draggable,
  dimmed,
  onOpen,
}: {
  visit: WeekVisit;
  box: { top: number; height: number };
  lane: Lane;
  draggable: boolean;
  /** Another worker's week is in focus: this visit is not hers. */
  dimmed: boolean;
  onOpen: (visit: WeekVisit) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: visit.id,
    data: { visit },
    disabled: !draggable,
  });
  const look = visitLook(visit.status);
  const title = useBlockTitle(visit);
  const width = 100 / lane.lanes;

  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        top: box.top,
        height: box.height,
        insetInlineStart: `calc(${lane.lane * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        zIndex: isDragging ? 30 : 10,
        touchAction: "none",
      }}
      className={cn(
        "group overflow-hidden rounded border border-s-4 bg-card bg-linear-to-b px-1.5 py-0.5 text-start select-none",
        "flex flex-col gap-px outline-none focus-visible:ring-2 focus-visible:ring-ring",
        look.edge,
        look.wash,
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        look.greyed && "border-dashed opacity-70",
        dimmed && !isDragging && "opacity-35",
        isDragging && "opacity-40 ring-2 ring-primary",
      )}
      title={title}
      aria-label={title}
      {...listeners}
      {...attributes}
      aria-roledescription={undefined}
      onClick={() => onOpen(visit)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(visit);
        }
      }}
    >
      <BlockBody visit={visit} height={box.height} />
    </div>
  );
}

/** What a block says, by height: the site always; the hours, the order number and the team when there is room. */
export function BlockBody({ visit, height }: { visit: WeekVisit; height: number }) {
  const t = useTranslations("WeekProgramme");
  const separator = useLocale() === "ar" ? "، " : ", ";
  const look = visitLook(visit.status);
  const StatusIcon = look.icon;
  const openSeats = Math.max(0, visit.workersNeeded - visit.team.length);
  const firstNames = visit.team.map((member) => member.firstName).filter(Boolean);

  return (
    <>
      <span className="flex min-w-0 items-start gap-1">
        <StatusIcon aria-hidden className={cn("mt-px size-3.5 shrink-0", look.ink)} />
        <bdi className={cn("min-w-0 flex-1 truncate text-xs leading-tight font-bold", look.greyed && "line-through")}>
          {visit.siteLabel}
        </bdi>
        {visit.changedAfterPrint ? (
          <Printer aria-hidden className="mt-px size-3.5 shrink-0 text-warning-ink" />
        ) : visit.isManuallyEdited ? (
          <Hand aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </span>
      {height > 36 && (
        <span className="truncate text-xs leading-tight text-foreground/80">
          <Ltr>
            {visit.startTime}–{endTimeOf(visit)}
          </Ltr>
          <span className="text-foreground/60"> · </span>
          <Ltr>{visit.number}</Ltr>
        </span>
      )}
      {height > 60 && (
        <span className="truncate text-xs leading-tight text-foreground/80">
          {firstNames.length > 0 && <bdi>{firstNames.join(separator)}</bdi>}
          {firstNames.length > 0 && openSeats > 0 && " · "}
          {openSeats > 0 && (
            <span className="font-semibold text-warning-ink">{t("OpenSeats", { count: openSeats })}</span>
          )}
        </span>
      )}
    </>
  );
}

/** A value read left to right inside a plain string (a tooltip cannot hold `<Ltr>`): Unicode's isolate marks. */
const ltrText = (text: string) => `⁦${text}⁩`;

/** The whole visit in one line, for the pointer's tooltip and for a screen reader. */
function useBlockTitle(visit: WeekVisit): string {
  const t = useTranslations("WeekProgramme");
  const statusLabel = useCodeLabel("VisitStatuses");
  const separator = useLocale() === "ar" ? "، " : ", ";
  const team = visit.team.map((member) => staffName(member)).join(separator);
  const openSeats = Math.max(0, visit.workersNeeded - visit.team.length);
  return [
    visit.siteLabel,
    t("OrderNumber", { number: ltrText(visit.number) }),
    ltrText(`${visit.startTime}–${endTimeOf(visit)}`),
    statusLabel(visit.status),
    team,
    openSeats > 0 ? t("OpenSeats", { count: openSeats }) : "",
    visit.changedAfterPrint ? t("ChangedAfterPrint") : visit.isManuallyEdited ? t("MovedByHand") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
