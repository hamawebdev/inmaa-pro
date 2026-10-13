import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarOff, CalendarPlus, Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { ScreenTabs } from "@/components/screen-tabs";
import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { monthBounds } from "@/features/people/components/format";
import { useMay, useMayIn } from "@/features/people/components/may";
import { MonthSwitch } from "@/features/people/components/month-switch";
import { listEmployeeAttendanceQuery } from "@/features/people/services/employee-attendance";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { pathKey } from "@/lib/compat/revalidate";

import { AbsencesView, LeaveView, RecordsView } from "./_components/attendance-views";
import { useAttendanceEntries } from "./_components/use-attendance-entries";

/**
 * Section «الموظفون», tab «الحضور والغياب»: the centre's employees' times in
 * and out, their absences and their leave. Owner: People.
 *
 * Closest academy screens: its employee attendance family (employee-attendance,
 * employee-absences): a second strip for records and absences, a table, an
 * "add" button in the heading. Leave is a third view, and what was recorded
 * can be changed or taken off, which the academy cannot do.
 */
const VIEWS = ["records", "absences", "leave"] as const;
type View = (typeof VIEWS)[number];

export default function EmployeeAttendancePage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("EmployeeAttendance");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { today } = useCentreClock();
  const writes = useMayIn("EMPLOYEES", "WRITE");
  const edits = useMay("attendance.employee.edit") && writes;
  const entries = useAttendanceEntries();

  const thisMonth = today.slice(0, 7);
  const asked = params.get("view") as View | null;
  const view: View = asked && VIEWS.includes(asked) ? asked : "records";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") ?? "") ? (params.get("month") as string) : thisMonth;
  const href = (next: { view?: View; month?: string }) => {
    const query = new URLSearchParams();
    const nextView = next.view ?? view;
    const nextMonth = next.month ?? month;
    if (nextView !== "records") query.set("view", nextView);
    if (nextMonth !== thisMonth) query.set("month", nextMonth);
    const text = query.toString();
    return `/dashboard/employee-attendance${text ? `?${text}` : ""}`;
  };

  const { from, to } = monthBounds(month);
  const { data, isPending } = useQuery({
    queryKey: [...pathKey("/dashboard/employee-attendance"), "month", month],
    queryFn: () => listEmployeeAttendanceQuery({ from, to }),
  });
  const people = React.useMemo(() => data ?? [], [data]);

  return (
    <SectionScreen
      section="employees"
      title={tNav("EmployeeAttendance")}
      description={t("Description")}
      actions={
        writes && (
          <>
            {view === "absences" && (
              <Button variant="outline" onClick={() => void entries.addAbsence()}>
                <CalendarOff />
                {t("Entry.AbsenceTitle")}
              </Button>
            )}
            {view === "leave" && (
              <Button variant="outline" onClick={() => void entries.requestLeave()}>
                <CalendarPlus />
                {t("Entry.LeaveTitle")}
              </Button>
            )}
            <Button variant="add" onClick={() => void entries.addCheck()}>
              <Plus />
              {t("Entry.CheckTitle")}
            </Button>
          </>
        )
      }
    >
      {entries.dialogs}
      <div className="space-y-5 tall:space-y-6">
        <ScreenTabs
          section="employees"
          items={VIEWS.map((each) => ({ id: each, label: t(`Views.${each}`), href: href({ view: each }) }))}
          value={view}
          ariaLabel={t("ViewsLabel")}
        />
        <MonthSwitch
          month={month}
          thisMonth={thisMonth}
          onChange={(next) => navigate(href({ month: next }), { replace: true })}
        />
        {view === "records" && <RecordsView people={people} month={month} loading={isPending} />}
        {view === "absences" && <AbsencesView people={people} loading={isPending} entries={entries} edits={edits} />}
        {view === "leave" && <LeaveView people={people} loading={isPending} entries={entries} decides={edits} />}
      </div>
    </SectionScreen>
  );
}
