import * as React from "react";

import {
  BadgeCheck,
  CalendarClock,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  ClipboardPen,
  Coffee,
  Repeat,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import type { AbsenceStatus } from "@/features/operations/services/absences";
import type {
  AbsenceLine,
  AttendanceDayState,
  AttendanceWorker,
  ShownSeatStatus,
} from "@/features/operations/services/worker-attendance";
import type { PresenceProof } from "@/features/operations/validators/option-codes";
import { intlLocaleFor } from "@/i18n/config";
import { useCodeLabel } from "@/i18n/use-code-label";
import { cn } from "@/lib/utils";

import { useDates, workerName } from "./attendance-helpers";

/**
 * What the three views of «الحضور والغياب» draw alike: the worker's name, the
 * chips, an absence in two cells, and the previous/next switch.
 */

/** Two dates read from the reading start: one date when the range is a single day. */
export function DateRange({ from, to }: { from: string; to: string }) {
  const dates = useDates();
  if (from === to) return <Ltr className="whitespace-nowrap">{dates.short(from)}</Ltr>;
  return (
    <span className="whitespace-nowrap">
      <Ltr>{dates.short(from)}</Ltr> – <Ltr>{dates.short(to)}</Ltr>
    </span>
  );
}

// ── The worker ──────────────────────────────────────────────────────────────

/** The name, then the worker's number under it. */
export function WorkerCell({ worker }: { worker: AttendanceWorker | null }) {
  if (!worker) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="min-w-0">
      <bdi className="block font-bold">{workerName(worker)}</bdi>
      <Ltr className="block text-sm text-muted-foreground">{worker.number}</Ltr>
    </div>
  );
}

// ── Chips ───────────────────────────────────────────────────────────────────

const DAY_STATE_LOOK: Record<AttendanceDayState, { tone: StatusTone; icon: LucideIcon }> = {
  PRESENT: { tone: "success", icon: UserCheck },
  ABSENT: { tone: "danger", icon: UserX },
  NOT_TYPED: { tone: "warning", icon: ClipboardPen },
  SCHEDULED: { tone: "pending", icon: CalendarClock },
  RESTING: { tone: "neutral", icon: Coffee },
  NO_VISIT: { tone: "neutral", icon: CircleSlash },
};

export function DayStateChip({ state }: { state: AttendanceDayState }) {
  const label = useCodeLabel("WorkerAttendance.DayStates");
  const look = DAY_STATE_LOOK[state];
  return <StatusChip tone={look.tone} icon={look.icon} label={label(state)} />;
}

/** In force (recorded, approved), waiting (asked for), or of no effect (refused, cancelled). */
const ABSENCE_STATUS_TONE: Record<AbsenceStatus, StatusTone> = {
  RECORDED: "warning",
  APPROVED: "success",
  REQUESTED: "pending",
  REFUSED: "danger",
  CANCELLED: "neutral",
};

export function AbsenceStatusChip({ status }: { status: AbsenceStatus }) {
  const label = useCodeLabel("WorkerAttendance.AbsenceStatuses");
  return <StatusChip tone={ABSENCE_STATUS_TONE[status]} label={label(status)} />;
}

/** A seat she no longer holds as planned: lost to an absence, a rest day, handed over. */
const SEAT_LOOK: Partial<Record<ShownSeatStatus, { tone: StatusTone; icon: LucideIcon }>> = {
  ABSENT: { tone: "danger", icon: CalendarX },
  RESTING: { tone: "neutral", icon: Coffee },
  REPLACED: { tone: "neutral", icon: Repeat },
};

export function SeatStatusChip({ status }: { status: ShownSeatStatus }) {
  const label = useCodeLabel("WorkerAttendance.SeatStatuses");
  const look = SEAT_LOOK[status];
  if (!look) return null;
  return <StatusChip tone={look.tone} icon={look.icon} label={label(status)} />;
}

const PROOF_INK: Record<PresenceProof, string> = {
  BOTH: "text-success",
  ARRIVAL_ONLY: "text-warning-ink",
  DEPARTURE_ONLY: "text-warning-ink",
  NONE: "text-destructive",
};

