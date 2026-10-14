import {
  AlarmClock,
  CircleCheck,
  CircleDashed,
  CirclePlay,
  CircleX,
  ClockAlert,
  Hourglass,
  Timer,
  TimerOff,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import type { ComplaintStatus } from "@/features/operations/services/complaints";
import type { ComplaintCounter } from "@/features/operations/rules/complaint-counter";
import type { ComplaintCounterState } from "@/features/operations/validators/option-codes";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";
import { cn } from "@/lib/utils";

import { useDates } from "../../../worker-attendance/_components/attendance-helpers";
import { QUALITY_PATH } from "../quality-views";

/** What the complaint screens draw alike: the two chips, a moment, a duration, a worker's name. */

/** Under the tab's key: the actions revalidate `/dashboard/quality`, which refreshes every list and page below it. */
export const qualityKey = (...parts: string[]) => [...pathKey(QUALITY_PATH), ...parts];

/** A date or a number kept whole inside a sentence that is not a component (a toast, a title). */
export const isolate = (text: string) => `⁦${text}⁩`;

export const workerName = (worker: { firstName: string; lastName: string }) => staffName(worker);

// ── The counter ─────────────────────────────────────────────────────────────

const COUNTER_LOOK: Record<ComplaintCounterState, { tone: StatusTone; icon: LucideIcon }> = {
  RUNNING: { tone: "progress", icon: Timer },
  CLOSE_TO_TARGET: { tone: "warning", icon: AlarmClock },
  LATE: { tone: "danger", icon: TimerOff },
  ANSWERED_IN_TIME: { tone: "success", icon: CircleCheck },
  ANSWERED_LATE: { tone: "warning", icon: ClockAlert },
};

/** Where the complaint stands against its target: running, close to it, late, answered in time or late. */
export function CounterChip({ counter, className }: { counter: ComplaintCounter; className?: string }) {
  const label = useCodeLabel("ComplaintCounter");
  const look = COUNTER_LOOK[counter.state];
  return <StatusChip tone={look.tone} icon={look.icon} label={label(counter.state)} className={className} />;
}

/** Office minutes, as hours and minutes. */
export function useDuration() {
  const t = useTranslations("Complaints");
  return (minutes: number) => {
    const whole = Math.abs(Math.round(minutes));
    const hours = Math.floor(whole / 60);
    const rest = whole % 60;
    return hours === 0 ? t("Minutes", { minutes: rest }) : t("HoursMinutes", { hours, minutes: rest });
  };
}

const NOTE_KEY: Record<ComplaintCounterState, string> = {
  RUNNING: "Counter.Left",
  CLOSE_TO_TARGET: "Counter.Left",
  LATE: "Counter.Late",
  ANSWERED_IN_TIME: "Counter.Early",
  ANSWERED_LATE: "Counter.AnsweredLate",
};

/** The line under the chip, in office time: what is left, how late it is, or how early or late the answer came. */
export function CounterNote({ counter, className }: { counter: ComplaintCounter; className?: string }) {
  const t = useTranslations("Complaints");
  const duration = useDuration();
  const text = t(NOTE_KEY[counter.state], { duration: duration(counter.marginMin) });
  return (
    <span className={cn("block truncate text-sm text-muted-foreground", className)} title={text}>
      {text}
    </span>
  );
}

// ── The status ──────────────────────────────────────────────────────────────

const STATUS_LOOK: Record<ComplaintStatus, { tone: StatusTone; icon: LucideIcon }> = {
  NEW: { tone: "pending", icon: Hourglass },
  IN_PROGRESS: { tone: "progress", icon: CirclePlay },
  SETTLED: { tone: "success", icon: CircleCheck },
  REJECTED: { tone: "neutral", icon: CircleX },
};

export function ComplaintStatusChip({ status, className }: { status: ComplaintStatus; className?: string }) {
  const label = useCodeLabel("Complaints.Statuses");
  const look = STATUS_LOOK[status] ?? { tone: "neutral", icon: CircleDashed };
  return <StatusChip tone={look.tone} icon={look.icon} label={label(status)} className={className} />;
}

// ── A moment ────────────────────────────────────────────────────────────────

/** A centre date and time in digits, kept in reading order. */
export function Moment({ at, className }: { at: { date: string; time: string }; className?: string }) {
  const dates = useDates();
  return (
    <Ltr className={cn("whitespace-nowrap", className)}>
      {dates.short(at.date)} {at.time}
    </Ltr>
  );
}

/** A centre date in digits. */
export function DayText({ date, className }: { date: string; className?: string }) {
  const dates = useDates();
  return <Ltr className={cn("whitespace-nowrap", className)}>{dates.short(date)}</Ltr>;
}
