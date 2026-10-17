import { useTranslations } from "use-intl";

import { ScreenTabs } from "@/components/screen-tabs";
import { SectionScreen } from "@/components/section-screen";
import { TEAMS_PATH } from "@/features/operations/services/teams";
import { useSearchParams } from "@/lib/compat/navigation";

import { TeamDayView } from "./_components/team-day-view";
import { TeamsRegister } from "./_components/teams-register";
import { WeekProgrammeView } from "./_components/week-programme-view";

const VIEWS = ["week", "day", "teams"] as const;
type View = (typeof VIEWS)[number];

/**
 * Section «عمال النظافة», tab «برنامج العمل» (#7, #8, #46): the visits of a dated
 * Saturday-to-Friday week as a calendar, moved by dragging, and each worker's
 * hours that week against her capacity with what the working-time rules say;
 * each team's day in order by zone with its vehicle; the register of teams and
 * vehicles.
 *
 * Closest academy screen: the scheduling calendar
 * (pages/dashboard/scheduling/page.tsx and its _components: the page client,
 * weekly-calendar, calendar-cell, schedule-block, drag-overlay-block), whose
 * layout, blocks, drag overlay and drop this follows. Dated weeks, the zone
 * filter, the teams and the load are new (scope section 3). The second strip
 * switches views as the attendance tab does.
 */
export default function WorkProgramPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("TeamDay");
  const params = useSearchParams();
  const view: View = params.get("view") === "day" ? "day" : params.get("view") === "teams" ? "teams" : "week";
  const tabs = (
    <ScreenTabs
      section="workers"
      items={VIEWS.map((each) => ({
        id: each,
        label: t(`Views.${each}`),
        href: each === "week" ? TEAMS_PATH : `${TEAMS_PATH}?view=${each}`,
      }))}
      value={view}
      ariaLabel={t("ViewsLabel")}
    />
  );

  return (
    <SectionScreen section="workers" title={tNav("WorkProgram")}>
      {view === "day" ? (
        <TeamDayView tabs={tabs} />
      ) : view === "teams" ? (
        <TeamsRegister tabs={tabs} />
      ) : (
        <WeekProgrammeView tabs={tabs} />
      )}
    </SectionScreen>
  );
}