/** Which of her two times the site contact initialled («توقيع/تأكيد الحضور»). */
export function PresenceProofNote({ proof, className }: { proof: PresenceProof | null; className?: string }) {
  const label = useCodeLabel("WorkerAttendance.PresenceProofs");
  if (!proof) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", PROOF_INK[proof], className)}>
      <BadgeCheck aria-hidden className="size-4 shrink-0" />
      {label(proof)}
    </span>
  );
}

/** Late beyond the grace time: a chip. Within it, nothing. */
export function LateChip({ lateMin, graceMin }: { lateMin: number | null; graceMin: number }) {
  const t = useTranslations("WorkerAttendance");
  if (lateMin === null || lateMin <= graceMin) return null;
  return <StatusChip tone="warning" label={t("Late", { minutes: lateMin })} />;
}

// ── An absence, in two cells ────────────────────────────────────────────────

/** Its dates, then its length (and the hours of a half day or some hours, the days of a leave). */
export function AbsenceWhen({ line }: { line: AbsenceLine }) {
  const t = useTranslations("WorkerAttendance");
  const typeLabel = useCodeLabel("Options.AbsenceType");
  const locale = useLocale();
  const days =
    line.days === null
      ? null
      : (line.days / 1000).toLocaleString(intlLocaleFor(locale), { maximumFractionDigits: 3 });
  return (
    <div className="min-w-0">
      <span className="block font-bold">
        <DateRange from={line.startDate} to={line.endDate} />
      </span>
      <span className="block text-sm text-muted-foreground">
        {typeLabel(line.type)}
        {line.startTime && line.endTime && (
          <>
            {" "}
            <Ltr>
              {line.startTime} – {line.endTime}
            </Ltr>
          </>
        )}
        {days !== null && (
          <>
            {" · "}
            {t("Absences.Days", { days })}
          </>
        )}
      </span>
    </div>
  );
}

/** What kind of absence (the kind of leave for a leave), how it was reported, and the reason typed. */
export function AbsenceKind({ line }: { line: AbsenceLine }) {
  const categoryLabel = useCodeLabel("WorkerAttendance.Categories");
  const leaveLabel = useCodeLabel("Options.LeaveType");
  const viaLabel = useCodeLabel("WorkerAttendance.Vias");
  const second = [line.reportedVia ? viaLabel(line.reportedVia) : null, line.reason].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0 max-w-72">
      <span className="block font-bold">
        {categoryLabel(line.category)}
        {line.leaveType && <span className="font-normal"> · {leaveLabel(line.leaveType)}</span>}
      </span>
      {second && (
        <bdi className="block truncate text-sm text-muted-foreground" title={second}>
          {second}
        </bdi>
      )}
    </div>
  );
}

/** People's treatment for pay: paid, justified. */
export function AbsencePay({ line }: { line: AbsenceLine }) {
  const paidLabel = useCodeLabel("WorkerAttendance.Paid");
  const justifiedLabel = useCodeLabel("WorkerAttendance.Justified");
  return (
    <div className="min-w-0 text-sm">
      <span className={cn("block whitespace-nowrap", line.paid === "NO" && "text-muted-foreground")}>
        {paidLabel(line.paid)}
      </span>
      <span className={cn("block whitespace-nowrap", line.justified === "NO" && "text-muted-foreground")}>
        {justifiedLabel(line.justified)}
      </span>
    </div>
  );
}

// ── Previous / next ─────────────────────────────────────────────────────────

/**
 * The academy's week switch (staff-check-history.tsx): previous, the period
 * in words, next, and a way back to the present when away from it.
 */
export function PeriodSwitch({
  label,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  presentLabel,
  onPresent,
}: {
  label: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  /** Shown only when away from the present. */
  presentLabel?: string;
  onPresent?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrevious}>
          {/* "Previous" points left in English and right in Arabic. */}
          <ChevronLeft className="rtl:rotate-180" />
          {previousLabel}
        </Button>
        <span className="min-w-56 text-center text-base font-bold">{label}</span>
        <Button variant="outline" size="sm" onClick={onNext}>
          {nextLabel}
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
      {presentLabel && onPresent && (
        <Button variant="outline" size="sm" onClick={onPresent}>
          {presentLabel}
        </Button>
      )}
    </div>
  );
}
