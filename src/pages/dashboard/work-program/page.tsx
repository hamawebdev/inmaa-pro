import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";

import { WeekProgrammeView } from "./_components/week-programme-view";

/**
 * Section «عمال النظافة», tab «برنامج العمل» (#7, #8): the visits of a dated
 * Saturday-to-Friday week as a calendar, moved by dragging, and each worker's
 * hours that week against her capacity with what the working-time rules say.
 *
 * Closest academy screen: the scheduling calendar
 * (pages/dashboard/scheduling/page.tsx and its _components: the page client,
 * weekly-calendar, calendar-cell, schedule-block, drag-overlay-block), whose
 * layout, blocks, drag overlay and drop this follows. Dated weeks, the zone
 * filter, the teams and the load are new (scope section 3).
 */
export default function WorkProgramPage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="workers" title={tNav("WorkersHeading")}>
      <WeekProgrammeView />
    </SectionScreen>
  );
}
