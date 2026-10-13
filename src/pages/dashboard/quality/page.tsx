import { useTranslations } from "use-intl";

import { ScreenTabs } from "@/components/screen-tabs";
import { SectionScreen } from "@/components/section-screen";
import { useSearchParams } from "@/lib/compat/navigation";

import { ComplaintsActions, ComplaintsView } from "./_components/complaints/complaints-view";
import { CorrectiveActions, CorrectiveView } from "./_components/corrective/corrective-view";
import { InspectionsActions, InspectionsView } from "./_components/inspections/inspections-view";
import { ProblemsActions, ProblemsView } from "./_components/problems/problems-view";
import { QUALITY_VIEWS, qualityHref, readQualityView, type QualityView } from "./_components/quality-views";
import { RatingsActions, RatingsView } from "./_components/ratings/ratings-view";

const VIEW: Record<QualityView, { View: () => React.ReactNode; Actions: () => React.ReactNode }> = {
  inspections: { View: InspectionsView, Actions: InspectionsActions },
  complaints: { View: ComplaintsView, Actions: ComplaintsActions },
  corrective: { View: CorrectiveView, Actions: CorrectiveActions },
  problems: { View: ProblemsView, Actions: ProblemsActions },
  ratings: { View: RatingsView, Actions: RatingsActions },
};

/**
 * Section «طلبات الخدمة», tab «الجودة والشكاوى» (#14 to #18): the supervisor's
 * inspections, the complaints with their counter, the corrective tasks, the
 * problem reports from the returned orders, and the clients' ratings.
 *
 * Closest academy screen: the attendance tab
 * (pages/dashboard/attendance/_components/attendance-screen.tsx): one tab that
 * switches between its own lists with a second strip, each list a searchable
 * table with row buttons. The view is kept in the address (`?view=`), so an
 * alert tile opens its list already filtered.
 */
export default function QualityPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Quality");
  const view = readQualityView(useSearchParams());
  const { View, Actions } = VIEW[view];
  const items = QUALITY_VIEWS.map((each) => ({ value: each, label: t(`Views.${each}`), href: qualityHref(each) }));

  return (
    <SectionScreen section="requests" title={tNav("Quality")} actions={<Actions />}>
      <div className="space-y-5">
        <ScreenTabs section="requests" items={items} value={view} ariaLabel={t("ViewsLabel")} />
        <View />
      </div>
    </SectionScreen>
  );
}
