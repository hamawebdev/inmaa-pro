import * as React from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { ScreenTabs } from "@/components/screen-tabs";
import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { cancelWorkerAbsenceAction } from "@/features/operations/services/absences";
import type { AbsenceLine } from "@/features/operations/services/worker-attendance";
import { useErrorMessage } from "@/i18n/errors";
import { useSearchParams } from "@/lib/compat/navigation";

import { AbsencesList } from "./_components/absences-list";
import { AddAbsenceDialog, type AbsenceRequest } from "./_components/add-absence-dialog";
import { mayRecordAbsence, useDates, workerName } from "./_components/attendance-helpers";
import {
  ATTENDANCE_VIEWS,
  attendanceHref,
  monthOfDate,
  readAttendanceParams,
  type AttendanceParams,
} from "./_components/attendance-params";
import { ATTENDANCE_KEY, dayQuery } from "./_components/attendance-queries";
import { DayCounts, DaySheet } from "./_components/day-sheet";
import { useReasonConfirm } from "./_components/reason-confirm";
import { WorkerHistory } from "./_components/worker-history";

/** A date or a number kept whole inside a sentence that is not a component (a toast, a dialog's text). */
const isolate = (text: string) => `⁦${text}⁩`;

/**
 * Section «عمال النظافة», tab «الحضور والغياب». Owner: Operations (#9, #12).
 *
 * Closest academy screen: the attendance family
 * (pages/dashboard/attendance/_components/attendance-screen.tsx and its
 * overviews). The academy's first switch (whose records) is the section here;
 * its second switch is kept: «تسجيلات الحضور» (one day, every worker, the
 * times typed from the returned orders) and «الغيابات» (a month of absences).
 * The header button records an absence, as the academy's adds one; a row
 * button opens the worker's history, as the academy's person pages do. The
 * view, the day, the month and the worker are kept in the address.
 *
 * The academy sets its second switch beside its first, above the search; the
 * first switch here is the section's strip, so the view switch opens the
 * view's own row of controls instead (the day or month switch, the search),
 * and the day's counts stand in the heading row, as on the visits tab: the
 * first worker of the day shows where the academy's first person does.
 */
export default function WorkerAttendancePage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("WorkerAttendance");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dates = useDates();
  const clock = useCentreClock();
  const params = readAttendanceParams(useSearchParams());
  const day = params.day ?? clock.today;
  const thisMonth = monthOfDate(clock.today);
  const month = params.month ?? monthOfDate(day);
  const canWrite = mayRecordAbsence();
  const showsDay = params.view === "records" && !params.worker;
  // The day sheet reads the same day under the same key: TanStack Query asks once.
  const daySheet = useQuery({ ...dayQuery(day), enabled: showsDay });

  const { view, day: dayParam, month: monthParam } = params;
  const go = (next: Partial<AttendanceParams>) => navigate(attendanceHref({ ...params, ...next }), { replace: true });
  const historyHref = React.useCallback(
    (workerId: string) => attendanceHref({ view, day: dayParam, month: monthParam, worker: workerId }),
    [view, dayParam, monthParam],
  );

  // What shows absences, after one is recorded or cancelled. The visits board refreshes through the actions.
  const refresh = React.useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
    [queryClient],
  );

  const [absence, setAbsence] = React.useState<{ open: boolean; request: AbsenceRequest }>({
    open: false,
    request: { date: clock.today },
  });
  const recordAbsence = React.useCallback(
    (workerId?: string) =>
      setAbsence({ open: true, request: { workerId, date: view === "records" && !params.worker ? day : clock.today } }),
    [view, params.worker, day, clock.today],
  );

  const [askReason, reasonDialog] = useReasonConfirm();
  const cancelAbsence = React.useCallback(
    async (line: AbsenceLine) => {
      const range =
        line.startDate === line.endDate
          ? isolate(dates.short(line.startDate))
          : `${isolate(dates.short(line.startDate))} – ${isolate(dates.short(line.endDate))}`;
      const reason = await askReason({
        title: t("Absences.CancelTitle"),
        description: t("Absences.CancelDescription", {
          name: line.worker ? workerName(line.worker) : "—",
          dates: range,
        }),
        reasonLabel: t("Absences.CancelReason"),
        confirmLabel: t("Absences.CancelConfirm"),
        cancelLabel: t("Absences.Keep"),
      });
      if (reason === null) return;
      const answer = await cancelWorkerAbsenceAction({ absenceId: line.id, reason });
      if (!answer.success) {
        toast.error(errorMessage(answer.error, t("Absences.CancelFailed")));
        return;
      }
      const back = answer.data.seatsGivenBack.length;
      const kept = answer.data.seatsReplaced.length;
      const description = [
        back > 0 ? t("Absences.SeatsGivenBack", { count: back }) : "",
        kept > 0 ? t("Absences.SeatsKept", { count: kept }) : "",
      ]
        .filter(Boolean)
        .join(" ");
      toast.success(t("Absences.Cancelled"), description ? { description } : undefined);
      refresh();
    },
    [askReason, dates, errorMessage, refresh, t],
  );

  const views = ATTENDANCE_VIEWS.map((each) => ({
    id: each,
    label: t(`Views.${each}`),
    href: attendanceHref({ view: each, day: dayParam, month: monthParam }),
  }));
  const viewTabs = <ScreenTabs section="workers" items={views} value={view} ariaLabel={t("ViewsLabel")} />;

  const counts = showsDay && daySheet.data ? <DayCounts rows={daySheet.data.rows} /> : null;
  const addButton = canWrite ? (
    <Button variant="add" onClick={() => recordAbsence()}>
      <Plus />
      {t("RecordAbsence")}
    </Button>
  ) : null;

  return (
    <SectionScreen
      section="workers"
      title={tNav("WorkerAttendance")}
      actions={
        counts || addButton ? (
          <>
            {counts}
            {addButton}
          </>
        ) : undefined
      }
    >
      {params.worker ? (
        <div className="space-y-5 tall:space-y-6">
          {viewTabs}
          <WorkerHistory
            key={params.worker}
            workerId={params.worker}
            month={month}
            thisMonth={thisMonth}
            onMonthChange={(next) => go({ month: next })}
            backHref={attendanceHref({ view, day: dayParam, month: monthParam })}
            onRecordAbsence={canWrite ? recordAbsence : undefined}
            onCancel={canWrite ? cancelAbsence : undefined}
          />
        </div>
      ) : view === "absences" ? (
        <AbsencesList
          month={month}
          thisMonth={thisMonth}
          onMonthChange={(next) => go({ month: next === thisMonth ? null : next })}
          historyHref={historyHref}
          onCancel={canWrite ? cancelAbsence : undefined}
          tabs={viewTabs}
        />
      ) : (
        <DaySheet
          day={day}
          today={clock.today}
          onDayChange={(next) => go({ day: next === clock.today ? null : next })}
          historyHref={historyHref}
          onRecordAbsence={canWrite ? recordAbsence : undefined}
          tabs={viewTabs}
        />
      )}

      <AddAbsenceDialog
        open={absence.open}
        request={absence.request}
        onOpenChange={(open) => setAbsence((current) => ({ ...current, open }))}
        onRecorded={refresh}
      />
      {reasonDialog}
    </SectionScreen>
  );
}
