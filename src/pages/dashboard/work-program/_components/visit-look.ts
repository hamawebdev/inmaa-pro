import {
  CalendarCheck,
  CircleAlert,
  CircleCheckBig,
  CircleMinus,
  CircleX,
  Clock,
  ShieldAlert,
  Timer,
  type LucideIcon,
} from "lucide-react";

import type { StatusTone } from "@/components/status-chip";
import type { VisitStatus, WorkRuleLevel } from "@/features/operations/validators/option-codes";

/**
 * A visit's block wears its status as `VisitStatusChip` does (his colours: green
 * confirmed, yellow awaiting, blue done, red problem, black cancelled), with the
 * chip's icon, so that the colour is never the only signal. That component keeps
 * its map to itself: this one follows it and must change with it
 * (src/features/operations/components/visit-status-chip.tsx).
 */
const STATUS_TONE: Record<VisitStatus, StatusTone> = {
  CONFIRMED: "success",
  AWAITING_CONFIRMATION: "warning",
  IN_PROGRESS: "info",
  DONE: "info",
  POSTPONED: "pending",
  PROBLEM: "danger",
  CANCELLED: "neutral",
};

const STATUS_ICON: Record<VisitStatus, LucideIcon> = {
  CONFIRMED: CalendarCheck,
  AWAITING_CONFIRMATION: CircleAlert,
  IN_PROGRESS: Timer,
  DONE: CircleCheckBig,
  POSTPONED: Clock,
  PROBLEM: CircleX,
  CANCELLED: CircleMinus,
};

/**
 * The block is drawn on the card colour with its tone washed over it (an
 * image layer above the background colour), so that the grid's lines do not
 * show through it, in light and in dark.
 */
const TONE_LOOK: Record<StatusTone, { edge: string; wash: string; ink: string }> = {
  success: { edge: "border-success", wash: "from-success/14 to-success/14", ink: "text-success" },
  warning: { edge: "border-warning-ink", wash: "from-warning/20 to-warning/20", ink: "text-warning-ink" },
  info: { edge: "border-info", wash: "from-info/14 to-info/14", ink: "text-info" },
  progress: { edge: "border-progress", wash: "from-progress/14 to-progress/14", ink: "text-progress" },
  danger: { edge: "border-destructive", wash: "from-destructive/12 to-destructive/12", ink: "text-destructive" },
  pending: { edge: "border-border-strong", wash: "from-muted to-muted", ink: "text-foreground/75" },
  neutral: { edge: "border-foreground/60", wash: "from-muted to-muted", ink: "text-muted-foreground" },
};

/** Cancelled and postponed visits stay on the week, greyed: they hold no seat in anyone's hours. */
const GREYED: readonly VisitStatus[] = ["CANCELLED", "POSTPONED"];

export function visitLook(status: VisitStatus) {
  return { icon: STATUS_ICON[status], greyed: GREYED.includes(status), ...TONE_LOOK[STATUS_TONE[status]] };
}

/**
 * A working-time finding as a chip, in the tones of the seat picker's chips
 * (components/visit-team/finding-chips.tsx): refused red, the manager's rules
 * and warnings amber, a note blue. The manager's rules carry his shield.
 */
export const LEVEL_LOOK: Record<WorkRuleLevel, { tone: StatusTone; icon?: LucideIcon }> = {
  REFUSED: { tone: "danger" },
  NEEDS_MANAGER: { tone: "warning", icon: ShieldAlert },
  WARNING: { tone: "warning" },
  FLAG: { tone: "info" },
};
