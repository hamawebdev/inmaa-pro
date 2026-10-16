import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { VisitStatusChip } from "@/features/operations/components/visit-status-chip";
import { addDays, isIsoDate, weekStartOf } from "@/features/operations/rules/calendar";
import type { RuleOverrideInput } from "@/features/operations/services/assignment";
import {
  WORK_PROGRAM_PATH,
  getWeekProgrammeQuery,
  moveVisitAction,
  type MoveTarget,
  type MoveVisitResult,
  type WeekVisit,
} from "@/features/operations/services/week-programme";
import { VISIT_STATUSES } from "@/features/operations/validators/option-codes";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { intlLocaleFor } from "@/i18n/config";
import { matchErrorMessage, useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

import { ApprovalDialog, type ApprovalRequest } from "./approval-dialog";
import { WeekCalendar } from "./week-calendar";
import { WorkerLoad } from "./worker-load";

const ALL_ZONES = "ALL";

/** A name typed in another script keeps its own direction inside a sentence of the toast (FSI … PDI). */
const isolate = (text: string) => `⁨${text}⁩`;

/**
 * «برنامج العمل»: the toolbar (zone, dated week), the visits by status, the
 * calendar, and the workers' load; the academy's scheduling page client
 * (scheduling/_components/scheduling-page-client.tsx) with its classroom
 * selector turned into the zone filter and the week made a dated one. The
 * week and the zone live in the address, so the way back from a visit lands on
 * the same week.
 */
export function WeekProgrammeView() {
  const t = useTranslations("WeekProgramme");
  const locale = useLocale();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const ruleLabel = useCodeLabel("WorkRules");
  const placeLabel = useCodeLabel("ProgrammeWarnings");
  const clock = useCentreClock();
  const [params, setParams] = useSearchParams();
  // Moving a visit from «برنامج العمل» is an act of عمال النظافة (audit ACC-X1): the service checks the same.
  const canMove = useSectionLevel("WORKERS") === "WRITE";
  const canOverride = useCan("schedule.overrideRule");
  const [focusWorkerId, setFocusWorkerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);

  const thisWeek = weekStartOf(clock.today);
  const asked = params.get("week");
  const weekStart = asked && isIsoDate(asked) ? weekStartOf(asked) : thisWeek;
  const zoneId = params.get("zone") ?? "";

  const programme = useQuery({
    queryKey: [...pathKey(WORK_PROGRAM_PATH), weekStart, zoneId],
    queryFn: () => getWeekProgrammeQuery({ weekStart, zoneId: zoneId || null }),
    placeholderData: keepPreviousData,
  });
  const week = programme.data;
  const focused = week?.workers.find((worker) => worker.id === focusWorkerId) ?? null;

  const intl = intlLocaleFor(locale);
  const utc = (date: string) => new Date(`${date}T00:00:00Z`);
  const weekLabel = new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(utc(weekStart), utc(addDays(weekStart, 6)));
  const dayFormat = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  const go = (next: { week?: string; zone?: string }) => {
    const search = new URLSearchParams(params);
    if (next.week !== undefined) {
      if (next.week === thisWeek) search.delete("week");
      else search.set("week", next.week);
    }
    if (next.zone !== undefined) {
      if (next.zone) search.set("zone", next.zone);
      else search.delete("zone");
    }
    setParams(search, { replace: true });
  };

  const announce = (visit: WeekVisit, result: MoveVisitResult) => {
    if (!result.moved) return;
    const title = t("Moved", { number: visit.number, day: dayFormat.format(utc(result.date)), time: result.startTime });
    const notes = [
      ...result.warnings.map((warning) => `${isolate(warning.workerName)}: ${ruleLabel(warning.code)}`),
      ...result.placeWarnings.map((code) => placeLabel(code)),
      ...(result.changedAfterPrint ? [t("ReprintOrder")] : []),
    ];
    if (notes.length === 0) {
      toast.success(title);
      return;
    }
    toast.warning(title, {
      duration: 12_000,
      description: (
        <ul className="list-disc space-y-0.5 ps-4">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ),
    });
  };

  const move = async (visit: WeekVisit, target: MoveTarget, override?: RuleOverrideInput) => {
    setSaving(true);
    const result = await moveVisitAction({ ...target, override: override ?? null });
    setSaving(false);
    if (result.success) {
      setApproval(null);
      announce(visit, result.data);
      return;
    }
    // A rule only the manager may pass: he is asked for his reason, and the move is sent again with it.
    if (!override && canOverride && matchErrorMessage(result.error)?.key === "SeatNeedsManager") {
      setApproval({ visit, target, dayLabel: dayFormat.format(utc(target.date)) });
      return;
    }
    toast.error(errorMessage(result.error, t("MoveFailed")));
  };

  const visits = week?.visits ?? [];
  const counts = VISIT_STATUSES.map((status) => ({
    status,
    count: visits.filter((visit) => visit.status === status).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <Select
          value={zoneId || ALL_ZONES}
          onValueChange={(value) => {
            setFocusWorkerId(null);
            go({ zone: value === ALL_ZONES ? "" : value });
          }}
        >
          <SelectTrigger className="w-56" aria-label={t("Zone")}>
            <SelectValue placeholder={t("Zone")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ZONES}>{t("AllZones")}</SelectItem>
            {(week?.zones ?? []).map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => go({ week: addDays(weekStart, -7) })}>
            {/* "Previous" points left in English and right in Arabic. */}
            <ChevronLeft className="rtl:rotate-180" />
            {t("PreviousWeek")}
          </Button>
          <span className="min-w-56 text-center text-base font-bold">{weekLabel}</span>
          <Button variant="outline" size="sm" onClick={() => go({ week: addDays(weekStart, 7) })}>
            {t("NextWeek")}
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
        {weekStart !== thisWeek && (
          <Button variant="outline" size="sm" onClick={() => go({ week: thisWeek })}>
            {t("ThisWeek")}
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label={t("Counts")}>
        <span className="me-1 text-base font-bold">{t("Total", { count: visits.length })}</span>
        {counts.map(({ status, count }) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <VisitStatusChip status={status} />
            <span className="font-bold tabular-nums">{count}</span>
          </span>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t(canMove ? "Hint" : "HintReadOnly")}</p>
        {focused && (
          <Button variant="secondary" size="xs" onClick={() => setFocusWorkerId(null)}>
            <X />
            {t("Focused", { name: isolate(staffName(focused)) })}
          </Button>
        )}
      </div>

      {programme.isError ? (
        <ErrorState onRetry={() => void programme.refetch()} />
      ) : week ? (
        <WeekCalendar
          week={week}
          today={clock.today}
          canMove={canMove}
          busy={saving || programme.isPlaceholderData}
          focusWorkerId={focused?.id ?? null}
          onOpen={(visit) => void navigate(`/dashboard/visits/${visit.id}`)}
          onMove={(visit, target) => void move(visit, target)}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center text-base text-muted-foreground">
          {t("Loading")}
        </div>
      )}

      {week && <WorkerLoad week={week} focusWorkerId={focused?.id ?? null} onFocus={setFocusWorkerId} />}

      <ApprovalDialog
        request={approval}
        onCancel={() => setApproval(null)}
        onApprove={(override) => (approval ? move(approval.visit, approval.target, override) : Promise.resolve())}
      />
    </div>
  );
}
