import { useTranslations } from "use-intl";

import { ScreenTabs } from "@/components/screen-tabs";
import { SectionScreen } from "@/components/section-screen";
import { SUPERVISORS_PATH } from "@/features/operations/services/supervisors";
import { useSearchParams } from "@/lib/compat/navigation";

import { WorkersByZone } from "./_components/workers-by-zone";
import { ZonesView } from "./_components/zones-view";

const VIEWS = ["zones", "workers"] as const;
type View = (typeof VIEWS)[number];

/**
 * Section «الموظفون», tab «المشرفون والمناطق» (#36): each zone with its
 * supervisor, its communes, its workers and today's visits; naming a zone's
 * supervisor; each worker's zone, and moving her to another (People's
 * `setWorkerZone`). A worker's supervisor is her zone's.
 *
 * Closest academy screen: the attendance tab
 * (pages/dashboard/attendance/_components/attendance-screen.tsx): one tab that
 * switches between two lists with a second strip, each a table with row
 * buttons that open a dialog, as «إضافة غياب» does. The view is kept in the
 * address (`?view=workers`).
 */
export default function SupervisorsPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("SupervisorZones");
  const view: View = useSearchParams().get("view") === "workers" ? "workers" : "zones";
  const tabs = (
    <ScreenTabs
      section="employees"
      items={VIEWS.map((each) => ({
        id: each,
        label: t(`Views.${each}`),
        href: each === "zones" ? SUPERVISORS_PATH : `${SUPERVISORS_PATH}?view=${each}`,
      }))}
      value={view}
      ariaLabel={t("ViewsLabel")}
    />
  );

  return (
    <SectionScreen section="employees" title={tNav("Supervisors")}>
      {view === "workers" ? <WorkersByZone tabs={tabs} /> : <ZonesView tabs={tabs} />}
    </SectionScreen>
  );
}
